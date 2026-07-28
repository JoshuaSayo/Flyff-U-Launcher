/** Shared contracts for the supervised, vision-only automation workbench. */

export type AutomationTemplateKind = "target" | "loot" | "death";

export const AUTOMATION_CONFIG_VERSION = 4 as const;

export type AutomationMode = "observer" | "combat" | "support" | "combat_support";

export type SupportBuff = {
    key: string;
    intervalSec: number;
    target: "main" | "self";
};

export type AutomationState =
    | "stopped"
    | "observing"
    | "searching"
    | "approaching"
    | "attacking"
    | "healing"
    | "looting"
    | "supporting"
    | "paused"
    | "faulted";

export type NormalizedRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type AutomationConfig = {
    version: typeof AUTOMATION_CONFIG_VERSION;
    profileId: string;
    mode: AutomationMode;
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
    supportProfileId: string | null;
    mainPartyHpRoi: NormalizedRect | null;
    mainPartyTargetRoi: NormalizedRect | null;
    supportSelfHpRoi: NormalizedRect | null;
    supportMpRoi: NormalizedRect | null;
    supportHealKey: string;
    supportFollowKey: string;
    supportDeselectKey: string;
    supportHealThreshold: number;
    supportSafeHpThreshold: number;
    supportHealIntervalMs: number;
    supportEmergencyHealThreshold: number;
    supportEmergencyHealIntervalMs: number;
    supportHpStableSamples: number;
    supportSelfHealEnabled: boolean;
    supportSelfHealKey: string;
    supportSelfHealThreshold: number;
    supportSelfSafeHpThreshold: number;
    supportSelfHealIntervalMs: number;
    supportMpPotionEnabled: boolean;
    supportMpPotionKey: string;
    supportMpPotionThreshold: number;
    supportMpPotionCooldownMs: number;
    supportResurrectionEnabled: boolean;
    supportResurrectionKey: string;
    supportResurrectionRetryMs: number;
    supportResurrectionMaxAttempts: number;
    supportFollowAfterAction: boolean;
    supportFollowIntervalMs: number;
    supportBuffs: SupportBuff[];
};

export type AutomationTemplateState = Record<AutomationTemplateKind, boolean>;

export type AutomationMetrics = {
    playerHp: number | null;
    targetHp: number | null;
    targetScore: number | null;
    lootScore: number | null;
    mainPartyHp: number | null;
    supportHp: number | null;
    supportMp: number | null;
    supportEmergency: boolean;
    supportResurrectionAttempts: number;
    supportProfileId: string | null;
    supportAction: string | null;
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
        version: AUTOMATION_CONFIG_VERSION,
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
        supportProfileId: null,
        mainPartyHpRoi: null,
        mainPartyTargetRoi: null,
        supportSelfHpRoi: null,
        supportMpRoi: null,
        supportHealKey: "4",
        supportFollowKey: "Z",
        supportDeselectKey: "BACKQUOTE",
        supportHealThreshold: 0.50,
        supportSafeHpThreshold: 0.80,
        supportHealIntervalMs: 1100,
        supportEmergencyHealThreshold: 0.25,
        supportEmergencyHealIntervalMs: 300,
        supportHpStableSamples: 2,
        supportSelfHealEnabled: false,
        supportSelfHealKey: "4",
        supportSelfHealThreshold: 0.35,
        supportSelfSafeHpThreshold: 0.70,
        supportSelfHealIntervalMs: 1200,
        supportMpPotionEnabled: false,
        supportMpPotionKey: "5",
        supportMpPotionThreshold: 0.25,
        supportMpPotionCooldownMs: 15000,
        supportResurrectionEnabled: false,
        supportResurrectionKey: "F1",
        supportResurrectionRetryMs: 4000,
        supportResurrectionMaxAttempts: 3,
        supportFollowAfterAction: true,
        supportFollowIntervalMs: 5000,
        supportBuffs: [],
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

function normalizeBarRect(value: unknown): NormalizedRect | null {
    const rect = normalizeRect(value, null);
    if (!rect || rect.width > 0.60 || rect.height > 0.18 || rect.width * rect.height > 0.06) return null;
    return rect;
}

function normalizeSupportTargetRect(value: unknown): NormalizedRect | null {
    const rect = normalizeRect(value, null);
    if (!rect || rect.width > 0.70 || rect.height > 0.20 || rect.width * rect.height > 0.10) return null;
    return rect;
}

function normalizeKey(value: unknown, fallback: string): string {
    if (typeof value !== "string") return fallback;
    const key = value.trim().toUpperCase();
    return /^(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|SPACE|LEFT|RIGHT|UP|DOWN|TAB|ESCAPE|BACKQUOTE)$/.test(key) ? key : fallback;
}

function normalizeSupportBuffs(value: unknown): SupportBuff[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const buffs: SupportBuff[] = [];
    for (const candidate of value) {
        if (!candidate || typeof candidate !== "object") continue;
        const raw = candidate as Partial<SupportBuff>;
        const key = normalizeKey(raw.key, "");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        buffs.push({
            key,
            intervalSec: Math.round(finiteNumber(raw.intervalSec, 600, 10, 7200)),
            target: raw.target === "self" ? "self" : "main",
        });
        if (buffs.length >= 12) break;
    }
    return buffs;
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
        mode: input.mode === "combat" || input.mode === "support" || input.mode === "combat_support"
            ? input.mode
            : "observer",
        playerHpRoi: normalizeBarRect(input.playerHpRoi),
        targetHpRoi: normalizeBarRect(input.targetHpRoi),
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
        supportProfileId: typeof input.supportProfileId === "string"
            && input.supportProfileId.length > 0
            && input.supportProfileId.length <= 200
            && input.supportProfileId !== profileId
            ? input.supportProfileId
            : null,
        mainPartyHpRoi: normalizeBarRect(input.mainPartyHpRoi),
        mainPartyTargetRoi: normalizeSupportTargetRect(input.mainPartyTargetRoi),
        supportSelfHpRoi: normalizeBarRect(input.supportSelfHpRoi),
        supportMpRoi: normalizeBarRect(input.supportMpRoi),
        supportHealKey: normalizeKey(input.supportHealKey, defaults.supportHealKey),
        supportFollowKey: normalizeKey(input.supportFollowKey, defaults.supportFollowKey),
        supportDeselectKey: normalizeKey(input.supportDeselectKey, defaults.supportDeselectKey),
        supportHealThreshold: finiteNumber(input.supportHealThreshold, defaults.supportHealThreshold, 0.05, 0.95),
        supportSafeHpThreshold: finiteNumber(input.supportSafeHpThreshold, defaults.supportSafeHpThreshold, 0.10, 1),
        supportHealIntervalMs: Math.round(finiteNumber(input.supportHealIntervalMs, defaults.supportHealIntervalMs, 500, 5000)),
        supportEmergencyHealThreshold: finiteNumber(input.supportEmergencyHealThreshold, defaults.supportEmergencyHealThreshold, 0.05, 0.90),
        supportEmergencyHealIntervalMs: Math.round(finiteNumber(input.supportEmergencyHealIntervalMs, defaults.supportEmergencyHealIntervalMs, 250, 1000)),
        supportHpStableSamples: Math.round(finiteNumber(input.supportHpStableSamples, defaults.supportHpStableSamples, 1, 5)),
        supportSelfHealEnabled: input.supportSelfHealEnabled === true,
        supportSelfHealKey: normalizeKey(input.supportSelfHealKey, defaults.supportSelfHealKey),
        supportSelfHealThreshold: finiteNumber(input.supportSelfHealThreshold, defaults.supportSelfHealThreshold, 0.05, 0.95),
        supportSelfSafeHpThreshold: finiteNumber(input.supportSelfSafeHpThreshold, defaults.supportSelfSafeHpThreshold, 0.10, 1),
        supportSelfHealIntervalMs: Math.round(finiteNumber(input.supportSelfHealIntervalMs, defaults.supportSelfHealIntervalMs, 500, 5000)),
        supportMpPotionEnabled: input.supportMpPotionEnabled === true,
        supportMpPotionKey: normalizeKey(input.supportMpPotionKey, defaults.supportMpPotionKey),
        supportMpPotionThreshold: finiteNumber(input.supportMpPotionThreshold, defaults.supportMpPotionThreshold, 0.05, 0.95),
        supportMpPotionCooldownMs: Math.round(finiteNumber(input.supportMpPotionCooldownMs, defaults.supportMpPotionCooldownMs, 1000, 120000)),
        supportResurrectionEnabled: input.supportResurrectionEnabled === true,
        supportResurrectionKey: normalizeKey(input.supportResurrectionKey, defaults.supportResurrectionKey),
        supportResurrectionRetryMs: Math.round(finiteNumber(input.supportResurrectionRetryMs, defaults.supportResurrectionRetryMs, 1500, 15000)),
        supportResurrectionMaxAttempts: Math.round(finiteNumber(input.supportResurrectionMaxAttempts, defaults.supportResurrectionMaxAttempts, 1, 5)),
        supportFollowAfterAction: input.supportFollowAfterAction !== false,
        supportFollowIntervalMs: Math.round(finiteNumber(input.supportFollowIntervalMs, defaults.supportFollowIntervalMs, 1000, 60000)),
        supportBuffs: normalizeSupportBuffs(input.supportBuffs),
    };
    config.safeHpThreshold = Math.max(config.safeHpThreshold, Math.min(1, config.healThreshold + 0.05));
    config.supportSafeHpThreshold = Math.max(
        config.supportSafeHpThreshold,
        Math.min(1, config.supportHealThreshold + 0.05),
    );
    config.supportEmergencyHealThreshold = Math.min(
        config.supportEmergencyHealThreshold,
        Math.max(0.05, config.supportHealThreshold - 0.05),
    );
    config.supportSelfSafeHpThreshold = Math.max(
        config.supportSelfSafeHpThreshold,
        Math.min(1, config.supportSelfHealThreshold + 0.05),
    );
    return config;
}
