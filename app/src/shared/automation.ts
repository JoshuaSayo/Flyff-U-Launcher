/** Shared contracts for the supervised, vision-only automation workbench. */

export type AutomationTemplateKind = "target" | "loot" | "death";

export type AutomationState =
    | "stopped"
    | "observing"
    | "searching"
    | "approaching"
    | "attacking"
    | "healing"
    | "looting"
    | "paused"
    | "faulted";

export type NormalizedRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type AutomationConfig = {
    version: 1;
    profileId: string;
    mode: "observer" | "combat";
    playerHpRoi: NormalizedRect | null;
    targetHpRoi: NormalizedRect | null;
    targetScanRoi: NormalizedRect;
    healThreshold: number;
    safeHpThreshold: number;
    templateThreshold: number;
    attackKeys: string[];
    healKey: string;
    pickupKey: string;
    searchKey: string;
    tickMs: number;
    actionIntervalMs: number;
    approachTimeoutMs: number;
    lootTimeoutMs: number;
    stateTimeoutMs: number;
};

export type AutomationTemplateState = Record<AutomationTemplateKind, boolean>;

export type AutomationMetrics = {
    playerHp: number | null;
    targetHp: number | null;
    targetScore: number | null;
    lootScore: number | null;
    captureMs: number | null;
    analyzeMs: number | null;
};

export type AutomationStatus = {
    state: AutomationState;
    profileId: string | null;
    armed: boolean;
    reason: string;
    updatedAt: string;
    transitionCount: number;
    actionCount: number;
    metrics: AutomationMetrics;
};

export type TemplateCaptureRequest = {
    profileId: string;
    kind: AutomationTemplateKind;
    rect: NormalizedRect;
};

export function defaultAutomationConfig(profileId: string): AutomationConfig {
    return {
        version: 1,
        profileId,
        mode: "observer",
        playerHpRoi: null,
        targetHpRoi: null,
        targetScanRoi: { x: 0.08, y: 0.08, width: 0.84, height: 0.62 },
        healThreshold: 0.40,
        safeHpThreshold: 0.75,
        templateThreshold: 0.82,
        attackKeys: ["1", "2", "3"],
        healKey: "4",
        pickupKey: "Z",
        searchKey: "RIGHT",
        tickMs: 500,
        actionIntervalMs: 850,
        approachTimeoutMs: 5000,
        lootTimeoutMs: 3500,
        stateTimeoutMs: 30000,
    };
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

export function normalizeRect(value: unknown, fallback: NormalizedRect | null): NormalizedRect | null {
    if (!value || typeof value !== "object") return fallback;
    const candidate = value as Partial<NormalizedRect>;
    const x = finiteNumber(candidate.x, -1, 0, 1);
    const y = finiteNumber(candidate.y, -1, 0, 1);
    const width = finiteNumber(candidate.width, -1, 0.001, 1);
    const height = finiteNumber(candidate.height, -1, 0.001, 1);
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.0001 || y + height > 1.0001) {
        return fallback;
    }
    return { x, y, width, height };
}

function normalizeKey(value: unknown, fallback: string): string {
    if (typeof value !== "string") return fallback;
    const key = value.trim().toUpperCase();
    return /^(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|SPACE|LEFT|RIGHT|UP|DOWN|TAB)$/.test(key) ? key : fallback;
}

/** Normalize renderer or disk input into a bounded automation configuration. */
export function normalizeAutomationConfig(profileId: string, value: unknown): AutomationConfig {
    const defaults = defaultAutomationConfig(profileId);
    const input = value && typeof value === "object" ? value as Partial<AutomationConfig> : {};
    const keys = Array.isArray(input.attackKeys)
        ? input.attackKeys.map((key) => normalizeKey(key, "")).filter(Boolean).slice(0, 8)
        : defaults.attackKeys;
    const config: AutomationConfig = {
        ...defaults,
        profileId,
        mode: input.mode === "combat" ? "combat" : "observer",
        playerHpRoi: normalizeRect(input.playerHpRoi, null),
        targetHpRoi: normalizeRect(input.targetHpRoi, null),
        targetScanRoi: normalizeRect(input.targetScanRoi, defaults.targetScanRoi) ?? defaults.targetScanRoi,
        healThreshold: finiteNumber(input.healThreshold, defaults.healThreshold, 0.05, 0.95),
        safeHpThreshold: finiteNumber(input.safeHpThreshold, defaults.safeHpThreshold, 0.10, 1),
        templateThreshold: finiteNumber(input.templateThreshold, defaults.templateThreshold, 0.45, 0.99),
        attackKeys: keys.length > 0 ? keys : defaults.attackKeys,
        healKey: normalizeKey(input.healKey, defaults.healKey),
        pickupKey: normalizeKey(input.pickupKey, defaults.pickupKey),
        searchKey: normalizeKey(input.searchKey, defaults.searchKey),
        tickMs: Math.round(finiteNumber(input.tickMs, defaults.tickMs, 250, 2000)),
        actionIntervalMs: Math.round(finiteNumber(input.actionIntervalMs, defaults.actionIntervalMs, 250, 5000)),
        approachTimeoutMs: Math.round(finiteNumber(input.approachTimeoutMs, defaults.approachTimeoutMs, 1000, 15000)),
        lootTimeoutMs: Math.round(finiteNumber(input.lootTimeoutMs, defaults.lootTimeoutMs, 500, 15000)),
        stateTimeoutMs: Math.round(finiteNumber(input.stateTimeoutMs, defaults.stateTimeoutMs, 5000, 180000)),
    };
    config.safeHpThreshold = Math.max(config.safeHpThreshold, Math.min(1, config.healThreshold + 0.05));
    return config;
}
