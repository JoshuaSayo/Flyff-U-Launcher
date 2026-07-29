/** Pure combat state decisions, separated from capture and input side effects. */

import type { AutomationMode, AutomationState } from "../../shared/automation";

export type FsmObservation = {
    mode: AutomationMode;
    playerHp: number | null;
    targetVisible: boolean;
    targetSelected: boolean;
    targetEngaged: boolean;
    lootVisible: boolean;
    deathVisible: boolean;
    elapsedInStateMs: number;
    healThreshold: number;
    safeHpThreshold: number;
    approachTimeoutMs: number;
    lootTimeoutMs: number;
    lostTargetFrames: number;
    lostEngagementFrames: number;
};

export function decideAutomationState(current: AutomationState, observation: FsmObservation): AutomationState {
    if (observation.deathVisible) return "paused";
    if (observation.mode === "observer") return "observing";
    if (observation.mode === "support") return "supporting";
    if (observation.playerHp !== null && observation.playerHp < observation.healThreshold && current !== "healing") return "healing";
    switch (current) {
        case "stopped":
        case "observing":
        case "paused":
        case "faulted":
            return current;
        case "searching":
            return observation.targetVisible ? "approaching" : "searching";
        case "approaching":
            if (observation.elapsedInStateMs >= observation.approachTimeoutMs) return "searching";
            if (!observation.targetVisible && !observation.targetSelected) return "searching";
            return observation.targetEngaged ? "attacking" : "approaching";
        case "attacking":
            if (observation.lostTargetFrames >= 3) return "looting";
            return observation.targetSelected && observation.lostEngagementFrames >= 2
                ? "approaching"
                : "attacking";
        case "healing":
            if (observation.playerHp === null || observation.playerHp < observation.safeHpThreshold) return "healing";
            if (observation.targetEngaged) return "attacking";
            return observation.targetSelected ? "approaching" : "searching";
        case "looting":
            return observation.elapsedInStateMs >= observation.lootTimeoutMs && !observation.lootVisible ? "searching" : "looting";
        case "supporting":
            return "supporting";
        default:
            return "faulted";
    }
}
