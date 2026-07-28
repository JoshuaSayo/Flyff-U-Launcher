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
});
