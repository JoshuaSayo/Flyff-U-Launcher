import { describe, expect, it, vi } from "vitest";
import type { BrowserWindow, NativeImage, WebContents } from "electron";
import sharp from "sharp";
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
    capturePage: ReturnType<typeof vi.fn>;
    hostCapturePage: ReturnType<typeof vi.fn>;
} {
    let focused = false;
    const restore = vi.fn();
    const show = vi.fn();
    const focusWindow = vi.fn();
    const focusContents = vi.fn(() => { focused = focusSucceeds; });
    const capturePage = vi.fn();
    const hostCapturePage = vi.fn();
    const webContents = {
        focus: focusContents,
        isFocused: vi.fn(() => focused),
        isDestroyed: vi.fn(() => false),
        sendInputEvent: vi.fn(),
        getType: vi.fn(() => "browserView"),
        capturePage,
    } as unknown as WebContents;
    const hostWindow = {
        isMinimized: vi.fn(() => true),
        restore,
        show,
        focus: focusWindow,
        capturePage: hostCapturePage,
    } as unknown as BrowserWindow;
    return {
        value: { profileId: "profile-1", hostWindow, webContents },
        restore,
        show,
        focusWindow,
        focusContents,
        capturePage,
        hostCapturePage,
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

    it("captures the selected game WebContents instead of the parent session renderer", async () => {
        const selected = target(true);
        const png = await sharp({
            create: { width: 12, height: 8, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 1 } },
        }).png().toBuffer();
        selected.capturePage.mockResolvedValue({
            isEmpty: () => false,
            toPNG: () => png,
        } as unknown as NativeImage);
        const service = new AutomationService({
            store: combatStore(),
            resolveTarget: () => selected.value,
        });

        const preview = await service.preview("profile-1");

        expect(preview.width).toBe(12);
        expect(preview.height).toBe(8);
        expect(selected.capturePage).toHaveBeenCalledOnce();
        expect(selected.hostCapturePage).not.toHaveBeenCalled();
        service.stop();
    });

    it("rejects oversized templates before capturing a frame", async () => {
        const selected = target(true);
        const service = new AutomationService({
            store: combatStore(),
            resolveTarget: () => selected.value,
        });

        await expect(service.captureTemplate({
            profileId: "profile-1",
            kind: "target",
            rect: { x: 0, y: 0, width: 0.9, height: 0.7 },
        })).rejects.toThrow("selection is too large");
        expect(selected.capturePage).not.toHaveBeenCalled();
        service.stop();
    });
});
