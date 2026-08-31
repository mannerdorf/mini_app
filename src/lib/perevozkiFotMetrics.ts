import { isReceivedInfoStatus } from "./statusUtils";

function parseCargoAmount(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return 0;
  const num = typeof raw === "string" ? parseFloat(raw.replace(",", ".")) : Number(raw);
  return Number.isFinite(num) ? num : 0;
}

export type PerevozkiFotMetrics = {
  paidWeight: number;
  sales: number;
};

export function aggregatePerevozkiFotMetrics(list: unknown[]): PerevozkiFotMetrics {
  let paidWeight = 0;
  let sales = 0;
  for (const row of list) {
    const item = row as Record<string, unknown>;
    if (isReceivedInfoStatus(item?.State)) continue;
    paidWeight += parseCargoAmount(item?.PW ?? item?.pw);
    sales += parseCargoAmount(item?.Sum ?? item?.sum);
  }
  return {
    paidWeight: Number(paidWeight.toFixed(2)),
    sales: Number(sales.toFixed(2)),
  };
}

export function normalizePerevozkiList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown[] }).items)) {
    return (data as { items: unknown[] }).items;
  }
  return [];
}
