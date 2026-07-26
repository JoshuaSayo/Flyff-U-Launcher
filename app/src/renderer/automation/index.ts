/** Renderer for the supervised automation workbench. */

import type { AutomationConfig, AutomationStatus, AutomationTemplateKind, AutomationTemplateState, NormalizedRect } from "../../shared/automation";
import { clear, el, qs, showToast } from "../dom-utils";

type CalibrationKind = "playerHpRoi" | "targetHpRoi" | "targetScanRoi" | AutomationTemplateKind;
type Profile = { id: string; name?: string; characters?: string[] };

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
        el("p", "automationSubtitle", "Supervised foreground control • compositor capture • local pixel analysis"),
        el("div", "automationSafety", "No memory access, packets, DOM inspection, official-API data, background control, or anti-cheat bypass."),
    );

    const profileSelect = document.createElement("select");
    profileSelect.className = "automationSelect";
    const refreshButton = actionButton("Refresh frame");
    const saveButton = actionButton("Save profile", "automationButton primary");
    const toolbar = el("div", "automationToolbar");
    toolbar.append(el("span", "automationProfileLabel", "Client profile"), profileSelect, refreshButton, saveButton);

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
    modeSelect.append(new Option("Observer only", "observer"), new Option("Combat FSM", "combat"));
    const modeRow = el("label", "automationField");
    modeRow.append(el("span", "automationFieldLabel", "Mode"), modeSelect);
    const attack = textField("Attack rotation");
    const heal = textField("Heal key");
    const pickup = textField("Pickup key");
    const search = textField("Search/camera key");
    const healAt = numericField("Heal below", 0.05, 0.95, 0.05);
    const safeAt = numericField("Resume above", 0.10, 1, 0.05);
    const threshold = numericField("Template threshold", 0.45, 0.99, 0.01);
    const tick = numericField("Vision tick (ms)", 250, 2000, 50);
    const action = numericField("Action interval (ms)", 250, 5000, 50);
    const configPanel = el("section", "automationCard");
    configPanel.append(
        el("h2", "automationCardTitle", "Profile configuration"),
        modeRow, attack.row, heal.row, pickup.row, search.row,
        healAt.row, safeAt.row, threshold.row, tick.row, action.row,
    );

    const calibrationPanel = el("section", "automationCard");
    calibrationPanel.append(el("h2", "automationCardTitle", "Vision calibration"));
    const calibrationGrid = el("div", "automationCalibrationGrid");
    const calibrationItems: Array<[CalibrationKind, string]> = [
        ["playerHpRoi", "Player HP region"],
        ["targetHpRoi", "Target HP region"],
        ["targetScanRoi", "Target scan area"],
        ["target", "Capture target label"],
        ["loot", "Capture loot"],
        ["death", "Capture death dialog"],
    ];
    const templateBadges = new Map<AutomationTemplateKind, HTMLElement>();
    let selectedCalibration: CalibrationKind | null = null;
    for (const [kind, label] of calibrationItems) {
        const item = actionButton(label, "automationButton calibration");
        item.dataset.kind = kind;
        item.onclick = () => {
            selectedCalibration = kind;
            for (const candidate of calibrationGrid.querySelectorAll("button")) candidate.classList.toggle("selected", candidate === item);
            canvasHint.textContent = `Drag the ${label.toLowerCase()} rectangle on the current frame.`;
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
    const sidebar = el("aside", "automationSidebar");
    sidebar.append(configPanel, calibrationPanel, sessionPanel);
    const layout = el("div", "automationLayout");
    layout.append(main, sidebar);
    root.append(header, toolbar, layout);

    let config: AutomationConfig | null = null;
    let templates: AutomationTemplateState = { target: false, loot: false, death: false };
    let frameImage: HTMLImageElement | null = null;
    let dragStart: { x: number; y: number } | null = null;
    let dragEnd: { x: number; y: number } | null = null;
    let refreshInFlight = false;
    const profileId = (): string => profileSelect.value;
    const valueOf = (input: HTMLInputElement, fallback: number): number => {
        const parsed = Number(input.value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };

    function updateConfigFromFields(): void {
        if (!config) return;
        config.mode = modeSelect.value === "combat" ? "combat" : "observer";
        config.attackKeys = attack.input.value.split(",").map((key) => key.trim().toUpperCase()).filter(Boolean);
        config.healKey = heal.input.value.trim().toUpperCase();
        config.pickupKey = pickup.input.value.trim().toUpperCase();
        config.searchKey = search.input.value.trim().toUpperCase();
        config.healThreshold = valueOf(healAt.input, config.healThreshold);
        config.safeHpThreshold = valueOf(safeAt.input, config.safeHpThreshold);
        config.templateThreshold = valueOf(threshold.input, config.templateThreshold);
        config.tickMs = valueOf(tick.input, config.tickMs);
        config.actionIntervalMs = valueOf(action.input, config.actionIntervalMs);
    }

    function updateFields(): void {
        if (!config) return;
        modeSelect.value = config.mode;
        attack.input.value = config.attackKeys.join(", ");
        heal.input.value = config.healKey;
        pickup.input.value = config.pickupKey;
        search.input.value = config.searchKey;
        healAt.input.value = String(config.healThreshold);
        safeAt.input.value = String(config.safeHpThreshold);
        threshold.input.value = String(config.templateThreshold);
        tick.input.value = String(config.tickMs);
        action.input.value = String(config.actionIntervalMs);
        for (const kind of ["target", "loot", "death"] as const) {
            const badge = templateBadges.get(kind);
            if (!badge) continue;
            badge.textContent = templates[kind] ? "ready" : "missing";
            badge.classList.toggle("ready", templates[kind]);
        }
        draw();
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
        if (config?.playerHpRoi) strokeRect(ctx, config.playerHpRoi, "#ef476f", "Player HP");
        if (config?.targetHpRoi) strokeRect(ctx, config.targetHpRoi, "#ffd166", "Target HP");
        if (config?.targetScanRoi) strokeRect(ctx, config.targetScanRoi, "#06d6a0", "Scan area");
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
            if (kind === "playerHpRoi" || kind === "targetHpRoi" || kind === "targetScanRoi") {
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

    async function refreshFrame(): Promise<void> {
        if (refreshInFlight || !profileId()) return;
        refreshInFlight = true;
        refreshButton.disabled = true;
        try {
            const preview = await window.api.automationPreview(profileId());
            const next = new Image();
            await new Promise<void>((resolve, reject) => {
                next.onload = () => resolve();
                next.onerror = () => reject(new Error("Could not decode captured frame"));
                next.src = preview.dataUrl;
            });
            frameImage = next;
            canvas.width = preview.width;
            canvas.height = preview.height;
            canvasHint.textContent = `Captured ${preview.width}×${preview.height} at ${new Date(preview.capturedAt).toLocaleTimeString()}`;
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
        updateFields();
        await refreshFrame();
    }

    function applyStatus(status: AutomationStatus): void {
        statusBadge.className = `automationState ${status.state}`;
        statusBadge.textContent = `${status.state.toUpperCase()}${status.armed ? " • ARMED" : ""}`;
        reason.textContent = status.reason;
        const pct = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(1)}%`;
        metrics.textContent = [
            `HP ${pct(status.metrics.playerHp)}`,
            `Target ${pct(status.metrics.targetScore)}`,
            `Loot ${pct(status.metrics.lootScore)}`,
            `Capture ${status.metrics.captureMs ?? "—"} ms`,
            `Analyze ${status.metrics.analyzeMs ?? "—"} ms`,
            `Actions ${status.actionCount}`,
        ].join("  •  ");
        startButton.disabled = !["stopped", "faulted"].includes(status.state);
        pauseButton.disabled = ["stopped", "paused", "faulted"].includes(status.state);
        resumeButton.disabled = status.state !== "paused";
        stopButton.disabled = status.state === "stopped";
    }

    profileSelect.onchange = () => void loadProfile(profileId()).catch((error) => showToast(String(error), "error"));
    refreshButton.onclick = () => void refreshFrame();
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

    const profiles = await window.api.profilesList() as Profile[];
    for (const profile of profiles) {
        profileSelect.append(new Option(profile.name?.trim() || profile.characters?.[0]?.trim() || profile.id, profile.id));
    }
    const requested = qs().get("profileId");
    if (requested && profiles.some((profile) => profile.id === requested)) profileSelect.value = requested;
    if (profiles.length === 0) {
        profileSelect.append(new Option("Create a launcher profile first", ""));
        profileSelect.disabled = true;
        refreshButton.disabled = true;
        saveButton.disabled = true;
    } else {
        await loadProfile(profileId());
    }
    applyStatus(await window.api.automationStatus());
    const previewTimer = setInterval(() => { if (!document.hidden) void refreshFrame(); }, 2500);
    window.addEventListener("beforeunload", () => clearInterval(previewTimer), { once: true });
}
