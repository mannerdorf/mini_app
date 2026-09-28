import { withOneCHistoryPriority } from "./oneCRequestGate.js";
import type { Pool } from "pg";
import { cronDateWindow, runCronWork } from "./cronWorkState.js";
import { addDaysIso, refreshDatedKindForWindow } from "./documentCacheRefreshCore.js";
import { invoiceBalance, invoiceDocSum, invoiceSumPaid } from "./invoiceAmounts.js";
import { getInvoicePaymentFilterKey } from "./invoicePaymentFilter.js";
import { coerceStatusDisplay } from "../src/lib/statusUtils.js";

export type RefreshQueueKind = "invoices" | "perevozki";
export type RefreshQueueLane = "recent" | "active" | "history";

/** Unknown states stay in the queue; only explicit final states may leave it. */
export function isOpenDocument(kind: RefreshQueueKind, payload: Record<string, unknown>): boolean {
  if (kind === "invoices") {
    const state = getInvoicePaymentFilterKey(payload, {
      sum: invoiceDocSum(payload), paid: invoiceSumPaid(payload), balance: invoiceBalance(payload),
    });
    return state !== "paid" && state !== "cancelled";
  }
  const state = coerceStatusDisplay(payload.State ?? payload.state ?? payload.Status).trim().toLowerCase();
  // Avoid matching intermediate phrases such as "готов к выдаче" or "не доставлен".
  return !/^(доставлен[аоы]?|заверш[её]н[аоы]?|выдан[аоы]?|отмен[её]н[аоы]?|аннулирован[аоы]?)[.!]?$/.test(state);
}

export function nextActiveDay(days: string[], after: unknown): string | null {
  const sorted = [...new Set(days)].sort();
  return sorted.find(day => typeof after !== "string" || day > after) ?? sorted[0] ?? null;
}

/** First observed closure is retained; repeated reads must not extend the grace period. */
export function closureWatch(
  days: { day: string; open: boolean; updatedAt: string | null }[],
  previous: Record<string, string | null>, now = new Date(),
) {
  const closedAt: Record<string, string | null> = {};
  const eligible: string[] = [];
  for (const row of days) {
    if (row.open) { closedAt[row.day] = null; eligible.push(row.day); continue; }
    const since = previous[row.day] || now.toISOString();
    closedAt[row.day] = since;
    const age = now.getTime() - Date.parse(since);
    const refreshed = row.updatedAt ? Date.parse(row.updatedAt) : 0;
    if (age < 7 * 86400000 && now.getTime() - refreshed >= 86400000) eligible.push(row.day);
  }
  return { closedAt, eligible };
}

export function nextHistoryDay(cursor: { nextDay?: string; endDay?: string }, now = new Date()) {
  const window = cronDateWindow(90, now);
  const endDay = cursor.endDay || addDaysIso(window.dateTo, -3);
  const day = cursor.nextDay && cursor.nextDay <= endDay ? cursor.nextDay : window.dateFrom;
  return { day, endDay: cursor.nextDay && cursor.nextDay <= endDay ? endDay : addDaysIso(window.dateTo, -3) };
}

/** One date window per invocation. Each kind/lane owns its cursor, retry delay and lease. */
export async function runDocumentRefreshQueue(
  pool: Pool, login: string, password: string, kind: RefreshQueueKind, lane: RefreshQueueLane,
  refresh = refreshDatedKindForWindow,
) {
  return runCronWork<Record<string, unknown>>(pool, `documents_${kind}_${lane}`, lane === "recent" ? 20 : 5, async cursor => {
    const recent = cronDateWindow(3);
    if (lane === "recent") {
      const result = await refresh(pool, login, password, kind, recent.dateFrom, recent.dateTo, "recent");
      return { result: { ok: true, kind, lane, result }, cursor: {} };
    }
    if (lane === "history") {
      const { day, endDay } = nextHistoryDay(cursor);
      const result = await withOneCHistoryPriority(() => refresh(pool, login, password, kind, day, day, "chunk"));
      return { result: { ok: true, kind, lane, date: day, endDay, result }, cursor: { nextDay: addDaysIso(day, 1), endDay } };
    }
    const table = kind === "invoices" ? "cache_invoices_rows" : "cache_perevozki_rows";
    const { rows } = await pool.query<{ day: string | null; updated_at: Date | string; payload: Record<string, unknown> }>(
      `SELECT doc_date::text AS day, updated_at, payload FROM ${table} WHERE doc_date < $1::date OR doc_date IS NULL`,
      [recent.dateFrom],
    );
    const open = rows.filter(row => isOpenDocument(kind, row.payload));
    const grouped = new Map<string, { day: string; open: boolean; updatedAt: string | null }>();
    for (const row of rows) {
      if (!row.day) continue;
      const prior = grouped.get(row.day);
      const updatedAt = row.updated_at ? new Date(row.updated_at).toISOString() : null;
      grouped.set(row.day, { day: row.day, open: (prior?.open ?? false) || isOpenDocument(kind, row.payload),
        updatedAt: prior?.updatedAt && updatedAt ? (prior.updatedAt < updatedAt ? prior.updatedAt : updatedAt) : updatedAt });
    }
    const watch = closureWatch([...grouped.values()], cursor.closedAt || {});
    const days = watch.eligible;
    const day = nextActiveDay(days, cursor.lastDate);
    const summary = { kind, lane, pendingDays: days.length, undatedDocuments: open.filter(row => !row.day).length };
    if (!day) return { result: { ok: true, ...summary, idle: true }, cursor: { ...cursor, closedAt: watch.closedAt } };
    const result = await refresh(pool, login, password, kind, day, day, "chunk");
    return { result: { ok: true, ...summary, date: day, result }, cursor: { lastDate: day, closedAt: watch.closedAt } };
  });
}
