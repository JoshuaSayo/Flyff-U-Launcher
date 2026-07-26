/** The only module authorized to emit automation input events. */

import { randomInt } from "crypto";
import type { WebContents } from "electron";

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class AutomationInputFacade {
    private owner: { profileId: string; webContents: WebContents } | null = null;
    private generation = 0;
    private heldKeys = new Set<string>();
    private heldMouse: { x: number; y: number } | null = null;

    claim(profileId: string, webContents: WebContents): void {
        if (this.owner && this.owner.profileId !== profileId) throw new Error(`Automation input is owned by ${this.owner.profileId}`);
        this.owner = { profileId, webContents };
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
        this.heldKeys.clear();
        this.heldMouse = null;
        this.owner = null;
        this.generation++;
    }

    private requireOwner(profileId: string): { webContents: WebContents; generation: number } {
        if (!this.owner || this.owner.profileId !== profileId) throw new Error("Automation does not own this profile");
        const wc = this.owner.webContents;
        if (wc.isDestroyed()) throw new Error("Selected client was closed");
        if (!wc.isFocused()) throw new Error("Selected client must remain in the foreground");
        return { webContents: wc, generation: this.generation };
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
}
