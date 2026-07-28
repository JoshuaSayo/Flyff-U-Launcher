import { describe, expect, it } from "vitest";
import { decideAutomationState, type FsmObservation } from "./fsm";

const base: FsmObservation = {
    mode: "combat",
    playerHp: 0.9,
    targetVisible: false,
    targetSelected: false,
    targetEngaged: false,
    lootVisible: false,
    deathVisible: false,
    elapsedInStateMs: 100,
    healThreshold: 0.4,
    safeHpThreshold: 0.75,
    approachTimeoutMs: 5000,
    lootTimeoutMs: 3500,
    lostTargetFrames: 0,
    lostEngagementFrames: 0,
};

describe("automation FSM", () => {
    it("moves from search to approach when a target is structurally matched", () => {
        expect(decideAutomationState("searching", { ...base, targetVisible: true })).toBe("approaching");
    });

    it("waits for a red crosshair after the first click reveals target HP", () => {
        expect(decideAutomationState("approaching", {
            ...base,
            targetVisible: true,
            targetSelected: true,
        })).toBe("approaching");
        expect(decideAutomationState("approaching", {
            ...base,
            targetVisible: true,
            targetSelected: true,
            targetEngaged: true,
        })).toBe("attacking");
    });

    it("re-engages a selected monster when the red crosshair is lost", () => {
        expect(decideAutomationState("attacking", {
            ...base,
            targetSelected: true,
            lostEngagementFrames: 2,
        })).toBe("approaching");
    });

    it("prioritizes healing when player HP is unsafe", () => {
        expect(decideAutomationState("attacking", { ...base, playerHp: 0.2, targetVisible: true })).toBe("healing");
    });

    it("moves to loot only after consecutive target loss", () => {
        expect(decideAutomationState("attacking", {
            ...base,
            targetSelected: true,
            targetEngaged: true,
            lostTargetFrames: 2,
        })).toBe("attacking");
        expect(decideAutomationState("attacking", { ...base, lostTargetFrames: 3 })).toBe("looting");
    });

    it("pauses when a death template is visible", () => {
        expect(decideAutomationState("attacking", { ...base, deathVisible: true })).toBe("paused");
    });

    it("keeps observer mode free of action states", () => {
        expect(decideAutomationState("observing", { ...base, mode: "observer", playerHp: 0.1, targetVisible: true })).toBe("observing");
    });

    it("keeps support-only mode in the paired-support state", () => {
        expect(decideAutomationState("supporting", { ...base, mode: "support", playerHp: 0.1 })).toBe("supporting");
    });

    it("runs the combat FSM while paired support is also enabled", () => {
        expect(decideAutomationState("searching", { ...base, mode: "combat_support", targetVisible: true })).toBe("approaching");
    });
});
