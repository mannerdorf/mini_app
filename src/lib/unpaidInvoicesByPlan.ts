import {
  buildCargoSumPaidByNumber,
  invoiceBalance,
  invoiceDocSum,
  isOutstandingDebtInvoice,
} from "../../lib/invoiceAmounts.js";
import { hasBillSignal } from "../../lib/notificationPoll.js";
import { parseCargoNumbersFromText } from "./formatUtils";
import { getCargoRoleSet } from "./cargoUtils";
import { getInvoicePaymentFilterKey } from "./statusUtils";
import { buildRouteTypePlanDaysMap, getEffectivePlannedDeliveryDate } from "./cargoPlannedDelivery";
import type { CargoItem } from "../types";

export const PLAN_ARRIVAL_HIGH_PRIORITY_WITHIN_DAYS = 7;

export type InvoicePlanPriority = "high" | "low" | "none";

export type UnpaidInvoicePlanRow = {
  invoice: Record<string, unknown>;
  invoiceNumber: string;
  customer: string;
  invoiceDate: string;
  balance: number;
  sum: number;
  cargoNumber: string | null;
  /** Статус перевозки (State), если счёт привязан к перевозке. */
  cargoState: unknown;
  planDate: Date | null;
  planDateKey: string | null;
  daysUntilPlan: number | null;
  priority: InvoicePlanPriority;
  paymentKey: ReturnType<typeof getInvoicePaymentFilterKey>;
};

function normCargoKey(num: string | null | undefined): string {
  if (num == null) return "";
  const s = String(num).replace(/^0000-/, "").trim().replace(/^0+/, "") || "0";
  return s;
}

function dateToKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function buildCargoByNumberMap(cargoItems: CargoItem[]): Map<string, CargoItem> {
  const map = new Map<string, CargoItem>();
  for (const item of cargoItems) {
    const raw = String(item.Number ?? "").trim();
    if (!raw) continue;
    const key = normCargoKey(raw);
    if (!map.has(key)) map.set(key, item);
    if (!map.has(raw)) map.set(raw, item);
  }
  return map;
}

export function buildCargoPlannedDateByNumber(cargoItems: CargoItem[]): Map<string, Date> {
  const planDays = buildRouteTypePlanDaysMap(cargoItems);
  const map = new Map<string, Date>();
  for (const item of cargoItems) {
    const raw = String(item.Number ?? "").trim();
    if (!raw) continue;
    const planned = getEffectivePlannedDeliveryDate(item, planDays);
    if (!planned) continue;
    const key = normCargoKey(raw);
    const existing = map.get(key);
    if (!existing || planned.getTime() < existing.getTime()) {
      map.set(key, planned);
    }
    if (key !== raw) {
      const ex2 = map.get(raw);
      if (!ex2 || planned.getTime() < ex2.getTime()) map.set(raw, planned);
    }
  }
  return map;
}

export function collectCargoNumbersFromInvoice(inv: Record<string, unknown>): string[] {
  const nums = new Set<string>();
  const list = Array.isArray(inv.List) ? inv.List : [];
  for (const row of list) {
    const text = String((row as { Operation?: string; Name?: string })?.Operation ?? (row as { Name?: string })?.Name ?? "").trim();
    if (!text) continue;
    parseCargoNumbersFromText(text)
      .filter((p) => p.type === "cargo" && p.value)
      .forEach((p) => nums.add(p.value));
  }
  return [...nums];
}

function getFirstCargoNumberFromInvoice(inv: Record<string, unknown>): string | null {
  const nums = collectCargoNumbersFromInvoice(inv);
  return nums[0] ?? null;
}

function earliestPlanForInvoice(
  inv: Record<string, unknown>,
  planByCargo: Map<string, Date>,
): { planDate: Date | null; cargoNumber: string | null } {
  const numbers = collectCargoNumbersFromInvoice(inv);
  let earliest: Date | null = null;
  let cargoNumber: string | null = null;
  for (const num of numbers) {
    const key = normCargoKey(num);
    const d = planByCargo.get(key) ?? planByCargo.get(num);
    if (!d) continue;
    if (!earliest || d.getTime() < earliest.getTime()) {
      earliest = d;
      cargoNumber = num;
    }
  }
  return { planDate: earliest, cargoNumber };
}

export function computeUnpaidInvoicesByPlan(
  invoices: Record<string, unknown>[],
  cargoItems: CargoItem[],
  options?: { highPriorityWithinDays?: number },
): UnpaidInvoicePlanRow[] {
  const withinDays = options?.highPriorityWithinDays ?? PLAN_ARRIVAL_HIGH_PRIORITY_WITHIN_DAYS;
  const planByCargo = buildCargoPlannedDateByNumber(cargoItems);
  const cargoByNumber = buildCargoByNumberMap(cargoItems);
  const cargoSumPaidByNumber = buildCargoSumPaidByNumber(cargoItems as Record<string, unknown>[]);
  const today = startOfDay(new Date());
  const dayMs = 24 * 60 * 60 * 1000;
  const rows: UnpaidInvoicePlanRow[] = [];

  for (const inv of invoices) {
    if (!isOutstandingDebtInvoice(inv, cargoSumPaidByNumber, getFirstCargoNumberFromInvoice)) continue;
    const sum = invoiceDocSum(inv);
    const balance = invoiceBalance(inv, cargoSumPaidByNumber, getFirstCargoNumberFromInvoice);
    if (sum <= 0 && balance <= 0) continue;

    const invoiceNumber = String(inv.Number ?? inv.number ?? inv.Номер ?? inv.N ?? "").trim() || "—";
    const customer = String(inv.Customer ?? inv.customer ?? inv.Контрагент ?? inv.Contractor ?? "").trim() || "—";
    const invoiceDate = String(inv.DateDoc ?? inv.Date ?? inv.date ?? inv.Дата ?? "").trim();
    const paymentKey = getInvoicePaymentFilterKey(inv);
    const { planDate, cargoNumber } = earliestPlanForInvoice(inv, planByCargo);
    let cargoState: unknown = null;
    if (cargoNumber) {
      const key = normCargoKey(cargoNumber);
      const cargo = cargoByNumber.get(key) ?? cargoByNumber.get(cargoNumber);
      cargoState = cargo?.State ?? null;
    }

    let daysUntilPlan: number | null = null;
    let priority: InvoicePlanPriority = "low";
    let planDateKey: string | null = null;

    if (planDate) {
      planDateKey = dateToKey(planDate);
      daysUntilPlan = Math.round((startOfDay(planDate).getTime() - today.getTime()) / dayMs);
      priority = daysUntilPlan <= withinDays ? "high" : "low";
    }

    rows.push({
      invoice: inv,
      invoiceNumber,
      customer,
      invoiceDate,
      balance,
      sum,
      cargoNumber,
      cargoState,
      planDate,
      planDateKey,
      daysUntilPlan,
      priority,
      paymentKey,
    });
  }

  rows.sort((a, b) => {
    const prio = (p: InvoicePlanPriority) => (p === "high" ? 0 : p === "low" ? 1 : 2);
    const pd = prio(a.priority) - prio(b.priority);
    if (pd !== 0) return pd;
    if (a.planDate && b.planDate) return a.planDate.getTime() - b.planDate.getTime();
    if (a.planDate) return -1;
    if (b.planDate) return 1;
    return b.balance - a.balance;
  });

  return rows;
}

export type UnpaidInvoiceCustomerGroup = {
  customer: string;
  priority: InvoicePlanPriority;
  balance: number;
  items: UnpaidInvoicePlanRow[];
};

export type UnbilledCargoPlanRow = {
  cargo: CargoItem;
  cargoNumber: string;
  customer: string;
  sum: number;
  cargoState: unknown;
  planDate: Date | null;
  planDateKey: string | null;
  daysUntilPlan: number | null;
  priority: InvoicePlanPriority;
};

export type UnbilledCargoCustomerGroup = {
  customer: string;
  priority: InvoicePlanPriority;
  sum: number;
  count: number;
  items: UnbilledCargoPlanRow[];
};

/** Объединённая группа для монитора в служебном режиме. */
export type UnpaidMonitorCustomerGroup = UnpaidInvoiceCustomerGroup & {
  unbilledItems: UnbilledCargoPlanRow[];
  unbilledSum: number;
  unbilledCount: number;
};

function parseCargoSum(item: CargoItem): number {
  const raw = item.Sum ?? (item as Record<string, unknown>).sum;
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) return 0;
  const num = typeof raw === "string" ? parseFloat(raw.replace(",", ".")) : Number(raw);
  return Number.isFinite(num) ? num : 0;
}

function cargoCustomerName(item: CargoItem): string {
  return String(
    item.Customer ??
      (item as Record<string, unknown>).customer ??
      (item as Record<string, unknown>).Заказчик ??
      "",
  ).trim();
}

function isUnbilledCustomerCargo(item: CargoItem): boolean {
  if (!getCargoRoleSet(item).has("Customer")) return false;
  if (hasBillSignal(item)) return false;
  if (parseCargoSum(item) <= 0.005) return false;
  return cargoCustomerName(item).length > 0;
}

function planPriorityForDate(
  planDate: Date | null,
  withinDays: number,
  today: Date,
  dayMs: number,
): Pick<UnbilledCargoPlanRow, "planDateKey" | "daysUntilPlan" | "priority"> {
  if (!planDate) {
    return { planDateKey: null, daysUntilPlan: null, priority: "low" };
  }
  const planDateKey = dateToKey(planDate);
  const daysUntilPlan = Math.round((startOfDay(planDate).getTime() - today.getTime()) / dayMs);
  const priority: InvoicePlanPriority = daysUntilPlan <= withinDays ? "high" : "low";
  return { planDateKey, daysUntilPlan, priority };
}

/** Перевозки заказчика без выставленного счёта (3 мес., те же данные perevozki). */
export function computeUnbilledCargoByPlan(
  cargoItems: CargoItem[],
  options?: { highPriorityWithinDays?: number },
): UnbilledCargoPlanRow[] {
  const withinDays = options?.highPriorityWithinDays ?? PLAN_ARRIVAL_HIGH_PRIORITY_WITHIN_DAYS;
  const planDays = buildRouteTypePlanDaysMap(cargoItems);
  const today = startOfDay(new Date());
  const dayMs = 24 * 60 * 60 * 1000;
  const rows: UnbilledCargoPlanRow[] = [];

  for (const item of cargoItems) {
    if (!isUnbilledCustomerCargo(item)) continue;
    const cargoNumber = String(item.Number ?? "").trim();
    if (!cargoNumber) continue;
    const customer = cargoCustomerName(item) || "—";
    const sum = parseCargoSum(item);
    const planDate = getEffectivePlannedDeliveryDate(item, planDays);
    const { planDateKey, daysUntilPlan, priority } = planPriorityForDate(planDate, withinDays, today, dayMs);
    rows.push({
      cargo: item,
      cargoNumber,
      customer,
      sum,
      cargoState: item.State ?? null,
      planDate,
      planDateKey,
      daysUntilPlan,
      priority,
    });
  }

  rows.sort((a, b) => {
    const prio = (p: InvoicePlanPriority) => (p === "high" ? 0 : p === "low" ? 1 : 2);
    const pd = prio(a.priority) - prio(b.priority);
    if (pd !== 0) return pd;
    if (a.planDate && b.planDate) return a.planDate.getTime() - b.planDate.getTime();
    if (a.planDate) return -1;
    if (b.planDate) return 1;
    return b.sum - a.sum;
  });

  return rows;
}

export function groupUnbilledCargoByCustomer(rows: UnbilledCargoPlanRow[]): UnbilledCargoCustomerGroup[] {
  const map = new Map<string, UnbilledCargoPlanRow[]>();
  for (const row of rows) {
    const key = row.customer.trim() || "—";
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  const groups: UnbilledCargoCustomerGroup[] = [];
  for (const [customer, items] of map) {
    groups.push({
      customer,
      priority: groupPriority(items),
      sum: items.reduce((acc, row) => acc + row.sum, 0),
      count: items.length,
      items,
    });
  }
  groups.sort((a, b) => compareUnpaidPlanGroups(
    { customer: a.customer, priority: a.priority, balance: a.sum, items: [] },
    { customer: b.customer, priority: b.priority, balance: b.sum, items: [] },
  ));
  return groups;
}

/** Счета + невыставленные перевозки по одному заказчику (служебный режим). */
export function mergeUnpaidMonitorCustomerGroups(
  invoiceGroups: UnpaidInvoiceCustomerGroup[],
  unbilledGroups: UnbilledCargoCustomerGroup[],
): UnpaidMonitorCustomerGroup[] {
  const map = new Map<string, UnpaidMonitorCustomerGroup>();

  for (const group of invoiceGroups) {
    map.set(group.customer, {
      ...group,
      unbilledItems: [],
      unbilledSum: 0,
      unbilledCount: 0,
    });
  }

  for (const unbilled of unbilledGroups) {
    const existing = map.get(unbilled.customer);
    if (existing) {
      existing.unbilledItems = unbilled.items;
      existing.unbilledSum = unbilled.sum;
      existing.unbilledCount = unbilled.count;
      existing.priority =
        existing.priority === "high" || unbilled.priority === "high" ? "high" : "low";
      continue;
    }
    map.set(unbilled.customer, {
      customer: unbilled.customer,
      priority: unbilled.priority,
      balance: 0,
      items: [],
      unbilledItems: unbilled.items,
      unbilledSum: unbilled.sum,
      unbilledCount: unbilled.count,
    });
  }

  const merged = [...map.values()];
  merged.sort((a, b) => {
    const prio = (p: InvoicePlanPriority) => (p === "high" ? 0 : p === "low" ? 1 : 2);
    const pd = prio(a.priority) - prio(b.priority);
    if (pd !== 0) return pd;
    const aPlan =
      a.items.find((row) => row.planDate)?.planDate ??
      a.unbilledItems.find((row) => row.planDate)?.planDate ??
      null;
    const bPlan =
      b.items.find((row) => row.planDate)?.planDate ??
      b.unbilledItems.find((row) => row.planDate)?.planDate ??
      null;
    if (aPlan && bPlan) return aPlan.getTime() - bPlan.getTime();
    if (aPlan) return -1;
    if (bPlan) return 1;
    return b.balance + b.unbilledSum - (a.balance + a.unbilledSum);
  });

  return merged;
}

function groupPriority(items: Array<{ priority: InvoicePlanPriority }>): InvoicePlanPriority {
  return items.some((row) => row.priority === "high") ? "high" : "low";
}

function compareUnpaidPlanGroups(a: UnpaidInvoiceCustomerGroup, b: UnpaidInvoiceCustomerGroup): number {
  const prio = (p: InvoicePlanPriority) => (p === "high" ? 0 : p === "low" ? 1 : 2);
  const pd = prio(a.priority) - prio(b.priority);
  if (pd !== 0) return pd;
  const aPlan = a.items.find((row) => row.planDate)?.planDate ?? null;
  const bPlan = b.items.find((row) => row.planDate)?.planDate ?? null;
  if (aPlan && bPlan) return aPlan.getTime() - bPlan.getTime();
  if (aPlan) return -1;
  if (bPlan) return 1;
  return b.balance - a.balance;
}

/** Группировка неоплаченных счетов по заказчику (монитор на главной в служебном режиме). */
export function groupUnpaidInvoicesByCustomer(rows: UnpaidInvoicePlanRow[]): UnpaidInvoiceCustomerGroup[] {
  const map = new Map<string, UnpaidInvoicePlanRow[]>();
  for (const row of rows) {
    const key = row.customer.trim() || "—";
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  const groups: UnpaidInvoiceCustomerGroup[] = [];
  for (const [customer, items] of map) {
    groups.push({
      customer,
      priority: groupPriority(items),
      balance: items.reduce((acc, row) => acc + row.balance, 0),
      items,
    });
  }
  groups.sort(compareUnpaidPlanGroups);
  return groups;
}
