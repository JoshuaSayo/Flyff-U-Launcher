import { describe, expect, it, vi } from "vitest";
import type { WebContents } from "electron";
import { AutomationInputFacade } from "./inputFacade";

function testContents(): {
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

describe("AutomationInputFacade Chromium Input delivery", () => {
    it("dispatches a complete Main click through CDP without synthetic renderer events", async () => {
        const main = testContents();
        const facade = new AutomationInputFacade();
        facade.claim("main", main.webContents);

        await facade.click("main", 240.4, 160.6);

        expect(main.attach).toHaveBeenCalledWith("1.3");
        expect(main.sendCommand).toHaveBeenCalledWith("Input.dispatchMouseEvent", expect.objectContaining({
            type: "mouseMoved",
            x: 240,
            y: 161,
        }));
        expect(main.sendCommand).toHaveBeenCalledWith("Input.dispatchMouseEvent", expect.objectContaining({
            type: "mousePressed",
            button: "left",
            buttons: 1,
        }));
        expect(main.sendCommand).toHaveBeenCalledWith("Input.dispatchMouseEvent", expect.objectContaining({
            type: "mouseReleased",
            buttons: 0,
        }));
        facade.release();
    });

    it("dispatches Main keys through CDP", async () => {
        const main = testContents();
        const facade = new AutomationInputFacade();
        facade.claim("main", main.webContents);

        await facade.pressKey("main", "RIGHT");

        expect(main.sendCommand).toHaveBeenNthCalledWith(1, "Input.dispatchKeyEvent", expect.objectContaining({
            type: "keyDown",
            code: "ArrowRight",
        }));
        expect(main.sendCommand).toHaveBeenNthCalledWith(2, "Input.dispatchKeyEvent", expect.objectContaining({
            type: "keyUp",
            code: "ArrowRight",
        }));
        facade.release();
    });

    it("dispatches support keys through CDP without requiring foreground focus", async () => {
        const support = testContents();
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
        const support = testContents();
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
