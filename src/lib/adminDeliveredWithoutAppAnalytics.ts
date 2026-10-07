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
  hasApp: boolean;
  hasLinkedInvoice: boolean;
};

export type DeliveredWithoutAppReport = {
  rows: DeliveredWithoutAppRow[];
  allRows: DeliveredWithoutAppRow[];
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
  const allRows: DeliveredWithoutAppRow[] = [];
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

    const hasApp = cargoHasAppDocument(item, linkedInvoice);
    if (hasApp) withApp += 1;
    else withoutApp += 1;
    if (!linkedInvoice) noLinkedInvoice += 1;

    const appSource = linkedInvoice && getInvoiceEdoRawByDocLabel(linkedInvoice, "АПП").trim() ? linkedInvoice : item;
    const row: DeliveredWithoutAppRow = {
      cargoNumber: cargoNumber || "—",
      customer: stripOoo(String(item.Customer ?? (item as { customer?: string }).customer ?? "—")).trim() || "—",
      datePrih: String(item.DatePrih ?? "").trim(),
      dateVr: String(item.DateVr ?? "").trim(),
      route: getCargoItemRouteLabel(item),
      invoiceNumber: linkedInvoice
        ? String(linkedInvoice.Number ?? linkedInvoice.number ?? linkedInvoice.N ?? "").trim() || null
        : null,
      appStatusLabel: getInvoiceEdoInfoByDocLabel(appSource, "АПП").label,
      hasApp,
      hasLinkedInvoice: !!linkedInvoice,
    };
    allRows.push(row);
    if (!hasApp) rows.push(row);
  }

  rows.sort(
    (a, b) =>
      String(b.dateVr).localeCompare(String(a.dateVr)) ||
      a.cargoNumber.localeCompare(b.cargoNumber, "ru"),
  );

  return { rows, allRows, deliveredTotal, withApp, withoutApp, noLinkedInvoice };
}

export type DeliveredAppFilter = 'all' | 'withoutApp' | 'withApp' | 'withoutInvoice';
export type DeliveredAppSortColumn = 'cargoNumber' | 'customer' | 'datePrih' | 'dateVr' | 'route' | 'invoiceNumber' | 'appStatusLabel';
export function filterSortDeliveredAppRows(rows:DeliveredWithoutAppRow[],filter:DeliveredAppFilter,column:DeliveredAppSortColumn,order:'asc'|'desc') {
  return rows.filter(row=>filter==='all' || (filter==='withoutApp'?!row.hasApp:filter==='withApp'?row.hasApp:!row.hasLinkedInvoice))
    .sort((a,b)=>{
      const x=a[column],y=b[column];
      const empty=(v:unknown)=>v==null || v==='' || v==='—';
      if(empty(x)!==empty(y))return empty(x)?1:-1;
      let diff=0;
      if(column==='datePrih'||column==='dateVr') {
        const date=(v:unknown)=>{const t=Date.parse(String(v??''));return Number.isFinite(t)?t:0;};
        diff=date(x)-date(y);
      } else diff=String(x??'').localeCompare(String(y??''),'ru',{numeric:true,sensitivity:'base'});
      return (order==='asc'?diff:-diff) || a.cargoNumber.localeCompare(b.cargoNumber,'ru',{numeric:true});
    });
}
