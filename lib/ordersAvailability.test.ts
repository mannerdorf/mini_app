import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

vi.mock("../api/_db.js", () => ({ getPool: vi.fn() }));
vi.mock("./verifyRegisteredUser.js", () => ({ verifyRegisteredUser: vi.fn() }));
vi.mock("./partnerOrUserApiAuth.js", () => ({ resolvePartnerOrUserApiAuth: vi.fn() }));
vi.mock("./requestErrorLog.js", () => ({ withErrorLog: (handler: unknown) => handler }));
vi.mock("../api/_lib/observability.js", () => ({ initRequestContext: () => ({ requestId: "test" }), logError: vi.fn() }));
import { getPool } from "../api/_db.js";
import { verifyRegisteredUser } from "./verifyRegisteredUser.js";
import { resolvePartnerOrUserApiAuth } from "./partnerOrUserApiAuth.js";
import handler, { readRegisteredOrdersFromCache } from "../api/orders/index.js";
import partnerHandler from "../api/partner/v1/orders.js";

const profile = { inn: "111", accessAllInns: false };
const read = (query: ReturnType<typeof vi.fn>) => readRegisteredOrdersFromCache(
  { query } as unknown as Pool, profile, "user", "2026-09-01", "2026-09-30", undefined, false,
);
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() });
beforeEach(() => vi.resetAllMocks());

describe("orders availability", () => {
  it("reports the timestamp and stale state of the fallback snapshot", async () => {
    const timestamp = "2025-01-01T10:00:00.000Z";
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes("AND fetched_at") ? [] : sql.includes("cache_orders") ? [{ data: [], fetched_at: timestamp }] : [] }));
    const metadata = vi.fn();
    await readRegisteredOrdersFromCache({ query } as unknown as Pool, profile, "user", "2026-09-01", "2026-09-30", undefined, false, undefined, metadata);
    expect(metadata).toHaveBeenCalledWith({ fetchedAt: timestamp, stale: true });
  });
  it("propagates a database outage instead of returning an empty list", async () => {
    await expect(read(vi.fn().mockRejectedValue(new Error("database offline")))).rejects.toThrow("database offline");
  });
  it("distinguishes an uninitialized cache from an empty successful snapshot", async () => {
    await expect(read(vi.fn().mockResolvedValue({ rows: [] }))).rejects.toThrow("not initialized");
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes("cache_orders")
      ? [{ data: [], fetched_at: new Date() }] : [] }));
    await expect(read(query)).resolves.toEqual([]);
    expect(query.mock.calls.some(([sql]) => sql.includes("pending_order_requests"))).toBe(true);
  });
  it("rejects corrupted cached data instead of reporting no orders", async () => {
    await expect(read(vi.fn().mockResolvedValue({ rows: [{ data: null }] }))).rejects.toThrow("Invalid orders cache");
  });
  it("does not silently omit pending orders when their query fails", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("pending_order_requests")) throw new Error("pending unavailable");
      return { rows: sql.includes("cache_orders") ? [{ data: [], fetched_at: new Date() }] : [] };
    });
    await expect(read(query)).rejects.toThrow("pending unavailable");
  });
  it("returns an explicit 503 to the application on cache failure", async () => {
    vi.mocked(getPool).mockReturnValue({ query: vi.fn().mockRejectedValue(new Error("internal database detail")) } as unknown as Pool);
    vi.mocked(verifyRegisteredUser).mockResolvedValue(profile);
    const res = response();
    await handler({ method: "POST", headers: {}, body: { login: "user", password: "test", isRegisteredUser: true, dateFrom: "2026-09-01", dateTo: "2026-09-30" } } as never, res as never);
    expect(res.status).toHaveBeenLastCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "ORDERS_UNAVAILABLE", request_id: "test" }));
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("internal database detail");
  });
  it("returns 503 through the partner API as well", async () => {
    vi.mocked(getPool).mockImplementation(() => { throw new Error("database offline"); });
    vi.mocked(resolvePartnerOrUserApiAuth).mockResolvedValue({ ok: true, login: "user", verified: profile, keyAllowedInnsCanon: null } as never);
    const res = response();
    await partnerHandler({ method: "POST", headers: {}, body: {} } as never, res as never);
    expect(res.status).toHaveBeenLastCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "ORDERS_UNAVAILABLE" }));
  });
});

it('does not allow sandbox diagnostics without verified credentials', async () => {
  vi.mocked(getPool).mockReturnValue({query:vi.fn().mockResolvedValue({rows:[{login:'user'}]})} as unknown as Pool);
  vi.mocked(verifyRegisteredUser).mockResolvedValue(null);
  const res=response();
  await handler({method:'POST',headers:{},body:{login:'user',password:'bad',diagnostics:true}} as never,res as never);
  expect(res.status).toHaveBeenLastCalledWith(401);
});
it('sandbox cannot expand the user scope with a foreign INN or a forged service flag', async () => {
  const query=vi.fn(async(sql:string)=>({rows:sql.includes('registered_users')?[{login:'user',permissions:{}}]:
    sql.includes('account_companies')?[{inn:'111'}]:sql.includes('cache_orders')?[{data:[{ЗаказчикИНН:'222',ЗаказчикНаименование:'PRIVATE',Дата:'2026-09-01'}],fetched_at:new Date()}]:[]}));
  vi.mocked(getPool).mockReturnValue({query} as unknown as Pool);
  vi.mocked(verifyRegisteredUser).mockResolvedValue(profile);
  const res=response();
  await handler({method:'POST',headers:{},body:{login:'user',password:'test',diagnostics:true,inn:'222',serviceMode:true,dateFrom:'2026-09-01',dateTo:'2026-09-30'}} as never,res as never);
  expect(res.status).toHaveBeenLastCalledWith(200);
  expect(res.json.mock.calls[0][0].counts.authorized).toBe(0);
  expect(JSON.stringify(res.json.mock.calls)).not.toContain('PRIVATE');
});
