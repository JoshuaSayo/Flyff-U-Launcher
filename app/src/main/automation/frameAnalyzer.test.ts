import { describe, expect, it } from "vitest";
import {
    detectBarFill,
    detectRedCrosshair,
    matchTemplate,
    structuralEdgeDensity,
    type PixelFrame,
} from "./frameAnalyzer";

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

function fillRect(
    target: PixelFrame,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: [number, number, number],
): void {
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) setPixel(target, x, y, color);
    }
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

    it("confirms a saturated-red three-direction combat crosshair", () => {
        const source = frame(320, 200, [25, 45, 25]);
        fillRect(source, 156, 76, 164, 84, [245, 35, 55]);
        fillRect(source, 137, 97, 145, 106, [245, 35, 55]);
        fillRect(source, 175, 97, 183, 106, [245, 35, 55]);

        const result = detectRedCrosshair(
            source,
            { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
            { x: 160, y: 100 },
        );

        expect(result.engaged).toBe(true);
        expect(result.score).toBeGreaterThanOrEqual(0.72);
    });

    it("does not confuse a white selection marker or red HP bar with the red crosshair", () => {
        const selected = frame(320, 200, [25, 45, 25]);
        fillRect(selected, 156, 76, 164, 84, [245, 245, 245]);
        fillRect(selected, 137, 97, 145, 106, [245, 245, 245]);
        fillRect(selected, 175, 97, 183, 106, [245, 245, 245]);
        const bar = frame(320, 200, [25, 45, 25]);
        fillRect(bar, 120, 96, 200, 104, [235, 30, 45]);
        const roi = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };

        expect(detectRedCrosshair(selected, roi, { x: 160, y: 100 }).engaged).toBe(false);
        expect(detectRedCrosshair(bar, roi, { x: 160, y: 100 }).engaged).toBe(false);
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
