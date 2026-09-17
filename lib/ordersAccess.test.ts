import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
vi.mock("../api/_db.js", () => ({ getPool: vi.fn(() => { throw new Error("Unexpected DB access"); }) }));
vi.mock("../api/_lib/observability.js", () => ({ initRequestContext: () => ({ requestId: "test" }), logError: vi.fn() }));
import { getPool } from "../api/_db.js";
import handler, { filterRegisteredOrdersList } from "../api/orders/index.js";
import { fetchPendingOrdersForList } from "./pendingOrderRequests.js";

const own = { CustomerINN: "111", Customer: "Own", Date: "2026-09-16" };
const foreign = { CustomerINN: "222", Customer: "Foreign", Date: "2026-09-16" };
function pool(service = false, companies: string[] = []) {
  return { query: vi.fn(async (sql: string) => ({ rows: sql.includes("SELECT permissions")
    ? [{ permissions: { service_mode: service } }]
    : companies.map(inn => ({ inn })) })) } as unknown as Pool;
}
const user = { inn: "111", accessAllInns: false };
const filter = (db: Pool, profile = user, inn?: string, service?: unknown, name?: string) =>
  filterRegisteredOrdersList(db, profile, "review@example.invalid", "2026-09-01", "2026-09-30", inn, service, [own, foreign], name);
afterEach(() => vi.unstubAllGlobals());

describe("orders authorization boundary", () => {
  it("rejects a foreign INN and name, including with a forged service flag", async () => {
    expect(await filter(pool(), user, "222")).toEqual([]);
    expect(await filter(pool(), user, undefined, false, "Foreign")).toEqual([]);
    expect(await filter(pool(), user, undefined, true)).toEqual([own]);
    expect(await filter(pool(), user, "222", true, "Foreign")).toEqual([]);
  });
  it("does not grant access for an empty set of allowed companies", async () => {
    expect(await filter(pool(), { inn: "", accessAllInns: false })).toEqual([]);
  });
  it("keeps allowed company selection and server-authorized service access", async () => {
    expect(await filter(pool())).toEqual([own]);
    expect(await filter(pool(false, ["222"]), user, "222")).toEqual([foreign]);
    expect(await filter(pool(true), user, undefined, true)).toEqual([own, foreign]);
    expect(await filter(pool(), { inn: "111", accessAllInns: true }, "222")).toEqual([foreign]);
  });
  it("preserves access as an authorized sender but not as an unrelated party", async () => {
    const sent = { ...foreign, SenderINN: "111" };
    const received = { ...foreign, ReceiverINN: "111" };
    expect(await filterRegisteredOrdersList(pool(), user, "user", "2026-09-01", "2026-09-30", undefined, false, [sent, received])).toEqual([sent]);
  });
  it("cannot recover disallowed pending rows using a matching company name", async () => {
    const db = { query: vi.fn(async () => ({ rows: [{ id: 1, login: "user", inn: "222", created_at: "2026-09-16T10:00:00Z", data_zabora: "2026-09-16", table_rows: [{ type: "source", customerName: "Foreign" }] }] })) } as unknown as Pool;
    expect(await fetchPendingOrdersForList(db, "user", "2026-09-01", "2026-09-30", new Set(["111"]), "Foreign")).toEqual([]);
  });
  it("does not serve shared cached data to an unverified legacy account", async () => {
    vi.mocked(getPool).mockReturnValue({query:vi.fn(async()=>({rows:[]}))} as unknown as Pool);
    const upstream = vi.fn(async () => ({ ok: false, status: 401, statusText: "Unauthorized", text: async () => '{"error":"Unauthorized"}' }));
    vi.stubGlobal("fetch", upstream);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    await handler({ method: "POST", headers: {}, body: { login: "legacy", password: "wrong", dateFrom: "2026-09-01", dateTo: "2026-09-30" } } as never, res as never);
    expect(upstream).toHaveBeenCalled();
    expect(res.status).toHaveBeenLastCalledWith(401);
  });
  it("never returns an unparsed upstream payload as successful order data", async () => {
    vi.mocked(getPool).mockReturnValue({query:vi.fn(async()=>({rows:[]}))} as unknown as Pool);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => {throw new Error("Invalid JSON");} })));
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    await handler({ method: "POST", headers: {}, body: { login: "legacy", password: "test-only", dateFrom: "2026-09-01", dateTo: "2026-09-30" } } as never, res as never);
    expect(res.status).toHaveBeenLastCalledWith(401);
    expect(res.send).not.toHaveBeenCalled();
  });

});
