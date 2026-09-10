import { resolvePlaceBoxSize } from "./boxPresets.js";
import { DEFAULT_BOX_PRICE_RUB, normalizeBoxesPayload } from "./defaultBoxes.js";
import type { BoxesPayload, ParcelPlace, QuoteLine } from "./types.js";

export const BOXES_QUOTE_LABEL = "Коробки";

export function calcBoxesQuote(
  places: ParcelPlace[],
  config: BoxesPayload | null | undefined,
): QuoteLine | null {
  const sizes = normalizeBoxesPayload(config).sizes;
  const priceByCode = new Map(sizes.map((s) => [s.code.toUpperCase(), Number(s.price_rub) || 0]));

  let total = 0;
  let count = 0;
  for (const place of places) {
    if (!place.boxRequired) continue;
    const size = resolvePlaceBoxSize(place);
    total += priceByCode.get(size) ?? DEFAULT_BOX_PRICE_RUB;
    count += 1;
  }

  if (count <= 0 || total <= 0) return null;

  return {
    key: "boxes",
    label: BOXES_QUOTE_LABEL,
    amountRub: Math.round(total * 100) / 100,
    meta: { count },
  };
}
