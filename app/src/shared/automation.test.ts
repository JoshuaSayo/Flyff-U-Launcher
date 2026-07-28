import { describe, expect, it } from "vitest";
import { AUTOMATION_CONFIG_VERSION, normalizeAutomationConfig } from "./automation";

describe("normalizeAutomationConfig", () => {
    it("clamps unsafe values and keeps the safe HP threshold above heal", () => {
        const config = normalizeAutomationConfig("profile-a", {
            mode: "combat",
            healThreshold: 0.9,
            safeHpThreshold: 0.2,
            tickMs: 1,
            attackKeys: ["1", "bad key", "F12"],
        });
        expect(config.profileId).toBe("profile-a");
        expect(config.version).toBe(AUTOMATION_CONFIG_VERSION);
        expect(config.tickMs).toBe(250);
        expect(config.safeHpThreshold).toBeGreaterThan(config.healThreshold);
        expect(config.attackKeys).toEqual(["1", "F12"]);
    });

    it("rejects rectangles that escape normalized frame bounds", () => {
        const config = normalizeAutomationConfig("profile-a", {
            playerHpRoi: { x: 0.9, y: 0, width: 0.2, height: 0.1 },
        });
        expect(config.playerHpRoi).toBeNull();
    });

    it("rejects implausibly large HP regions", () => {
        const config = normalizeAutomationConfig("profile-a", {
            playerHpRoi: { x: 0.05, y: 0.05, width: 0.45, height: 0.30 },
            targetHpRoi: { x: 0.10, y: 0.10, width: 0.70, height: 0.08 },
        });
        expect(config.playerHpRoi).toBeNull();
        expect(config.targetHpRoi).toBeNull();
    });

    it("normalizes paired support settings and unique buff intervals", () => {
        const config = normalizeAutomationConfig("main", {
            mode: "combat_support",
            supportProfileId: "support",
            mainPartyHpRoi: { x: 0.1, y: 0.2, width: 0.3, height: 0.05 },
            mainPartyTargetRoi: { x: 0.1, y: 0.15, width: 0.3, height: 0.05 },
            supportHealThreshold: 0.7,
            supportSafeHpThreshold: 0.2,
            supportEmergencyHealThreshold: 0.9,
            supportHpStableSamples: 99,
            supportSelfHealThreshold: 0.8,
            supportSelfSafeHpThreshold: 0.2,
            supportDeselectKey: "BACKQUOTE",
            supportBuffs: [
                { key: "1", intervalSec: 600, target: "main" },
                { key: "1", intervalSec: 30, target: "self" },
                { key: "F3", intervalSec: 900, target: "self" },
                { key: "bad key", intervalSec: 1 },
            ],
        });
        expect(config.mode).toBe("combat_support");
        expect(config.supportProfileId).toBe("support");
        expect(config.supportSafeHpThreshold).toBeGreaterThan(config.supportHealThreshold);
        expect(config.supportEmergencyHealThreshold).toBeLessThan(config.supportHealThreshold);
        expect(config.supportHpStableSamples).toBe(5);
        expect(config.supportSelfSafeHpThreshold).toBeGreaterThan(config.supportSelfHealThreshold);
        expect(config.supportDeselectKey).toBe("BACKQUOTE");
        expect(config.supportBuffs).toEqual([
            { key: "1", intervalSec: 600, target: "main" },
            { key: "F3", intervalSec: 900, target: "self" },
        ]);
    });

    it("does not allow a profile to support itself", () => {
        const config = normalizeAutomationConfig("main", {
            mode: "support",
            supportProfileId: "main",
        });
        expect(config.supportProfileId).toBeNull();
    });

    it("keeps click-to-attack enabled when optional skill rotation is empty", () => {
        const config = normalizeAutomationConfig("main", {
            mode: "combat",
            useAttackSkills: false,
            attackKeys: [],
        });
        expect(config.useAttackSkills).toBe(false);
        expect(config.attackKeys).toEqual([]);
    });

    it("normalizes optional attack skill keys only when explicitly enabled", () => {
        const config = normalizeAutomationConfig("main", {
            useAttackSkills: true,
            attackKeys: ["1", "bad key", "F2"],
        });
        expect(config.useAttackSkills).toBe(true);
        expect(config.attackKeys).toEqual(["1", "F2"]);
    });
});
