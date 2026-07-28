/** Persistent configuration and user-captured templates for automation profiles. */

import path from "path";
import { mkdir, readFile, writeFile, access, unlink } from "fs/promises";
import type { AutomationConfig, AutomationTemplateKind, AutomationTemplateState } from "../../shared/automation";
import { AUTOMATION_CONFIG_VERSION, defaultAutomationConfig, normalizeAutomationConfig } from "../../shared/automation";

const TEMPLATE_KINDS: AutomationTemplateKind[] = ["target", "loot", "death"];

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
            if (!raw || typeof raw !== "object" || (raw as { version?: unknown }).version !== AUTOMATION_CONFIG_VERSION) {
                const defaults = defaultAutomationConfig(profileId);
                const previousVersion = raw && typeof raw === "object" ? Number((raw as { version?: unknown }).version) : 0;
                const clearStaleCapture = previousVersion < 2;
                const previousThreshold = raw && typeof raw === "object"
                    ? Number((raw as { templateThreshold?: unknown }).templateThreshold)
                    : Number.NaN;
                const migrateLegacyDefaultThreshold = previousVersion < 6
                    && (!Number.isFinite(previousThreshold) || previousThreshold === 0.82);
                const migrated = normalizeAutomationConfig(profileId, {
                    ...(raw && typeof raw === "object" ? raw : {}),
                    version: AUTOMATION_CONFIG_VERSION,
                    ...(migrateLegacyDefaultThreshold ? {
                        templateThreshold: defaults.templateThreshold,
                    } : {}),
                    ...(clearStaleCapture ? {
                        playerHpRoi: null,
                        targetHpRoi: null,
                        targetScanRoi: defaults.targetScanRoi,
                    } : {}),
                });
                if (clearStaleCapture) {
                    await Promise.all(TEMPLATE_KINDS.map((kind) => this.removeTemplate(profileId, kind)));
                }
                return this.save(profileId, migrated);
            }
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
