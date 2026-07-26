/** Persistent configuration and user-captured templates for automation profiles. */

import path from "path";
import { mkdir, readFile, writeFile, access, unlink } from "fs/promises";
import type { AutomationConfig, AutomationTemplateKind, AutomationTemplateState } from "../../shared/automation";
import { defaultAutomationConfig, normalizeAutomationConfig } from "../../shared/automation";

function safeProfileSegment(profileId: string): string {
    return encodeURIComponent(profileId).replace(/%/g, "_");
}

export class AutomationStore {
    constructor(private readonly rootDir: string) {}

    private profileDir(profileId: string): string {
        return path.join(this.rootDir, safeProfileSegment(profileId));
    }

    private configPath(profileId: string): string {
        return path.join(this.profileDir(profileId), "config.json");
    }

    templatePath(profileId: string, kind: AutomationTemplateKind): string {
        return path.join(this.profileDir(profileId), `${kind}.png`);
    }

    async load(profileId: string): Promise<AutomationConfig> {
        try {
            const raw = JSON.parse(await readFile(this.configPath(profileId), "utf8")) as unknown;
            return normalizeAutomationConfig(profileId, raw);
        } catch {
            return defaultAutomationConfig(profileId);
        }
    }

    async save(profileId: string, value: unknown): Promise<AutomationConfig> {
        const config = normalizeAutomationConfig(profileId, value);
        await mkdir(this.profileDir(profileId), { recursive: true });
        await writeFile(this.configPath(profileId), `${JSON.stringify(config, null, 2)}\n`, "utf8");
        return config;
    }

    async saveTemplate(profileId: string, kind: AutomationTemplateKind, png: Buffer): Promise<void> {
        await mkdir(this.profileDir(profileId), { recursive: true });
        await writeFile(this.templatePath(profileId, kind), png);
    }

    async removeTemplate(profileId: string, kind: AutomationTemplateKind): Promise<void> {
        try { await unlink(this.templatePath(profileId, kind)); } catch { /* already absent */ }
    }

    async templateState(profileId: string): Promise<AutomationTemplateState> {
        const exists = async (kind: AutomationTemplateKind): Promise<boolean> => {
            try { await access(this.templatePath(profileId, kind)); return true; } catch { return false; }
        };
        const [target, loot, death] = await Promise.all([exists("target"), exists("loot"), exists("death")]);
        return { target, loot, death };
    }
}
