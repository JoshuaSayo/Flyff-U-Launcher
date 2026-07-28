/** The only module authorized to emit automation input events. */

import { randomInt } from "crypto";
import type { WebContents } from "electron";

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

type CdpKeyInfo = { key: string; code: string; vkc: number };

function cdpKeyInfo(keyCode: string): CdpKeyInfo | null {
    const key = keyCode.trim().toUpperCase();
    const special: Record<string, CdpKeyInfo> = {
        SPACE: { key: " ", code: "Space", vkc: 32 },
        TAB: { key: "Tab", code: "Tab", vkc: 9 },
        LEFT: { key: "ArrowLeft", code: "ArrowLeft", vkc: 37 },
        UP: { key: "ArrowUp", code: "ArrowUp", vkc: 38 },
        RIGHT: { key: "ArrowRight", code: "ArrowRight", vkc: 39 },
        DOWN: { key: "ArrowDown", code: "ArrowDown", vkc: 40 },
    };
    if (special[key]) return special[key];
    if (/^[A-Z]$/.test(key)) return { key: key.toLowerCase(), code: "Key" + key, vkc: key.charCodeAt(0) };
    if (/^[0-9]$/.test(key)) return { key, code: "Digit" + key, vkc: key.charCodeAt(0) };
    const functionKey = /^F([1-9]|1[0-2])$/.exec(key);
    if (functionKey) {
        const number = Number(functionKey[1]);
        return { key: "F" + number, code: "F" + number, vkc: 111 + number };
    }
    return null;
}

export class AutomationInputFacade {
    private owner: { profileId: string; webContents: WebContents } | null = null;
    private supportOwner: { profileId: string; webContents: WebContents } | null = null;
    private generation = 0;
    private heldKeys = new Set<string>();
    private supportHeldKeys = new Set<string>();
    private heldMouse: { x: number; y: number } | null = null;
    private supportMouse: { x: number; y: number } | null = null;
    private cdpOwned = new WeakSet<WebContents>();

    claim(profileId: string, webContents: WebContents): void {
        if (this.owner && this.owner.profileId !== profileId) throw new Error(`Automation input is owned by ${this.owner.profileId}`);
        this.owner = { profileId, webContents };
        this.generation++;
    }

    claimSupport(profileId: string, webContents: WebContents): void {
        if (this.supportOwner && this.supportOwner.profileId !== profileId) {
            throw new Error("Support input is owned by " + this.supportOwner.profileId);
        }
        this.supportOwner = { profileId, webContents };
        this.generation++;
    }

    release(): void {
        const wc = this.owner?.webContents;
        if (wc && !wc.isDestroyed()) {
            for (const keyCode of this.heldKeys) {
                try { wc.sendInputEvent({ type: "keyUp", keyCode }); } catch { /* closing */ }
            }
            if (this.heldMouse) {
                try { wc.sendInputEvent({ type: "mouseUp", x: this.heldMouse.x, y: this.heldMouse.y, button: "left", clickCount: 1 }); } catch { /* closing */ }
            }
        }
        const support = this.supportOwner?.webContents;
        if (support && !support.isDestroyed() && this.cdpOwned.has(support)) {
            const releases = [...this.supportHeldKeys].map((keyCode) =>
                this.sendCdpKey(support, "keyUp", keyCode).catch((): void => undefined));
            if (this.supportMouse) {
                releases.push(support.debugger.sendCommand("Input.dispatchMouseEvent", {
                    type: "mouseReleased",
                    x: this.supportMouse.x,
                    y: this.supportMouse.y,
                    button: "left",
                    buttons: 0,
                    clickCount: 1,
                }).then((): void => undefined).catch((): void => undefined));
            }
            void Promise.all(releases).finally(() => {
                if (!support.isDestroyed() && this.cdpOwned.has(support) && support.debugger.isAttached()) {
                    try { support.debugger.detach(); } catch { /* closing */ }
                }
                this.cdpOwned.delete(support);
            });
        }
        this.heldKeys.clear();
        this.supportHeldKeys.clear();
        this.heldMouse = null;
        this.supportMouse = null;
        this.owner = null;
        this.supportOwner = null;
        this.generation++;
    }

    private requireOwner(profileId: string): { webContents: WebContents; generation: number } {
        if (!this.owner || this.owner.profileId !== profileId) throw new Error("Automation does not own this profile");
        const wc = this.owner.webContents;
        if (wc.isDestroyed()) throw new Error("Selected client was closed");
        if (!wc.isFocused()) throw new Error("Selected client must remain in the foreground");
        return { webContents: wc, generation: this.generation };
    }

    private requireSupport(profileId: string): { webContents: WebContents; generation: number } {
        if (!this.supportOwner || this.supportOwner.profileId !== profileId) {
            throw new Error("Automation does not own support profile " + profileId);
        }
        const wc = this.supportOwner.webContents;
        if (wc.isDestroyed()) throw new Error("Support client was closed");
        return { webContents: wc, generation: this.generation };
    }

    private ensureCdp(webContents: WebContents): void {
        if (this.cdpOwned.has(webContents) && webContents.debugger.isAttached()) return;
        if (webContents.debugger.isAttached()) {
            throw new Error("Support client debugger is already in use; close DevTools and disable controller Forward Hold");
        }
        webContents.debugger.attach("1.3");
        this.cdpOwned.add(webContents);
        webContents.once("destroyed", () => this.cdpOwned.delete(webContents));
        webContents.debugger.once("detach", () => this.cdpOwned.delete(webContents));
    }

    private async sendCdpKey(webContents: WebContents, type: "keyDown" | "keyUp", keyCode: string): Promise<void> {
        this.ensureCdp(webContents);
        const info = cdpKeyInfo(keyCode);
        if (!info) throw new Error("Unsupported support key " + keyCode);
        await webContents.debugger.sendCommand("Input.dispatchKeyEvent", {
            type,
            key: info.key,
            code: info.code,
            windowsVirtualKeyCode: info.vkc,
            nativeVirtualKeyCode: info.vkc,
        });
    }

    async pressKey(profileId: string, keyCode: string): Promise<void> {
        const { webContents, generation } = this.requireOwner(profileId);
        webContents.sendInputEvent({ type: "keyDown", keyCode });
        this.heldKeys.add(keyCode);
        await delay(randomInt(55, 96));
        if (this.owner?.webContents === webContents && this.generation === generation && !webContents.isDestroyed()) {
            webContents.sendInputEvent({ type: "keyUp", keyCode });
            this.heldKeys.delete(keyCode);
        }
    }

    async click(profileId: string, x: number, y: number): Promise<void> {
        const { webContents, generation } = this.requireOwner(profileId);
        const px = Math.max(0, Math.round(x));
        const py = Math.max(0, Math.round(y));
        webContents.sendInputEvent({ type: "mouseMove", x: px, y: py });
        await delay(randomInt(35, 76));
        if (this.generation !== generation) return;
        webContents.sendInputEvent({ type: "mouseDown", x: px, y: py, button: "left", clickCount: 1 });
        this.heldMouse = { x: px, y: py };
        await delay(randomInt(55, 106));
        if (this.owner?.webContents === webContents && this.generation === generation && !webContents.isDestroyed()) {
            webContents.sendInputEvent({ type: "mouseUp", x: px, y: py, button: "left", clickCount: 1 });
            this.heldMouse = null;
        }
    }

    async pressSupportKey(profileId: string, keyCode: string): Promise<void> {
        const { webContents, generation } = this.requireSupport(profileId);
        await this.sendCdpKey(webContents, "keyDown", keyCode);
        this.supportHeldKeys.add(keyCode);
        await delay(randomInt(55, 96));
        if (this.supportOwner?.webContents === webContents && this.generation === generation && !webContents.isDestroyed()) {
            await this.sendCdpKey(webContents, "keyUp", keyCode);
            this.supportHeldKeys.delete(keyCode);
        }
    }

    async clickSupport(profileId: string, x: number, y: number): Promise<void> {
        const { webContents, generation } = this.requireSupport(profileId);
        this.ensureCdp(webContents);
        const px = Math.max(0, Math.round(x));
        const py = Math.max(0, Math.round(y));
        await webContents.debugger.sendCommand("Input.dispatchMouseEvent", {
            type: "mouseMoved",
            x: px,
            y: py,
            button: "none",
            buttons: 0,
        });
        await delay(randomInt(35, 76));
        if (this.generation !== generation) return;
        await webContents.debugger.sendCommand("Input.dispatchMouseEvent", {
            type: "mousePressed",
            x: px,
            y: py,
            button: "left",
            buttons: 1,
            clickCount: 1,
        });
        this.supportMouse = { x: px, y: py };
        await delay(randomInt(55, 106));
        if (this.supportOwner?.webContents === webContents && this.generation === generation && !webContents.isDestroyed()) {
            await webContents.debugger.sendCommand("Input.dispatchMouseEvent", {
                type: "mouseReleased",
                x: px,
                y: py,
                button: "left",
                buttons: 0,
                clickCount: 1,
            });
            this.supportMouse = null;
        }
    }
}
