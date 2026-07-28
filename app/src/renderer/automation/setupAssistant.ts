import type { AutomationMode } from "../../shared/automation";

export type SetupReadinessInput = {
    mode: AutomationMode;
    mainProfileId: string;
    supportProfileId: string | null;
    hasPlayerHp: boolean;
    hasTargetTemplate: boolean;
    hasMainPartyHp: boolean;
    hasMainPartyRow: boolean;
    hasSupportHealKey: boolean;
    selfHealEnabled: boolean;
    hasSupportHp: boolean;
    mpPotionEnabled: boolean;
    hasSupportMp: boolean;
    resurrectionEnabled: boolean;
    hasDeathTemplate: boolean;
    acknowledged: boolean;
};

export type SetupCheck = {
    id: string;
    label: string;
    ready: boolean;
};

/** Build the ordered preflight checklist shown by the guided automation setup. */
export function automationSetupChecklist(input: SetupReadinessInput): SetupCheck[] {
    const combatMode = input.mode === "combat" || input.mode === "combat_support";
    const supportMode = input.mode === "support" || input.mode === "combat_support";
    const checks: SetupCheck[] = [{
        id: "main_profile",
        label: "Main profile selected",
        ready: input.mainProfileId.length > 0,
    }];
    if (combatMode) {
        checks.push(
            { id: "main_hp", label: "Main player HP calibrated", ready: input.hasPlayerHp },
            { id: "target_template", label: "Target template captured", ready: input.hasTargetTemplate },
        );
    }
    if (supportMode) {
        checks.push(
            {
                id: "support_profile",
                label: "Different Support profile selected",
                ready: Boolean(input.supportProfileId && input.supportProfileId !== input.mainProfileId),
            },
            {
                id: "main_party_hp",
                label: "Main party HP calibrated on Support view",
                ready: input.hasMainPartyHp,
            },
            {
                id: "main_party_row",
                label: "Main party row calibrated on Support view",
                ready: input.hasMainPartyRow,
            },
            { id: "support_heal_key", label: "Support heal key configured", ready: input.hasSupportHealKey },
        );
        if (input.selfHealEnabled) {
            checks.push({ id: "support_hp", label: "Support HP calibrated", ready: input.hasSupportHp });
        }
        if (input.mpPotionEnabled) {
            checks.push({ id: "support_mp", label: "Support MP calibrated", ready: input.hasSupportMp });
        }
        if (input.resurrectionEnabled) {
            checks.push({
                id: "death_template",
                label: "Main death dialog captured",
                ready: input.hasDeathTemplate,
            });
        }
    }
    if (input.mode !== "observer") {
        checks.push({
            id: "acknowledgement",
            label: "Supervision risk acknowledged",
            ready: input.acknowledged,
        });
    }
    return checks;
}
