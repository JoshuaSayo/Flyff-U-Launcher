import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

function sourceFiles(directory: string): string[] {
    const result: string[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) result.push(...sourceFiles(absolute));
        else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) result.push(absolute);
    }
    return result;
}

describe("automation architectural boundary", () => {
    const directory = path.resolve(__dirname);
    const files = sourceFiles(directory);

    it("does not import plugin, API-fetch, or network services", () => {
        for (const file of files) {
            const source = readFileSync(file, "utf8");
            expect(source, file).not.toMatch(/from\s+["'][^"']*(?:plugin|api-fetch|serviceRegistry|node:https|node:http)["']/i);
            expect(source, file).not.toMatch(/\bfetch\s*\(/);
        }
    });

    it("does not inspect the game DOM and confines debugger access to the input facade", () => {
        for (const file of files) {
            const source = readFileSync(file, "utf8");
            expect(source, file).not.toContain("executeJavaScript");
            if (!file.endsWith("inputFacade.ts")) expect(source, file).not.toContain(".debugger");
        }
    });

    it("uses only the CDP Input domain for Main and paired Support delivery", () => {
        const file = files.find((candidate) => candidate.endsWith("inputFacade.ts"));
        expect(file).toBeDefined();
        const source = readFileSync(file!, "utf8");
        const commands = [...source.matchAll(/\.sendCommand\(\s*["']([^"']+)["']/g)]
            .map((match) => match[1]);
        expect(commands.length).toBeGreaterThan(0);
        expect(commands.every((command) => command.startsWith("Input."))).toBe(true);
    });

    it("emits input only through inputFacade.ts", () => {
        for (const file of files.filter((candidate) => !candidate.endsWith("inputFacade.ts"))) {
            expect(readFileSync(file, "utf8"), file).not.toContain("sendInputEvent");
        }
    });
});
