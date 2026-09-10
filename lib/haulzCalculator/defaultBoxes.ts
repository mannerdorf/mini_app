import { HAULZ_BOX_PRESET_LABELS } from "./boxPresets.js";
import type { BoxesPayload, BoxSizePrice } from "./types.js";

export const DEFAULT_BOX_PRICE_RUB = 100;

export const DEFAULT_BOXES: BoxesPayload = {
  sizes: HAULZ_BOX_PRESET_LABELS.map((label) => ({
    code: label,
    label,
    price_rub: DEFAULT_BOX_PRICE_RUB,
  })),
};

export function normalizeBoxesPayload(payload: BoxesPayload | null | undefined): BoxesPayload {
  const byCode = new Map<string, BoxSizePrice>();
  for (const row of payload?.sizes ?? []) {
    const code = String(row.code || row.label || "")
      .trim()
      .toUpperCase();
    if (!code) continue;
    byCode.set(code, {
      code,
      label: String(row.label || code).trim() || code,
      price_rub: Math.max(0, Number(row.price_rub) || 0),
    });
  }
  return {
    sizes: HAULZ_BOX_PRESET_LABELS.map((label) => {
      const existing = byCode.get(label);
      return (
        existing ?? {
          code: label,
          label,
          price_rub: DEFAULT_BOX_PRICE_RUB,
        }
      );
    }),
  };
}
