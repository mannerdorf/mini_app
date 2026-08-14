import type { HaulzCalcDraftStatus } from "../../../lib/haulzCalculator/draftStatus";
import {
  orderRouteLabel,
  pendingPointLabel,
} from "../documents/orders/documentsOrderJournalUtils";
import type { ManagerJournalRow } from "./draftToManagerJournalRow";

export type ManagerJournalFilters = {
  orderDate: string;
  pickupDate: string;
  customer: string;
  sender: string;
  receiver: string;
  route: string;
  status: string;
};

export const EMPTY_MANAGER_JOURNAL_FILTERS: ManagerJournalFilters = {
  orderDate: "",
  pickupDate: "",
  customer: "",
  sender: "",
  receiver: "",
  route: "",
  status: "",
};

export function datePart(value: string | undefined | null): string {
  if (!value) return "";
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dotted = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (dotted) return `${dotted[3]}-${dotted[2]}-${dotted[1]}`;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return "";
}

export function managerJournalRouteLabel(row: ManagerJournalRow): string {
  const senderPoint = pendingPointLabel(row, "from");
  const destinationPoint = pendingPointLabel(row, "to");
  return orderRouteLabel(row, senderPoint, destinationPoint);
}

export function buildManagerJournalFilterOptions(rows: ManagerJournalRow[]) {
  const customers = new Set<string>();
  const senders = new Set<string>();
  const receivers = new Set<string>();
  const routes = new Set<string>();
  const statuses = new Set<HaulzCalcDraftStatus>();

  for (const row of rows) {
    const customer = String(row.ЗаказчикНаименование ?? "").trim();
    const sender = String(row.ОтправительНаименование ?? "").trim();
    const receiver = String(row.ПолучательНаименование ?? "").trim();
    const route = managerJournalRouteLabel(row);

    if (customer) customers.add(customer);
    if (sender) senders.add(sender);
    if (receiver) receivers.add(receiver);
    if (route) routes.add(route);
    statuses.add(row._draft.status);
  }

  const sortRu = (a: string, b: string) => a.localeCompare(b, "ru");
  const sortDatesDesc = (a: string, b: string) => b.localeCompare(a);

  const orderDates = new Set<string>();
  const pickupDates = new Set<string>();

  for (const row of rows) {
    const orderDate = datePart(String(row.Дата ?? row.DateZayavki ?? row._draft.updatedAt ?? ""));
    const pickupDate = datePart(String(row.ДатаЗабораПлан ?? row.PickupDatePlan ?? ""));
    if (orderDate) orderDates.add(orderDate);
    if (pickupDate) pickupDates.add(pickupDate);
  }

  return {
    customers: [...customers].sort(sortRu),
    senders: [...senders].sort(sortRu),
    receivers: [...receivers].sort(sortRu),
    routes: [...routes].sort(sortRu),
    statuses: [...statuses],
    orderDates: [...orderDates].sort(sortDatesDesc),
    pickupDates: [...pickupDates].sort(sortDatesDesc),
  };
}

export function filterManagerJournalRows(
  rows: ManagerJournalRow[],
  filters: ManagerJournalFilters,
): ManagerJournalRow[] {
  return rows.filter((row) => {
    const draft = row._draft;

    if (filters.orderDate) {
      const orderDate = datePart(String(row.Дата ?? row.DateZayavki ?? draft.updatedAt ?? ""));
      if (orderDate !== filters.orderDate) return false;
    }

    if (filters.pickupDate) {
      const pickupDate = datePart(String(row.ДатаЗабораПлан ?? row.PickupDatePlan ?? ""));
      if (pickupDate !== filters.pickupDate) return false;
    }

    if (filters.customer && String(row.ЗаказчикНаименование ?? "") !== filters.customer) return false;
    if (filters.sender && String(row.ОтправительНаименование ?? "") !== filters.sender) return false;
    if (filters.receiver && String(row.ПолучательНаименование ?? "") !== filters.receiver) return false;

    if (filters.route && managerJournalRouteLabel(row) !== filters.route) return false;
    if (filters.status && draft.status !== filters.status) return false;

    return true;
  });
}
