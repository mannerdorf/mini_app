import { cityToCode, normalizeInvoiceStatus, parseCargoNumbersFromText, stripOoo } from "../lib/formatUtils";
import { getFilterKeyByStatus } from "../lib/statusUtils";
import type { StatusFilter } from "../types";

export const INVOICE_FAVORITES_VALUE = "__favorites__";

function normalizeInn(value: unknown): string {
  return String(value ?? "").trim();
}

function getItemInn(item: any): string {
  return normalizeInn(item?.INN ?? item?.Inn ?? item?.inn ?? item?.CustomerINN ?? item?.customerInn);
}

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

export function getEdoStatus(item: any): string {
  const v = item?.EdoStatus ?? item?.edoStatus ?? item?.EdoState ?? item?.EDO ?? item?.StatusEDO ?? item?.ЭДО ?? item?.DocumentStatus ?? item?.documentStatus ?? "";
  return String(v ?? "").trim() || "";
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

export function buildCargoStateByNumber(perevozkiItems: any[]) {
  const m = new Map<string, string>();
  (perevozkiItems || []).forEach((c: any) => {
    const raw = (c.Number ?? c.number ?? "").toString().replace(/^0000-/, "").trim();
    if (!raw || c.State == null) return;
    const key = raw.replace(/^0+/, "") || raw;
    m.set(key, String(c.State));
    if (key !== raw) m.set(raw, String(c.State));
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

type FilterInvoicesParams = {
  items: any[];
  activeInn?: string;
  useServiceRequest: boolean;
  customerFilter: string;
  statusFilterSet: Set<string>;
  typeFilter: "all" | "ferry" | "auto";
  routeFilter: "all" | "MSK-KGD" | "KGD-MSK";
  deliveryStatusFilterSet: Set<StatusFilter>;
  routeFilterCargo: string;
  transportFilter: string;
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

export function buildFilteredInvoices(params: FilterInvoicesParams) {
  const {
    items,
    activeInn,
    useServiceRequest,
    customerFilter,
    statusFilterSet,
    typeFilter,
    routeFilter,
    deliveryStatusFilterSet,
    routeFilterCargo,
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
  } = params;

  let res = [...items];
  const normalizedActiveInn = normalizeInn(activeInn);
  if (!useServiceRequest && normalizedActiveInn) {
    // Safety filter: in regular mode always pin documents to selected header company.
    res = res.filter((i) => getItemInn(i) === normalizedActiveInn);
  }
  if (customerFilter) {
    res = res.filter((i) => ((i.Customer ?? i.customer ?? i.Контрагент ?? i.Contractor ?? i.Organization ?? "").trim()) === customerFilter);
  }
  if (statusFilterSet.size > 0) {
    res = res.filter((i) => {
      const invStatus = normalizeInvoiceStatus(i.Status ?? i.State ?? i.state ?? i.Статус ?? i.status ?? i.PaymentStatus ?? "");
      const invNum = String(i.Number ?? i.number ?? i.Номер ?? i.N ?? "");
      const isFav = isInvoiceFavorite(invNum);
      return (statusFilterSet.has(INVOICE_FAVORITES_VALUE) && isFav) || statusFilterSet.has(invStatus);
    });
  }
  if (typeFilter === "ferry") res = res.filter((i) => i?.AK === true || i?.AK === "true" || i?.AK === "1" || i?.AK === 1);
  if (typeFilter === "auto") res = res.filter((i) => !(i?.AK === true || i?.AK === "true" || i?.AK === "1" || i?.AK === 1));
  if (routeFilter === "MSK-KGD") res = res.filter((i) => cityToCode(i.CitySender) === "MSK" && cityToCode(i.CityReceiver) === "KGD");
  if (routeFilter === "KGD-MSK") res = res.filter((i) => cityToCode(i.CitySender) === "KGD" && cityToCode(i.CityReceiver) === "MSK");
  if (deliveryStatusFilterSet.size > 0) {
    res = res.filter((i) => {
      const cargoNum = getFirstCargoNumberFromInvoice(i);
      const state = cargoNum ? cargoStateByNumber.get(normCargoKey(cargoNum)) : undefined;
      return deliveryStatusFilterSet.has(getFilterKeyByStatus(state));
    });
  }
  if (routeFilterCargo !== "all") {
    res = res.filter((i) => {
      const cargoNum = getFirstCargoNumberFromInvoice(i);
      const route = cargoNum ? cargoRouteByNumber.get(normCargoKey(cargoNum)) : "";
      return route === routeFilterCargo;
    });
  }
  if (transportFilter) {
    res = res.filter((i) => {
      const cargoNum = getFirstCargoNumberFromInvoice(i);
      const transport = cargoNum ? cargoTransportByNumber.get(normCargoKey(cargoNum)) : "";
      return transport === transportFilter;
    });
  }
  if (searchText.trim()) {
    const lower = searchText.trim().toLowerCase();
    res = res.filter((i) => getInvoiceSearchText(i).includes(lower));
  }
  if (edoStatusFilterSet.size > 0) {
    res = res.filter((i) => {
      const edo = getEdoStatus(i);
      return edo && edoStatusFilterSet.has(edo);
    });
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
  getFirstCargoNumberFromInvoice: (inv: any) => string | null;
  cargoTransportByNumber: Map<string, string>;
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
    getFirstCargoNumberFromInvoice,
    cargoTransportByNumber,
  } = params;

  let res = sortedActs;
  const normalizedActiveInn = normalizeInn(activeInn);
  if (!useServiceRequest && normalizedActiveInn) {
    // Safety filter: in regular mode always pin documents to selected header company.
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
      const edo = getEdoStatus(a);
      return edo && edoStatusFilterSet.has(edo);
    });
  }
  if (transportFilter) {
    res = res.filter((a) => {
      const cargoNum = getFirstCargoNumberFromInvoice(a);
      const transport = cargoNum ? cargoTransportByNumber.get(normCargoKey(cargoNum)) : "";
      return transport === transportFilter;
    });
  }
  return res;
}

export function buildDocsSummary(list: any[]) {
  let sum = 0;
  list.forEach((i: any) => {
    const v = i.SumDoc ?? i.Sum ?? i.sum ?? i.Сумма ?? i.Amount ?? 0;
    sum += typeof v === "string" ? parseFloat(v) || 0 : (v || 0);
  });
  return { sum, count: list.length };
}

export function buildActsSummary(list: any[]) {
  let sum = 0;
  list.forEach((a: any) => {
    const v = a.SumDoc ?? a.Sum ?? a.sum ?? 0;
    sum += typeof v === "string" ? parseFloat(v) || 0 : (v || 0);
  });
  return { sum, count: list.length };
}

