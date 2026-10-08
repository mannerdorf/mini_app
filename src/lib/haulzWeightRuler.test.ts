import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRulerTicks, chunkRulerTicks, DEFAULT_WEIGHT_RULER_CONFIG,
  HAULZ_WEIGHT_RULER_STORAGE_KEY, isWeightOnRuler, loadWeightRulerConfig,
  parseWeightRulerNumber, RULER_PITCH_MM, rulerPrintPages, saveWeightRulerConfig,
  validateWeightRulerConfig,
} from "./haulzWeightRuler";

afterEach(() => vi.unstubAllGlobals());
describe("barcode weight scale", () => {
  it("generates fractional weight values exactly, including both endpoints", () => {
    const config = { start: 0.1, end: 0.7, step: 0.2 };
    expect(buildRulerTicks(config).map(tick => tick.weightKg)).toEqual([0.1, 0.3, 0.5, 0.7]);
    expect(isWeightOnRuler(config, 0.3)).toBe(true);
    expect(isWeightOnRuler(config, 0.4)).toBe(false);
    expect(isWeightOnRuler(config, 0.9)).toBe(false);
  });
  it("rejects invalid inputs and incomplete final intervals", () => {
    for (const value of ["", "oops", "1e3", "0x10", "1.0001", "-1"]) expect(parseWeightRulerNumber(value)).toBeNull();
    expect(parseWeightRulerNumber("0,125")).toBe(0.125);
    for (const config of [
      { start: NaN, end: 10, step: 1 }, { start: -1, end: 10, step: 1 },
      { start: 0, end: 10, step: 0 }, { start: 10, end: 5, step: 1 },
      { start: 0, end: 10, step: 3 }, { start: 0, end: 6, step: 0.001 },
    ]) {
      expect(validateWeightRulerConfig(config)).not.toBeNull();
      expect(buildRulerTicks(config)).toEqual([]);
    }
  });
  it("joins strips at the same endpoint without a missing or duplicated interval", () => {
    const ticks = buildRulerTicks({ start: 10, end: 110, step: 1 });
    const strips = chunkRulerTicks(ticks);
    expect(strips).toHaveLength(2);
    expect(strips[0].at(-1)).toEqual(strips[1][0]);
    expect(strips.flatMap((strip, i) => i ? strip.slice(1) : strip)).toEqual(ticks);
    expect(strips.map(strip => (strip.length - 1) * RULER_PITCH_MM)).toEqual([250, 250]);
    expect(rulerPrintPages(strips)).toHaveLength(1);
    expect(rulerPrintPages(chunkRulerTicks(buildRulerTicks({ start: 0, end: 200, step: 1 }))).map(page => page.length)).toEqual([3, 1]);
  });
  it("does not reinterpret the old kg/cm calibration, and restores valid new settings", () => {
    const data = new Map([["haulz.weightRuler.config", '{"start":10,"end":100,"step":0.5}']]);
    vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
    expect(loadWeightRulerConfig()).toEqual(DEFAULT_WEIGHT_RULER_CONFIG);
    const config = { start: 10, end: 30, step: 0.5 };
    saveWeightRulerConfig(config);
    expect(loadWeightRulerConfig()).toEqual(config);
    data.set(HAULZ_WEIGHT_RULER_STORAGE_KEY, '{"start":null,"end":30,"step":0.5}');
    expect(loadWeightRulerConfig()).toEqual(DEFAULT_WEIGHT_RULER_CONFIG);
  });
});
