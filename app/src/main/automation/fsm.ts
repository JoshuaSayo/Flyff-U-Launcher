/** Pure combat state decisions, separated from capture and input side effects. */

import type { AutomationState } from "../../shared/automation";

export type FsmObservation = {
    mode: "observer" | "combat";
    playerHp: number | null;
    targetVisible: boolean;
    lootVisible: boolean;
    deathVisible: boolean;
    elapsedInStateMs: number;
    healThreshold: number;
    safeHpThreshold: number;
    approachTimeoutMs: number;
    lootTimeoutMs: number;
    lostTargetFrames: number;
};

export function decideAutomationState(current: AutomationState, observation: FsmObservation): AutomationState {
    if (observation.deathVisible) return "paused";
    if (observation.mode === "observer") return "observing";
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
            return observation.targetVisible ? "attacking" : "approaching";
        case "attacking":
            return observation.lostTargetFrames >= 3 ? "looting" : "attacking";
        case "healing":
            return observation.playerHp !== null && observation.playerHp >= observation.safeHpThreshold ? "attacking" : "healing";
        case "looting":
            return observation.elapsedInStateMs >= observation.lootTimeoutMs && !observation.lootVisible ? "searching" : "looting";
        default:
            return "faulted";
    }
}
