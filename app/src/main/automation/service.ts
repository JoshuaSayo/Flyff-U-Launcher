/** Supervised automation runtime orchestrating capture, perception, FSM, and input. */

import { performance } from "perf_hooks";
import type { BrowserWindow, Rectangle, WebContents } from "electron";
import { readFile } from "fs/promises";
import { safeCaptureWindow } from "../capture/safeCapture";
import { logErr, logInfo, logWarn } from "../../shared/logger";
import type {
    AutomationConfig,
    AutomationMetrics,
    AutomationState,
    AutomationStatus,
    AutomationTemplateKind,
    TemplateCaptureRequest,
} from "../../shared/automation";
import { decodePng, detectBarFill, extractNormalizedRect, matchTemplate, structuralEdgeDensity, type PixelFrame, type TemplateMatch } from "./frameAnalyzer";
import { decideAutomationState } from "./fsm";
import { AutomationInputFacade } from "./inputFacade";
import { AutomationStore } from "./store";

export type AutomationTarget = {
    profileId: string;
    hostWindow: BrowserWindow;
    webContents: WebContents;
    captureRect?: Rectangle;
};

export type AutomationServiceOptions = {
    store: AutomationStore;
    resolveTarget: (profileId: string) => AutomationTarget | null;
    onStatus?: (status: AutomationStatus) => void;
};

type CapturedFrame = { png: Buffer; pixels: PixelFrame; captureMs: number };

const TEMPLATE_LIMITS: Record<AutomationTemplateKind, { width: number; height: number; area: number }> = {
    target: { width: 0.35, height: 0.20, area: 0.05 },
    loot: { width: 0.35, height: 0.25, area: 0.06 },
    death: { width: 0.65, height: 0.50, area: 0.20 },
};

const EMPTY_METRICS: AutomationMetrics = {
    playerHp: null,
    targetHp: null,
    targetScore: null,
    lootScore: null,
    mainPartyHp: null,
    supportProfileId: null,
    supportAction: null,
    captureMs: null,
    analyzeMs: null,
};

const usesCombat = (config: AutomationConfig): boolean =>
    config.mode === "combat" || config.mode === "combat_support";

const usesSupport = (config: AutomationConfig): boolean =>
    config.mode === "support" || config.mode === "combat_support";

export class AutomationService {
    private readonly input = new AutomationInputFacade();
    private statusValue: AutomationStatus = {
        state: "stopped",
        profileId: null,
        armed: false,
        reason: "Ready",
        updatedAt: new Date().toISOString(),
        transitionCount: 0,
        actionCount: 0,
        metrics: { ...EMPTY_METRICS },
    };
    private config: AutomationConfig | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private captureInFlight = new Map<string, Promise<CapturedFrame>>();
    private stateEnteredAt = Date.now();
    private lastActionAt = 0;
    private lastSearchAt = 0;
    private attackIndex = 0;
    private lostTargetFrames = 0;
    private generation = 0;
    private templateCache = new Map<string, PixelFrame>();
    private captureSourceLogged = new Set<string>();
    private supportBuffDueAt = new Map<string, number>();
    private lastSupportHealAt = 0;
    private lastSupportFollowAt = 0;
    private lastSupportAction: string | null = null;
    private supportHealing = false;

    constructor(private readonly options: AutomationServiceOptions) {}

    status(): AutomationStatus {
        return { ...this.statusValue, metrics: { ...this.statusValue.metrics } };
    }

    async getConfig(profileId: string): Promise<{ config: AutomationConfig; templates: Awaited<ReturnType<AutomationStore["templateState"]>> }> {
        return { config: await this.options.store.load(profileId), templates: await this.options.store.templateState(profileId) };
    }

    async saveConfig(profileId: string, value: unknown): Promise<AutomationConfig> {
        this.assertEditable(profileId);
        return this.options.store.save(profileId, value);
    }

    async deleteTemplate(profileId: string, kind: AutomationTemplateKind): Promise<void> {
        this.assertEditable(profileId);
        await this.options.store.removeTemplate(profileId, kind);
        this.templateCache.delete(this.options.store.templatePath(profileId, kind));
    }

    async captureTemplate(request: TemplateCaptureRequest): Promise<void> {
        this.assertEditable(request.profileId);
        const limits = TEMPLATE_LIMITS[request.kind];
        if (request.rect.width > limits.width
            || request.rect.height > limits.height
            || request.rect.width * request.rect.height > limits.area) {
            throw new Error(request.kind + " selection is too large; drag tightly around one distinctive visual element");
        }
        const captured = await this.capture(request.profileId);
        const template = await extractNormalizedRect(captured.png, request.rect);
        const decoded = await decodePng(template);
        if (decoded.width < 4 || decoded.height < 4) throw new Error("Selected template is too small");
        if (structuralEdgeDensity(decoded) < 0.015) {
            throw new Error(request.kind + " selection has too little visual detail; include text, an icon, or clear edges");
        }
        await this.options.store.saveTemplate(request.profileId, request.kind, template);
        this.templateCache.set(this.options.store.templatePath(request.profileId, request.kind), decoded);
        logInfo(`Captured ${request.kind} template for ${request.profileId} (${decoded.width}x${decoded.height})`, "Automation");
    }

    async preview(profileId: string): Promise<{ dataUrl: string; width: number; height: number; capturedAt: string }> {
        const captured = await this.capture(profileId);
        return {
            dataUrl: `data:image/png;base64,${captured.png.toString("base64")}`,
            width: captured.pixels.width,
            height: captured.pixels.height,
            capturedAt: new Date().toISOString(),
        };
    }

    async start(profileId: string, acknowledged: boolean): Promise<AutomationStatus> {
        if (this.statusValue.state !== "stopped" && this.statusValue.state !== "paused" && this.statusValue.state !== "faulted") {
            throw new Error("Automation is already running");
        }
        const target = this.options.resolveTarget(profileId);
        if (!target) throw new Error("Open the selected profile in a launcher client first");
        const config = await this.options.store.load(profileId);
        const templates = await this.options.store.templateState(profileId);
        const combatEnabled = usesCombat(config);
        const supportEnabled = usesSupport(config);
        if (combatEnabled) {
            if (!config.playerHpRoi) throw new Error("Calibrate the player HP region before arming combat mode");
            if (!templates.target) throw new Error("Capture a target template before arming combat mode");
        }
        let supportTarget: AutomationTarget | null = null;
        if (supportEnabled) {
            if (!config.supportProfileId) throw new Error("Choose a different Support client profile");
            if (!config.mainPartyHpRoi) throw new Error("Calibrate the Main party HP region on the Support view");
            if (!config.mainPartyTargetRoi) throw new Error("Calibrate the Main party target row on the Support view");
            supportTarget = this.options.resolveTarget(config.supportProfileId);
            if (!supportTarget) throw new Error("Open the selected Support profile in the launcher first");
        }
        if (combatEnabled || supportEnabled) {
            if (!acknowledged) throw new Error("Supervision acknowledgement is required before arming automated input");
            if (target.hostWindow.isMinimized()) target.hostWindow.restore();
            target.hostWindow.show();
            target.hostWindow.focus();
            target.webContents.focus();
            await new Promise<void>((resolve) => setImmediate(resolve));
            if (!target.webContents.isFocused()) throw new Error("The selected game client could not receive foreground focus");
            if (combatEnabled) this.input.claim(profileId, target.webContents);
            if (supportEnabled && supportTarget && config.supportProfileId) {
                this.input.claimSupport(config.supportProfileId, supportTarget.webContents);
            }
        }
        this.config = config;
        this.generation++;
        this.lostTargetFrames = 0;
        this.attackIndex = 0;
        this.lastActionAt = 0;
        this.lastSearchAt = 0;
        this.lastSupportHealAt = 0;
        this.lastSupportFollowAt = 0;
        this.lastSupportAction = null;
        this.supportHealing = false;
        this.supportBuffDueAt = new Map(config.supportBuffs.map((buff) => [buff.key, 0]));
        const initialState: AutomationState = config.mode === "observer"
            ? "observing"
            : config.mode === "support"
                ? "supporting"
                : "searching";
        const initialReason = config.mode === "observer"
            ? "Observer mode started"
            : config.mode === "support"
                ? "Paired Support mode armed"
                : config.mode === "combat_support"
                    ? "Combat and paired Support modes armed"
                    : "Combat mode armed";
        this.setState(initialState, initialReason);
        this.statusValue.profileId = profileId;
        this.statusValue.armed = combatEnabled || supportEnabled;
        this.statusValue.metrics = {
            ...EMPTY_METRICS,
            supportProfileId: config.supportProfileId,
        };
        this.emit();
        this.schedule(0, this.generation);
        return this.status();
    }

    pause(reason = "Paused by user"): AutomationStatus {
        if (this.statusValue.state === "stopped") return this.status();
        this.clearTimer();
        this.generation++;
        this.input.release();
        this.statusValue.armed = false;
        this.setState("paused", reason);
        return this.status();
    }

    async resume(acknowledged: boolean): Promise<AutomationStatus> {
        const profileId = this.statusValue.profileId;
        if (!profileId || this.statusValue.state !== "paused") throw new Error("There is no paused session to resume");
        return this.start(profileId, acknowledged);
    }

    stop(reason = "Stopped by user"): AutomationStatus {
        this.clearTimer();
        this.generation++;
        this.input.release();
        this.config = null;
        this.supportBuffDueAt.clear();
        this.lastSupportHealAt = 0;
        this.lastSupportFollowAt = 0;
        this.lastSupportAction = null;
        this.supportHealing = false;
        this.statusValue.profileId = null;
        this.statusValue.armed = false;
        this.statusValue.metrics = { ...EMPTY_METRICS };
        this.setState("stopped", reason);
        return this.status();
    }

    dispose(): void {
        this.stop("Application shutting down");
        this.templateCache.clear();
        this.captureSourceLogged.clear();
        this.captureInFlight.clear();
    }

    private assertEditable(profileId: string): void {
        if (this.statusValue.profileId === profileId && !["stopped", "paused", "faulted"].includes(this.statusValue.state)) {
            throw new Error("Pause or stop automation before changing its calibration");
        }
    }

    private schedule(delayMs: number, generation: number): void {
        this.clearTimer();
        this.timer = setTimeout(() => void this.tick(generation), delayMs);
    }

    private clearTimer(): void {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }

    private async capture(profileId: string): Promise<CapturedFrame> {
        const existing = this.captureInFlight.get(profileId);
        if (existing) return existing;
        const capturePromise = (async () => {
            const target = this.options.resolveTarget(profileId);
            if (!target) throw new Error("Selected client is no longer open");
            const started = performance.now();
            const contentsType = target.webContents.getType();
            const captureGameSurface = process.platform !== "linux";
            const image = captureGameSurface
                ? await target.webContents.capturePage(undefined, { stayAwake: false })
                : await safeCaptureWindow(target.hostWindow, target.captureRect);
            if (image.isEmpty()) throw new Error("Compositor capture returned an empty frame");
            const png = image.toPNG();
            if (png.length === 0) throw new Error("Compositor capture returned no pixels");
            const pixels = await decodePng(png);
            if (!this.captureSourceLogged.has(profileId)) {
                this.captureSourceLogged.add(profileId);
                logInfo("Capturing game surface for " + profileId + ": " + contentsType + " " + pixels.width + "x" + pixels.height, "Automation");
            }
            return { png, pixels, captureMs: performance.now() - started };
        })();
        this.captureInFlight.set(profileId, capturePromise);
        try {
            return await capturePromise;
        } finally {
            if (this.captureInFlight.get(profileId) === capturePromise) {
                this.captureInFlight.delete(profileId);
            }
        }
    }

    private async loadTemplate(profileId: string, kind: AutomationTemplateKind): Promise<PixelFrame | null> {
        const templatePath = this.options.store.templatePath(profileId, kind);
        const cached = this.templateCache.get(templatePath);
        if (cached) return cached;
        try {
            const decoded = await decodePng(await readFile(templatePath));
            this.templateCache.set(templatePath, decoded);
            return decoded;
        } catch {
            return null;
        }
    }

    private async analyze(frame: PixelFrame, profileId: string, config: AutomationConfig): Promise<{
        playerHp: number | null;
        targetHp: number | null;
        target: TemplateMatch | null;
        loot: TemplateMatch | null;
        death: TemplateMatch | null;
    }> {
        const [targetTemplate, lootTemplate, deathTemplate] = await Promise.all([
            this.loadTemplate(profileId, "target"),
            this.loadTemplate(profileId, "loot"),
            this.loadTemplate(profileId, "death"),
        ]);
        return {
            playerHp: config.playerHpRoi ? detectBarFill(frame, config.playerHpRoi) : null,
            targetHp: config.targetHpRoi ? detectBarFill(frame, config.targetHpRoi) : null,
            target: targetTemplate ? matchTemplate(frame, targetTemplate, config.targetScanRoi) : null,
            loot: lootTemplate ? matchTemplate(frame, lootTemplate, config.targetScanRoi) : null,
            death: deathTemplate ? matchTemplate(frame, deathTemplate, { x: 0, y: 0, width: 1, height: 1 }) : null,
        };
    }

    private async tick(generation: number): Promise<void> {
        if (generation !== this.generation || !this.config || !this.statusValue.profileId) return;
        const profileId = this.statusValue.profileId;
        const config = this.config;
        try {
            const target = this.options.resolveTarget(profileId);
            if (!target) throw new Error("Selected client was closed");
            if (config.mode !== "observer" && !target.webContents.isFocused()) {
                this.pause("Main client focus lost: click the Main client, then resume");
                return;
            }
            const supportProfileId = usesSupport(config) ? config.supportProfileId : null;
            const supportTarget = supportProfileId ? this.options.resolveTarget(supportProfileId) : null;
            if (supportProfileId && !supportTarget) throw new Error("Support client was closed");
            const [captured, supportCaptured] = await Promise.all([
                this.capture(profileId),
                supportProfileId ? this.capture(supportProfileId) : Promise.resolve(null),
            ]);
            const analyzeStarted = performance.now();
            const result = await this.analyze(captured.pixels, profileId, config);
            const mainPartyHp = supportCaptured && config.mainPartyHpRoi
                ? detectBarFill(supportCaptured.pixels, config.mainPartyHpRoi)
                : null;
            const threshold = config.templateThreshold;
            const targetVisible = (result.target?.score ?? 0) >= threshold;
            const lootVisible = (result.loot?.score ?? 0) >= threshold;
            const deathVisible = (result.death?.score ?? 0) >= threshold;
            const analyzeMs = performance.now() - analyzeStarted;
            if (this.statusValue.state === "attacking") {
                this.lostTargetFrames = targetVisible ? 0 : this.lostTargetFrames + 1;
            } else {
                this.lostTargetFrames = 0;
            }

            if (deathVisible) {
                this.pause("Death screen detected; manual recovery required");
                return;
            }
            if (usesCombat(config)
                && Date.now() - this.stateEnteredAt >= config.stateTimeoutMs
                && !["stopped", "paused", "faulted"].includes(this.statusValue.state)) {
                this.pause(`${this.statusValue.state} exceeded the configured safety timeout`);
                return;
            }
            if (supportCaptured && supportProfileId) {
                await this.performSupportAction(supportProfileId, supportCaptured.pixels, mainPartyHp);
            }
            this.statusValue.metrics = {
                playerHp: result.playerHp,
                targetHp: result.targetHp,
                targetScore: result.target?.score ?? null,
                lootScore: result.loot?.score ?? null,
                mainPartyHp,
                supportProfileId,
                supportAction: this.lastSupportAction,
                captureMs: Math.round(Math.max(captured.captureMs, supportCaptured?.captureMs ?? 0) * 10) / 10,
                analyzeMs: Math.round(analyzeMs * 10) / 10,
            };
            const current = this.statusValue.state;
            const next = decideAutomationState(current, {
                mode: config.mode,
                playerHp: result.playerHp,
                targetVisible,
                lootVisible,
                deathVisible,
                elapsedInStateMs: Date.now() - this.stateEnteredAt,
                healThreshold: config.healThreshold,
                safeHpThreshold: config.safeHpThreshold,
                approachTimeoutMs: config.approachTimeoutMs,
                lootTimeoutMs: config.lootTimeoutMs,
                lostTargetFrames: this.lostTargetFrames,
            });
            if (next !== current) {
                this.setState(next, this.transitionReason(current, next));
                await this.onStateEntered(next, result.target, result.loot);
            } else {
                await this.performStateAction(next, result.loot);
            }
            this.emit();
            if (generation === this.generation && !["paused", "stopped", "faulted"].includes(this.statusValue.state)) {
                this.schedule(config.tickMs, generation);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logErr(message, "Automation");
            this.clearTimer();
            this.input.release();
            this.statusValue.armed = false;
            this.setState("faulted", message);
        }
    }

    private async performSupportAction(
        supportProfileId: string,
        frame: PixelFrame,
        mainPartyHp: number | null,
    ): Promise<void> {
        if (!this.config || !this.config.mainPartyTargetRoi) return;
        const config = this.config;
        const now = Date.now();
        if (mainPartyHp !== null) {
            if (mainPartyHp < config.supportHealThreshold) this.supportHealing = true;
            if (mainPartyHp >= config.supportSafeHpThreshold) this.supportHealing = false;
        }
        const targetMain = async (): Promise<void> => {
            const rect = config.mainPartyTargetRoi!;
            await this.input.clickSupport(
                supportProfileId,
                (rect.x + rect.width / 2) * frame.width,
                (rect.y + rect.height / 2) * frame.height,
            );
        };
        const follow = async (afterAction: boolean): Promise<void> => {
            if (!config.supportFollowAfterAction) return;
            if (Date.now() - this.lastSupportFollowAt < config.supportFollowIntervalMs) return;
            await this.input.pressSupportKey(supportProfileId, config.supportFollowKey);
            this.lastSupportFollowAt = Date.now();
            this.lastSupportAction = afterAction && this.lastSupportAction
                ? this.lastSupportAction + " + follow " + config.supportFollowKey
                : "Auto-follow " + config.supportFollowKey;
            this.recordAction();
        };

        if (this.supportHealing && now - this.lastSupportHealAt >= config.supportHealIntervalMs) {
            await targetMain();
            await this.input.pressSupportKey(supportProfileId, config.supportHealKey);
            this.lastSupportHealAt = Date.now();
            this.lastSupportAction = "Heal " + config.supportHealKey;
            this.recordAction();
            logInfo("Support " + supportProfileId + " healed Main at " + Math.round((mainPartyHp ?? 0) * 100) + "%", "Automation");
            await follow(true);
            return;
        }

        const dueBuff = config.supportBuffs.find((buff) => now >= (this.supportBuffDueAt.get(buff.key) ?? 0));
        if (dueBuff) {
            await targetMain();
            await this.input.pressSupportKey(supportProfileId, dueBuff.key);
            this.supportBuffDueAt.set(dueBuff.key, Date.now() + dueBuff.intervalSec * 1000);
            this.lastSupportAction = "Buff " + dueBuff.key;
            this.recordAction();
            logInfo("Support " + supportProfileId + " cast buff " + dueBuff.key, "Automation");
            await follow(true);
            return;
        }

        await follow(false);
    }

    private async onStateEntered(state: AutomationState, target: TemplateMatch | null, loot: TemplateMatch | null): Promise<void> {
        if (!this.config || !this.statusValue.profileId) return;
        if (state === "approaching" && target) {
            await this.input.click(this.statusValue.profileId, target.x + target.width / 2, target.y + target.height / 2);
            this.recordAction();
        } else if (state === "healing") {
            await this.input.pressKey(this.statusValue.profileId, this.config.healKey);
            this.recordAction();
        } else if (state === "looting") {
            await this.performLoot(loot);
        }
    }

    private async performStateAction(state: AutomationState, loot: TemplateMatch | null): Promise<void> {
        if (!this.config || !this.statusValue.profileId) return;
        const now = Date.now();
        if (state === "attacking" && now - this.lastActionAt >= this.config.actionIntervalMs) {
            const key = this.config.attackKeys[this.attackIndex % this.config.attackKeys.length]!;
            this.attackIndex++;
            await this.input.pressKey(this.statusValue.profileId, key);
            this.recordAction();
        } else if (state === "healing" && now - this.lastActionAt >= this.config.actionIntervalMs) {
            await this.input.pressKey(this.statusValue.profileId, this.config.healKey);
            this.recordAction();
        } else if (state === "looting" && now - this.lastActionAt >= this.config.actionIntervalMs) {
            await this.performLoot(loot);
        } else if (state === "searching" && now - this.lastSearchAt >= Math.max(2000, this.config.actionIntervalMs * 3)) {
            await this.input.pressKey(this.statusValue.profileId, this.config.searchKey);
            this.lastSearchAt = now;
            this.recordAction();
        }
    }

    private async performLoot(loot: TemplateMatch | null): Promise<void> {
        if (!this.config || !this.statusValue.profileId) return;
        if (loot && loot.score >= this.config.templateThreshold) {
            await this.input.click(this.statusValue.profileId, loot.x + loot.width / 2, loot.y + loot.height / 2);
        } else {
            await this.input.pressKey(this.statusValue.profileId, this.config.pickupKey);
        }
        this.recordAction();
    }

    private recordAction(): void {
        this.lastActionAt = Date.now();
        this.statusValue.actionCount++;
    }

    private setState(state: AutomationState, reason: string): void {
        if (this.statusValue.state !== state) {
            logInfo(`${this.statusValue.state} -> ${state}: ${reason}`, "Automation");
            this.statusValue.transitionCount++;
        }
        this.statusValue.state = state;
        this.statusValue.reason = reason;
        this.statusValue.updatedAt = new Date().toISOString();
        this.stateEnteredAt = Date.now();
        this.emit();
    }

    private transitionReason(from: AutomationState, to: AutomationState): string {
        if (to === "approaching") return "Target template matched";
        if (to === "attacking") return from === "healing" ? "HP recovered" : "Approach complete";
        if (to === "healing") return "Player HP is below the configured threshold";
        if (to === "looting") return "Target was lost for three consecutive frames";
        if (to === "searching") return from === "looting" ? "Loot sweep complete" : "Approach timed out";
        return `${from} -> ${to}`;
    }

    private emit(): void {
        this.statusValue.updatedAt = new Date().toISOString();
        try { this.options.onStatus?.(this.status()); } catch (err) { logWarn(`Status listener failed: ${String(err)}`, "Automation"); }
    }
}
