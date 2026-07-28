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
    debuggerAttach: ReturnType<typeof vi.fn>;
    debuggerSendCommand: ReturnType<typeof vi.fn>;
} {
    let focused = false;
    let debuggerAttached = false;
    const restore = vi.fn();
    const show = vi.fn();
    const focusWindow = vi.fn();
    const focusContents = vi.fn(() => { focused = focusSucceeds; });
    const capturePage = vi.fn();
    const hostCapturePage = vi.fn();
    const debuggerAttach = vi.fn(() => { debuggerAttached = true; });
    const debuggerSendCommand = vi.fn(async () => undefined);
    const webContents = {
        focus: focusContents,
        isFocused: vi.fn(() => focused),
        isDestroyed: vi.fn(() => false),
        sendInputEvent: vi.fn(),
        getType: vi.fn(() => "browserView"),
        capturePage,
        once: vi.fn(),
        debugger: {
            isAttached: vi.fn(() => debuggerAttached),
            attach: debuggerAttach,
            detach: vi.fn(() => { debuggerAttached = false; }),
            once: vi.fn(),
            sendCommand: debuggerSendCommand,
        },
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
        debuggerAttach,
        debuggerSendCommand,
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

    it("pairs a Support client and dispatches its due buff without focusing it", async () => {
        const main = target(true);
        const support = target(false);
        support.value.profileId = "profile-2";
        const png = await sharp({
            create: { width: 100, height: 40, channels: 4, background: { r: 220, g: 20, b: 30, alpha: 1 } },
        }).png().toBuffer();
        const image = {
            isEmpty: () => false,
            toPNG: () => png,
        } as unknown as NativeImage;
        main.capturePage.mockResolvedValue(image);
        support.capturePage.mockResolvedValue(image);
        const config = {
            ...defaultAutomationConfig("profile-1"),
            mode: "support" as const,
            supportProfileId: "profile-2",
            mainPartyHpRoi: { x: 0.05, y: 0.10, width: 0.40, height: 0.15 },
            mainPartyTargetRoi: { x: 0.05, y: 0.05, width: 0.40, height: 0.10 },
            supportBuffs: [{ key: "F3", intervalSec: 600 }],
            supportFollowAfterAction: false,
        };
        const store = {
            load: vi.fn(async () => config),
            templateState: vi.fn(async () => ({ target: false, loot: false, death: false })),
            templatePath: vi.fn((_profileId: string, kind: string) => kind),
        } as unknown as AutomationStore;
        const service = new AutomationService({
            store,
            resolveTarget: (profileId) => profileId === "profile-1" ? main.value : profileId === "profile-2" ? support.value : null,
        });

        const status = await service.start("profile-1", true);
        expect(status.state).toBe("supporting");
        await vi.waitFor(() => {
            expect(support.debuggerSendCommand).toHaveBeenCalledWith(
                "Input.dispatchKeyEvent",
                expect.objectContaining({ type: "keyDown", key: "F3" }),
            );
            expect(service.status().metrics.supportAction).toBe("Buff F3");
        });
        expect(support.focusContents).not.toHaveBeenCalled();
        expect(service.status().metrics.supportProfileId).toBe("profile-2");
        service.stop();
    });

    it("prioritizes a reactive Support heal when the Main party HP is low", async () => {
        const main = target(true);
        const support = target(false);
        support.value.profileId = "profile-2";
        const width = 100;
        const height = 40;
        const raw = Buffer.alloc(width * height * 4);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const offset = (y * width + x) * 4;
                const insideLowHpFill = y >= 4 && y < 10 && x >= 5 && x < 15;
                raw[offset] = insideLowHpFill ? 220 : 0;
                raw[offset + 1] = insideLowHpFill ? 20 : 0;
                raw[offset + 2] = insideLowHpFill ? 30 : 0;
                raw[offset + 3] = 255;
            }
        }
        const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
        const image = {
            isEmpty: () => false,
            toPNG: () => png,
        } as unknown as NativeImage;
        main.capturePage.mockResolvedValue(image);
        support.capturePage.mockResolvedValue(image);
        const config = {
            ...defaultAutomationConfig("profile-1"),
            mode: "support" as const,
            supportProfileId: "profile-2",
            mainPartyHpRoi: { x: 0.05, y: 0.10, width: 0.40, height: 0.15 },
            mainPartyTargetRoi: { x: 0.05, y: 0.05, width: 0.40, height: 0.10 },
            supportHealKey: "4",
            supportHealThreshold: 0.50,
            supportSafeHpThreshold: 0.80,
            supportBuffs: [{ key: "F3", intervalSec: 600 }],
            supportFollowAfterAction: false,
        };
        const store = {
            load: vi.fn(async () => config),
            templateState: vi.fn(async () => ({ target: false, loot: false, death: false })),
            templatePath: vi.fn((_profileId: string, kind: string) => kind),
        } as unknown as AutomationStore;
        const service = new AutomationService({
            store,
            resolveTarget: (profileId) => profileId === "profile-1" ? main.value : profileId === "profile-2" ? support.value : null,
        });

        await service.start("profile-1", true);
        await vi.waitFor(() => {
            expect(support.debuggerSendCommand).toHaveBeenCalledWith(
                "Input.dispatchKeyEvent",
                expect.objectContaining({ type: "keyDown", key: "4" }),
            );
            expect(service.status().metrics.mainPartyHp).not.toBeNull();
            expect(service.status().metrics.supportAction).toBe("Heal 4");
        });
        const keyDowns = support.debuggerSendCommand.mock.calls
            .filter(([method, params]) => method === "Input.dispatchKeyEvent" && params.type === "keyDown")
            .map(([, params]) => params.key);
        expect(keyDowns[0]).toBe("4");
        expect(service.status().metrics.mainPartyHp!).toBeLessThan(0.50);
        service.stop();
    });
});
