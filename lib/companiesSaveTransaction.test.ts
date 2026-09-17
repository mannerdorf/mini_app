import { beforeEach, expect, it, vi } from "vitest";
const { query, release } = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock("../api/_db.js", () => ({ getPool: () => ({ connect: async () => ({ query, release }) }) }));
vi.mock("../api/_lib/observability.js", () => ({ initRequestContext: () => ({ requestId: "test" }), logError: vi.fn() }));
vi.mock("./companyAccess.js", () => ({ CompanyAccessError: class extends Error {}, resolveCompanyAccess: async () => ({ login: "review@example.invalid", registered: false, customers: [{ inn: "123", name: "Test" }] }) }));
import handler from "../api/companies-save.js";

beforeEach(() => { query.mockReset(); release.mockReset(); });
async function invoke() {
  const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await handler({ method: "POST", body: { login: "review@example.invalid", customers: [{ inn: "123", name: "Test" }] } } as never, res as never);
  return res;
}
it("rolls back a failed insert before releasing the connection", async () => {
  query.mockImplementation(async (sql: string) => { if (sql.startsWith("INSERT")) throw new Error("insert failed"); return { rows: [] }; });
  const res = await invoke();
  expect(query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", expect.stringContaining("DELETE"), expect.stringContaining("INSERT"), "ROLLBACK"]);
  expect(res.status).toHaveBeenCalledWith(500);
  expect(release).toHaveBeenCalledExactlyOnceWith(undefined);
  expect(query.mock.invocationCallOrder.at(-1)!).toBeLessThan(release.mock.invocationCallOrder[0]);
});
it("discards the connection if rollback fails", async () => {
  query.mockImplementation(async (sql: string) => { if (sql.startsWith("INSERT") || sql === "ROLLBACK") throw new Error(sql === "ROLLBACK" ? "rollback failed" : "insert failed"); });
  await invoke();
  expect(release).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: "rollback failed" }));
});
it("commits a successful save without rolling back", async () => {
  query.mockResolvedValue({ rows: [] });
  const res = await invoke();
  expect(query).toHaveBeenLastCalledWith("COMMIT");
  expect(res.status).toHaveBeenCalledWith(200);
  expect(release).toHaveBeenCalledExactlyOnceWith(undefined);
});
