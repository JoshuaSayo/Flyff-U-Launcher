/** Renderer for the supervised automation workbench. */

import type { AutomationConfig, AutomationStatus, AutomationTemplateKind, AutomationTemplateState, NormalizedRect } from "../../shared/automation";
import { clear, el, qs, showToast } from "../dom-utils";
import { automationSetupChecklist, type SetupCheck } from "./setupAssistant";

type CalibrationKind =
    | "playerHpRoi"
    | "targetHpRoi"
    | "targetScanRoi"
    | "mainPartyHpRoi"
    | "mainPartyTargetRoi"
    | "supportSelfHpRoi"
    | "supportMpRoi"
    | AutomationTemplateKind;
type Profile = { id: string; name?: string; characters?: string[] };

const isSupportCalibration = (kind: CalibrationKind | null): boolean =>
    kind === "mainPartyHpRoi"
    || kind === "mainPartyTargetRoi"
    || kind === "supportSelfHpRoi"
    || kind === "supportMpRoi";

const profileLabel = (profile: Profile): string => {
    const name = profile.name?.trim();
    const character = profile.characters?.[0]?.trim();
    if (name && character && name !== character) return name + " — " + character;
    return name || character || profile.id;
};

const actionButton = (label: string, classes = "automationButton"): HTMLButtonElement =>
    el("button", classes, label) as HTMLButtonElement;

function numericField(label: string, min: number, max: number, step: number): { row: HTMLElement; input: HTMLInputElement } {
    const input = document.createElement("input");
    Object.assign(input, { type: "number", min: String(min), max: String(max), step: String(step) });
    const row = el("label", "automationField");
    row.append(el("span", "automationFieldLabel", label), input);
    return { row, input };
}

function textField(label: string): { row: HTMLElement; input: HTMLInputElement } {
    const input = document.createElement("input");
    const row = el("label", "automationField");
    row.append(el("span", "automationFieldLabel", label), input);
    return { row, input };
}

export async function renderAutomation(root: HTMLElement): Promise<void> {
    clear(root);
    root.className = "automationRoot";

    const header = el("header", "automationHeader");
    header.append(
        el("h1", "automationTitle", "Vision Automation Workbench"),
        el("p", "automationSubtitle", "Supervised Main control • paired Support healer/buffer • local pixel analysis"),
        el("div", "automationSafety", "Background input is limited to the explicitly paired Support client. No memory, packets, DOM inspection, official-API data, or anti-cheat bypass."),
    );

    const profileSelect = document.createElement("select");
    profileSelect.className = "automationSelect";
    const refreshButton = actionButton("Refresh frame");
    const saveButton = actionButton("Save profile", "automationButton primary");
    const toolbar = el("div", "automationToolbar");
    toolbar.append(el("span", "automationProfileLabel", "Main profile"), profileSelect, refreshButton, saveButton);

    const canvas = document.createElement("canvas");
    canvas.className = "automationCanvas";
    canvas.width = 960;
    canvas.height = 540;
    const canvasHint = el("div", "automationCanvasHint", "Refresh a frame, choose a calibration action, then drag a rectangle.");
    const canvasWrap = el("div", "automationCanvasWrap");
    canvasWrap.append(canvas, canvasHint);
    const main = el("main", "automationMain");
    main.append(canvasWrap);

    const modeSelect = document.createElement("select");
    modeSelect.append(
        new Option("Observer only", "observer"),
        new Option("Combat FSM", "combat"),
        new Option("Support healer/buffer", "support"),
        new Option("Combat + Support", "combat_support"),
    );
    const modeRow = el("label", "automationField");
    modeRow.append(el("span", "automationFieldLabel", "Mode"), modeSelect);
    const attack = textField("Skill rotation (optional)");
    const useAttackSkills = document.createElement("input");
    useAttackSkills.type = "checkbox";
    const useAttackSkillsRow = el("label", "automationAcknowledge");
    useAttackSkillsRow.append(
        useAttackSkills,
        el("span", "", "Use skill keys only after the red combat crosshair is confirmed"),
    );
    const heal = textField("Heal key");
    const pickup = textField("Pickup key");
    const search = textField("Search/camera key");
    const healAt = numericField("Heal below", 0.05, 0.95, 0.05);
    const safeAt = numericField("Resume above", 0.10, 1, 0.05);
    const threshold = numericField("Template threshold", 0.45, 0.99, 0.01);
    const tick = numericField("Vision tick (ms)", 250, 2000, 50);
    const action = numericField("Action interval (ms)", 250, 5000, 50);
    const mainConfigDetails = document.createElement("details");
    const mainConfigSummary = document.createElement("summary");
    mainConfigSummary.textContent = "Main combat and vision settings";
    mainConfigDetails.append(
        mainConfigSummary,
        el("p", "automationShortcut", "Targeting clicks the monster to reveal its HP, clicks again to engage, then requires the red crosshair. Skills are not required."),
        useAttackSkillsRow,
        attack.row,
        heal.row,
        pickup.row,
        search.row,
        healAt.row,
        safeAt.row,
        threshold.row,
        tick.row,
        action.row,
    );
    const configPanel = el("section", "automationCard");
    configPanel.append(
        el("h2", "automationCardTitle", "Profile configuration"),
        modeRow,
        mainConfigDetails,
    );

    const supportSelect = document.createElement("select");
    const supportRow = el("label", "automationField");
    supportRow.append(el("span", "automationFieldLabel", "Support client"), supportSelect);
    const supportHeal = textField("Support heal key");
    const supportFollow = textField("Auto-follow key");
    const supportDeselect = textField("Deselect/self key");
    const supportHealAt = numericField("Heal Main below", 0.05, 0.95, 0.05);
    const supportSafeAt = numericField("Heal Main until", 0.10, 1, 0.05);
    const supportHealInterval = numericField("Heal interval (ms)", 500, 5000, 50);
    const supportEmergencyAt = numericField("Emergency below", 0.05, 0.90, 0.05);
    const supportEmergencyInterval = numericField("Emergency interval (ms)", 250, 1000, 50);
    const supportStableSamples = numericField("Stable low-HP samples", 1, 5, 1);
    const supportSelfHeal = textField("Self-heal key");
    const supportSelfHealAt = numericField("Self-heal below", 0.05, 0.95, 0.05);
    const supportSelfSafeAt = numericField("Self-heal until", 0.10, 1, 0.05);
    const supportSelfInterval = numericField("Self-heal interval (ms)", 500, 5000, 50);
    const supportSelfEnabled = document.createElement("input");
    supportSelfEnabled.type = "checkbox";
    const supportSelfEnabledRow = el("label", "automationAcknowledge");
    supportSelfEnabledRow.append(supportSelfEnabled, el("span", "", "Self-heal Support when its own HP is low"));
    const supportMpPotion = textField("MP potion key");
    const supportMpAt = numericField("Use MP potion below", 0.05, 0.95, 0.05);
    const supportMpCooldown = numericField("MP potion cooldown (ms)", 1000, 120000, 500);
    const supportMpEnabled = document.createElement("input");
    supportMpEnabled.type = "checkbox";
    const supportMpEnabledRow = el("label", "automationAcknowledge");
    supportMpEnabledRow.append(supportMpEnabled, el("span", "", "Use Support MP potion with cooldown protection"));
    const supportResurrection = textField("Resurrection key");
    const supportResurrectionRetry = numericField("Resurrection retry (ms)", 1500, 15000, 500);
    const supportResurrectionAttempts = numericField("Resurrection attempts", 1, 5, 1);
    const supportResurrectionEnabled = document.createElement("input");
    supportResurrectionEnabled.type = "checkbox";
    const supportResurrectionEnabledRow = el("label", "automationAcknowledge");
    supportResurrectionEnabledRow.append(
        supportResurrectionEnabled,
        el("span", "", "Auto-resurrect Main and verify the party HP bar before retrying"),
    );
    const supportFollowInterval = numericField("Follow interval (ms)", 1000, 60000, 500);
    const supportBuffs = textField("Buffs key:seconds:target");
    const supportAutoFollow = document.createElement("input");
    supportAutoFollow.type = "checkbox";
    const supportAutoFollowRow = el("label", "automationAcknowledge");
    supportAutoFollowRow.append(supportAutoFollow, el("span", "", "Periodically follow Main and resume follow after support actions"));
    const emergencyDetails = document.createElement("details");
    const emergencySummary = document.createElement("summary");
    emergencySummary.textContent = "Emergency healing and stability";
    emergencyDetails.append(
        emergencySummary,
        supportEmergencyAt.row,
        supportEmergencyInterval.row,
        supportStableSamples.row,
    );
    const selfCareDetails = document.createElement("details");
    const selfCareSummary = document.createElement("summary");
    selfCareSummary.textContent = "Optional Support self-care";
    selfCareDetails.append(
        selfCareSummary,
        supportSelfEnabledRow,
        supportSelfHeal.row,
        supportSelfHealAt.row,
        supportSelfSafeAt.row,
        supportSelfInterval.row,
        supportMpEnabledRow,
        supportMpPotion.row,
        supportMpAt.row,
        supportMpCooldown.row,
    );
    const resurrectionDetails = document.createElement("details");
    const resurrectionSummary = document.createElement("summary");
    resurrectionSummary.textContent = "Optional auto-resurrection";
    resurrectionDetails.append(
        resurrectionSummary,
        supportResurrectionEnabledRow,
        supportResurrection.row,
        supportResurrectionRetry.row,
        supportResurrectionAttempts.row,
    );
    const timingDetails = document.createElement("details");
    const timingSummary = document.createElement("summary");
    timingSummary.textContent = "Advanced timing";
    timingDetails.append(
        timingSummary,
        supportHealInterval.row,
        supportFollowInterval.row,
    );
    const starterPresetButton = actionButton("Apply Support starter preset", "automationButton primary");
    const supportPanel = el("section", "automationCard");
    supportPanel.append(
        el("h2", "automationCardTitle", "Paired Support"),
        el("p", "automationShortcut", "Start with the preset and required fields. Open optional sections only after basic healing works."),
        starterPresetButton,
        supportRow,
        supportHeal.row,
        supportFollow.row,
        supportDeselect.row,
        supportHealAt.row,
        supportSafeAt.row,
        supportBuffs.row,
        supportAutoFollowRow,
        emergencyDetails,
        selfCareDetails,
        resurrectionDetails,
        timingDetails,
        el("p", "automationShortcut", "Buff examples: 1:600:main, F3:900:self"),
    );

    const calibrationPanel = el("section", "automationCard");
    calibrationPanel.append(el("h2", "automationCardTitle", "Vision calibration"));
    const calibrationGrid = el("div", "automationCalibrationGrid");
    const calibrationItems: Array<[CalibrationKind, string]> = [
        ["playerHpRoi", "1. Main player HP"],
        ["targetHpRoi", "2. Selected monster HP"],
        ["targetScanRoi", "3. Monster scan area"],
        ["mainPartyHpRoi", "1. Main party HP"],
        ["mainPartyTargetRoi", "2. Main party row"],
        ["supportSelfHpRoi", "Support HP (Support view)"],
        ["supportMpRoi", "Support MP (Support view)"],
        ["target", "4. Capture monster label"],
        ["loot", "Capture loot"],
        ["death", "Capture death dialog"],
    ];
    const templateBadges = new Map<AutomationTemplateKind, HTMLElement>();
    const calibrationButtons = new Map<CalibrationKind, HTMLButtonElement>();
    let selectedCalibration: CalibrationKind | null = null;
    for (const [kind, label] of calibrationItems) {
        const item = actionButton(label, "automationButton calibration");
        calibrationButtons.set(kind, item);
        item.dataset.kind = kind;
        item.onclick = () => {
            selectedCalibration = kind;
            for (const candidate of calibrationGrid.querySelectorAll("button")) candidate.classList.toggle("selected", candidate === item);
            canvasHint.textContent = `Drag the ${label.toLowerCase()} rectangle on the current frame.`;
            if (isSupportCalibration(kind)) {
                if (!supportSelect.value) {
                    showToast("Choose a different Support client first", "error");
                    return;
                }
                void refreshFrame(false, supportSelect.value);
            } else if (currentFrameProfileId !== profileId()) {
                void refreshFrame(false, profileId());
            }
        };
        if (kind === "target" || kind === "loot" || kind === "death") {
            const badge = el("span", "automationTemplateBadge", "missing");
            templateBadges.set(kind, badge);
            item.append(badge);
        }
        calibrationGrid.append(item);
    }
    calibrationPanel.append(calibrationGrid);

    const statusBadge = el("div", "automationState stopped", "STOPPED");
    const reason = el("div", "automationReason", "Ready");
    const metrics = el("div", "automationMetrics");
    const acknowledgement = document.createElement("input");
    acknowledgement.type = "checkbox";
    const acknowledgementRow = el("label", "automationAcknowledge");
    acknowledgementRow.append(acknowledgement, el("span", "", "I am supervising the selected foreground client and accept the game-account risk."));
    const startButton = actionButton("Start", "automationButton success");
    const pauseButton = actionButton("Pause");
    const resumeButton = actionButton("Resume");
    const stopButton = actionButton("Emergency stop", "automationButton danger");
    const controls = el("div", "automationControls");
    controls.append(startButton, pauseButton, resumeButton, stopButton);
    const sessionPanel = el("section", "automationCard automationSession");
    sessionPanel.append(
        el("h2", "automationCardTitle", "Supervised session"),
        statusBadge, reason, metrics, acknowledgementRow, controls,
        el("p", "automationShortcut", "Global emergency stop: Ctrl+Shift+F12"),
    );
    const setupChecklist = el("div", "automationMetrics");
    const setupNext = el("p", "automationShortcut", "Choose a mode to see required setup.");
    const setupPanel = el("section", "automationCard");
    setupPanel.append(
        el("h2", "automationCardTitle", "Setup assistant"),
        el("p", "automationShortcut", "Open Main and Support in launcher Grid/Split view before calibrating."),
        setupChecklist,
        setupNext,
    );
    const sidebar = el("aside", "automationSidebar");
    sidebar.append(sessionPanel, setupPanel, configPanel, supportPanel, calibrationPanel);
    const layout = el("div", "automationLayout");
    layout.append(main, sidebar);
    root.append(header, toolbar, layout);

    let config: AutomationConfig | null = null;
    let templates: AutomationTemplateState = { target: false, loot: false, death: false };
    let frameImage: HTMLImageElement | null = null;
    let dragStart: { x: number; y: number } | null = null;
    let dragEnd: { x: number; y: number } | null = null;
    let refreshInFlight = false;
    let currentFrameProfileId = "";
    let profiles: Profile[] = [];
    const profileId = (): string => profileSelect.value;
    const valueOf = (input: HTMLInputElement, fallback: number): number => {
        const parsed = Number(input.value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };
    const combatModeSelected = (): boolean =>
        modeSelect.value === "combat" || modeSelect.value === "combat_support";
    const supportModeSelected = (): boolean =>
        modeSelect.value === "support" || modeSelect.value === "combat_support";

    function setupChecks(): SetupCheck[] {
        const mode = modeSelect.value === "combat"
            || modeSelect.value === "support"
            || modeSelect.value === "combat_support"
            ? modeSelect.value
            : "observer";
        return automationSetupChecklist({
            mode,
            mainProfileId: profileId(),
            supportProfileId: supportSelect.value || null,
            hasPlayerHp: Boolean(config?.playerHpRoi),
            hasTargetHp: Boolean(config?.targetHpRoi),
            hasTargetTemplate: templates.target,
            useAttackSkills: useAttackSkills.checked,
            hasAttackKeys: attack.input.value.split(",").some((key) => key.trim().length > 0),
            hasMainPartyHp: Boolean(config?.mainPartyHpRoi),
            hasMainPartyRow: Boolean(config?.mainPartyTargetRoi),
            hasSupportHealKey: supportHeal.input.value.trim().length > 0,
            selfHealEnabled: supportSelfEnabled.checked,
            hasSupportHp: Boolean(config?.supportSelfHpRoi),
            mpPotionEnabled: supportMpEnabled.checked,
            hasSupportMp: Boolean(config?.supportMpRoi),
            resurrectionEnabled: supportResurrectionEnabled.checked,
            hasDeathTemplate: templates.death,
            acknowledged: acknowledgement.checked,
        });
    }

    function updateSetupAssistant(): void {
        const checks = setupChecks();
        setupChecklist.replaceChildren(...checks.map((check) =>
            el("div", "", (check.ready ? "✓ " : "○ ") + check.label)));
        const missing = checks.filter((check) => !check.ready);
        setupNext.textContent = missing.length === 0
            ? modeSelect.value === "observer"
                ? "Observer is ready. Press Start when the selected game view is visible."
                : "Ready to start. Keep Main focused and supervise the first actions."
            : "Next: " + missing[0]!.label + ".";
        startButton.textContent = modeSelect.value === "support"
            ? "Start Support"
            : modeSelect.value === "combat_support"
                ? "Start Main + Support"
                : modeSelect.value === "combat"
                    ? "Start Main combat"
                    : "Start observer";
    }

    function setFieldsDisabled(
        fields: Array<{ input: HTMLInputElement }>,
        disabled: boolean,
    ): void {
        for (const field of fields) field.input.disabled = disabled;
    }

    function syncGuidedUi(): void {
        setFieldsDisabled(
            [attack],
            !useAttackSkills.checked,
        );
        setFieldsDisabled(
            [supportSelfHeal, supportSelfHealAt, supportSelfSafeAt, supportSelfInterval],
            !supportSelfEnabled.checked,
        );
        setFieldsDisabled(
            [supportMpPotion, supportMpAt, supportMpCooldown],
            !supportMpEnabled.checked,
        );
        setFieldsDisabled(
            [supportResurrection, supportResurrectionRetry, supportResurrectionAttempts],
            !supportResurrectionEnabled.checked,
        );
        if (supportSelfEnabled.checked || supportMpEnabled.checked) selfCareDetails.open = true;
        if (supportResurrectionEnabled.checked) resurrectionDetails.open = true;
        mainConfigDetails.open = combatModeSelected();
        supportPanel.hidden = !supportModeSelected();
        calibrationPanel.hidden = modeSelect.value === "observer";
        const supportKinds = new Set<CalibrationKind>([
            "mainPartyHpRoi",
            "mainPartyTargetRoi",
            "supportSelfHpRoi",
            "supportMpRoi",
            "death",
        ]);
        const combatKinds = new Set<CalibrationKind>([
            "playerHpRoi",
            "targetHpRoi",
            "targetScanRoi",
            "target",
            "loot",
            "death",
        ]);
        for (const [kind, button] of calibrationButtons) {
            button.hidden = !(
                (supportModeSelected() && supportKinds.has(kind))
                || (combatModeSelected() && combatKinds.has(kind))
            );
        }
        updateSetupAssistant();
    }

    function updateConfigFromFields(): void {
        if (!config) return;
        config.mode = modeSelect.value === "combat"
            || modeSelect.value === "support"
            || modeSelect.value === "combat_support"
            ? modeSelect.value
            : "observer";
        config.useAttackSkills = useAttackSkills.checked;
        config.attackKeys = attack.input.value.split(",").map((key) => key.trim().toUpperCase()).filter(Boolean);
        config.healKey = heal.input.value.trim().toUpperCase();
        config.pickupKey = pickup.input.value.trim().toUpperCase();
        config.searchKey = search.input.value.trim().toUpperCase();
        config.healThreshold = valueOf(healAt.input, config.healThreshold);
        config.safeHpThreshold = valueOf(safeAt.input, config.safeHpThreshold);
        config.templateThreshold = valueOf(threshold.input, config.templateThreshold);
        config.tickMs = valueOf(tick.input, config.tickMs);
        config.actionIntervalMs = valueOf(action.input, config.actionIntervalMs);
        config.supportProfileId = supportSelect.value || null;
        config.supportHealKey = supportHeal.input.value.trim().toUpperCase();
        config.supportFollowKey = supportFollow.input.value.trim().toUpperCase();
        config.supportDeselectKey = supportDeselect.input.value.trim().toUpperCase();
        config.supportHealThreshold = valueOf(supportHealAt.input, config.supportHealThreshold);
        config.supportSafeHpThreshold = valueOf(supportSafeAt.input, config.supportSafeHpThreshold);
        config.supportHealIntervalMs = valueOf(supportHealInterval.input, config.supportHealIntervalMs);
        config.supportEmergencyHealThreshold = valueOf(supportEmergencyAt.input, config.supportEmergencyHealThreshold);
        config.supportEmergencyHealIntervalMs = valueOf(supportEmergencyInterval.input, config.supportEmergencyHealIntervalMs);
        config.supportHpStableSamples = valueOf(supportStableSamples.input, config.supportHpStableSamples);
        config.supportSelfHealEnabled = supportSelfEnabled.checked;
        config.supportSelfHealKey = supportSelfHeal.input.value.trim().toUpperCase();
        config.supportSelfHealThreshold = valueOf(supportSelfHealAt.input, config.supportSelfHealThreshold);
        config.supportSelfSafeHpThreshold = valueOf(supportSelfSafeAt.input, config.supportSelfSafeHpThreshold);
        config.supportSelfHealIntervalMs = valueOf(supportSelfInterval.input, config.supportSelfHealIntervalMs);
        config.supportMpPotionEnabled = supportMpEnabled.checked;
        config.supportMpPotionKey = supportMpPotion.input.value.trim().toUpperCase();
        config.supportMpPotionThreshold = valueOf(supportMpAt.input, config.supportMpPotionThreshold);
        config.supportMpPotionCooldownMs = valueOf(supportMpCooldown.input, config.supportMpPotionCooldownMs);
        config.supportResurrectionEnabled = supportResurrectionEnabled.checked;
        config.supportResurrectionKey = supportResurrection.input.value.trim().toUpperCase();
        config.supportResurrectionRetryMs = valueOf(supportResurrectionRetry.input, config.supportResurrectionRetryMs);
        config.supportResurrectionMaxAttempts = valueOf(
            supportResurrectionAttempts.input,
            config.supportResurrectionMaxAttempts,
        );
        config.supportFollowIntervalMs = valueOf(supportFollowInterval.input, config.supportFollowIntervalMs);
        config.supportFollowAfterAction = supportAutoFollow.checked;
        config.supportBuffs = supportBuffs.input.value.split(",").map((entry) => {
            const [rawKey, rawInterval, rawTarget] = entry.split(":");
            return {
                key: rawKey?.trim().toUpperCase() ?? "",
                intervalSec: Number(rawInterval?.trim() ?? "600"),
                target: rawTarget?.trim().toLowerCase() === "self" ? "self" as const : "main" as const,
            };
        }).filter((buff) => buff.key.length > 0 && Number.isFinite(buff.intervalSec));
    }

    function updateFields(): void {
        if (!config) return;
        modeSelect.value = config.mode;
        useAttackSkills.checked = config.useAttackSkills;
        attack.input.value = config.attackKeys.join(", ");
        heal.input.value = config.healKey;
        pickup.input.value = config.pickupKey;
        search.input.value = config.searchKey;
        healAt.input.value = String(config.healThreshold);
        safeAt.input.value = String(config.safeHpThreshold);
        threshold.input.value = String(config.templateThreshold);
        tick.input.value = String(config.tickMs);
        action.input.value = String(config.actionIntervalMs);
        supportSelect.value = config.supportProfileId ?? "";
        supportHeal.input.value = config.supportHealKey;
        supportFollow.input.value = config.supportFollowKey;
        supportDeselect.input.value = config.supportDeselectKey;
        supportHealAt.input.value = String(config.supportHealThreshold);
        supportSafeAt.input.value = String(config.supportSafeHpThreshold);
        supportHealInterval.input.value = String(config.supportHealIntervalMs);
        supportEmergencyAt.input.value = String(config.supportEmergencyHealThreshold);
        supportEmergencyInterval.input.value = String(config.supportEmergencyHealIntervalMs);
        supportStableSamples.input.value = String(config.supportHpStableSamples);
        supportSelfEnabled.checked = config.supportSelfHealEnabled;
        supportSelfHeal.input.value = config.supportSelfHealKey;
        supportSelfHealAt.input.value = String(config.supportSelfHealThreshold);
        supportSelfSafeAt.input.value = String(config.supportSelfSafeHpThreshold);
        supportSelfInterval.input.value = String(config.supportSelfHealIntervalMs);
        supportMpEnabled.checked = config.supportMpPotionEnabled;
        supportMpPotion.input.value = config.supportMpPotionKey;
        supportMpAt.input.value = String(config.supportMpPotionThreshold);
        supportMpCooldown.input.value = String(config.supportMpPotionCooldownMs);
        supportResurrectionEnabled.checked = config.supportResurrectionEnabled;
        supportResurrection.input.value = config.supportResurrectionKey;
        supportResurrectionRetry.input.value = String(config.supportResurrectionRetryMs);
        supportResurrectionAttempts.input.value = String(config.supportResurrectionMaxAttempts);
        supportFollowInterval.input.value = String(config.supportFollowIntervalMs);
        supportAutoFollow.checked = config.supportFollowAfterAction;
        supportBuffs.input.value = config.supportBuffs
            .map((buff) => buff.key + ":" + buff.intervalSec + ":" + buff.target)
            .join(", ");
        for (const kind of ["target", "loot", "death"] as const) {
            const badge = templateBadges.get(kind);
            if (!badge) continue;
            badge.textContent = templates[kind] ? "ready" : "missing";
            badge.classList.toggle("ready", templates[kind]);
        }
        draw();
        syncGuidedUi();
    }

    function strokeRect(ctx: CanvasRenderingContext2D, rect: NormalizedRect, color: string, label: string): void {
        const x = rect.x * canvas.width;
        const y = rect.y * canvas.height;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, canvas.width / 600);
        ctx.strokeRect(x, y, rect.width * canvas.width, rect.height * canvas.height);
        ctx.fillStyle = color;
        ctx.font = `${Math.max(12, canvas.width / 80)}px sans-serif`;
        ctx.fillText(label, x + 4, Math.max(14, y - 5));
    }

    function draw(): void {
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#05070d";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (frameImage) ctx.drawImage(frameImage, 0, 0, canvas.width, canvas.height);
        if (currentFrameProfileId === profileId()) {
            if (config?.playerHpRoi) strokeRect(ctx, config.playerHpRoi, "#ef476f", "Player HP");
            if (config?.targetHpRoi) strokeRect(ctx, config.targetHpRoi, "#ffd166", "Target HP");
            if (config?.targetScanRoi) strokeRect(ctx, config.targetScanRoi, "#06d6a0", "Scan area");
        } else if (currentFrameProfileId === config?.supportProfileId) {
            if (config.mainPartyHpRoi) strokeRect(ctx, config.mainPartyHpRoi, "#ef476f", "Main party HP");
            if (config.mainPartyTargetRoi) strokeRect(ctx, config.mainPartyTargetRoi, "#ffd166", "Main party row");
            if (config.supportSelfHpRoi) strokeRect(ctx, config.supportSelfHpRoi, "#ff8fab", "Support HP");
            if (config.supportMpRoi) strokeRect(ctx, config.supportMpRoi, "#4cc9f0", "Support MP");
        }
        if (dragStart && dragEnd) {
            const x = Math.min(dragStart.x, dragEnd.x);
            const y = Math.min(dragStart.y, dragEnd.y);
            const width = Math.abs(dragEnd.x - dragStart.x);
            const height = Math.abs(dragEnd.y - dragStart.y);
            ctx.fillStyle = "rgba(155,89,255,.18)";
            ctx.fillRect(x, y, width, height);
            ctx.strokeStyle = "#a970ff";
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, width, height);
        }
    }

    function point(event: PointerEvent): { x: number; y: number } {
        const rect = canvas.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * canvas.width / rect.width)),
            y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * canvas.height / rect.height)),
        };
    }

    canvas.onpointerdown = (event) => {
        if (!selectedCalibration || !frameImage) return;
        canvas.setPointerCapture(event.pointerId);
        dragStart = point(event);
        dragEnd = dragStart;
        draw();
    };
    canvas.onpointermove = (event) => {
        if (!dragStart) return;
        dragEnd = point(event);
        draw();
    };
    canvas.onpointerup = async (event) => {
        if (!dragStart || !selectedCalibration || !config) return;
        dragEnd = point(event);
        const x = Math.min(dragStart.x, dragEnd.x);
        const y = Math.min(dragStart.y, dragEnd.y);
        const width = Math.abs(dragEnd.x - dragStart.x);
        const height = Math.abs(dragEnd.y - dragStart.y);
        dragStart = null;
        dragEnd = null;
        if (width < 4 || height < 4) return draw();
        const rect: NormalizedRect = { x: x / canvas.width, y: y / canvas.height, width: width / canvas.width, height: height / canvas.height };
        const kind = selectedCalibration;
        try {
            if (isSupportCalibration(kind) && currentFrameProfileId !== config.supportProfileId) {
                throw new Error("Refresh the selected Support view before calibrating its party panel");
            }
            if (!isSupportCalibration(kind) && currentFrameProfileId !== profileId()) {
                throw new Error("Refresh the Main view before calibrating this region");
            }
            if (kind === "playerHpRoi"
                || kind === "targetHpRoi"
                || kind === "targetScanRoi"
                || kind === "mainPartyHpRoi"
                || kind === "mainPartyTargetRoi"
                || kind === "supportSelfHpRoi"
                || kind === "supportMpRoi") {
                if ((kind === "playerHpRoi"
                    || kind === "targetHpRoi"
                    || kind === "mainPartyHpRoi"
                    || kind === "supportSelfHpRoi"
                    || kind === "supportMpRoi")
                    && (rect.width > 0.60 || rect.height > 0.18 || rect.width * rect.height > 0.06)) {
                    throw new Error("Bar selection is too large; select only the colored interior");
                }
                if (kind === "mainPartyTargetRoi"
                    && (rect.width > 0.70 || rect.height > 0.20 || rect.width * rect.height > 0.10)) {
                    throw new Error("Main party row is too large; select only the Main character's name row");
                }
                config[kind] = rect;
                canvasHint.textContent = "Region updated. Save the profile to persist it.";
            } else {
                const result = await window.api.automationCaptureTemplate({ profileId: profileId(), kind, rect });
                templates = result.templates;
                canvasHint.textContent = `${kind} template captured.`;
            }
            updateFields();
        } catch (error) {
            showToast(error instanceof Error ? error.message : String(error), "error");
        }
    };

    async function refreshFrame(showCalibrationGuidance = false, sourceProfileId = profileId()): Promise<void> {
        if (refreshInFlight || !sourceProfileId) return;
        refreshInFlight = true;
        refreshButton.disabled = true;
        try {
            const preview = await window.api.automationPreview(sourceProfileId);
            const next = new Image();
            await new Promise<void>((resolve, reject) => {
                next.onload = () => resolve();
                next.onerror = () => reject(new Error("Could not decode captured frame"));
                next.src = preview.dataUrl;
            });
            frameImage = next;
            currentFrameProfileId = sourceProfileId;
            canvas.width = preview.width;
            canvas.height = preview.height;
            const captured = `Captured ${preview.width}×${preview.height} at ${new Date(preview.capturedAt).toLocaleTimeString()}`;
            canvasHint.textContent = showCalibrationGuidance
                && sourceProfileId === profileId()
                && !config?.playerHpRoi
                && !templates.target
                ? captured + ". Verify the game is visible, then recalibrate Player HP and capture a small target label."
                : captured + (sourceProfileId === profileId() ? " • Main view" : " • Support view");
            draw();
        } catch (error) {
            canvasHint.textContent = error instanceof Error ? error.message : String(error);
        } finally {
            refreshInFlight = false;
            refreshButton.disabled = false;
        }
    }

    async function loadProfile(id: string): Promise<void> {
        const result = await window.api.automationGetConfig(id);
        config = result.config;
        templates = result.templates;
        refreshSupportOptions(id);
        currentFrameProfileId = id;
        updateFields();
        await refreshFrame(true, id);
    }

    function applyStatus(status: AutomationStatus): void {
        statusBadge.className = `automationState ${status.state}`;
        statusBadge.textContent = `${status.state.toUpperCase()}${status.armed ? " • ARMED" : ""}`;
        reason.textContent = status.reason;
        const pct = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(1)}%`;
        metrics.textContent = [
            `HP ${pct(status.metrics.playerHp)}`,
            `Target HP ${pct(status.metrics.targetHp)}`,
            `Selected ${status.metrics.targetSelected ? "yes" : "no"}`,
            `Crosshair ${status.metrics.targetEngaged ? "RED" : "no"} ${pct(status.metrics.targetCrosshairScore)}`,
            `Main party ${pct(status.metrics.mainPartyHp)}`,
            `Support HP ${pct(status.metrics.supportHp)}`,
            `Support MP ${pct(status.metrics.supportMp)}`,
            `Emergency ${status.metrics.supportEmergency ? "BURST" : "no"}`,
            `Res attempts ${status.metrics.supportResurrectionAttempts}`,
            `Target ${pct(status.metrics.targetScore)}`,
            `Loot ${pct(status.metrics.lootScore)}`,
            `Support ${status.metrics.supportAction ?? "—"}`,
            `Capture ${status.metrics.captureMs ?? "—"} ms`,
            `Analyze ${status.metrics.analyzeMs ?? "—"} ms`,
            `Actions ${status.actionCount}`,
        ].join("  •  ");
        startButton.disabled = !["stopped", "faulted"].includes(status.state);
        pauseButton.disabled = ["stopped", "paused", "faulted"].includes(status.state);
        resumeButton.disabled = status.state !== "paused";
        stopButton.disabled = status.state === "stopped";
    }

    function refreshSupportOptions(mainProfileId: string): void {
        const selected = config?.supportProfileId ?? supportSelect.value;
        supportSelect.replaceChildren(new Option("Choose Support profile", ""));
        for (const profile of profiles) {
            if (profile.id === mainProfileId) continue;
            supportSelect.append(new Option(profileLabel(profile), profile.id));
        }
        supportSelect.value = [...supportSelect.options].some((option) => option.value === selected) ? selected : "";
    }

    profileSelect.onchange = () => {
        void loadProfile(profileId()).catch((error) => showToast(String(error), "error"));
    };
    modeSelect.onchange = () => {
        syncGuidedUi();
    };
    supportSelect.onchange = () => {
        if (config) config.supportProfileId = supportSelect.value || null;
        if (isSupportCalibration(selectedCalibration) && supportSelect.value) {
            void refreshFrame(false, supportSelect.value);
        }
        updateSetupAssistant();
    };
    starterPresetButton.onclick = () => {
        if (!config) return;
        modeSelect.value = "support";
        supportHeal.input.value = "4";
        supportFollow.input.value = "Z";
        supportDeselect.input.value = "BACKQUOTE";
        supportHealAt.input.value = "0.5";
        supportSafeAt.input.value = "0.8";
        supportHealInterval.input.value = "1100";
        supportEmergencyAt.input.value = "0.25";
        supportEmergencyInterval.input.value = "300";
        supportStableSamples.input.value = "2";
        supportFollowInterval.input.value = "5000";
        supportSelfEnabled.checked = false;
        supportMpEnabled.checked = false;
        supportResurrectionEnabled.checked = false;
        supportAutoFollow.checked = true;
        supportBuffs.input.value = "";
        updateConfigFromFields();
        syncGuidedUi();
        showToast("Starter preset applied. Select Support, then complete calibration steps 1 and 2.", "success");
    };
    root.addEventListener("input", () => syncGuidedUi());
    refreshButton.onclick = () => {
        const source = isSupportCalibration(selectedCalibration) ? supportSelect.value : profileId();
        if (!source) return showToast("Choose a Support client first", "error");
        void refreshFrame(true, source);
    };
    saveButton.onclick = async () => {
        if (!config) return;
        updateConfigFromFields();
        try {
            config = await window.api.automationSaveConfig(profileId(), config);
            updateFields();
            showToast("Automation profile saved", "success");
        } catch (error) { showToast(error instanceof Error ? error.message : String(error), "error"); }
    };
    startButton.onclick = async () => {
        if (!config) return;
        updateConfigFromFields();
        const missing = setupChecks().filter((check) => !check.ready);
        if (missing.length > 0) {
            updateSetupAssistant();
            showToast("Setup incomplete: " + missing.map((check) => check.label).join("; "), "error");
            return;
        }
        try {
            config = await window.api.automationSaveConfig(profileId(), config);
            applyStatus(await window.api.automationStart(profileId(), acknowledgement.checked));
        } catch (error) { showToast(error instanceof Error ? error.message : String(error), "error"); }
    };
    pauseButton.onclick = () => void window.api.automationPause().then(applyStatus).catch((error) => showToast(String(error), "error"));
    resumeButton.onclick = () => void window.api.automationResume(acknowledgement.checked).then(applyStatus).catch((error) => showToast(String(error), "error"));
    stopButton.onclick = () => void window.api.automationStop().then(applyStatus).catch((error) => showToast(String(error), "error"));
    window.api.onAutomationStatus(applyStatus);
    window.api.onAutomationSelectProfile((id) => {
        if ([...profileSelect.options].some((option) => option.value === id)) {
            profileSelect.value = id;
            void loadProfile(id);
        }
    });

    profiles = await window.api.profilesList() as Profile[];
    for (const profile of profiles) {
        profileSelect.append(new Option(profileLabel(profile), profile.id));
    }
    const requested = qs().get("profileId");
    if (requested && profiles.some((profile) => profile.id === requested)) profileSelect.value = requested;
    refreshSupportOptions(profileId());
    if (profiles.length === 0) {
        profileSelect.append(new Option("Create a launcher profile first", ""));
        profileSelect.disabled = true;
        refreshButton.disabled = true;
        saveButton.disabled = true;
    } else {
        await loadProfile(profileId());
    }
    applyStatus(await window.api.automationStatus());
    const previewTimer = setInterval(() => {
        if (!document.hidden) void refreshFrame(false, currentFrameProfileId || profileId());
    }, 2500);
    window.addEventListener("beforeunload", () => clearInterval(previewTimer), { once: true });
}
