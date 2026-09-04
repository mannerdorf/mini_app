import { describe, expect, it } from "vitest";
import {
  absoluteBitsAtCm,
  absoluteTrackCount,
  buildRulerTicks,
  chunkRulerTicks,
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
});
