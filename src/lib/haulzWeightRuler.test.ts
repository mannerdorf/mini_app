import { describe, expect, it } from "vitest";
import {
  absoluteBitsAtCm,
  absoluteTrackCount,
  buildRulerStripLayers,
  buildRulerTicks,
  chunkRulerTicks,
  fineSubdivisionBitAtCm,
  rulerStripCellBlack,
  rulerStripLayerCount,
  stripLengthCm,
  validateWeightRulerConfig,
  weightFromPositionCm,
} from "./haulzWeightRuler";

describe("haulzWeightRuler", () => {
  it("maps position cm to weight", () => {
    const cfg = { start: 0, end: 100, step: 0.5 };
    expect(stripLengthCm(cfg)).toBe(200);
    expect(weightFromPositionCm(cfg, 0)).toBe(0);
    expect(weightFromPositionCm(cfg, 10)).toBe(5);
  });

  it("validates range", () => {
    expect(validateWeightRulerConfig({ start: 0, end: 10, step: 1 })).toBeNull();
    expect(validateWeightRulerConfig({ start: 10, end: 5, step: 1 })).toMatch(/Конец/);
    expect(validateWeightRulerConfig({ start: 0, end: 10, step: 0 })).toMatch(/Шаг/);
  });

  it("builds gray absolute bits uniquely for nearby positions", () => {
    const tracks = absoluteTrackCount(16);
    const a = absoluteBitsAtCm(3, tracks).join("");
    const b = absoluteBitsAtCm(4, tracks).join("");
    expect(a).not.toBe(b);
  });

  it("chunks ticks into rows", () => {
    const ticks = buildRulerTicks({ start: 0, end: 10, step: 1 });
    const rows = chunkRulerTicks(ticks, 4);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0]?.length).toBe(4);
    expect(rows.flat().length).toBe(ticks.length);
  });

  it("builds more strip layers than absolute-only tracks", () => {
    expect(rulerStripLayerCount(100)).toBeGreaterThan(absoluteTrackCount(100));
    expect(buildRulerStripLayers(100).length).toBeGreaterThanOrEqual(14);
  });

  it("fine subdivision alternates every cm on track 0", () => {
    expect(fineSubdivisionBitAtCm(0, 0)).toBe(true);
    expect(fineSubdivisionBitAtCm(1, 0)).toBe(false);
    expect(fineSubdivisionBitAtCm(2, 0)).toBe(true);
  });

  it("marks row start and decimeter on sync layers", () => {
    const layers = buildRulerStripLayers(100);
    const rowSync = layers.find((l) => l.kind === "row-sync")!;
    const decimeter = layers.find((l) => l.kind === "decimeter")!;
    expect(rulerStripCellBlack(rowSync, 20, 0, absoluteTrackCount(100))).toBe(true);
    expect(rulerStripCellBlack(rowSync, 20, 5, absoluteTrackCount(100))).toBe(false);
    expect(rulerStripCellBlack(decimeter, 30, 10, absoluteTrackCount(100))).toBe(true);
    expect(rulerStripCellBlack(decimeter, 31, 11, absoluteTrackCount(100))).toBe(false);
  });
});
