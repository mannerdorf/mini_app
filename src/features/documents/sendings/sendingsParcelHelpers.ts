import {
  checkSanctionsByNomenclature,
  mergeSanctionVerdicts,
  pickNomenclatureText,
  type SanctionCheckResult,
} from "../../../lib/sanctions";
import { getSendingParcelsFromRow } from "../lib/documentsPipeline";

function getParcelGoodsObject(parcel: unknown): Record<string, unknown> {
  const p = parcel as Record<string, unknown> | null | undefined;
  const goodsRaw = p?.Товары ?? p?.Goods ?? p?.goods;
  return Array.isArray(goodsRaw)
    ? (goodsRaw[0] as Record<string, unknown>)
    : goodsRaw && typeof goodsRaw === "object"
      ? (goodsRaw as Record<string, unknown>)
      : {};
}

function getParcelTnvedRaw(parcel: unknown, goods: Record<string, unknown>): unknown {
  const p = parcel as Record<string, unknown> | null | undefined;
  return (
    goods?.ТНВЭД ??
    goods?.TNVED ??
    goods?.tnved ??
    goods?.HsCode ??
    goods?.HSCode ??
    p?.ТНВЭД ??
    p?.TNVED ??
    p?.tnved
  );
}

/** Parcels attached to a sending row (alias for pipeline helper). */
export function getRequestParcels(row: unknown): unknown[] {
  return getSendingParcelsFromRow(row);
}

export function getParcelTnvedCode(parcel: unknown): string {
  const goods = getParcelGoodsObject(parcel);
  return checkSanctionsByNomenclature(
    pickNomenclatureText(parcel),
    getParcelTnvedRaw(parcel, goods),
  ).tnvedCode;
}

export function getParcelSanctionResult(parcel: unknown): SanctionCheckResult {
  const goods = getParcelGoodsObject(parcel);
  return checkSanctionsByNomenclature(
    pickNomenclatureText(parcel),
    getParcelTnvedRaw(parcel, goods),
  );
}

export function getSendingSanctionResult(row: unknown): SanctionCheckResult {
  const parcels = getRequestParcels(row);
  if (parcels.length === 0) {
    return {
      verdict: "review",
      tnvedCode: "",
      reason: "нет данных по посылкам для проверки",
      matchedBy: "none",
    };
  }
  return mergeSanctionVerdicts(parcels.map(getParcelSanctionResult));
}

/** Flatten parcel object tree for search matching. */
export function getParcelSearchText(parcel: unknown): string {
  const parts: string[] = [];
  const seen = new WeakSet<object>();
  const collect = (value: unknown, depth = 0) => {
    if (value == null || depth > 8) return;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      const s = String(value).trim();
      if (s) parts.push(s);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collect(item, depth + 1));
      return;
    }
    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      if (seen.has(obj)) return;
      seen.add(obj);
      Object.values(obj).forEach((v) => collect(v, depth + 1));
    }
  };
  collect(parcel);
  return parts.join(" ").toLowerCase();
}
