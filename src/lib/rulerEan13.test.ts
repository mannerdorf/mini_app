import { describe, expect, it } from 'vitest';
import { BitArray, EAN13Reader } from '@zxing/library';
import { ean13CheckDigit, ean13Modules, parseRulerScan, rulerEan13 } from './rulerEan13';
import { buildRulerTicks } from './haulzWeightRuler';

describe('fourth scale EAN-13 weight codes', () => {
  it('matches a known EAN check digit', () => {
    expect(ean13CheckDigit('400638133393')).toBe('1');
  });
  it('is decoded independently, including fractional weights and the supported boundaries', () => {
    const reader = new EAN13Reader();
    const weights = new Set([
      ...buildRulerTicks({ start: 0, end: 5000, step: 1 }).map(tick => tick.weightKg),
      0.001, 0.125, 0.3, 10.5, 99999.999,
    ]);
    for (const weight of weights) {
      const code = rulerEan13(weight);
      const modules = ean13Modules(code);
      const row = new BitArray(modules.length * 3);
      [...modules].forEach((bit, i) => {
        if (bit === '1') for (let j = 0; j < 3; j++) row.set(i * 3 + j);
      });
      expect(reader.decodeRow(0, row, null).getText()).toBe(code);
      expect(parseRulerScan(code)).toBe(weight);
    }
  });
  it('carries the weight itself, independent of the range and interval used for printing', () => {
    expect(rulerEan13(10.5).slice(0, 12)).toBe('200400010500');
    expect(parseRulerScan(rulerEan13(10.5))).toBe(10.5);
    const code = rulerEan13(37.125);
    expect(parseRulerScan(code + '\r\n')).toBe(37.125);
    expect(parseRulerScan(']E0' + code)).toBe(37.125);
    expect(parseRulerScan(code.slice(0, 12))).toBe(37.125);
  });
  it('rejects corrupted codes, product barcodes, old position codes and unencoded numbers', () => {
    const code = rulerEan13(37);
    expect(parseRulerScan(code.slice(0, 12) + ((Number(code[12]) + 1) % 10))).toBeNull();
    expect(parseRulerScan('4006381333931')).toBeNull();
    expect(parseRulerScan('200000000037' + ean13CheckDigit('200000000037'))).toBeNull();
    expect(parseRulerScan('37')).toBeNull();
    expect(() => rulerEan13(-1)).toThrow();
    expect(() => rulerEan13(100000)).toThrow();
    expect(() => rulerEan13(0.0001)).toThrow();
  });
});
