import { buildCargoSumPaidByNumber, invoiceBalance, invoiceDocSum } from "../../lib/invoiceAmounts.js";
import { parseCargoNumbersFromText } from "./formatUtils";
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

function isOutstandingInvoice(
  inv: Record<string, unknown>,
  cargoSumPaidByNumber: Map<string, number>,
): boolean {
  const key = getInvoicePaymentFilterKey(inv);
  if (key === "paid" || key === "cancelled") return false;
  if (key === "unpaid" || key === "partial") return true;
  return invoiceBalance(inv, cargoSumPaidByNumber, getFirstCargoNumberFromInvoice) > 0.005;
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
    if (!isOutstandingInvoice(inv, cargoSumPaidByNumber)) continue;
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
