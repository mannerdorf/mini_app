import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { enqueueCargoNotifications, processCargoNotifications } from "./cargoNotificationQueue.js";
let db: PGlite;
let locked = false;
const query = async (sql: string, args?: any[]) => {
  if (sql.includes("pg_try_advisory_lock")) { const acquired = !locked; locked = true; return {rows:[{locked:acquired}]}; }
  if (sql.includes("pg_advisory_unlock")) { locked = false; return {rows:[]}; }
  return db.query(sql,args);
};
const client: any = {query,release:vi.fn()};
const pool: any = {query,connect:async()=>client};
beforeAll(async()=>{db=new PGlite();await db.exec(readFileSync(new URL("../migrations/118_cargo_notification_queue.sql",import.meta.url),"utf8"));});
afterAll(()=>db.close());
it("persists unique snapshots and rolls back with the data transaction",async()=>{
  await db.exec("BEGIN");
  await enqueueCargoNotifications(client,[{Number:"rollback",State:"В пути"}],"test");
  await db.exec("ROLLBACK");
  expect((await db.query("SELECT * FROM cargo_notification_queue")).rows).toHaveLength(0);
  await enqueueCargoNotifications(client,[{Number:"a",State:"В пути"},{Number:"a",State:"В пути"},{Number:"a",State:"Доставлено"},{Number:"b",State:"В пути"}],"test");
  expect((await db.query("SELECT * FROM cargo_notification_queue")).rows).toHaveLength(3);
});
it("retries failure, preserves cargo order and does not block other cargo",async()=>{
  const deliver=vi.fn(async(item:any)=>({failed:item.Number==='a'?1:0}));
  expect(await processCargoNotifications(pool,deliver)).toEqual({completed:1,retried:1});
  expect(deliver.mock.calls.map(c=>c[0].State)).toEqual(["В пути","В пути"]);
  const rows=(await db.query<any>("SELECT * FROM cargo_notification_queue ORDER BY id")).rows;
  expect(rows[0].attempts).toBe(1);
  expect(rows[1].completed_at).toBeNull();
  await db.exec("UPDATE cargo_notification_queue SET next_at=now()");
  expect(await processCargoNotifications(pool,async()=>({failed:0}))).toEqual({completed:2,retried:0});
});
it("keeps deferred data pending and excludes concurrent workers",async()=>{
  await enqueueCargoNotifications(client,[{Number:"c"}],"test");
  expect(await processCargoNotifications(pool,async()=>({failed:0,deferred:1}))).toEqual({completed:0,retried:1});
  locked=true;
  const deliver=vi.fn();
  expect(await processCargoNotifications(pool,deliver)).toMatchObject({skipped:true});
  expect(deliver).not.toHaveBeenCalled();
  locked=false;
});
it("records safe deferral reasons and exception stage without secret error text",async()=>{
  await db.exec("DELETE FROM cargo_notification_queue");
  await enqueueCargoNotifications(client,[{Number:"diagnostics-a"},{Number:"diagnostics-b"}],"test");
  await processCargoNotifications(pool,async(item,trace)=>{
    if(item.Number==='diagnostics-a') return {failed:0,deferred:1,retryReasons:['missing_bill_number','secret-token']};
    trace('subscriber_scopes');
    throw new Error('password=secret-token');
  });
  const rows=(await db.query<any>("SELECT last_error FROM cargo_notification_queue ORDER BY id")).rows;
  expect(rows.map(row=>row.last_error)).toEqual(['missing_bill_number','exception_at_subscriber_scopes']);
});
