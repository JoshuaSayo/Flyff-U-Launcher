import { describe, expect, it } from "vitest";
import { automationSetupChecklist, type SetupReadinessInput } from "./setupAssistant";

const readySupport: SetupReadinessInput = {
    mode: "support",
    mainProfileId: "main",
    supportProfileId: "support",
    hasPlayerHp: false,
    hasTargetHp: false,
    hasTargetTemplate: false,
    mainHealingEnabled: false,
    deathDetectionEnabled: false,
    useAttackSkills: false,
    hasAttackKeys: false,
    hasMainPartyHp: true,
    hasMainPartyRow: true,
    hasSupportHealKey: true,
    selfHealEnabled: false,
    hasSupportHp: false,
    mpPotionEnabled: false,
    hasSupportMp: false,
    resurrectionEnabled: false,
    hasDeathTemplate: false,
    acknowledged: true,
};

describe("automationSetupChecklist", () => {
    it("keeps starter Support setup limited to the required five steps", () => {
        const checks = automationSetupChecklist(readySupport);
        expect(checks.map((check) => check.id)).toEqual([
            "main_profile",
            "support_profile",
            "main_party_hp",
            "main_party_row",
            "support_heal_key",
            "acknowledgement",
        ]);
        expect(checks.every((check) => check.ready)).toBe(true);
    });

    it("adds only the calibrations required by enabled optional features", () => {
        const checks = automationSetupChecklist({
            ...readySupport,
            selfHealEnabled: true,
            mpPotionEnabled: true,
            resurrectionEnabled: true,
        });
        expect(checks.filter((check) => !check.ready).map((check) => check.id)).toEqual([
            "support_hp",
            "support_mp",
            "death_template",
        ]);
    });

    it("shows combat requirements alongside Support in combined mode", () => {
        const checks = automationSetupChecklist({
            ...readySupport,
            mode: "combat_support",
        });
        expect(checks.filter((check) => !check.ready).map((check) => check.id)).toEqual([
            "target_template",
        ]);
    });

    it("requires attack keys only when optional skill rotation is enabled", () => {
        const checks = automationSetupChecklist({
            ...readySupport,
            mode: "combat",
            hasPlayerHp: true,
            hasTargetHp: true,
            hasTargetTemplate: true,
            useAttackSkills: true,
        });
        expect(checks.filter((check) => !check.ready).map((check) => check.id)).toEqual(["attack_keys"]);
    });

    it("requires Main HP calibration only when optional Main healing is enabled", () => {
        const checks = automationSetupChecklist({
            ...readySupport,
            mode: "combat",
            hasTargetTemplate: true,
            mainHealingEnabled: true,
        });
        expect(checks.filter((check) => !check.ready).map((check) => check.id)).toEqual(["main_hp"]);
    });

    it("requires a death dialog only when optional combat death detection is enabled", () => {
        const checks = automationSetupChecklist({
            ...readySupport,
            mode: "combat",
            hasPlayerHp: true,
            hasTargetHp: true,
            hasTargetTemplate: true,
            deathDetectionEnabled: true,
        });
        expect(checks.filter((check) => !check.ready).map((check) => check.id)).toEqual(["death_template"]);
    });
});
