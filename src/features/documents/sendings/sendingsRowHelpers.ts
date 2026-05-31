import type { VisibleSendingRowMeta } from "./useSendingsBulkActions";

export function getSendingRowKey(row: unknown, idx: number): string {
  const r = row as Record<string, unknown> | null | undefined;
  const number = String(r?.Номер ?? r?.Number ?? r?.number ?? "").trim();
  return number || `${idx}`;
}

export function getSendingCargoNumbers(row: unknown): string[] {
  const r = row as Record<string, unknown> | null | undefined;
  const numbers: string[] = [];
  const add = (value: unknown) => {
    const v = String(value ?? "").trim();
    if (v) numbers.push(v);
  };
  add(r?.НомерПеревозки);
  add(r?.CargoNumber);
  add(r?.NumberPerevozki);
  add(r?.ИДОтправления);
  add(r?.Номер);
  add(r?.Number);
  add(r?.number);
  const rawParcels = r?.Посылки ?? r?.Parcels ?? r?.parcels ?? r?.Packages ?? r?.packages;
  const parcels = Array.isArray(rawParcels)
    ? rawParcels
    : rawParcels && typeof rawParcels === "object"
      ? Object.values(rawParcels as Record<string, unknown>)
      : [];
  parcels.forEach((parcel) => {
    const p = parcel as Record<string, unknown>;
    add(p?.Перевозка);
    add(p?.ИДОтправления);
    add(p?.НомерПеревозки);
    add(p?.CargoNumber);
    add(p?.NumberPerevozki);
    const goodsRaw = p?.Товары;
    const goods = Array.isArray(goodsRaw)
      ? (goodsRaw[0] ?? {})
      : goodsRaw && typeof goodsRaw === "object"
        ? goodsRaw
        : null;
    if (goods && typeof goods === "object") {
      const g = goods as Record<string, unknown>;
      add(g?.Перевозка);
      add(g?.ИДОтправления);
      add(g?.НомерПеревозки);
      add(g?.CargoNumber);
      add(g?.NumberPerevozki);
    }
  });
  return Array.from(new Set(numbers));
}

export function buildVisibleSendingMeta(sendingRowsSorted: unknown[]): VisibleSendingRowMeta[] {
  return sendingRowsSorted.map((row, idx) => {
    const r = row as Record<string, unknown>;
    const rawDate = r?.Дата ?? r?.Date ?? r?.date ?? "";
    const sendingNumber = String(r?.Номер ?? r?.Number ?? r?.number ?? "").trim();
    return {
      rowKey: getSendingRowKey(row, idx),
      row,
      sendingNumber,
      sendingDate: rawDate ? String(rawDate) : "",
      cargoNumbers: getSendingCargoNumbers(row),
    };
  });
}

export function getSendingsAnalyticsExtraColCount(hasAnalytics: boolean, showSums: boolean): number {
  return hasAnalytics ? 2 + (showSums ? 2 : 0) : 0;
}
