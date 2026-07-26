/** Dedicated, hardened BrowserWindow for the automation workbench. */

import { BrowserWindow } from "electron";
import type { LoadView } from "../viewLoader";

export function createAutomationWindowManager(options: {
    preloadPath: string;
    loadView: LoadView;
    onClosed?: () => void;
}) {
    let window: BrowserWindow | null = null;

    const get = (): BrowserWindow | null => window && !window.isDestroyed() ? window : null;

    const open = async (profileId?: string): Promise<BrowserWindow> => {
        const existing = get();
        if (existing) {
            existing.show();
            existing.focus();
            if (profileId) existing.webContents.send("automation:selectProfile", profileId);
            return existing;
        }
        window = new BrowserWindow({
            width: 1240,
            height: 820,
            minWidth: 980,
            minHeight: 680,
            show: false,
            backgroundColor: "#0b1220",
            title: "Flyff-U Automation Workbench",
            autoHideMenuBar: true,
            webPreferences: {
                preload: options.preloadPath,
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
                backgroundThrottling: false,
            },
        });
        window.setMenu(null);
        window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        window.on("closed", () => {
            window = null;
            options.onClosed?.();
        });
        await options.loadView(window, "automation", profileId ? { profileId } : undefined);
        window.once("ready-to-show", () => get()?.show());
        return window;
    };

    return { get, open };
}

export type AutomationWindowManager = ReturnType<typeof createAutomationWindowManager>;
