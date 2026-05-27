import { invoiceDocSum } from "../../lib/invoiceAmounts.js";
import { cityToCode, normalizeInvoiceStatus, parseCargoNumbersFromText, stripOoo } from "../lib/formatUtils";
import { coerceStatusDisplay, getFilterKeyByStatus, getInvoicePaymentFilterKey } from "../lib/statusUtils";
import {
  getInvoiceEdoInfoByDocLabel,
  INVOICE_EDO_MERGED_COLUMNS,
  invoiceMatchesEdoStatusFilter,
  isInvoiceEdoSigned,
  type InvoiceEdoDocAgg,
  type InvoiceEdoMergedDocLabel,
} from "../lib/edoStatus";
import type { StatusFilter } from "../types";
import {
  matchesRouteFilterSet,
  matchesTypeFilterSet,
  routeCargoLabelToKey,
  type RouteFilterKey,
  type SharedBillStatusKey,
  type TypeFilterKey,
} from "../lib/sharedListFilters";

export const INVOICE_FAVORITES_VALUE = "__favorites__";

export function normalizeTransportName(value: unknown): string {
  const s = String(value ?? "").toUpperCase().trim();
  if (!s) return "";
  const normalizedSpaces = s.replace(/\s+/g, " ");
  const container = normalizedSpaces.match(/([A-ZА-Я]{4})[\s\-]*([0-9]{7})$/u);
  if (container) return `${container[1]} ${container[2]}`;
  const vehicle = normalizedSpaces.match(/([A-ZА-Я][0-9]{3}[A-ZА-Я]{2})(\s*\/?\s*([0-9]{2,3}))?$/u);
  if (vehicle) {
    const base = vehicle[1];
    const region = vehicle[3] ?? "";
    if (!region) return base;
    return `${base}${region}`;
  }
  const looseVehicle = normalizedSpaces.match(/([A-ZА-Я])[\s\-]*([0-9]{3})[\s\-]*([A-ZА-Я]{2})(?:[\s\-]*\/?[\s\-]*([0-9]{2,3}))?$/u);
  if (looseVehicle) {
    const base = `${looseVehicle[1]}${looseVehicle[2]}${looseVehicle[3]}`;
    const region = looseVehicle[4] ?? "";
    if (!region) return base;
    return `${base}${region}`;
  }
  return normalizedSpaces
    .replace(/\bнаименование\s*тс\b[:\-]?\s*/giu, "")
    .replace(/\bконтейнер\b[:\-]?\s*/giu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeInn(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  return digits || raw;
}

export function getItemInn(item: any): string {
  return normalizeInn(
    item?.INN ??
      item?.Inn ??
      item?.inn ??
      item?.ЗаказчикИНН ??
      item?.ПолучательИНН ??
      item?.CustomerINN ??
      item?.CustomerInn ??
      item?.customerInn ??
      item?.INNCustomer ??
      item?.InnCustomer ??
      item?.КонтрагентИНН
  );
}

/** Оставить только строки выбранной в шапке компании (по ИНН). */
export function filterItemsByActiveInn<T>(items: T[], activeInn?: string): T[] {
  const normalizedActiveInn = normalizeInn(activeInn);
  if (!normalizedActiveInn) return items;
  return items.filter((i) => getItemInn(i) === normalizedActiveInn);
}

/** Обычный режим (дашборд): перевозки по ИНН и/или наименованию из шапки. */
export function filterItemsForHeaderCustomer(
  items: Array<{ Customer?: string; customer?: string; [key: string]: unknown }>,
  opts: { activeInn?: string; activeCustomerName?: string },
): typeof items {
  const inn = normalizeInn(opts.activeInn);
  const nameKey = stripOoo(opts.activeCustomerName ?? "").toLowerCase();
  if (!inn && !nameKey) return items;

  return items.filter((item) => {
    const itemInn = getItemInn(item);
    const itemName = stripOoo(String(item.Customer ?? item.customer ?? "")).toLowerCase();
    if (inn && itemInn) return itemInn === inn;
    if (nameKey && itemName) return itemName === nameKey;
    if (inn && !itemInn && nameKey) return itemName === nameKey;
    return false;
  });
}

/** @deprecated используйте filterItemsForHeaderCustomer */
export const filterCargoItemsForHeaderCustomer = filterItemsForHeaderCustomer;

export function getInvoiceSearchText(inv: any): string {
  const parts: string[] = [
    String(inv?.Number ?? inv?.number ?? inv?.Номер ?? inv?.N ?? ""),
    stripOoo(String(inv?.Customer ?? inv?.customer ?? inv?.Контрагент ?? inv?.Contractor ?? inv?.Organization ?? "")),
    String(inv?.DateDoc ?? inv?.Date ?? inv?.date ?? inv?.Дата ?? ""),
    String(inv?.SumDoc ?? inv?.Sum ?? inv?.sum ?? inv?.Сумма ?? inv?.Amount ?? ""),
  ];
  const list: Array<{ Name?: string; Operation?: string }> = Array.isArray(inv?.List) ? inv.List : [];
  list.forEach((row) => parts.push(String(row?.Operation ?? row?.Name ?? "")));
  return parts.join(" ").toLowerCase();
}

export function getActSearchText(act: any): string {
  const parts: string[] = [
    String(act?.Number ?? act?.number ?? ""),
    String(act?.Invoice ?? act?.invoice ?? act?.Счёт ?? ""),
    stripOoo(String(act?.Customer ?? act?.customer ?? act?.Контрагент ?? act?.Contractor ?? act?.Organization ?? "")),
    String(act?.DateDoc ?? act?.Date ?? act?.date ?? ""),
    String(act?.SumDoc ?? act?.Sum ?? act?.sum ?? ""),
  ];
  const list: Array<{ Name?: string; Operation?: string }> = Array.isArray(act?.List) ? act.List : [];
  list.forEach((row) => parts.push(String(row?.Operation ?? row?.Name ?? "")));
  return parts.join(" ").toLowerCase();
}

export function getOrderSearchText(order: any): string {
  const deepParts: string[] = [];
  const seen = new WeakSet<object>();
  const collectDeepValues = (value: unknown, depth = 0) => {
    if (value == null || depth > 8) return;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      const s = String(value).trim();
      if (s) deepParts.push(s);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectDeepValues(item, depth + 1));
      return;
    }
    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      if (seen.has(obj)) return;
      seen.add(obj);
      Object.values(obj).forEach((v) => collectDeepValues(v, depth + 1));
    }
  };
  collectDeepValues(order);
  const parts: string[] = [
    String(order?.Number ?? order?.number ?? order?.Номер ?? order?.N ?? ""),
    String(order?.НомерЗаявки ?? ""),
    String(order?.НомерПеревозки ?? order?.Перевозка ?? ""),
    stripOoo(String(order?.Customer ?? order?.customer ?? order?.Заказчик ?? order?.Контрагент ?? order?.Contractor ?? order?.Organization ?? "")),
    String(order?.Получатель ?? order?.Receiver ?? ""),
    String(order?.DateZayavki ?? order?.DateOtpr ?? order?.DateSend ?? order?.DatePrih ?? order?.DateVr ?? order?.DateDoc ?? order?.Дата ?? order?.Date ?? order?.date ?? ""),
    String(order?.State ?? order?.state ?? order?.Статус ?? ""),
    String(order?.AutoReg ?? order?.autoReg ?? order?.АвтомобильCMRНаименование ?? ""),
    String(order?.ПломбаCMR ?? ""),
    String(order?.Комментарий ?? order?.Comment ?? ""),
    String(order?.Sum ?? order?.sum ?? order?.Сумма ?? order?.Amount ?? ""),
    ...deepParts,
  ];
  return parts.join(" ").toLowerCase();
}

export function getEdoStatus(item: any): string {
  const v = item?.EdoStatus ?? item?.edoStatus ?? item?.EdoState ?? item?.EDO ?? item?.StatusEDO ?? item?.ЭДО ?? item?.DocumentStatus ?? item?.documentStatus ?? "";
  return String(v ?? "").trim() || "";
}

/** Числовая часть номера счёта для сопоставления УПД ↔ счёт (как в ActDetailModal) */
function normInvoiceNumForActLink(s: string | undefined | null): string {
  return String(s ?? "").trim().replace(/^0000-/, "").replace(/^0+/, "") || "0";
}

function actInvoiceLinkMatches(actNum: string, invNum: string): boolean {
  const a = String(actNum ?? "").trim();
  const b = String(invNum ?? "").trim();
  if (!a || !b) return false;
  if (a === b) return true;
  const na = normInvoiceNumForActLink(a);
  const nb = normInvoiceNumForActLink(b);
  if (na === nb) return true;
  const ia = parseInt(na, 10);
  const ib = parseInt(nb, 10);
  return !isNaN(ia) && !isNaN(ib) && ia === ib;
}

export function findInvoiceLinkedToAct(act: any, invoices: any[] | undefined | null): any | null {
  const link = String(act?.Invoice ?? act?.invoice ?? act?.Счёт ?? act?.Счет ?? "").trim();
  if (!link || !invoices?.length) return null;
  for (const inv of invoices) {
    const num = String(inv?.Number ?? inv?.number ?? inv?.Номер ?? inv?.N ?? inv?.numberDoc ?? "").trim();
    if (actInvoiceLinkMatches(link, num)) return inv;
  }
  return null;
}

/** УПД, связанный со счётом (обратный поиск к findInvoiceLinkedToAct). */
export function findActLinkedToInvoice(inv: any, acts: any[] | undefined | null): any | null {
  const invNum = String(inv?.Number ?? inv?.number ?? inv?.Номер ?? inv?.N ?? inv?.numberDoc ?? "").trim();
  if (!invNum || !acts?.length) return null;
  for (const act of acts) {
    const link = String(act?.Invoice ?? act?.invoice ?? act?.Счёт ?? act?.Счет ?? "").trim();
    if (link && actInvoiceLinkMatches(link, invNum)) return act;
  }
  return null;
}

/**
 * ЭДО для УПД: `DDRecipientResponseStatus_UPD` из связанного счёта (список из раздела «Счета»),
 * иначе то же поле на объекте УПД, если API его отдаёт.
 */
export function getActUpdEdoInfo(act: any, invoices: any[] | undefined | null) {
  const inv = findInvoiceLinkedToAct(act, invoices);
  if (inv) return getInvoiceEdoInfoByDocLabel(inv, "УПД");
  return getInvoiceEdoInfoByDocLabel(act, "УПД");
}

/** ЭДО по строкам УПД: статусы берём из связанного счёта, иначе с объекта УПД (как в склеенных счетах). */
export function aggregateActsEdoDocStats(
  acts: any[] | undefined | null,
  invoices: any[] | undefined | null,
): Record<InvoiceEdoMergedDocLabel, InvoiceEdoDocAgg> {
  const out: Record<InvoiceEdoMergedDocLabel, InvoiceEdoDocAgg> = {
    ЭР: { signed: 0, total: 0 },
    АПП: { signed: 0, total: 0 },
    УПД: { signed: 0, total: 0 },
    СЧЕТ: { signed: 0, total: 0 },
  };
  for (const act of acts || []) {
    const inv = findInvoiceLinkedToAct(act, invoices);
    const source = inv ?? act;
    for (const label of INVOICE_EDO_MERGED_COLUMNS) {
      const info = getInvoiceEdoInfoByDocLabel(source, label);
      if (!info.raw) continue;
      out[label].total += 1;
      if (isInvoiceEdoSigned(info)) out[label].signed += 1;
    }
  }
  return out;
}

export function normCargoKey(num: string | null | undefined): string {
  if (num == null) return "";
  const s = String(num).replace(/^0000-/, "").trim().replace(/^0+/, "") || "0";
  return s;
}

export function getFirstCargoNumberFromInvoice(inv: any): string | null {
  const list: Array<{ Name?: string; Operation?: string }> = Array.isArray(inv?.List) ? inv.List : [];
  for (let i = 0; i < list.length; i++) {
    const text = String(list[i]?.Operation ?? list[i]?.Name ?? "").trim();
    if (!text) continue;
    const parts = parseCargoNumbersFromText(text);
    const cargo = parts.find((p) => p.type === "cargo");
    if (cargo?.value) return cargo.value;
  }
  return null;
}

/** Все номера груза со счёта/УПД (первая строка + все из List) — для ТС по цепочке перевозки. */
export function collectInvoiceLinkedCargoNumbers(inv: any): string[] {
  const cargoNums = new Set<string>();
  const firstCargoNum = getFirstCargoNumberFromInvoice(inv);
  if (firstCargoNum) cargoNums.add(firstCargoNum);
  const list: Array<{ Name?: string; Operation?: string }> = Array.isArray(inv?.List) ? inv.List : [];
  list.forEach((row) => {
    const text = String(row?.Operation ?? row?.Name ?? "").trim();
    if (!text) return;
    parseCargoNumbersFromText(text)
      .filter((p) => p.type === "cargo" && p.value)
      .forEach((p) => cargoNums.add(p.value));
  });
  return [...cargoNums];
}

export function buildCargoStateByNumber(perevozkiItems: any[]) {
  const m = new Map<string, string>();
  (perevozkiItems || []).forEach((c: any) => {
    const raw = (c.Number ?? c.number ?? "").toString().replace(/^0000-/, "").trim();
    if (!raw || c.State == null) return;
    const display = coerceStatusDisplay(c.State);
    if (!display) return;
    const key = raw.replace(/^0+/, "") || raw;
    m.set(key, display);
    if (key !== raw) m.set(raw, display);
  });
  return m;
}

export function buildCargoRouteByNumber(perevozkiItems: any[]) {
  const m = new Map<string, string>();
  (perevozkiItems || []).forEach((c: any) => {
    const raw = (c.Number ?? c.number ?? "").toString().replace(/^0000-/, "").trim();
    if (!raw) return;
    const key = raw.replace(/^0+/, "") || raw;
    const from = cityToCode(c.CitySender ?? c.citySender);
    const to = cityToCode(c.CityReceiver ?? c.cityReceiver);
    const route = [from, to].filter(Boolean).join(" – ") || "";
    if (!route) return;
    m.set(key, route);
    if (key !== raw) m.set(raw, route);
  });
  return m;
}

export function buildCargoTransportByNumber(perevozkiItems: any[]) {
  const m = new Map<string, string>();
  (perevozkiItems || []).forEach((c: any) => {
    const raw = (c.Number ?? c.number ?? "").toString().replace(/^0000-/, "").trim();
    if (!raw) return;
    const key = raw.replace(/^0+/, "") || raw;
    const transport = String(c.AutoReg ?? c.autoReg ?? c.Transport ?? c.transport ?? "").trim();
    if (!transport) return;
    m.set(key, transport);
    if (key !== raw) m.set(raw, transport);
  });
  return m;
}

function pickCargoRecordNumber(c: any): string {
  return String(
    c?.Number ??
      c?.number ??
      c?.Номер ??
      c?.НомерПеревозки ??
      c?.CargoNumber ??
      c?.NumberPerevozki ??
      "",
  )
    .replace(/^0000-/, "")
    .trim();
}

function pickCargoRecordSum(c: any): number {
  return parseSendingMetricNumber(c?.Sum ?? c?.sum ?? c?.Сумма ?? c?.Amount ?? c?.amount);
}

export type EdoCargoCardItem = {
  cargoKey: string;
  cargoNumber: string;
  invoice: any;
  cargo: any | null;
};

/** Одна плитка ЭДО = одна перевозка; ЭДО берётся из связанного счёта. */
export function buildEdoCargoCardItems(
  invoices: any[],
  perevozkiItems: any[] | null | undefined,
  getFirstCargoNumberFromInvoice: (inv: any) => string | null,
): EdoCargoCardItem[] {
  const perevozkiByKey = new Map<string, any>();
  (perevozkiItems || []).forEach((c) => {
    const raw = pickCargoRecordNumber(c);
    if (!raw) return;
    const key = normCargoKey(raw);
    perevozkiByKey.set(key, c);
    if (key !== raw) perevozkiByKey.set(raw, c);
  });

  const map = new Map<string, EdoCargoCardItem>();
  for (const inv of invoices || []) {
    const nums = collectInvoiceLinkedCargoNumbers(inv);
    if (!nums.length) {
      const first = getFirstCargoNumberFromInvoice(inv);
      if (first) nums.push(first);
    }
    if (!nums.length) continue;
    for (const num of nums) {
      const key = normCargoKey(num);
      if (map.has(key)) continue;
      map.set(key, {
        cargoKey: key,
        cargoNumber: num,
        invoice: inv,
        cargo: perevozkiByKey.get(key) ?? perevozkiByKey.get(num) ?? null,
      });
    }
  }

  return [...map.values()].sort((a, b) => {
    const da = a.cargo?.DatePrih ?? a.invoice?.DateDoc ?? a.invoice?.Date ?? "";
    const db = b.cargo?.DatePrih ?? b.invoice?.DateDoc ?? b.invoice?.Date ?? "";
    return String(db).localeCompare(String(da));
  });
}

/** Сумма перевозки (freight) из getperevozka по номеру груза. */
export function buildCargoSumByNumber(perevozkiItems: any[]): Map<string, number> {
  const m = new Map<string, number>();
  (perevozkiItems || []).forEach((c: any) => {
    const raw = pickCargoRecordNumber(c);
    if (!raw) return;
    const sum = pickCargoRecordSum(c);
    if (sum <= 0) return;
    const key = normCargoKey(raw);
    m.set(key, sum);
    if (key !== raw) m.set(raw, sum);
  });
  return m;
}

type FilterInvoicesParams = {
  items: any[];
  activeInn?: string;
  useServiceRequest: boolean;
  customerFilter: string;
  invoiceFavoritesOnly: boolean;
  billStatusFilterSet: Set<SharedBillStatusKey>;
  typeFilterSet: Set<TypeFilterKey>;
  routeFilterSet: Set<RouteFilterKey>;
  deliveryStatusFilterSet: Set<StatusFilter>;
  transportFilter: string;
  transportLinkedCargoNumbers?: Set<string>;
  searchText: string;
  edoStatusFilterSet: Set<string>;
  sortBy: "date" | null;
  sortOrder: "asc" | "desc";
  isInvoiceFavorite: (num: string | undefined) => boolean;
  getFirstCargoNumberFromInvoice: (inv: any) => string | null;
  cargoStateByNumber: Map<string, string>;
  cargoRouteByNumber: Map<string, string>;
  cargoTransportByNumber: Map<string, string>;
};

export function linkedCargoMatchesTransportFilter(
  linkedCargoNumbers: string[],
  transportFilter: string,
  transportLinkedCargoNumbers?: Set<string>,
  cargoTransportByNumber?: Map<string, string>,
): boolean {
  if (!transportFilter) return true;
  if (transportLinkedCargoNumbers?.size) {
    return linkedCargoNumbers.some((num) => transportLinkedCargoNumbers.has(normCargoKey(num)));
  }
  const selected = normalizeTransportName(transportFilter);
  for (const cargoNum of linkedCargoNumbers) {
    const byCargo = normalizeTransportName(cargoTransportByNumber?.get(normCargoKey(cargoNum)));
    if (byCargo === selected) return true;
  }
  return false;
}

export type DocInvoiceFilterSection = "Счета" | "ЭДО";

/** Какие фильтры счетов применять на вкладке (только те, что есть в UI этой вкладки). */
export function resolveInvoiceFiltersForDocSection(
  section: DocInvoiceFilterSection,
  filters: {
    billStatusFilterSet: Set<SharedBillStatusKey>;
    deliveryStatusFilterSet: Set<StatusFilter>;
    typeFilterSet: Set<TypeFilterKey>;
    routeFilterSet: Set<RouteFilterKey>;
    invoiceFavoritesOnly: boolean;
    edoStatusFilterSet: Set<string>;
    transportFilter: string;
  },
): {
  billStatusFilterSet: Set<SharedBillStatusKey>;
  deliveryStatusFilterSet: Set<StatusFilter>;
  typeFilterSet: Set<TypeFilterKey>;
  routeFilterSet: Set<RouteFilterKey>;
  invoiceFavoritesOnly: boolean;
  edoStatusFilterSet: Set<string>;
  transportFilter: string;
} {
  const noneBill = new Set<SharedBillStatusKey>();
  const noneDelivery = new Set<StatusFilter>();
  const noneType = new Set<TypeFilterKey>();
  const noneRoute = new Set<RouteFilterKey>();

  if (section === "Счета") {
    return {
      billStatusFilterSet: filters.billStatusFilterSet,
      deliveryStatusFilterSet: filters.deliveryStatusFilterSet,
      typeFilterSet: noneType,
      routeFilterSet: filters.routeFilterSet,
      invoiceFavoritesOnly: filters.invoiceFavoritesOnly,
      edoStatusFilterSet: filters.edoStatusFilterSet,
      transportFilter: filters.transportFilter,
    };
  }

  return {
    billStatusFilterSet: noneBill,
    deliveryStatusFilterSet: noneDelivery,
    typeFilterSet: noneType,
    routeFilterSet: noneRoute,
    invoiceFavoritesOnly: false,
    edoStatusFilterSet: filters.edoStatusFilterSet,
    transportFilter: filters.transportFilter,
  };
}

export function sendingRowMatchesTransportFilter(
  row: any,
  transportFilter: string,
  transportLinkedCargoNumbers?: Set<string>,
): boolean {
  if (!transportFilter) return true;
  if (transportLinkedCargoNumbers?.size) {
    return collectSendingCargoNumbers(row).some((num) =>
      transportLinkedCargoNumbers.has(normCargoKey(num)),
    );
  }
  const vehicle = normalizeTransportName(
    row?.АвтомобильCMRНаименование ?? row?.AutoReg ?? row?.autoReg ?? row?.AutoType ?? "",
  );
  return vehicle === normalizeTransportName(transportFilter);
}

export function buildFilteredInvoices(params: FilterInvoicesParams) {
  const {
    items,
    activeInn,
    useServiceRequest,
    customerFilter,
    invoiceFavoritesOnly,
    billStatusFilterSet,
    typeFilterSet,
    routeFilterSet,
    deliveryStatusFilterSet,
    transportFilter,
    searchText,
    edoStatusFilterSet,
    sortBy,
    sortOrder,
    isInvoiceFavorite,
    getFirstCargoNumberFromInvoice,
    cargoStateByNumber,
    cargoRouteByNumber,
    cargoTransportByNumber,
    transportLinkedCargoNumbers,
  } = params;

  let res = [...items];
  const normalizedActiveInn = normalizeInn(activeInn);
  if (!useServiceRequest && normalizedActiveInn) {
    res = res.filter((i) => getItemInn(i) === normalizedActiveInn);
  }
  if (customerFilter) {
    res = res.filter((i) => ((i.Customer ?? i.customer ?? i.Контрагент ?? i.Contractor ?? i.Organization ?? "").trim()) === customerFilter);
  }
  if (invoiceFavoritesOnly) {
    res = res.filter((i) => isInvoiceFavorite(String(i?.Number ?? i?.number ?? i?.Номер ?? i?.N ?? "")));
  }
  if (billStatusFilterSet.size > 0) {
    res = res.filter((i) => billStatusFilterSet.has(getInvoicePaymentFilterKey(i)));
  }
  if (typeFilterSet.size > 0) {
    res = res.filter((i) => matchesTypeFilterSet(i?.AK, typeFilterSet));
  }
  if (routeFilterSet.size > 0) {
    res = res.filter((i) => {
      if (matchesRouteFilterSet(i.CitySender, i.CityReceiver, routeFilterSet)) return true;
      const cargoNum = getFirstCargoNumberFromInvoice(i);
      const route = cargoNum ? cargoRouteByNumber.get(normCargoKey(cargoNum)) : "";
      const key = routeCargoLabelToKey(route ?? "");
      return key ? routeFilterSet.has(key) : false;
    });
  }
  if (deliveryStatusFilterSet.size > 0) {
    res = res.filter((i) => {
      const cargoNum = getFirstCargoNumberFromInvoice(i);
      const state = cargoNum ? cargoStateByNumber.get(normCargoKey(cargoNum)) : undefined;
      return deliveryStatusFilterSet.has(getFilterKeyByStatus(state));
    });
  }
  if (transportFilter) {
    res = res.filter((i) =>
      linkedCargoMatchesTransportFilter(
        collectInvoiceLinkedCargoNumbers(i),
        transportFilter,
        transportLinkedCargoNumbers,
        cargoTransportByNumber,
      ),
    );
  }
  if (searchText.trim()) {
    const lower = searchText.trim().toLowerCase();
    res = res.filter((i) => getInvoiceSearchText(i).includes(lower));
  }
  if (edoStatusFilterSet.size > 0) {
    res = res.filter((i) => invoiceMatchesEdoStatusFilter(i, edoStatusFilterSet));
  }
  const getDate = (r: any) => (r.Date ?? r.date ?? r.Дата ?? r.DateDoc ?? "").toString();
  if (sortBy === "date") {
    res.sort((a, b) => {
      const da = getDate(a);
      const db = getDate(b);
      const cmp = da.localeCompare(db);
      return sortOrder === "desc" ? -cmp : cmp;
    });
  }
  return res;
}

type FilterActsParams = {
  sortedActs: any[];
  activeInn?: string;
  useServiceRequest: boolean;
  actCustomerFilter: string;
  searchText: string;
  edoStatusFilterSet: Set<string>;
  transportFilter: string;
  transportLinkedCargoNumbers?: Set<string>;
  getFirstCargoNumberFromInvoice: (inv: any) => string | null;
  cargoTransportByNumber: Map<string, string>;
  /** Счета из того же периода — для статуса ЭДО УПД по `DDRecipientResponseStatus_UPD` */
  invoices?: any[];
};

export function buildFilteredActs(params: FilterActsParams) {
  const {
    sortedActs,
    activeInn,
    useServiceRequest,
    actCustomerFilter,
    searchText,
    edoStatusFilterSet,
    transportFilter,
    transportLinkedCargoNumbers,
    getFirstCargoNumberFromInvoice,
    cargoTransportByNumber,
    invoices,
  } = params;

  let res = sortedActs;
  const normalizedActiveInn = normalizeInn(activeInn);
  if (!useServiceRequest && normalizedActiveInn) {
    res = res.filter((a) => getItemInn(a) === normalizedActiveInn);
  }
  if (actCustomerFilter) {
    res = res.filter((a: any) => ((a.Customer ?? a.customer ?? a.Контрагент ?? a.Contractor ?? a.Organization ?? "").trim()) === actCustomerFilter);
  }
  if (searchText.trim()) {
    const lower = searchText.trim().toLowerCase();
    res = res.filter((a) => getActSearchText(a).includes(lower));
  }
  if (edoStatusFilterSet.size > 0) {
    res = res.filter((a) => {
      const edo = getActUpdEdoInfo(a, invoices);
      return Boolean(edo.raw) && edoStatusFilterSet.has(edo.label);
    });
  }
  if (transportFilter) {
    res = res.filter((a) =>
      linkedCargoMatchesTransportFilter(
        collectInvoiceLinkedCargoNumbers(a),
        transportFilter,
        transportLinkedCargoNumbers,
        cargoTransportByNumber,
      ),
    );
  }
  return res;
}

type FilterOrdersParams = {
  items: any[];
  activeInn?: string;
  useServiceRequest: boolean;
  customerFilter: string;
  typeFilterSet: Set<TypeFilterKey>;
  routeFilterSet: Set<RouteFilterKey>;
  deliveryStatusFilterSet: Set<StatusFilter>;
  transportFilter: string;
  searchText: string;
  sortBy: "date" | null;
  sortOrder: "asc" | "desc";
};

export function buildFilteredOrders(params: FilterOrdersParams) {
  const {
    items,
    activeInn,
    useServiceRequest,
    customerFilter,
    typeFilterSet,
    routeFilterSet,
    deliveryStatusFilterSet,
    transportFilter,
    searchText,
    sortBy,
    sortOrder,
  } = params;

  let res = [...items];
  const normalizedActiveInn = normalizeInn(activeInn);
  if (!useServiceRequest && normalizedActiveInn) {
    res = res.filter((i) => {
      const customerInn = normalizeInn(i?.ЗаказчикИНН ?? i?.CustomerINN ?? i?.CustomerInn ?? i?.customerInn ?? i?.INNCustomer ?? i?.InnCustomer);
      const receiverInn = normalizeInn(i?.ПолучательИНН ?? i?.ReceiverINN ?? i?.ReceiverInn ?? i?.INNReceiver ?? i?.InnReceiver);
      const senderInn = normalizeInn(i?.ОтправительИНН ?? i?.SenderINN ?? i?.SenderInn ?? i?.INNSender ?? i?.InnSender);
      const fallbackInn = getItemInn(i);
      return [customerInn, receiverInn, senderInn, fallbackInn].some((inn) => inn === normalizedActiveInn);
    });
  }
  if (customerFilter) {
    res = res.filter((i) => ((i.Customer ?? i.customer ?? i.ЗаказчикНаименование ?? i.Заказчик ?? i.Контрагент ?? i.Contractor ?? i.Organization ?? "").trim()) === customerFilter);
  }
  if (typeFilterSet.size > 0) {
    res = res.filter((i) => matchesTypeFilterSet(i?.AK, typeFilterSet));
  }
  if (routeFilterSet.size > 0) {
    res = res.filter((i) =>
      matchesRouteFilterSet(
        i.CitySender ?? i.ПунктОтправленияГородАэропорт ?? i.ГородОтправления,
        i.CityReceiver ?? i.ПунктНазначенияГородАэропорт ?? i.ГородНазначения,
        routeFilterSet
      )
    );
  }
  if (deliveryStatusFilterSet.size > 0) {
    res = res.filter((i) => deliveryStatusFilterSet.has(getFilterKeyByStatus(i.State)));
  }
  if (transportFilter) {
    res = res.filter((i) => normalizeTransportName(i.AutoReg ?? i.autoReg ?? i.АвтомобильCMRНаименование ?? "") === transportFilter);
  }
  if (searchText.trim()) {
    const lower = searchText.trim().toLowerCase();
    res = res.filter((i) => getOrderSearchText(i).includes(lower));
  }
  if (sortBy === "date") {
    const getDate = (r: any) => (r.DateZayavki ?? r.DateOtpr ?? r.DateSend ?? r.DatePrih ?? r.DateVr ?? r.DateDoc ?? r.Дата ?? r.Date ?? r.date ?? "").toString();
    res.sort((a, b) => {
      const da = getDate(a);
      const db = getDate(b);
      const cmp = da.localeCompare(db);
      return sortOrder === "desc" ? -cmp : cmp;
    });
  }
  return res;
}

export type DocsSummaryTotals = {
  sum: number;
  count: number;
  mest: number;
  pw: number;
  w: number;
  vol: number;
};

function parseCargoMetric(value: unknown): number {
  if (value == null || value === "") return 0;
  return typeof value === "string" ? parseFloat(value) || 0 : Number(value) || 0;
}

/** Сумма документа — как в разделе УПД (SumDoc / Sum / sum). */
function pickUpdStyleDocSum(row: any): number {
  const v = row?.SumDoc ?? row?.Sum ?? row?.sum ?? 0;
  return typeof v === "string" ? parseFloat(v) || 0 : (v || 0);
}

function buildLinkedCargoMetrics(list: any[], perevozkiItems: any[] | undefined): Pick<DocsSummaryTotals, "mest" | "pw" | "w" | "vol"> {
  const metrics = { mest: 0, pw: 0, w: 0, vol: 0 };
  if (!perevozkiItems?.length || !list.length) return metrics;

  const cargoByKey = new Map<string, any>();
  perevozkiItems.forEach((c: any) => {
    const raw = String(c?.Number ?? c?.number ?? "").trim();
    if (!raw) return;
    const key = normCargoKey(raw);
    cargoByKey.set(key, c);
    const stripped = raw.replace(/^0+/, "") || raw;
    if (stripped !== key) cargoByKey.set(stripped, c);
  });

  const seenCargo = new Set<string>();
  list.forEach((row) => {
    collectInvoiceLinkedCargoNumbers(row).forEach((num) => {
      const key = normCargoKey(num);
      if (!key || seenCargo.has(key)) return;
      const cargo = cargoByKey.get(key);
      if (!cargo) return;
      seenCargo.add(key);
      metrics.mest += parseCargoMetric(cargo.Mest);
      metrics.pw += parseCargoMetric(cargo.PW);
      metrics.w += parseCargoMetric(cargo.W);
      metrics.vol += parseCargoMetric(cargo.Value);
    });
  });

  return metrics;
}

export function buildDocsSummary(list: any[], perevozkiItems?: any[]): DocsSummaryTotals {
  let sum = 0;
  list.forEach((i: any) => {
    const v = i.SumDoc ?? i.Sum ?? i.sum ?? i.Сумма ?? i.Amount ?? 0;
    sum += typeof v === "string" ? parseFloat(v) || 0 : (v || 0);
  });
  return { sum, count: list.length, ...buildLinkedCargoMetrics(list, perevozkiItems) };
}

/** Итоги счетов: сумма по полям счёта, метрики груза — по связанным перевозкам. */
export function buildInvoicesSummary(
  filteredInvoices: any[],
  _acts: any[] | undefined | null,
  perevozkiItems?: any[],
): DocsSummaryTotals {
  let sum = 0;
  filteredInvoices.forEach((inv) => {
    sum += invoiceDocSum(inv);
  });
  return {
    sum,
    count: filteredInvoices.length,
    ...buildLinkedCargoMetrics(filteredInvoices, perevozkiItems),
  };
}

export function buildActsSummary(list: any[], perevozkiItems?: any[]): DocsSummaryTotals {
  let sum = 0;
  list.forEach((a: any) => {
    sum += pickUpdStyleDocSum(a);
  });
  return { sum, count: list.length, ...buildLinkedCargoMetrics(list, perevozkiItems) };
}

export type SendingParcelMetrics = { paidWeight: number; cost: number; declaredCost: number };

/** Синхрон с `pickDate` в api/sendings.ts */
export function normalizeApiDateOnly(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const ruMatch = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (ruMatch) return `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}`;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().split("T")[0];
}

/** Дата рейса отправки — как в колонке «Дата» таблицы отправок. */
export function pickSendingRowDisplayDateRaw(item: any): unknown {
  return (
    item?.Дата ??
    item?.Date ??
    item?.date ??
    item?.DateOtpr ??
    item?.DateSend ??
    item?.DateShipment ??
    item?.ShipmentDate ??
    item?.DateDoc ??
    item?.ДатаОтправки ??
    item?.DatePrih ??
    item?.DateVr
  );
}

export function pickSendingRowDisplayDate(item: any): string {
  return normalizeApiDateOnly(pickSendingRowDisplayDateRaw(item));
}

/** Синхрон с `pickDate` в api/sendings.ts (фильтр кэша на бэкенде). */
export function pickSendingFilterDateRaw(item: any): unknown {
  return (
    item?.DateOtpr ??
    item?.DateSend ??
    item?.DateShipment ??
    item?.ShipmentDate ??
    item?.DateDoc ??
    item?.Date ??
    item?.date ??
    item?.ДатаОтправки ??
    item?.Дата ??
    item?.DatePrih ??
    item?.DateVr
  );
}

export function pickSendingFilterDate(item: any): string {
  return normalizeApiDateOnly(pickSendingFilterDateRaw(item));
}

export function isApiDateInRange(d: string, dateFrom: string, dateTo: string): boolean {
  if (!d) return false;
  return d >= dateFrom && d <= dateTo;
}

/** Отправка попадает в выбранный период по дате рейса. */
export function sendingRowInSelectedPeriod(
  row: any,
  dateFrom: string,
  dateTo: string,
): boolean {
  return isApiDateInRange(pickSendingRowDisplayDate(row), dateFrom, dateTo);
}

/** ТС из отправок за период — для фильтра «Транспортное средство». */
export function buildTransportOptionsFromSendingsInPeriod(
  sendingsItems: any[],
  dateFrom: string,
  dateTo: string,
  sendingsLoading: boolean,
): string[] {
  if (sendingsLoading) return [];
  const set = new Set<string>();
  (sendingsItems || []).forEach((row: any) => {
    if (!sendingRowInSelectedPeriod(row, dateFrom, dateTo)) return;
    const v = normalizeTransportName(
      row?.АвтомобильCMRНаименование ?? row?.AutoReg ?? row?.autoReg ?? row?.AutoType ?? "",
    );
    if (v) set.add(v);
  });
  return [...set].sort((a, b) => a.localeCompare(b, "ru"));
}

function addSendingCargoNumber(numbers: string[], value: unknown): void {
  const v = String(value ?? "").trim();
  if (v) numbers.push(v);
}

/** Все номера грузов/отправлений из строки отправки (посылки, товары). */
export function collectSendingCargoNumbers(row: any): string[] {
  const numbers: string[] = [];
  addSendingCargoNumber(numbers, row?.НомерПеревозки);
  addSendingCargoNumber(numbers, row?.CargoNumber);
  addSendingCargoNumber(numbers, row?.NumberPerevozki);
  addSendingCargoNumber(numbers, row?.Перевозка);
  addSendingCargoNumber(numbers, row?.ИДОтправления);
  addSendingCargoNumber(numbers, row?.Номер);
  addSendingCargoNumber(numbers, row?.Number);
  addSendingCargoNumber(numbers, row?.number);

  for (const parcel of getSendingParcelsFromRow(row)) {
    addSendingCargoNumber(numbers, parcel?.ИДОтправления);
    addSendingCargoNumber(numbers, parcel?.Перевозка);
    addSendingCargoNumber(numbers, parcel?.НомерПеревозки);
    addSendingCargoNumber(numbers, parcel?.CargoNumber);
    addSendingCargoNumber(numbers, parcel?.NumberPerevozki);
    const goods = getParcelGoodsObject(parcel);
    addSendingCargoNumber(numbers, goods?.ИДОтправления);
    addSendingCargoNumber(numbers, goods?.Перевозка);
    addSendingCargoNumber(numbers, goods?.НомерПеревозки);
    addSendingCargoNumber(numbers, goods?.CargoNumber);
    addSendingCargoNumber(numbers, goods?.NumberPerevozki);
  }

  return Array.from(new Set(numbers));
}

export function enrichCargoTransportByNumberFromSendings(
  base: Map<string, string>,
  sendingsItems: any[],
): Map<string, string> {
  const map = new Map(base);
  (sendingsItems || []).forEach((row: any) => {
    const transport = String(
      row?.АвтомобильCMRНаименование
        ?? row?.AutoReg
        ?? row?.autoReg
        ?? row?.AutoType
        ?? "",
    ).trim();
    if (!transport) return;
    for (const raw of collectSendingCargoNumbers(row)) {
      const key = normCargoKey(raw);
      if (!key) continue;
      map.set(key, transport);
      if (key !== raw) map.set(raw, transport);
    }
  });
  return map;
}

export function buildCargoTransportByNumberFromPerevozkiAndSendings(
  perevozkiItems: any[],
  sendingsItems: any[],
): Map<string, string> {
  return enrichCargoTransportByNumberFromSendings(
    buildCargoTransportByNumber(perevozkiItems),
    sendingsItems,
  );
}

function pickSendingRowVehicle(row: any): string {
  return normalizeTransportName(
    row?.АвтомобильCMRНаименование ?? row?.AutoReg ?? row?.autoReg ?? row?.AutoType ?? "",
  );
}

/** Номера перевозок, привязанных к ТС через отправки за период. */
export function buildTransportLinkedCargoNumbersInPeriod(
  sendingsItems: any[],
  dateFrom: string,
  dateTo: string,
  transportFilter: string,
): Set<string> {
  const selected = normalizeTransportName(transportFilter);
  if (!selected) return new Set();
  const set = new Set<string>();
  (sendingsItems || []).forEach((row: any) => {
    if (!sendingRowInSelectedPeriod(row, dateFrom, dateTo)) return;
    if (pickSendingRowVehicle(row) !== selected) return;
    for (const raw of collectSendingCargoNumbers(row)) {
      const key = normCargoKey(raw);
      if (key) set.add(key);
    }
  });
  return set;
}

export function parseSendingMetricNumber(v: unknown): number {
  const raw = String(v ?? "").trim().replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function roundSendingMetric(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

export function formatSendingMetricNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return String(roundSendingMetric(n));
}

export function getSendingParcelsFromRow(row: any): any[] {
  const raw = row?.Посылки ?? row?.Parcels ?? row?.parcels ?? row?.Packages ?? row?.packages;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function getParcelGoodsObject(parcel: any): Record<string, unknown> {
  const goodsRaw = parcel?.Товары;
  if (Array.isArray(goodsRaw)) return (goodsRaw[0] ?? {}) as Record<string, unknown>;
  if (goodsRaw && typeof goodsRaw === "object") return goodsRaw as Record<string, unknown>;
  return {};
}

function pickSendingFreightAmount(...sources: unknown[]): number {
  for (const source of sources) {
    const n = parseSendingMetricNumber(source);
    if (n > 0) return n;
  }
  return 0;
}

function addFreightCargoNumber(numbers: string[], value: unknown): void {
  const v = String(value ?? "").trim();
  if (v) numbers.push(v);
}

function lookupCargoFreightSum(cargoSumByNumber: Map<string, number> | undefined, num: unknown): number {
  if (!cargoSumByNumber?.size) return 0;
  const trimmed = String(num ?? "").trim();
  if (!trimmed) return 0;
  return cargoSumByNumber.get(normCargoKey(trimmed)) ?? cargoSumByNumber.get(trimmed) ?? 0;
}

/** Номера перевозок для суммы freight (без ИД отправления — это не номер груза). */
export function collectSendingFreightCargoNumbers(row: any): string[] {
  const numbers: string[] = [];
  addFreightCargoNumber(numbers, row?.НомерПеревозки);
  addFreightCargoNumber(numbers, row?.CargoNumber);
  addFreightCargoNumber(numbers, row?.NumberPerevozki);
  addFreightCargoNumber(numbers, row?.Перевозка);

  for (const parcel of getSendingParcelsFromRow(row)) {
    addFreightCargoNumber(numbers, parcel?.Перевозка);
    addFreightCargoNumber(numbers, parcel?.НомерПеревозки);
    addFreightCargoNumber(numbers, parcel?.CargoNumber);
    addFreightCargoNumber(numbers, parcel?.NumberPerevozki);
    const goods = getParcelGoodsObject(parcel);
    addFreightCargoNumber(numbers, goods?.Перевозка);
    addFreightCargoNumber(numbers, goods?.НомерПеревозки);
    addFreightCargoNumber(numbers, goods?.CargoNumber);
    addFreightCargoNumber(numbers, goods?.NumberPerevozki);
  }

  return Array.from(new Set(numbers));
}

/** Сумма перевозки по посылке (как «Сумма» в отчёте 1С), не объявленная стоимость товара. */
export function getParcelFreightSum(parcel: any, cargoSumByNumber?: Map<string, number>): number {
  const goods = getParcelGoodsObject(parcel);
  const direct = pickSendingFreightAmount(
    parcel?.Сумма,
    parcel?.Sum,
    parcel?.SumDoc,
    parcel?.Amount,
    parcel?.amount,
    parcel?.sum,
    goods?.Сумма,
    goods?.Sum,
    goods?.SumDoc,
    goods?.Amount,
    goods?.amount,
    goods?.sum,
    parcel?.Стоимость,
    goods?.Стоимость,
  );
  if (direct > 0) return direct;

  for (const num of [
    parcel?.Перевозка,
    parcel?.НомерПеревозки,
    parcel?.CargoNumber,
    parcel?.NumberPerevozki,
    goods?.Перевозка,
    goods?.НомерПеревозки,
    goods?.CargoNumber,
    goods?.NumberPerevozki,
  ]) {
    const sum = lookupCargoFreightSum(cargoSumByNumber, num);
    if (sum > 0) return sum;
  }
  return 0;
}

export function getSendingRowFreightSum(row: any, cargoSumByNumber?: Map<string, number>): number {
  const rowSum = pickSendingFreightAmount(
    row?.Сумма,
    row?.Sum,
    row?.SumDoc,
    row?.Amount,
    row?.amount,
    row?.sum,
  );
  if (rowSum > 0) return rowSum;

  const parcels = getSendingParcelsFromRow(row);
  let directParcelTotal = 0;
  for (const parcel of parcels) {
    directParcelTotal += pickSendingFreightAmount(
      parcel?.Сумма,
      parcel?.Sum,
      parcel?.SumDoc,
      parcel?.Amount,
      parcel?.amount,
      parcel?.sum,
    );
  }
  if (directParcelTotal > 0) return directParcelTotal;

  let total = 0;
  const seen = new Set<string>();
  for (const num of collectSendingFreightCargoNumbers(row)) {
    const key = normCargoKey(num);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    total += lookupCargoFreightSum(cargoSumByNumber, num);
  }
  return total;
}

/** Объявленная стоимость товара в посылке. */
export function getParcelDeclaredCost(parcel: any): number {
  const pickDeclared = (obj: unknown): number =>
    parseSendingMetricNumber(
      (obj as any)?.ОбъявленнаяСтоимостьТовараДляПечати ??
        (obj as any)?.ОбъявленнаяСтоимостьТовара ??
        (obj as any)?.ОбъявленнаяСтоимость ??
        (obj as any)?.ОбъявлСтоимость ??
        (obj as any)?.DeclaredCost ??
        (obj as any)?.declaredCost ??
        (obj as any)?.DeclaredValue ??
        (obj as any)?.declaredValue
    );

  const goodsRaw = parcel?.Товары;
  if (Array.isArray(goodsRaw)) {
    let total = 0;
    for (const item of goodsRaw) {
      total += pickDeclared(item);
    }
    if (total > 0) return total;
  }

  const goods = getParcelGoodsObject(parcel);
  const fromGoods = pickDeclared(goods);
  if (fromGoods > 0) return fromGoods;

  return pickDeclared(parcel);
}

export function getSendingRowDeclaredCost(row: any): number {
  const parcels = getSendingParcelsFromRow(row);
  if (parcels.length === 0) return 0;
  let total = 0;
  for (const parcel of parcels) {
    total += getParcelDeclaredCost(parcel);
  }
  return total;
}

export function sumSendingParcelsMetrics(
  parcels: any[],
  cargoSumByNumber?: Map<string, number>,
): SendingParcelMetrics {
  let paidWeight = 0;
  let cost = 0;
  let declaredCost = 0;
  for (const parcel of parcels) {
    paidWeight += parseSendingMetricNumber(parcel?.ПлатныйВес);
    cost += getParcelFreightSum(parcel, cargoSumByNumber);
    declaredCost += getParcelDeclaredCost(parcel);
  }
  return { paidWeight, cost, declaredCost };
}

export function getSendingRowParcelMetrics(
  row: any,
  cargoSumByNumber?: Map<string, number>,
): SendingParcelMetrics {
  const parcels = getSendingParcelsFromRow(row);
  let paidWeight = 0;
  for (const parcel of parcels) {
    paidWeight += parseSendingMetricNumber(parcel?.ПлатныйВес);
  }
  return {
    paidWeight,
    cost: getSendingRowFreightSum(row, cargoSumByNumber),
    declaredCost: getSendingRowDeclaredCost(row),
  };
}

export type SendingVehicleTotalRow = {
  vehicle: string;
  sendingsCount: number;
  paidWeight: number;
  cost: number;
  declaredCost: number;
};

export function buildSendingsTotalsByVehicle(
  rows: any[],
  getVehicle: (row: any) => string,
  cargoSumByNumber?: Map<string, number>,
): SendingVehicleTotalRow[] {
  const map = new Map<string, SendingVehicleTotalRow>();
  for (const row of rows) {
    const vehicle = getVehicle(row) || "—";
    const metrics = getSendingRowParcelMetrics(row, cargoSumByNumber);
    const prev =
      map.get(vehicle) ??
      { vehicle, sendingsCount: 0, paidWeight: 0, cost: 0, declaredCost: 0 };
    prev.sendingsCount += 1;
    prev.paidWeight += metrics.paidWeight;
    prev.cost += metrics.cost;
    prev.declaredCost += metrics.declaredCost;
    map.set(vehicle, prev);
  }
  return [...map.values()].sort((a, b) =>
    a.vehicle.localeCompare(b.vehicle, "ru", { numeric: true })
  );
}

