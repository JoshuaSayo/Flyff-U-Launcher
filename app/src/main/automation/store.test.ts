import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { AUTOMATION_CONFIG_VERSION } from "../../shared/automation";
import { AutomationStore } from "./store";

describe("AutomationStore", () => {
    it("clears version-1 pixel calibration and templates after the capture-source fix", async () => {
        const root = await mkdtemp(path.join(tmpdir(), "flyff-automation-store-"));
        const profileDir = path.join(root, "profile-1");
        await mkdir(profileDir, { recursive: true });
        await writeFile(path.join(profileDir, "config.json"), JSON.stringify({
            version: 1,
            profileId: "profile-1",
            mode: "combat",
            playerHpRoi: { x: 0, y: 0, width: 0.2, height: 0.1 },
            targetHpRoi: { x: 0, y: 0, width: 0.2, height: 0.1 },
            targetScanRoi: { x: 0, y: 0, width: 1, height: 1 },
            attackKeys: ["7", "8"],
        }), "utf8");
        await Promise.all(["target", "loot", "death"].map((kind) =>
            writeFile(path.join(profileDir, kind + ".png"), Buffer.from("stale"))));

        try {
            const store = new AutomationStore(root);
            const config = await store.load("profile-1");

            expect(config.version).toBe(AUTOMATION_CONFIG_VERSION);
            expect(config.playerHpRoi).toBeNull();
            expect(config.targetHpRoi).toBeNull();
            expect(config.attackKeys).toEqual(["7", "8"]);
            expect(await store.templateState("profile-1")).toEqual({ target: false, loot: false, death: false });
            const persisted = JSON.parse(await readFile(path.join(profileDir, "config.json"), "utf8")) as { version: number };
            expect(persisted.version).toBe(AUTOMATION_CONFIG_VERSION);
            await expect(access(path.join(profileDir, "target.png"))).rejects.toThrow();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("preserves version-2 vision calibration while adding paired-support defaults", async () => {
        const root = await mkdtemp(path.join(tmpdir(), "flyff-automation-store-"));
        const profileDir = path.join(root, "profile-2");
        const playerHpRoi = { x: 0.02, y: 0.03, width: 0.20, height: 0.04 };
        await mkdir(profileDir, { recursive: true });
        await writeFile(path.join(profileDir, "config.json"), JSON.stringify({
            version: 2,
            profileId: "profile-2",
            mode: "combat",
            playerHpRoi,
        }), "utf8");
        await writeFile(path.join(profileDir, "target.png"), Buffer.from("preserve"), "utf8");

        try {
            const store = new AutomationStore(root);
            const config = await store.load("profile-2");

            expect(config.version).toBe(AUTOMATION_CONFIG_VERSION);
            expect(config.playerHpRoi).toEqual(playerHpRoi);
            expect(config.supportProfileId).toBeNull();
            expect(config.supportBuffs).toEqual([]);
            expect((await store.templateState("profile-2")).target).toBe(true);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("preserves version-3 pairing while adding Support self-care defaults", async () => {
        const root = await mkdtemp(path.join(tmpdir(), "flyff-automation-store-"));
        const profileDir = path.join(root, "profile-3");
        const mainPartyHpRoi = { x: 0.05, y: 0.10, width: 0.35, height: 0.05 };
        await mkdir(profileDir, { recursive: true });
        await writeFile(path.join(profileDir, "config.json"), JSON.stringify({
            version: 3,
            profileId: "profile-3",
            mode: "support",
            supportProfileId: "support-3",
            mainPartyHpRoi,
            supportBuffs: [{ key: "F3", intervalSec: 900 }],
        }), "utf8");

        try {
            const store = new AutomationStore(root);
            const config = await store.load("profile-3");

            expect(config.version).toBe(AUTOMATION_CONFIG_VERSION);
            expect(config.supportProfileId).toBe("support-3");
            expect(config.mainPartyHpRoi).toEqual(mainPartyHpRoi);
            expect(config.supportBuffs).toEqual([{ key: "F3", intervalSec: 900, target: "main" }]);
            expect(config.supportSelfHealEnabled).toBe(false);
            expect(config.supportMpPotionEnabled).toBe(false);
            expect(config.supportResurrectionEnabled).toBe(false);
            expect(config.useAttackSkills).toBe(false);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("migrates the old default target threshold without overriding a customized value", async () => {
        const root = await mkdtemp(path.join(tmpdir(), "flyff-automation-store-"));
        const legacyDir = path.join(root, "legacy");
        const customDir = path.join(root, "custom");
        await mkdir(legacyDir, { recursive: true });
        await mkdir(customDir, { recursive: true });
        await writeFile(path.join(legacyDir, "config.json"), JSON.stringify({
            version: 5,
            profileId: "legacy",
            templateThreshold: 0.82,
        }), "utf8");
        await writeFile(path.join(customDir, "config.json"), JSON.stringify({
            version: 5,
            profileId: "custom",
            templateThreshold: 0.70,
        }), "utf8");

        try {
            const store = new AutomationStore(root);
            expect((await store.load("legacy")).templateThreshold).toBe(0.60);
            expect((await store.load("custom")).templateThreshold).toBe(0.70);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
