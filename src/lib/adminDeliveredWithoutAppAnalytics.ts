import { getCargoItemRouteLabel } from "../components/shared/CargoTableDisplay";
import {
  collectInvoiceLinkedCargoNumbers,
  normCargoKey,
} from "../features/documents/lib/documentsPipeline";
import { stripOoo } from "./formatUtils";
import { getInvoiceEdoInfoByDocLabel, getInvoiceEdoRawByDocLabel } from "./edoStatus";
import { getFilterKeyByStatus, isReceivedInfoStatus } from "./statusUtils";
import type { CargoItem } from "../types";

export type DeliveredWithoutAppRow = {
  cargoNumber: string;
  customer: string;
  datePrih: string;
  dateVr: string;
  route: string;
  invoiceNumber: string | null;
  appStatusLabel: string;
};

export type DeliveredWithoutAppReport = {
  rows: DeliveredWithoutAppRow[];
  deliveredTotal: number;
  withApp: number;
  withoutApp: number;
  noLinkedInvoice: number;
};

/** Сдвигает dateFrom назад для поиска счетов, выставленных до даты выдачи. */
export function expandInvoiceLookupDateFrom(dateFrom: string, daysBack = 120): string {
  const d = new Date(`${dateFrom}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return dateFrom;
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

export function buildInvoiceByCargoKeyMap(invoices: unknown[]): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const inv of invoices) {
    if (!inv || typeof inv !== "object") continue;
    const record = inv as Record<string, unknown>;
    for (const num of collectInvoiceLinkedCargoNumbers(record)) {
      const key = normCargoKey(num);
      if (!key || map.has(key)) continue;
      map.set(key, record);
    }
  }
  return map;
}

/** Есть ли у перевозки/счёта статус или документ АПП в ЭДО. */
export function cargoHasAppDocument(item: CargoItem, linkedInvoice?: Record<string, unknown> | null): boolean {
  const rawOnCargo = getInvoiceEdoRawByDocLabel(item, "АПП").trim();
  if (rawOnCargo) return true;
  if (linkedInvoice) {
    const rawOnInvoice = getInvoiceEdoRawByDocLabel(linkedInvoice, "АПП").trim();
    if (rawOnInvoice) return true;
  }
  return false;
}

export function buildDeliveredWithoutAppReport(
  cargoItems: CargoItem[],
  invoices: unknown[],
): DeliveredWithoutAppReport {
  const invoiceByCargo = buildInvoiceByCargoKeyMap(invoices);
  const rows: DeliveredWithoutAppRow[] = [];
  let deliveredTotal = 0;
  let withApp = 0;
  let withoutApp = 0;
  let noLinkedInvoice = 0;

  for (const item of cargoItems) {
    if (isReceivedInfoStatus(item.State)) continue;
    if (getFilterKeyByStatus(item.State) !== "delivered") continue;
    deliveredTotal += 1;

    const cargoNumber = String(item.Number ?? "").trim();
    const cargoKey = normCargoKey(cargoNumber);
    const linkedInvoice = cargoKey ? invoiceByCargo.get(cargoKey) ?? null : null;

    if (cargoHasAppDocument(item, linkedInvoice)) {
      withApp += 1;
      continue;
    }

    withoutApp += 1;
    if (!linkedInvoice) noLinkedInvoice += 1;

    const appSource = linkedInvoice ?? item;
    rows.push({
      cargoNumber: cargoNumber || "—",
      customer: stripOoo(String(item.Customer ?? (item as { customer?: string }).customer ?? "—")).trim() || "—",
      datePrih: String(item.DatePrih ?? "").trim(),
      dateVr: String(item.DateVr ?? "").trim(),
      route: getCargoItemRouteLabel(item),
      invoiceNumber: linkedInvoice
        ? String(linkedInvoice.Number ?? linkedInvoice.number ?? linkedInvoice.N ?? "").trim() || null
        : null,
      appStatusLabel: getInvoiceEdoInfoByDocLabel(appSource, "АПП").label,
    });
  }

  rows.sort(
    (a, b) =>
      String(b.dateVr).localeCompare(String(a.dateVr)) ||
      a.cargoNumber.localeCompare(b.cargoNumber, "ru"),
  );

  return { rows, deliveredTotal, withApp, withoutApp, noLinkedInvoice };
}
