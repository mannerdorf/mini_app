import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { query, connect, verify, txQuery, release } = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), verify: vi.fn(), txQuery: vi.fn(), release: vi.fn() }));
vi.mock("../api/_db.js", () => ({ getPool: () => ({ query, connect }) }));
vi.mock("./verifyRegisteredUser.js", () => ({ verifyRegisteredUser: verify }));
vi.mock("../api/_lib/observability.js", () => ({ initRequestContext: () => ({ requestId: "test" }), logError: vi.fn() }));
import read from "../api/companies.js";
import save from "../api/companies-save.js";
function response() { return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() }; }
const credentials = { login: "review@example.invalid", password: "test-only" };
beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue({ rows: [] });
  verify.mockResolvedValue(null);
  txQuery.mockResolvedValue({ rows: [] });
  connect.mockResolvedValue({ query: txQuery, release });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ customers: [{ INN: "111", Name: "Trusted" }] }) })));
});
afterEach(() => vi.unstubAllGlobals());

describe("companies endpoint authorization", () => {
  it("rejects anonymous reads and writes before any external request or mutation", async () => {
    for (const handler of [read, save]) {
      const res = response();
      await handler({ method: "POST", query: {}, headers: {}, body: { login: credentials.login, customers: [{ inn: "222", name: "Injected" }] } } as never, res as never);
      expect(res.status).toHaveBeenLastCalledWith(401);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });
  it("refuses incorrect registered credentials without falling back to 1C", async () => {
    query.mockResolvedValue({ rows: [{ login: credentials.login }] });
    const res = response();
    await read({ method: "POST", query: {}, body: { accounts: [credentials] } } as never, res as never);
    expect(res.status).toHaveBeenLastCalledWith(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not mutate registered bindings even with a valid password and arbitrary submitted INNs", async () => {
    query.mockImplementation(async (sql: string) => ({ rows: sql.includes("registered_users") ? [{ login: credentials.login }] : [{ inn: "111", name: "Assigned" }] }));
    verify.mockResolvedValue({ inn: "111", accessAllInns: false });
    const res = response();
    await save({ method: "POST", body: { ...credentials, customers: [{ inn: "222", name: "Injected" }] } } as never, res as never);
    expect(res.status).toHaveBeenLastCalledWith(200);
    expect(connect).not.toHaveBeenCalled();
  });
  it("saves only server-fetched legacy companies, ignoring injected client assignments", async () => {
    const res = response();
    await save({ method: "POST", body: { ...credentials, customers: [{ inn: "222", name: "Injected" }] } } as never, res as never);
    expect(res.status).toHaveBeenLastCalledWith(200);
    const inserts = txQuery.mock.calls.filter(([sql]) => sql.includes("INSERT"));
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]).toEqual([credentials.login, "111", "Trusted"]);
  });
  it("rejects requesting another login using valid header credentials", async () => {
    const res = response();
    await read({ method: "GET", query: { login: "other@example.invalid" }, headers: { "x-login": credentials.login, "x-password": credentials.password } } as never, res as never);
    expect(res.status).toHaveBeenLastCalledWith(403);
    expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ companies: expect.anything() }));
  });
  it("ignores the client access_all flag and returns only assigned registered companies", async () => {
    query.mockImplementation(async (sql: string) => ({ rows: sql.includes("registered_users") ? [{ login: credentials.login }] : [{ inn: "111", name: "Assigned" }] }));
    verify.mockResolvedValue({ inn: "111", accessAllInns: false });
    const res = response();
    await read({ method: "POST", query: {}, body: { accounts: [{ ...credentials, access_all: true }] } } as never, res as never);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ companies: [{ login: credentials.login, inn: "111", name: "Assigned" }] }));
    expect(query.mock.calls.some(([sql]) => sql.includes("cache_customers"))).toBe(false);
  });
  it("rejects a batch when any account lacks its own credentials", async () => {
    const res = response();
    await read({ method: "POST", query: {}, body: { accounts: [credentials, { login: "victim@example.invalid" }] } } as never, res as never);
    expect(res.status).toHaveBeenLastCalledWith(401);
    expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ companies: expect.anything() }));
  });
  it("does not change bindings when upstream validation fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ Success: false }) })));
    const res = response();
    await save({ method: "POST", body: credentials } as never, res as never);
    expect(res.status).toHaveBeenLastCalledWith(401);
    expect(connect).not.toHaveBeenCalled();
  });
  it("supports legacy v1 only through a separately authenticated upstream response", async () => {
    const upstream = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ Customer: "Legacy", INN: "333" }] });
    vi.stubGlobal("fetch", upstream);
    const res = response();
    await save({ method: "POST", body: { ...credentials, customers: [{ inn: "222", name: "Injected" }] } } as never, res as never);
    expect(res.status).toHaveBeenLastCalledWith(200);
    expect(txQuery.mock.calls.find(([sql]) => sql.includes("INSERT"))?.[1]).toEqual([credentials.login, "333", "Legacy"]);
    expect(upstream.mock.calls[1][1].headers.Auth).toBe(`Basic ${credentials.login}:${credentials.password}`);
  });

});
