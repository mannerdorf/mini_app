import type { ClaimNomenclatureRow } from "./claimFormConstants";

export function mapClaimEnumToRu(values: string[], labels: Record<string, string>): string[] {
  return values.map((v) => labels[String(v).trim()] || v);
}

export async function fileToBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Не удалось прочитать файл: ${file.name}`));
    reader.readAsDataURL(file);
  });
  const commaIdx = dataUrl.indexOf(",");
  return commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
}

export function formatPhoneMask(value: string): string {
  const digitsOnly = String(value || "").replace(/\D/g, "");
  if (!digitsOnly) return "";
  let digits = digitsOnly;
  if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (!digits.startsWith("7")) digits = `7${digits}`;
  digits = digits.slice(0, 11);
  const p1 = digits.slice(1, 4);
  const p2 = digits.slice(4, 7);
  const p3 = digits.slice(7, 9);
  const p4 = digits.slice(9, 11);
  let out = "+7";
  if (p1) out += ` (${p1}`;
  if (p1.length === 3) out += ")";
  if (p2) out += ` ${p2}`;
  if (p3) out += `-${p3}`;
  if (p4) out += `-${p4}`;
  return out;
}

export function normalizeClaimCargoNumber(rawValue: string): string {
  const raw = String(rawValue || "").trim();
  if (!raw) return "";
  const compact = raw.replace(/\s+/g, "");
  const digitMatch = compact.match(/\d{5,12}/);
  return (digitMatch ? digitMatch[0] : compact).trim();
}

export function normalizeAcceptedCargoNomenclatureRows(
  rows: Record<string, unknown>[]
): ClaimNomenclatureRow[] {
  const result: ClaimNomenclatureRow[] = [];
  const seen = new Set<string>();
  rows.forEach((row, idx) => {
    const barcode = String(
      row?.Package ??
        (row as Record<string, unknown>)?.package ??
        (row as Record<string, unknown>)?.Barcode ??
        (row as Record<string, unknown>)?.barcode ??
        (row as Record<string, unknown>)?.Штрихкод ??
        ""
    ).trim();
    const skuRaw =
      (row as Record<string, unknown>)?.SKUs ??
      (row as Record<string, unknown>)?.skus ??
      (row as Record<string, unknown>)?.SKU ??
      (row as Record<string, unknown>)?.Nomenclature ??
      (row as Record<string, unknown>)?.Номенклатура ??
      (row as Record<string, unknown>)?.Goods ??
      (row as Record<string, unknown>)?.Товар ??
      (row as Record<string, unknown>)?.Name;
    const name = (() => {
      if (Array.isArray(skuRaw)) {
        const values = skuRaw
          .map((it: unknown) => {
            if (it == null) return "";
            if (typeof it === "string") return it;
            if (typeof it === "object") {
              const obj = it as Record<string, unknown>;
              return String(obj?.SKU ?? obj?.sku ?? obj?.Name ?? obj?.Номенклатура ?? "");
            }
            return String(it);
          })
          .map((s) => String(s).trim())
          .filter(Boolean);
        return values.join("\n");
      }
      if (skuRaw && typeof skuRaw === "object") {
        const obj = skuRaw as Record<string, unknown>;
        return String(obj?.SKU ?? obj?.sku ?? obj?.Name ?? obj?.Номенклатура ?? "").trim();
      }
      return String(skuRaw ?? "").trim();
    })();
    const declaredRaw =
      (row as Record<string, unknown>)?.DeclaredCost ??
      (row as Record<string, unknown>)?.declaredCost ??
      (row as Record<string, unknown>)?.DeclaredValue ??
      (row as Record<string, unknown>)?.declaredValue ??
      (row as Record<string, unknown>)?.ОбъявленнаяСтоимость ??
      (row as Record<string, unknown>)?.ОбъявлСтоимость ??
      (row as Record<string, unknown>)?.Объявленная_стоимость ??
      (row as Record<string, unknown>)?.InsuredValue ??
      (row as Record<string, unknown>)?.Стоимость;
    const declaredCost = (() => {
      const value = String(declaredRaw ?? "").trim();
      if (!value) return "";
      const normalized = value.replace(/\s/g, "").replace(",", ".");
      const asNumber = Number(normalized);
      if (Number.isFinite(asNumber)) {
        return `${asNumber.toLocaleString("ru-RU")} ₽`;
      }
      return value;
    })();
    if (!barcode && !name) return;
    const dedupeKey = `${barcode}::${name}::${declaredCost}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    result.push({
      key: `${barcode || "row"}:${idx}`,
      barcode,
      name: name || "—",
      declaredCost: declaredCost || "—",
    });
  });
  return result;
}

export function extractCustomerClaimPayloadFromEvents(events: unknown[]): {
  contactName: string;
  selectedPlaces: string[];
  manipulationSigns: string[];
  packagingTypes: string[];
} {
  if (!Array.isArray(events) || events.length === 0) {
    return { contactName: "", selectedPlaces: [], manipulationSigns: [], packagingTypes: [] };
  }
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i] as Record<string, unknown>;
    const eventType = String(event?.eventType || "").trim().toLowerCase();
    if (eventType !== "claim_draft_saved" && eventType !== "claim_created") continue;
    const rawPayload = event?.payload;
    const payload =
      typeof rawPayload === "string"
        ? (() => {
            try {
              return JSON.parse(rawPayload) as Record<string, unknown>;
            } catch {
              return {};
            }
          })()
        : rawPayload && typeof rawPayload === "object"
          ? (rawPayload as Record<string, unknown>)
          : {};
    const selectedPlaces = Array.isArray(payload?.selectedPlaces)
      ? payload.selectedPlaces.map((v) => String(v || "").trim()).filter(Boolean)
      : [];
    const manipulationSigns = Array.isArray(payload?.manipulationSigns)
      ? payload.manipulationSigns.map((v) => String(v || "").trim()).filter(Boolean)
      : [];
    const packagingTypes = Array.isArray(payload?.packagingTypes)
      ? payload.packagingTypes.map((v) => String(v || "").trim()).filter(Boolean)
      : [];
    return {
      contactName: String(payload?.customerContactName || "").trim(),
      selectedPlaces,
      manipulationSigns,
      packagingTypes,
    };
  }
  return { contactName: "", selectedPlaces: [], manipulationSigns: [], packagingTypes: [] };
}
