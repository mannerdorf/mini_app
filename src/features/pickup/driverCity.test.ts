import { it, expect, vi, afterEach } from 'vitest';
import { readDriverCity, saveDriverCity } from './driverCity';
afterEach(() => vi.unstubAllGlobals());
it('isolates persisted cities per account and ignores unsupported values', () => {
  const values = new Map();
  vi.stubGlobal('localStorage',{getItem:(k:string)=>values.get(k),setItem:(k:string,v:string)=>values.set(k,v)});
  saveDriverCity(' Alice ','kaliningrad');
  expect(readDriverCity('alice')).toBe('kaliningrad');
  expect(readDriverCity('bob')).toBeUndefined();
  values.set('haulz.pickup.city:bob','invalid');
  expect(readDriverCity('bob')).toBeUndefined();
});
