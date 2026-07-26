import { describe, expect, it, vi } from "vitest";
import type { BrowserWindow, WebContents } from "electron";
import { defaultAutomationConfig } from "../../shared/automation";
import { AutomationService, type AutomationTarget } from "./service";
import type { AutomationStore } from "./store";

function combatStore(): AutomationStore {
    const config = {
        ...defaultAutomationConfig("profile-1"),
        mode: "combat" as const,
        playerHpRoi: { x: 0.02, y: 0.02, width: 0.20, height: 0.04 },
    };
    return {
        load: vi.fn(async () => config),
        templateState: vi.fn(async () => ({ target: true, loot: false, death: false })),
    } as unknown as AutomationStore;
}

function target(focusSucceeds: boolean): {
    value: AutomationTarget;
    restore: ReturnType<typeof vi.fn>;
    show: ReturnType<typeof vi.fn>;
    focusWindow: ReturnType<typeof vi.fn>;
    focusContents: ReturnType<typeof vi.fn>;
} {
    let focused = false;
    const restore = vi.fn();
    const show = vi.fn();
    const focusWindow = vi.fn();
    const focusContents = vi.fn(() => { focused = focusSucceeds; });
    const webContents = {
        focus: focusContents,
        isFocused: vi.fn(() => focused),
        isDestroyed: vi.fn(() => false),
        sendInputEvent: vi.fn(),
    } as unknown as WebContents;
    const hostWindow = {
        isMinimized: vi.fn(() => true),
        restore,
        show,
        focus: focusWindow,
    } as unknown as BrowserWindow;
    return {
        value: { profileId: "profile-1", hostWindow, webContents },
        restore,
        show,
        focusWindow,
        focusContents,
    };
}

describe("AutomationService combat arming", () => {
    it("restores and focuses the selected game client before arming", async () => {
        const selected = target(true);
        const service = new AutomationService({
            store: combatStore(),
            resolveTarget: () => selected.value,
        });

        const status = await service.start("profile-1", true);

        expect(selected.restore).toHaveBeenCalledOnce();
        expect(selected.show).toHaveBeenCalledOnce();
        expect(selected.focusWindow).toHaveBeenCalledOnce();
        expect(selected.focusContents).toHaveBeenCalledOnce();
        expect(status.state).toBe("searching");
        expect(status.armed).toBe(true);
        service.stop();
    });

    it("refuses to arm when the selected client cannot receive focus", async () => {
        const selected = target(false);
        const service = new AutomationService({
            store: combatStore(),
            resolveTarget: () => selected.value,
        });

        await expect(service.start("profile-1", true)).rejects.toThrow("could not receive foreground focus");
        expect(service.status().armed).toBe(false);
        service.stop();
    });
});
