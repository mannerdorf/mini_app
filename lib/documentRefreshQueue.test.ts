import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { isOpenDocument, nextActiveDay, runDocumentRefreshQueue, closureWatch, nextHistoryDay } from "./documentRefreshQueue.js";
let db: PGlite;
const pool: any = { query: (s: string, p?: unknown[]) => db.query(s, p) };
beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(new URL("../migrations/116_cron_load_control.sql", import.meta.url), "utf8"));
  await db.exec(`CREATE TABLE cache_invoices_rows(doc_date date,payload jsonb,updated_at timestamptz DEFAULT now()); CREATE TABLE cache_perevozki_rows(doc_date date,payload jsonb,updated_at timestamptz DEFAULT now());
    INSERT INTO cache_invoices_rows VALUES ('2025-01-01','{"Sum":1000,"Sum_paid":400,"StateBill":"Оплачен"}'),('2025-01-01','{"Sum":100}'),('2025-02-01','{"Sum":100}'),('2025-03-01','{"Sum":100,"Balance":0}');`);
}, 30000);
afterAll(() => db.close());
it.each(["В пути", "Готов к выдаче", "Не доставлен", "", "На доставке"])("keeps non-final cargo: %s", state => expect(isOpenDocument("perevozki", { State: state })).toBe(true));
it.each(["Доставлено", "Выдан", "Отменён", "Завершена"])("removes explicitly final cargo: %s", state => expect(isOpenDocument("perevozki", { State: state })).toBe(false));
it("uses balances rather than stale invoice labels", () => {
  expect(isOpenDocument("invoices", { Sum:100, Balance:100, StateBill:"Оплачен" })).toBe(true);
  expect(isOpenDocument("invoices", { Sum:100, Balance:0, StateBill:"Не оплачен" })).toBe(false);
});
it("rotates distinct dates and wraps", () => {
  expect(nextActiveDay(["2025-02-01","2025-01-01","2025-01-01"], "2025-01-01")).toBe("2025-02-01");
  expect(nextActiveDay(["2025-01-01"], "2025-12-01")).toBe("2025-01-01");
});
it("groups old unpaid invoices by date, keeps cursor on failure and isolates queues", async () => {
  const refresh: any = vi.fn(async () => ({cacheCount: 2}));
  expect(await runDocumentRefreshQueue(pool,"x","x","invoices","active",refresh)).toMatchObject({date:"2025-01-01",pendingDays:2});
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(await runDocumentRefreshQueue(pool,"x","x","invoices","active",refresh)).toMatchObject({skipped:true});
  await db.exec("UPDATE cron_work_state SET next_at=now()-interval '1 minute'");
  refresh.mockRejectedValueOnce(new Error("1C timeout"));
  await expect(runDocumentRefreshQueue(pool,"x","x","invoices","active",refresh)).rejects.toThrow("1C timeout");
  const state = (await db.query<any>("SELECT cursor,failures FROM cron_work_state WHERE name='documents_invoices_active'")).rows[0];
  expect(state).toMatchObject({cursor:{lastDate:"2025-01-01"},failures:1});
  await runDocumentRefreshQueue(pool,"x","x","perevozki","recent",refresh);
  expect(refresh).toHaveBeenLastCalledWith(pool,"x","x","perevozki",expect.any(String),expect.any(String),"recent");
});

it("keeps closure time stable, waits a day, expires after seven days and reopens", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  const row = {day:"2025-01-01",open:false,updatedAt:"2026-09-26T12:00:00Z"};
  const initial=closureWatch([row],{},now);
  expect(initial.eligible).toEqual([row.day]);
  expect(closureWatch([row],initial.closedAt,new Date("2026-09-29T12:00:00Z")).closedAt).toEqual(initial.closedAt);
  expect(closureWatch([{...row,updatedAt:now.toISOString()}],initial.closedAt,now).eligible).toEqual([]);
  expect(closureWatch([row],initial.closedAt,new Date("2026-10-05T12:00:00Z")).eligible).toEqual([]);
  expect(closureWatch([{...row,open:true}],initial.closedAt,now).closedAt[row.day]).toBeNull();
});
it("resumes a fixed historical cycle and resets its bounds only after completion", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  expect(nextHistoryDay({nextDay:"2026-09-01",endDay:"2026-09-20"},now)).toEqual({day:"2026-09-01",endDay:"2026-09-20"});
  expect(nextHistoryDay({nextDay:"2026-09-21",endDay:"2026-09-20"},now)).toEqual(nextHistoryDay({},now));
});
it("persists historical progress and does not advance after a timeout", async () => {
  const refresh: any = vi.fn(async () => ({cacheCount:0}));
  const first: any = await runDocumentRefreshQueue(pool,"x","x","invoices","history",refresh);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(refresh).toHaveBeenCalledWith(pool,"x","x","invoices",first.date,first.date,"chunk");
  const before=(await db.query<any>("SELECT cursor FROM cron_work_state WHERE name='documents_invoices_history'")).rows[0].cursor;
  await db.exec("UPDATE cron_work_state SET next_at=now()-interval '1 minute' WHERE name='documents_invoices_history'");
  refresh.mockRejectedValueOnce(new Error("timeout"));
  await expect(runDocumentRefreshQueue(pool,"x","x","invoices","history",refresh)).rejects.toThrow("timeout");
  expect((await db.query<any>("SELECT cursor FROM cron_work_state WHERE name='documents_invoices_history'")).rows[0].cursor).toEqual(before);
});
