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
});
