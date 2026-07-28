import { describe, expect, it } from "vitest";
import { detectBarFill, matchTemplate, structuralEdgeDensity, type PixelFrame } from "./frameAnalyzer";

function frame(width: number, height: number, color: [number, number, number] = [0, 0, 0]): PixelFrame {
    const data = new Uint8Array(width * height * 4);
    for (let index = 0; index < width * height; index++) {
        data[index * 4] = color[0];
        data[index * 4 + 1] = color[1];
        data[index * 4 + 2] = color[2];
        data[index * 4 + 3] = 255;
    }
    return { width, height, channels: 4, data };
}

function setPixel(target: PixelFrame, x: number, y: number, color: [number, number, number]): void {
    const offset = (y * target.width + x) * target.channels;
    target.data[offset] = color[0];
    target.data[offset + 1] = color[1];
    target.data[offset + 2] = color[2];
}

describe("frameAnalyzer", () => {
    it("measures a structurally filled red HP bar", () => {
        const source = frame(100, 8, [25, 25, 25]);
        for (let y = 1; y < 7; y++) {
            for (let x = 0; x < 60; x++) setPixel(source, x, y, [220, 25, 35]);
        }
        expect(detectBarFill(source, { x: 0, y: 0, width: 1, height: 1 })).toBeCloseTo(0.60, 1);
    });

    it("measures a blue MP bar without treating it as HP", () => {
        const source = frame(100, 8, [25, 25, 25]);
        for (let y = 1; y < 7; y++) {
            for (let x = 0; x < 35; x++) setPixel(source, x, y, [30, 95, 225]);
        }
        const rect = { x: 0, y: 0, width: 1, height: 1 };
        expect(detectBarFill(source, rect, "mana")).toBeCloseTo(0.35, 1);
        expect(detectBarFill(source, rect)).toBeNull();
    });

    it("finds a brightness-normalized structural template", () => {
        const source = frame(48, 32, [18, 18, 18]);
        const template = frame(8, 6, [18, 18, 18]);
        for (let y = 0; y < template.height; y++) {
            for (let x = 0; x < template.width; x++) {
                const color: [number, number, number] = (x + y) % 3 === 0 ? [230, 210, 60] : [35, 45, 70];
                setPixel(template, x, y, color);
                setPixel(source, 20 + x, 12 + y, color);
            }
        }
        const match = matchTemplate(source, template, { x: 0, y: 0, width: 1, height: 1 });
        expect(match).not.toBeNull();
        expect(match!.score).toBeGreaterThan(0.95);
        expect(match!.x).toBeGreaterThanOrEqual(18);
        expect(match!.x).toBeLessThanOrEqual(22);
    });

    it("rejects smooth regions as low-detail templates", () => {
        const smooth = frame(80, 40, [35, 35, 35]);
        for (let y = 0; y < smooth.height; y++) {
            for (let x = 0; x < smooth.width; x++) {
                const value = 35 + Math.floor(x / 20);
                setPixel(smooth, x, y, [value, value, value]);
            }
        }
        expect(structuralEdgeDensity(smooth)).toBeLessThan(0.015);
    });
});
