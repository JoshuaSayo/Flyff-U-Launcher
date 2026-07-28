import { describe, expect, it, vi } from "vitest";
import type { WebContents } from "electron";
import { AutomationInputFacade } from "./inputFacade";

function supportContents(): {
    webContents: WebContents;
    attach: ReturnType<typeof vi.fn>;
    sendCommand: ReturnType<typeof vi.fn>;
} {
    let attached = false;
    const attach = vi.fn(() => { attached = true; });
    const sendCommand = vi.fn(async () => undefined);
    const webContents = {
        isDestroyed: vi.fn(() => false),
        once: vi.fn(),
        debugger: {
            isAttached: vi.fn(() => attached),
            attach,
            detach: vi.fn(() => { attached = false; }),
            once: vi.fn(),
            sendCommand,
        },
    } as unknown as WebContents;
    return { webContents, attach, sendCommand };
}

describe("AutomationInputFacade paired support", () => {
    it("dispatches support keys through CDP without requiring foreground focus", async () => {
        const support = supportContents();
        const facade = new AutomationInputFacade();
        facade.claimSupport("support", support.webContents);

        await facade.pressSupportKey("support", "F3");

        expect(support.attach).toHaveBeenCalledWith("1.3");
        expect(support.sendCommand).toHaveBeenNthCalledWith(1, "Input.dispatchKeyEvent", expect.objectContaining({
            type: "keyDown",
            key: "F3",
            windowsVirtualKeyCode: 114,
        }));
        expect(support.sendCommand).toHaveBeenNthCalledWith(2, "Input.dispatchKeyEvent", expect.objectContaining({
            type: "keyUp",
            key: "F3",
        }));
        facade.release();
    });

    it("dispatches a complete support click through CDP", async () => {
        const support = supportContents();
        const facade = new AutomationInputFacade();
        facade.claimSupport("support", support.webContents);

        await facade.clickSupport("support", 120.4, 80.6);

        expect(support.sendCommand).toHaveBeenCalledWith("Input.dispatchMouseEvent", expect.objectContaining({
            type: "mousePressed",
            x: 120,
            y: 81,
        }));
        expect(support.sendCommand).toHaveBeenCalledWith("Input.dispatchMouseEvent", expect.objectContaining({
            type: "mouseReleased",
            buttons: 0,
        }));
        facade.release();
    });
});
