import { cityToCode, normalizeInvoiceStatus, parseCargoNumbersFromText, stripOoo } from "../lib/formatUtils";
import { getFilterKeyByStatus } from "../lib/statusUtils";
import type { StatusFilter } from "../types";

export const INVOICE_FAVORITES_VALUE = "__favorites__";

function normalizeTransportName(value: unknown): string {
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

function getItemInn(item: any): string {
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
      const selected = normalizeTransportName(transportFilter);
      const direct = normalizeTransportName(
        i?.AutoReg ??
          i?.autoReg ??
          i?.АвтомобильCMRНаименование ??
          i?.Transport ??
          i?.transport ??
          i?.AutoType
      );
      if (direct && direct === selected) return true;

      const cargoNums = new Set<string>();
      const firstCargoNum = getFirstCargoNumberFromInvoice(i);
      if (firstCargoNum) cargoNums.add(firstCargoNum);
      const list: Array<{ Name?: string; Operation?: string }> = Array.isArray(i?.List) ? i.List : [];
      list.forEach((row) => {
        const text = String(row?.Operation ?? row?.Name ?? "").trim();
        if (!text) return;
        parseCargoNumbersFromText(text)
          .filter((p) => p.type === "cargo" && p.value)
          .forEach((p) => cargoNums.add(p.value));
      });

      for (const cargoNum of cargoNums) {
        const transport = normalizeTransportName(cargoTransportByNumber.get(normCargoKey(cargoNum)));
        if (transport && transport === selected) return true;
      }
      return false;
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
      const selected = normalizeTransportName(transportFilter);
      const direct = normalizeTransportName(
        a?.AutoReg ??
          a?.autoReg ??
          a?.АвтомобильCMRНаименование ??
          a?.Transport ??
          a?.transport ??
          a?.AutoType
      );
      if (direct && direct === selected) return true;
      const cargoNum = getFirstCargoNumberFromInvoice(a);
      const transport = cargoNum ? normalizeTransportName(cargoTransportByNumber.get(normCargoKey(cargoNum))) : "";
      return transport === selected;
    });
  }
  return res;
}

type FilterOrdersParams = {
  items: any[];
  activeInn?: string;
  useServiceRequest: boolean;
  customerFilter: string;
  typeFilter: "all" | "ferry" | "auto";
  routeFilter: "all" | "MSK-KGD" | "KGD-MSK";
  deliveryStatusFilterSet: Set<StatusFilter>;
  routeFilterCargo: string;
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
    typeFilter,
    routeFilter,
    deliveryStatusFilterSet,
    routeFilterCargo,
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
  if (typeFilter === "ferry") res = res.filter((i) => i?.AK === true || i?.AK === "true" || i?.AK === "1" || i?.AK === 1);
  if (typeFilter === "auto") res = res.filter((i) => !(i?.AK === true || i?.AK === "true" || i?.AK === "1" || i?.AK === 1));
  if (routeFilter === "MSK-KGD") res = res.filter((i) => cityToCode(i.CitySender) === "MSK" && cityToCode(i.CityReceiver) === "KGD");
  if (routeFilter === "KGD-MSK") res = res.filter((i) => cityToCode(i.CitySender) === "KGD" && cityToCode(i.CityReceiver) === "MSK");
  if (deliveryStatusFilterSet.size > 0) {
    res = res.filter((i) => deliveryStatusFilterSet.has(getFilterKeyByStatus(i.State)));
  }
  if (routeFilterCargo !== "all") {
    res = res.filter((i) => {
      const from = cityToCode(i.CitySender ?? i.ПунктОтправленияГородАэропорт ?? i.ГородОтправления);
      const to = cityToCode(i.CityReceiver ?? i.ПунктНазначенияГородАэропорт ?? i.ГородНазначения);
      const route = [from, to].filter(Boolean).join(" – ") || "";
      return route === routeFilterCargo;
    });
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

