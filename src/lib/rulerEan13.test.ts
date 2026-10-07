import { describe, expect, it } from 'vitest';
import { BitArray, EAN13Reader } from '@zxing/library';
import { ean13CheckDigit, ean13Modules, parseRulerScan, rulerEan13 } from './rulerEan13';

describe('ruler EAN-13', () => {
  it('matches a known EAN check digit', () => {
    expect(ean13CheckDigit('400638133393')).toBe('1');
  });
  it('is decoded by an independent barcode reader for every permitted position', () => {
    const reader = new EAN13Reader();
    for (let cm = 0; cm <= 5000; cm++) {
      const code = rulerEan13(cm);
      const modules = ean13Modules(code);
      const row = new BitArray(modules.length * 3);
      [...modules].forEach((bit, i) => {
        if (bit === '1') for (let j = 0; j < 3; j++) row.set(i * 3 + j);
      });
      expect(reader.decodeRow(0, row, null).getText()).toBe(code);
      expect(parseRulerScan(code)).toBe(cm);
    }
  });
  it('handles scanner suffix, AIM identifier and omitted check digit', () => {
    const code = rulerEan13(37);
    expect(parseRulerScan(code + '\r\n')).toBe(37);
    expect(parseRulerScan(']E0' + code)).toBe(37);
    expect(parseRulerScan(code.slice(0, 12))).toBe(37);
    expect(parseRulerScan('37')).toBe(37);
  });
  it('rejects corrupted codes, unrelated barcodes and invalid positions', () => {
    const code = rulerEan13(37);
    expect(parseRulerScan(code.slice(0, 12) + ((Number(code[12]) + 1) % 10))).toBeNull();
    expect(parseRulerScan('4006381333931')).toBeNull();
    expect(parseRulerScan('-1')).toBeNull();
    expect(parseRulerScan('5001')).toBeNull();
    expect(() => rulerEan13(1.5)).toThrow();
  });
});
