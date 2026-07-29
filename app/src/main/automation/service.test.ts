import { describe, expect, it, vi } from "vitest";
import type { BrowserWindow, NativeImage, WebContents } from "electron";
import sharp from "sharp";
import { defaultAutomationConfig, type AutomationConfig } from "../../shared/automation";
import {
    AutomationService,
    targetBodyClickPoint,
    targetTrackingRoi,
    type AutomationTarget,
} from "./service";
import type { AutomationStore } from "./store";

function combatStore(): AutomationStore {
    const config = {
        ...defaultAutomationConfig("profile-1"),
        mode: "combat" as const,
        playerHpRoi: { x: 0.02, y: 0.02, width: 0.20, height: 0.04 },
        targetHpRoi: { x: 0.30, y: 0.02, width: 0.20, height: 0.04 },
    };
    return {
        load: vi.fn(async () => config),
        templateState: vi.fn(async () => ({ target: true, loot: false, death: false })),
        templatePath: vi.fn((_profileId: string, kind: string) => "missing-" + kind + ".png"),
    } as unknown as AutomationStore;
}

function target(focusSucceeds: boolean): {
    value: AutomationTarget;
    restore: ReturnType<typeof vi.fn>;
    show: ReturnType<typeof vi.fn>;
    focusWindow: ReturnType<typeof vi.fn>;
    focusContents: ReturnType<typeof vi.fn>;
    capturePage: ReturnType<typeof vi.fn>;
    hostCapturePage: ReturnType<typeof vi.fn>;
    sendInputEvent: ReturnType<typeof vi.fn>;
    debuggerAttach: ReturnType<typeof vi.fn>;
    debuggerSendCommand: ReturnType<typeof vi.fn>;
} {
    let focused = false;
    let debuggerAttached = false;
    const restore = vi.fn();
    const show = vi.fn();
    const focusWindow = vi.fn();
    const focusContents = vi.fn(() => { focused = focusSucceeds; });
    const capturePage = vi.fn();
    const hostCapturePage = vi.fn();
    const sendInputEvent = vi.fn();
    const debuggerAttach = vi.fn(() => { debuggerAttached = true; });
    const debuggerSendCommand = vi.fn(async () => undefined);
    const webContents = {
        focus: focusContents,
        isFocused: vi.fn(() => focused),
        isDestroyed: vi.fn(() => false),
        sendInputEvent,
        getType: vi.fn(() => "browserView"),
        capturePage,
        once: vi.fn(),
        debugger: {
            isAttached: vi.fn(() => debuggerAttached),
            attach: debuggerAttach,
            detach: vi.fn(() => { debuggerAttached = false; }),
            once: vi.fn(),
            sendCommand: debuggerSendCommand,
        },
    } as unknown as WebContents;
    const hostWindow = {
        isMinimized: vi.fn(() => true),
        restore,
        show,
        focus: focusWindow,
        capturePage: hostCapturePage,
    } as unknown as BrowserWindow;
    return {
        value: { profileId: "profile-1", hostWindow, webContents },
        restore,
        show,
        focusWindow,
        focusContents,
        capturePage,
        hostCapturePage,
        sendInputEvent,
        debuggerAttach,
        debuggerSendCommand,
    };
}

async function testFrame(
    width: number,
    height: number,
    regions: Array<{
        x0: number;
        x1: number;
        y0: number;
        y1: number;
        color: [number, number, number];
    }>,
): Promise<Buffer> {
    const raw = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * 4;
            const region = regions.find((candidate) =>
                x >= candidate.x0 && x < candidate.x1 && y >= candidate.y0 && y < candidate.y1);
            raw[offset] = region?.color[0] ?? 0;
            raw[offset + 1] = region?.color[1] ?? 0;
            raw[offset + 2] = region?.color[2] ?? 0;
            raw[offset + 3] = 255;
        }
    }
    return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

function capturedImage(png: Buffer): NativeImage {
    return {
        isEmpty: () => false,
        toPNG: () => png,
    } as unknown as NativeImage;
}

function keyDownCodes(calls: unknown[][]): string[] {
    return calls
        .filter(([method, params]) =>
            method === "Input.dispatchKeyEvent"
            && typeof params === "object"
            && params !== null
            && (params as { type?: unknown }).type === "keyDown")
        .map(([, params]) => String((params as { code?: unknown }).code));
}

describe("AutomationService combat arming", () => {
    it("converts a matched monster label into a bounded body-click sweep", () => {
        expect(targetBodyClickPoint({ score: 1, x: 50, y: 30, width: 20, height: 8 })).toEqual({
            x: 60,
            y: 42,
        });
        expect(targetBodyClickPoint({ score: 1, x: 50, y: 30, width: 20, height: 8 }, 1)).toEqual({
            x: 56,
            y: 48,
        });
        expect(targetBodyClickPoint({ score: 1, x: 50, y: 30, width: 20, height: 8 }, 2)).toEqual({
            x: 64,
            y: 48,
        });
    });

    it("keeps the first click close to the user's current 108x56 label crop", () => {
        expect(targetBodyClickPoint({ score: 0.669, x: 400, y: 250, width: 108, height: 56 })).toEqual({
            x: 454,
            y: 320,
        });
    });

    it("builds a local retry region around one moving monster label", () => {
        expect(targetTrackingRoi(
            { width: 1708, height: 863 },
            { width: 108, height: 43 },
            { x: 733, y: 453 },
        )).toEqual({
            x: 571 / 1708,
            y: 317.5 / 863,
            width: 324 / 1708,
            height: 206 / 863,
        });
    });

    it("ignores a legacy death-template match when optional death detection is disabled", async () => {
        const selected = target(true);
        const png = await testFrame(120, 80, []);
        selected.capturePage.mockResolvedValue(capturedImage(png));
        const config = {
            ...defaultAutomationConfig("profile-1"),
            mode: "combat" as const,
            tickMs: 250,
            playerHpRoi: { x: 0.02, y: 0.02, width: 0.20, height: 0.05 },
            targetHpRoi: { x: 0.30, y: 0.02, width: 0.20, height: 0.05 },
            deathDetectionEnabled: false,
        };
        const store = {
            load: vi.fn(async () => config),
            templateState: vi.fn(async () => ({ target: true, loot: false, death: true })),
        } as unknown as AutomationStore;
        const service = new AutomationService({
            store,
            resolveTarget: () => selected.value,
        });
        const analyze = vi.fn(async () => ({
            playerHp: 0.9,
            targetHp: null,
            target: null,
            loot: null,
            death: { score: 1, x: 0, y: 0, width: 20, height: 10 },
            crosshair: { engaged: false, score: 0, centerX: null, centerY: null },
        }));
        const internal = service as unknown as { analyze: typeof analyze };
        vi.spyOn(internal, "analyze").mockImplementation(analyze);

        await service.start("profile-1", true);
        await vi.waitFor(() => expect(analyze).toHaveBeenCalled(), { timeout: 1500 });
        expect(service.status().state).not.toBe("paused");
        expect(service.status().reason).not.toContain("Death screen detected");
        service.stop();
    });

    it("restores and focuses the selected game client before arming", async () => {
        const selected = target(true);
        const service = new AutomationService({
            store: combatStore(),
            resolveTarget: () => selected.value,
        });

        const status = await service.start("profile-1", true);

        expect(selected.restore).toHaveBeenCalledOnce();
        expect(selected.show).toHaveBeenCalledOnce();
        expect(selected.focusWindow).toHaveBeenCalledOnce();
        expect(selected.focusContents).toHaveBeenCalledOnce();
        expect(status.state).toBe("searching");
        expect(status.armed).toBe(true);
        service.stop();
    });

    it("arms basic combat without optional Main or target HP calibration", async () => {
        const selected = target(true);
        const config: AutomationConfig = {
            ...defaultAutomationConfig("profile-1"),
            mode: "combat" as const,
            playerHpRoi: null,
            targetHpRoi: null,
        };
        const store = {
            load: vi.fn(async () => config),
            templateState: vi.fn(async () => ({ target: true, loot: false, death: false })),
        } as unknown as AutomationStore;
        const service = new AutomationService({ store, resolveTarget: () => selected.value });

        await expect(service.start("profile-1", true)).resolves.toMatchObject({
            state: "searching",
            armed: true,
        });
        service.stop();
    });

    it("requires player HP calibration only when optional Main healing is enabled", async () => {
        const selected = target(true);
        const config: AutomationConfig = {
            ...defaultAutomationConfig("profile-1"),
            mode: "combat" as const,
            mainHealingEnabled: true,
            playerHpRoi: null,
        };
        const store = {
            load: vi.fn(async () => config),
            templateState: vi.fn(async () => ({ target: true, loot: false, death: false })),
        } as unknown as AutomationStore;
        const service = new AutomationService({ store, resolveTarget: () => selected.value });

        await expect(service.start("profile-1", true)).rejects.toThrow(
            "Calibrate the player HP region or disable optional Main healing",
        );
        service.stop();
    });

    it("refuses to arm when the selected client cannot receive focus", async () => {
        const selected = target(false);
        const service = new AutomationService({
            store: combatStore(),
            resolveTarget: () => selected.value,
        });

        await expect(service.start("profile-1", true)).rejects.toThrow("could not receive foreground focus");
        expect(service.status().armed).toBe(false);
        service.stop();
    });

    it("continues while the Automation Workbench provides supervision focus", async () => {
        const selected = target(true);
        const png = await testFrame(120, 80, []);
        selected.capturePage.mockResolvedValue(capturedImage(png));
        const supervisionActive = vi.fn(() => true);
        const service = new AutomationService({
            store: combatStore(),
            resolveTarget: () => selected.value,
            isSupervisionActive: supervisionActive,
        });

        await service.start("profile-1", true);
        await vi.waitFor(() => expect(supervisionActive).toHaveBeenCalled(), { timeout: 1500 });
        expect(service.status().state).not.toBe("paused");
        expect(service.status().state).not.toBe("faulted");

        supervisionActive.mockReturnValue(false);
        await vi.waitFor(() => expect(service.status().state).toBe("paused"), { timeout: 1500 });
        expect(service.status().reason).toContain("Supervision focus lost");
        service.stop();
    });

    it("clicks to select and engage before attacking without optional skill keys", async () => {
        const selected = target(true);
        const png = await testFrame(120, 80, []);
        selected.capturePage.mockResolvedValue(capturedImage(png));
        const config = {
            ...defaultAutomationConfig("profile-1"),
            mode: "combat" as const,
            tickMs: 250,
            actionIntervalMs: 600,
            useAttackSkills: false,
            attackKeys: [] as string[],
            playerHpRoi: { x: 0.02, y: 0.02, width: 0.20, height: 0.05 },
            targetHpRoi: { x: 0.30, y: 0.02, width: 0.20, height: 0.05 },
        };
        const store = {
            load: vi.fn(async () => config),
            templateState: vi.fn(async () => ({ target: true, loot: false, death: false })),
        } as unknown as AutomationStore;
        const service = new AutomationService({
            store,
            resolveTarget: () => selected.value,
        });
        const targetMatch = { score: 1, x: 50, y: 30, width: 20, height: 8 };
        let frames = 0;
        const internal = service as unknown as {
            analyze: (...args: unknown[]) => Promise<{
                playerHp: number;
                targetHp: number | null;
                target: typeof targetMatch;
                loot: null;
                death: null;
                crosshair: {
                    engaged: boolean;
                    score: number;
                    centerX: number | null;
                    centerY: number | null;
                };
            }>;
        };
        vi.spyOn(internal, "analyze").mockImplementation(async () => {
            frames++;
            const engaged = frames >= 4;
            return {
                playerHp: 0.9,
                targetHp: null,
                target: targetMatch,
                loot: null,
                death: null,
                crosshair: {
                    engaged,
                    score: engaged ? 0.9 : 0.2,
                    centerX: engaged ? 60 : null,
                    centerY: engaged ? 40 : null,
                },
            };
        });

        await service.start("profile-1", true);
        await vi.waitFor(() => {
            expect(service.status().state).toBe("attacking");
        }, { timeout: 2500 });

        const mouseEvents = selected.debuggerSendCommand.mock.calls
            .filter(([method]) => method === "Input.dispatchMouseEvent")
            .map(([, event]) => event as { type?: string; x?: number; y?: number });
        const keyEvents = selected.debuggerSendCommand.mock.calls
            .filter(([method]) => method === "Input.dispatchKeyEvent");
        expect(mouseEvents.filter((event) => event.type === "mousePressed").length).toBeGreaterThanOrEqual(2);
        expect(mouseEvents).toContainEqual(expect.objectContaining({ type: "mousePressed", x: 60, y: 42 }));
        expect(keyEvents).toHaveLength(0);
        expect(service.status().metrics.targetSelected).toBe(false);
        expect(service.status().metrics.targetEngaged).toBe(true);
        service.stop();
    });

    it("captures the selected game WebContents instead of the parent session renderer", async () => {
        const selected = target(true);
        const png = await sharp({
            create: { width: 12, height: 8, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 1 } },
        }).png().toBuffer();
        selected.capturePage.mockResolvedValue({
            isEmpty: () => false,
            toPNG: () => png,
        } as unknown as NativeImage);
        const service = new AutomationService({
            store: combatStore(),
            resolveTarget: () => selected.value,
        });

        const preview = await service.preview("profile-1");

        expect(preview.width).toBe(12);
        expect(preview.height).toBe(8);
        expect(selected.capturePage).toHaveBeenCalledOnce();
        expect(selected.hostCapturePage).not.toHaveBeenCalled();
        service.stop();
    });

    it("rejects oversized templates before capturing a frame", async () => {
        const selected = target(true);
        const service = new AutomationService({
            store: combatStore(),
            resolveTarget: () => selected.value,
        });

        await expect(service.captureTemplate({
            profileId: "profile-1",
            kind: "target",
            rect: { x: 0, y: 0, width: 0.9, height: 0.7 },
        })).rejects.toThrow("selection is too large");
        expect(selected.capturePage).not.toHaveBeenCalled();
        service.stop();
    });

    it("pairs a Support client and dispatches its due buff without focusing it", async () => {
        const main = target(true);
        const support = target(false);
        support.value.profileId = "profile-2";
        const png = await sharp({
            create: { width: 100, height: 40, channels: 4, background: { r: 220, g: 20, b: 30, alpha: 1 } },
        }).png().toBuffer();
        const image = {
            isEmpty: () => false,
            toPNG: () => png,
        } as unknown as NativeImage;
        main.capturePage.mockResolvedValue(image);
        support.capturePage.mockResolvedValue(image);
        const config = {
            ...defaultAutomationConfig("profile-1"),
            mode: "support" as const,
            supportProfileId: "profile-2",
            mainPartyHpRoi: { x: 0.05, y: 0.10, width: 0.40, height: 0.15 },
            mainPartyTargetRoi: { x: 0.05, y: 0.05, width: 0.40, height: 0.10 },
            supportBuffs: [{ key: "F3", intervalSec: 600, target: "main" as const }],
            supportFollowAfterAction: false,
        };
        const store = {
            load: vi.fn(async () => config),
            templateState: vi.fn(async () => ({ target: false, loot: false, death: false })),
            templatePath: vi.fn((_profileId: string, kind: string) => kind),
        } as unknown as AutomationStore;
        const service = new AutomationService({
            store,
            resolveTarget: (profileId) => profileId === "profile-1" ? main.value : profileId === "profile-2" ? support.value : null,
        });

        const status = await service.start("profile-1", true);
        expect(status.state).toBe("supporting");
        await vi.waitFor(() => {
            expect(support.debuggerSendCommand).toHaveBeenCalledWith(
                "Input.dispatchKeyEvent",
                expect.objectContaining({ type: "keyDown", key: "F3" }),
            );
            expect(service.status().metrics.supportAction).toBe("Buff F3 → main");
        });
        expect(support.focusContents).not.toHaveBeenCalled();
        expect(service.status().metrics.supportProfileId).toBe("profile-2");
        service.stop();
    });

    it("prioritizes a reactive Support heal when the Main party HP is low", async () => {
        const main = target(true);
        const support = target(false);
        support.value.profileId = "profile-2";
        const width = 100;
        const height = 40;
        const raw = Buffer.alloc(width * height * 4);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const offset = (y * width + x) * 4;
                const insideLowHpFill = y >= 4 && y < 10 && x >= 5 && x < 15;
                raw[offset] = insideLowHpFill ? 220 : 0;
                raw[offset + 1] = insideLowHpFill ? 20 : 0;
                raw[offset + 2] = insideLowHpFill ? 30 : 0;
                raw[offset + 3] = 255;
            }
        }
        const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
        const image = {
            isEmpty: () => false,
            toPNG: () => png,
        } as unknown as NativeImage;
        main.capturePage.mockResolvedValue(image);
        support.capturePage.mockResolvedValue(image);
        const config = {
            ...defaultAutomationConfig("profile-1"),
            mode: "support" as const,
            supportProfileId: "profile-2",
            mainPartyHpRoi: { x: 0.05, y: 0.10, width: 0.40, height: 0.15 },
            mainPartyTargetRoi: { x: 0.05, y: 0.05, width: 0.40, height: 0.10 },
            supportHealKey: "4",
            supportHealThreshold: 0.50,
            supportSafeHpThreshold: 0.80,
            supportEmergencyHealThreshold: 0.30,
            supportBuffs: [{ key: "F3", intervalSec: 600, target: "main" as const }],
            supportFollowAfterAction: false,
        };
        const store = {
            load: vi.fn(async () => config),
            templateState: vi.fn(async () => ({ target: false, loot: false, death: false })),
            templatePath: vi.fn((_profileId: string, kind: string) => kind),
        } as unknown as AutomationStore;
        const service = new AutomationService({
            store,
            resolveTarget: (profileId) => profileId === "profile-1" ? main.value : profileId === "profile-2" ? support.value : null,
        });

        await service.start("profile-1", true);
        await vi.waitFor(() => {
            expect(support.debuggerSendCommand).toHaveBeenCalledWith(
                "Input.dispatchKeyEvent",
                expect.objectContaining({ type: "keyDown", key: "4" }),
            );
            expect(service.status().metrics.mainPartyHp).not.toBeNull();
            expect(service.status().metrics.supportAction).toBe("Emergency heal 4");
        });
        const keyDowns = support.debuggerSendCommand.mock.calls
            .filter(([method, params]) => method === "Input.dispatchKeyEvent" && params.type === "keyDown")
            .map(([, params]) => params.key);
        expect(keyDowns[0]).toBe("4");
        expect(service.status().metrics.mainPartyHp!).toBeLessThan(0.50);
        service.stop();
    });

    it("deselects Main and self-heals Support before maintenance actions", async () => {
        const main = target(true);
        const support = target(false);
        support.value.profileId = "profile-2";
        const png = await testFrame(100, 60, [
            { x0: 5, x1: 45, y0: 3, y1: 9, color: [220, 20, 30] },
            { x0: 5, x1: 13, y0: 18, y1: 24, color: [220, 20, 30] },
        ]);
        const image = capturedImage(png);
        main.capturePage.mockResolvedValue(image);
        support.capturePage.mockResolvedValue(image);
        const config = {
            ...defaultAutomationConfig("profile-1"),
            mode: "support" as const,
            supportProfileId: "profile-2",
            mainPartyHpRoi: { x: 0.05, y: 0.05, width: 0.40, height: 0.10 },
            mainPartyTargetRoi: { x: 0.05, y: 0.02, width: 0.40, height: 0.08 },
            supportSelfHpRoi: { x: 0.05, y: 0.30, width: 0.40, height: 0.10 },
            supportSelfHealEnabled: true,
            supportSelfHealKey: "6",
            supportSelfHealThreshold: 0.50,
            supportSelfSafeHpThreshold: 0.80,
            supportBuffs: [{ key: "F3", intervalSec: 600, target: "main" as const }],
            supportFollowAfterAction: false,
        };
        const store = {
            load: vi.fn(async () => config),
            templateState: vi.fn(async () => ({ target: false, loot: false, death: false })),
            templatePath: vi.fn((_profileId: string, kind: string) => kind),
        } as unknown as AutomationStore;
        const service = new AutomationService({
            store,
            resolveTarget: (profileId) => profileId === "profile-1" ? main.value : support.value,
        });

        await service.start("profile-1", true);
        await vi.waitFor(() => {
            expect(service.status().metrics.supportAction).toBe("Self-heal 6");
        });
        expect(keyDownCodes(support.debuggerSendCommand.mock.calls).slice(0, 2)).toEqual(["Backquote", "Digit6"]);
        expect(service.status().metrics.supportHp).toBeLessThan(0.50);
        service.stop();
    });

    it("uses an MP potion from the structural blue Support MP bar", async () => {
        const main = target(true);
        const support = target(false);
        support.value.profileId = "profile-2";
        const png = await testFrame(100, 60, [
            { x0: 5, x1: 45, y0: 3, y1: 9, color: [220, 20, 30] },
            { x0: 5, x1: 13, y0: 33, y1: 39, color: [30, 95, 225] },
        ]);
        const image = capturedImage(png);
        main.capturePage.mockResolvedValue(image);
        support.capturePage.mockResolvedValue(image);
        const config = {
            ...defaultAutomationConfig("profile-1"),
            mode: "support" as const,
            supportProfileId: "profile-2",
            mainPartyHpRoi: { x: 0.05, y: 0.05, width: 0.40, height: 0.10 },
            mainPartyTargetRoi: { x: 0.05, y: 0.02, width: 0.40, height: 0.08 },
            supportMpRoi: { x: 0.05, y: 0.55, width: 0.40, height: 0.10 },
            supportMpPotionEnabled: true,
            supportMpPotionKey: "7",
            supportMpPotionThreshold: 0.50,
            supportBuffs: [] as Array<{ key: string; intervalSec: number; target: "main" | "self" }>,
            supportFollowAfterAction: false,
        };
        const store = {
            load: vi.fn(async () => config),
            templateState: vi.fn(async () => ({ target: false, loot: false, death: false })),
            templatePath: vi.fn((_profileId: string, kind: string) => kind),
        } as unknown as AutomationStore;
        const service = new AutomationService({
            store,
            resolveTarget: (profileId) => profileId === "profile-1" ? main.value : support.value,
        });

        await service.start("profile-1", true);
        await vi.waitFor(() => {
            expect(service.status().metrics.supportAction).toBe("MP potion 7");
        });
        expect(keyDownCodes(support.debuggerSendCommand.mock.calls)[0]).toBe("Digit7");
        expect(service.status().metrics.supportMp).toBeLessThan(0.50);
        service.stop();
    });

    it("deselects Main before casting a self-targeted timed buff", async () => {
        const main = target(true);
        const support = target(false);
        support.value.profileId = "profile-2";
        const png = await testFrame(100, 40, [
            { x0: 5, x1: 45, y0: 4, y1: 10, color: [220, 20, 30] },
        ]);
        const image = capturedImage(png);
        main.capturePage.mockResolvedValue(image);
        support.capturePage.mockResolvedValue(image);
        const config = {
            ...defaultAutomationConfig("profile-1"),
            mode: "support" as const,
            supportProfileId: "profile-2",
            mainPartyHpRoi: { x: 0.05, y: 0.10, width: 0.40, height: 0.15 },
            mainPartyTargetRoi: { x: 0.05, y: 0.05, width: 0.40, height: 0.10 },
            supportBuffs: [{ key: "F3", intervalSec: 900, target: "self" as const }],
            supportFollowAfterAction: false,
        };
        const store = {
            load: vi.fn(async () => config),
            templateState: vi.fn(async () => ({ target: false, loot: false, death: false })),
            templatePath: vi.fn((_profileId: string, kind: string) => kind),
        } as unknown as AutomationStore;
        const service = new AutomationService({
            store,
            resolveTarget: (profileId) => profileId === "profile-1" ? main.value : support.value,
        });

        await service.start("profile-1", true);
        await vi.waitFor(() => {
            expect(service.status().metrics.supportAction).toBe("Buff F3 → self");
        });
        expect(keyDownCodes(support.debuggerSendCommand.mock.calls).slice(0, 2)).toEqual(["Backquote", "F3"]);
        service.stop();
    });

    it("attempts configured resurrection and pauses after verified retries are exhausted", async () => {
        const main = target(true);
        const support = target(false);
        support.value.profileId = "profile-2";
        const png = await testFrame(100, 40, []);
        const image = capturedImage(png);
        main.capturePage.mockResolvedValue(image);
        support.capturePage.mockResolvedValue(image);
        const config = {
            ...defaultAutomationConfig("profile-1"),
            mode: "support" as const,
            tickMs: 250,
            supportProfileId: "profile-2",
            mainPartyHpRoi: { x: 0.05, y: 0.10, width: 0.40, height: 0.15 },
            mainPartyTargetRoi: { x: 0.05, y: 0.05, width: 0.40, height: 0.10 },
            supportResurrectionEnabled: true,
            supportResurrectionKey: "F1",
            supportResurrectionRetryMs: 1500,
            supportResurrectionMaxAttempts: 1,
            supportBuffs: [] as Array<{ key: string; intervalSec: number; target: "main" | "self" }>,
            supportFollowAfterAction: false,
        };
        const store = {
            load: vi.fn(async () => config),
            templateState: vi.fn(async () => ({ target: false, loot: false, death: true })),
            templatePath: vi.fn((_profileId: string, kind: string) => kind),
        } as unknown as AutomationStore;
        const service = new AutomationService({
            store,
            resolveTarget: (profileId) => profileId === "profile-1" ? main.value : support.value,
        });
        const internal = service as unknown as {
            analyze: (...args: unknown[]) => Promise<{
                playerHp: null;
                targetHp: null;
                target: null;
                loot: null;
                death: { score: number; x: number; y: number; width: number; height: number };
                crosshair: { engaged: false; score: 0; centerX: null; centerY: null };
            }>;
        };
        vi.spyOn(internal, "analyze").mockResolvedValue({
            playerHp: null,
            targetHp: null,
            target: null,
            loot: null,
            death: { score: 1, x: 0, y: 0, width: 20, height: 10 },
            crosshair: { engaged: false, score: 0, centerX: null, centerY: null },
        });

        await service.start("profile-1", true);
        await vi.waitFor(() => {
            expect(service.status().state).toBe("paused");
        }, { timeout: 2500 });
        expect(keyDownCodes(support.debuggerSendCommand.mock.calls)).toContain("F1");
        expect(service.status().metrics.supportResurrectionAttempts).toBe(1);
        expect(service.status().reason).toContain("Auto-resurrection exhausted 1 verified attempts");
        service.stop();
    });
});
