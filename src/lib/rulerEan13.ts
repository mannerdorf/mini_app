/** Internal ruler codes: six-digit namespace + position in whole centimetres. */
const PREFIX = '200000';
const L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

export function ean13CheckDigit(payload: string): string {
  if (!/^\d{12}$/.test(payload)) throw new Error('EAN-13 requires 12 payload digits');
  const sum = [...payload].reduce((total, digit, i) => total + Number(digit) * (i % 2 ? 3 : 1), 0);
  return String((10 - sum % 10) % 10);
}

export function rulerEan13(positionCm: number): string {
  if (!Number.isInteger(positionCm) || positionCm < 0 || positionCm > 5000) throw new Error('Invalid ruler position');
  const payload = PREFIX + String(positionCm).padStart(6, '0');
  return payload + ean13CheckDigit(payload);
}

/** 95 EAN modules plus left/right quiet zones of 11/7 modules. */
export function ean13Modules(code: string): string {
  if (!/^\d{13}$/.test(code) || ean13CheckDigit(code.slice(0, 12)) !== code[12]) throw new Error('Invalid EAN-13');
  const parity = PARITY[Number(code[0])];
  const left = [...code.slice(1, 7)].map((digit, i) => (parity[i] === 'L' ? L : G)[Number(digit)]).join('');
  const right = [...code.slice(7)].map(digit => [...L[Number(digit)]].map(bit => bit === '1' ? '0' : '1').join('')).join('');
  return '0'.repeat(11) + '101' + left + '01010' + right + '101' + '0'.repeat(7);
}

export function parseRulerScan(raw: string): number | null {
  const value = raw.trim().replace(/^\]E0/, '');
  if (/^\d{12,13}$/.test(value)) {
    // Some scanners omit the check digit; accept only this ruler's namespace.
    if (!value.startsWith(PREFIX)) return null;
    if (value.length === 13 && ean13CheckDigit(value.slice(0, 12)) !== value[12]) return null;
    const cm = Number(value.slice(6, 12));
    return cm <= 5000 ? cm : null;
  }
  if (!/^\d+(?:[.,]\d+)?$/.test(value)) return null;
  const cm = Number(value.replace(',', '.'));
  return Number.isFinite(cm) && cm <= 5000 ? cm : null;
}
