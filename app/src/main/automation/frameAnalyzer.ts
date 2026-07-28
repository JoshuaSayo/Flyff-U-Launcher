/** Local pixel analysis. This module has no network, plugin, DOM, or game-data access. */

import sharp from "sharp";
import type { NormalizedRect } from "../../shared/automation";

export type PixelFrame = {
    width: number;
    height: number;
    channels: number;
    data: Uint8Array;
};

export type TemplateMatch = {
    score: number;
    x: number;
    y: number;
    width: number;
    height: number;
};

export type RedCrosshairDetection = {
    engaged: boolean;
    score: number;
    centerX: number | null;
    centerY: number | null;
};

export async function decodePng(png: Buffer): Promise<PixelFrame> {
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { width: info.width, height: info.height, channels: info.channels, data };
}

export function toPixelRect(frame: Pick<PixelFrame, "width" | "height">, rect: NormalizedRect): { x: number; y: number; width: number; height: number } {
    const x = Math.max(0, Math.min(frame.width - 1, Math.round(rect.x * frame.width)));
    const y = Math.max(0, Math.min(frame.height - 1, Math.round(rect.y * frame.height)));
    const width = Math.max(1, Math.min(frame.width - x, Math.round(rect.width * frame.width)));
    const height = Math.max(1, Math.min(frame.height - y, Math.round(rect.height * frame.height)));
    return { x, y, width, height };
}

function rgbToHsv(r8: number, g8: number, b8: number): { h: number; s: number; v: number } {
    const r = r8 / 255;
    const g = g8 / 255;
    const b = b8 / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    if (delta > 0) {
        if (max === r) h = 60 * (((g - b) / delta) % 6);
        else if (max === g) h = 60 * (((b - r) / delta) + 2);
        else h = 60 * (((r - g) / delta) + 4);
    }
    if (h < 0) h += 360;
    return { h, s: max === 0 ? 0 : delta / max, v: max };
}

/** Estimate a health or mana bar fill from a configured ROI using HSV structure. */
export function detectBarFill(
    frame: PixelFrame,
    rect: NormalizedRect,
    kind: "health" | "mana" = "health",
): number | null {
    const roi = toPixelRect(frame, rect);
    const columnActive = new Array<boolean>(roi.width).fill(false);
    for (let x = 0; x < roi.width; x++) {
        let colored = 0;
        for (let y = 0; y < roi.height; y++) {
            const offset = ((roi.y + y) * frame.width + roi.x + x) * frame.channels;
            const hsv = rgbToHsv(frame.data[offset] ?? 0, frame.data[offset + 1] ?? 0, frame.data[offset + 2] ?? 0);
            const isRed = hsv.h <= 24 || hsv.h >= 335;
            const isGreen = hsv.h >= 75 && hsv.h <= 165;
            const isBlue = hsv.h >= 185 && hsv.h <= 250;
            const acceptedHue = kind === "mana" ? isBlue : isRed || isGreen;
            if (acceptedHue && hsv.s >= 0.45 && hsv.v >= 0.30) colored++;
        }
        columnActive[x] = colored >= Math.max(1, Math.ceil(roi.height * 0.22));
    }
    const activeColumns = columnActive.reduce((sum, active) => sum + (active ? 1 : 0), 0);
    if (activeColumns < Math.max(2, Math.floor(roi.width * 0.02))) return null;

    let furthest = -1;
    let gap = 0;
    for (let x = 0; x < columnActive.length; x++) {
        if (columnActive[x]) {
            furthest = x;
            gap = 0;
        } else if (furthest >= 0 && ++gap > Math.max(2, Math.round(roi.width * 0.04))) {
            break;
        }
    }
    return Math.min(1, Math.max(0, (furthest + 1) / roi.width));
}

/**
 * Detect Flyff's red combat crosshair near the monster that was clicked.
 *
 * The monster label remains the primary target detector. This confirmation
 * combines saturated-red HSV segmentation with a three-direction radial
 * structure so ordinary red bars or text do not count as engagement.
 */
export function detectRedCrosshair(
    frame: PixelFrame,
    scanRect: NormalizedRect,
    near: { x: number; y: number } | null,
): RedCrosshairDetection {
    const empty: RedCrosshairDetection = {
        engaged: false,
        score: 0,
        centerX: null,
        centerY: null,
    };
    if (!near) return empty;

    const scan = toPixelRect(frame, scanRect);
    const minDimension = Math.min(frame.width, frame.height);
    const searchRadius = Math.max(36, Math.min(90, Math.round(minDimension * 0.075)));
    const outerRadius = Math.max(24, Math.min(72, Math.round(minDimension * 0.070)));
    const innerRadius = Math.max(5, Math.min(14, Math.round(minDimension * 0.012)));
    const candidateStep = Math.max(4, Math.min(10, Math.round(minDimension / 150)));
    const sampleStep = minDimension >= 900 ? 2 : 1;
    const extent = searchRadius + outerRadius;
    const left = Math.max(scan.x, Math.round(near.x - extent));
    const right = Math.min(scan.x + scan.width - 1, Math.round(near.x + extent));
    const top = Math.max(scan.y, Math.round(near.y - extent));
    const bottom = Math.min(scan.y + scan.height - 1, Math.round(near.y + extent));
    const redPixels: Array<{ x: number; y: number }> = [];

    for (let y = top; y <= bottom; y += sampleStep) {
        for (let x = left; x <= right; x += sampleStep) {
            const offset = (y * frame.width + x) * frame.channels;
            const r = frame.data[offset] ?? 0;
            const g = frame.data[offset + 1] ?? 0;
            const b = frame.data[offset + 2] ?? 0;
            const hsv = rgbToHsv(r, g, b);
            const redHue = hsv.h <= 20 || hsv.h >= 340;
            if (redHue && hsv.s >= 0.62 && hsv.v >= 0.48 && r >= 135 && r - Math.max(g, b) >= 28) {
                redPixels.push({ x, y });
            }
        }
    }
    if (redPixels.length < 9) return empty;

    const minSectorPixels = sampleStep === 1 ? 4 : 2;
    let best = empty;
    for (let cy = Math.round(near.y - searchRadius); cy <= near.y + searchRadius; cy += candidateStep) {
        for (let cx = Math.round(near.x - searchRadius); cx <= near.x + searchRadius; cx += candidateStep) {
            const sectors = [0, 0, 0, 0];
            let total = 0;
            let centerPixels = 0;
            let minX = Number.POSITIVE_INFINITY;
            let maxX = Number.NEGATIVE_INFINITY;
            let minY = Number.POSITIVE_INFINITY;
            let maxY = Number.NEGATIVE_INFINITY;
            for (const pixel of redPixels) {
                const dx = pixel.x - cx;
                const dy = pixel.y - cy;
                const distance = Math.hypot(dx, dy);
                if (distance < innerRadius) {
                    centerPixels++;
                    continue;
                }
                if (distance > outerRadius) continue;
                const sector = Math.abs(dx) >= Math.abs(dy)
                    ? dx >= 0 ? 0 : 2
                    : dy >= 0 ? 1 : 3;
                sectors[sector]++;
                total++;
                minX = Math.min(minX, pixel.x);
                maxX = Math.max(maxX, pixel.x);
                minY = Math.min(minY, pixel.y);
                maxY = Math.max(maxY, pixel.y);
            }
            const activeSectors = sectors.filter((count) => count >= minSectorPixels).length;
            if (activeSectors < 2 || total === 0) continue;
            const spanX = Math.max(0, maxX - minX);
            const spanY = Math.max(0, maxY - minY);
            const spanFactor = Math.min(1, spanX / (outerRadius * 0.9), spanY / (outerRadius * 0.9));
            const densityFactor = Math.min(1, total / (minSectorPixels * 8));
            const centerClearFactor = Math.max(0, 1 - centerPixels / Math.max(1, total * 0.35));
            const score = Math.min(1,
                activeSectors / 4 * 0.45
                + spanFactor * 0.30
                + densityFactor * 0.15
                + centerClearFactor * 0.10);
            if (score > best.score) {
                best = {
                    engaged: activeSectors >= 3 && spanFactor >= 0.65 && score >= 0.72,
                    score,
                    centerX: cx,
                    centerY: cy,
                };
            }
        }
    }
    return best;
}

function luminance(frame: PixelFrame, x: number, y: number): number {
    const offset = (y * frame.width + x) * frame.channels;
    return 0.2126 * (frame.data[offset] ?? 0) + 0.7152 * (frame.data[offset + 1] ?? 0) + 0.0722 * (frame.data[offset + 2] ?? 0);
}

function meanLuminance(frame: PixelFrame, x0: number, y0: number, width: number, height: number, sample: number): number {
    let total = 0;
    let count = 0;
    for (let y = 0; y < height; y += sample) {
        for (let x = 0; x < width; x += sample) {
            total += luminance(frame, x0 + x, y0 + y);
            count++;
        }
    }
    return count > 0 ? total / count : 0;
}

/** Ratio of sampled neighboring pixels with a meaningful luminance edge. */
export function structuralEdgeDensity(frame: PixelFrame): number {
    if (frame.width < 2 || frame.height < 2) return 0;
    const step = Math.max(1, Math.floor(Math.min(frame.width, frame.height) / 64));
    let edges = 0;
    let comparisons = 0;
    for (let y = 0; y < frame.height - step; y += step) {
        for (let x = 0; x < frame.width - step; x += step) {
            const value = luminance(frame, x, y);
            if (Math.abs(value - luminance(frame, x + step, y)) >= 18) edges++;
            if (Math.abs(value - luminance(frame, x, y + step)) >= 18) edges++;
            comparisons += 2;
        }
    }
    return comparisons > 0 ? edges / comparisons : 0;
}

/** Multi-position, brightness-normalized structural template matching. */
export function matchTemplate(frame: PixelFrame, template: PixelFrame, scanRect: NormalizedRect): TemplateMatch | null {
    const scan = toPixelRect(frame, scanRect);
    if (template.width < 3 || template.height < 3 || template.width > scan.width || template.height > scan.height) return null;
    const sample = Math.max(1, Math.ceil(Math.min(template.width, template.height) / 12));
    const stride = Math.max(2, Math.floor(sample * 1.5));
    const templateMean = meanLuminance(template, 0, 0, template.width, template.height, sample);
    let bestScore = 0;
    let bestX = scan.x;
    let bestY = scan.y;
    for (let y = scan.y; y <= scan.y + scan.height - template.height; y += stride) {
        for (let x = scan.x; x <= scan.x + scan.width - template.width; x += stride) {
            const candidateMean = meanLuminance(frame, x, y, template.width, template.height, sample);
            let covariance = 0;
            let templateEnergy = 0;
            let candidateEnergy = 0;
            for (let ty = 0; ty < template.height; ty += sample) {
                for (let tx = 0; tx < template.width; tx += sample) {
                    const a = luminance(template, tx, ty) - templateMean;
                    const b = luminance(frame, x + tx, y + ty) - candidateMean;
                    covariance += a * b;
                    templateEnergy += a * a;
                    candidateEnergy += b * b;
                }
            }
            const denominator = Math.sqrt(templateEnergy * candidateEnergy);
            const correlation = denominator > 1e-6 ? covariance / denominator : -1;
            const score = Math.max(0, Math.min(1, (correlation + 1) / 2));
            if (score > bestScore) {
                bestScore = score;
                bestX = x;
                bestY = y;
            }
        }
    }
    return { score: Math.max(0, Math.min(1, bestScore)), x: bestX, y: bestY, width: template.width, height: template.height };
}

export async function extractNormalizedRect(png: Buffer, rect: NormalizedRect): Promise<Buffer> {
    const metadata = await sharp(png).metadata();
    if (!metadata.width || !metadata.height) throw new Error("Captured frame has no dimensions");
    const pixelRect = toPixelRect({ width: metadata.width, height: metadata.height }, rect);
    return sharp(png).extract({ left: pixelRect.x, top: pixelRect.y, width: pixelRect.width, height: pixelRect.height }).png().toBuffer();
}
