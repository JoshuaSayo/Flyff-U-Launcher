/** IPC boundary for automation. Mutations are accepted only from the workbench. */

import type { IpcMainInvokeEvent } from "electron";
import { createSafeHandler, PermissionError, ValidationError } from "../ipc/common";
import type { AutomationTemplateKind, TemplateCaptureRequest } from "../../shared/automation";
import { normalizeRect } from "../../shared/automation";
import type { AutomationService } from "./service";
import type { AutomationWindowManager } from "./window";

const TEMPLATE_KINDS = new Set<AutomationTemplateKind>(["target", "loot", "death"]);

function isTrustedLocalUrl(url: string): boolean {
    return url.startsWith("file:") || url.startsWith("http://localhost:") || url.startsWith("http://127.0.0.1:");
}

export function registerAutomationIpc(options: {
    service: AutomationService;
    window: AutomationWindowManager;
    logError: (message: unknown) => void;
}): void {
    const safeHandle = createSafeHandler(options.logError);
    const requireLocalUi = (event: IpcMainInvokeEvent): void => {
        if (!isTrustedLocalUrl(event.sender.getURL())) throw new PermissionError("Automation is available only to local launcher UI");
    };
    const requireWorkbench = (event: IpcMainInvokeEvent): void => {
        const workbench = options.window.get();
        if (!workbench || workbench.webContents.id !== event.sender.id) throw new PermissionError("Automation mutation requires the workbench window");
    };
    const profileId = (value: unknown): string => {
        if (typeof value !== "string" || value.length < 1 || value.length > 200) throw new ValidationError("Invalid profileId");
        return value;
    };

    safeHandle("automation:open", async (event, selectedProfileId) => {
        requireLocalUi(event as IpcMainInvokeEvent);
        await options.window.open(typeof selectedProfileId === "string" ? selectedProfileId : undefined);
        return true;
    });
    safeHandle("automation:status", (event) => {
        requireWorkbench(event as IpcMainInvokeEvent);
        return options.service.status();
    }, { rateLimit: { maxTokens: 20, refillRate: 5 } });
    safeHandle("automation:getConfig", async (event, id) => {
        requireWorkbench(event as IpcMainInvokeEvent);
        return options.service.getConfig(profileId(id));
    });
    safeHandle("automation:saveConfig", async (event, id, value) => {
        requireWorkbench(event as IpcMainInvokeEvent);
        return options.service.saveConfig(profileId(id), value);
    });
    safeHandle("automation:preview", async (event, id) => {
        requireWorkbench(event as IpcMainInvokeEvent);
        return options.service.preview(profileId(id));
    }, { rateLimit: { maxTokens: 4, refillRate: 1 } });
    safeHandle("automation:captureTemplate", async (event, raw) => {
        requireWorkbench(event as IpcMainInvokeEvent);
        if (!raw || typeof raw !== "object") throw new ValidationError("Invalid template request");
        const request = raw as Partial<TemplateCaptureRequest>;
        const id = profileId(request.profileId);
        if (!TEMPLATE_KINDS.has(request.kind as AutomationTemplateKind)) throw new ValidationError("Invalid template kind");
        const rect = normalizeRect(request.rect, null);
        if (!rect) throw new ValidationError("Invalid template rectangle");
        await options.service.captureTemplate({ profileId: id, kind: request.kind as AutomationTemplateKind, rect });
        return options.service.getConfig(id);
    });
    safeHandle("automation:deleteTemplate", async (event, id, kind) => {
        requireWorkbench(event as IpcMainInvokeEvent);
        const normalizedId = profileId(id);
        if (!TEMPLATE_KINDS.has(kind as AutomationTemplateKind)) throw new ValidationError("Invalid template kind");
        await options.service.deleteTemplate(normalizedId, kind as AutomationTemplateKind);
        return options.service.getConfig(normalizedId);
    });
    safeHandle("automation:start", async (event, id, acknowledged) => {
        requireWorkbench(event as IpcMainInvokeEvent);
        return options.service.start(profileId(id), acknowledged === true);
    });
    safeHandle("automation:pause", (event) => {
        requireWorkbench(event as IpcMainInvokeEvent);
        return options.service.pause();
    });
    safeHandle("automation:resume", async (event, acknowledged) => {
        requireWorkbench(event as IpcMainInvokeEvent);
        return options.service.resume(acknowledged === true);
    });
    safeHandle("automation:stop", (event) => {
        requireWorkbench(event as IpcMainInvokeEvent);
        return options.service.stop();
    });
}
