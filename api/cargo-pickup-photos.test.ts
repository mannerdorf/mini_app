import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), verify: vi.fn(), read: vi.fn(), legacy: vi.fn() }));
vi.mock("./_db.js", () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock("./_lib/cors.js", () => ({ respondCorsPreflight: () => false }));
vi.mock("../lib/verifyRegisteredUser.js", () => ({ verifyRegisteredUser: mocks.verify }));
vi.mock("../lib/documentCacheRead.js", () => ({ readPerevozkiByNumbersFromCache: mocks.read }));
vi.mock("../lib/companyAccess.js", () => ({ resolveCompanyAccess: mocks.legacy, CompanyAccessError: class extends Error {} }));
import handler from "./cargo-pickup-photos.js";
const cargo = { Number: "123", INN: "7701234567", ZayavkaNumber: "001" };
async function call(extra = {}) {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res); res.json.mockReturnValue(res);
  await handler({ method: "POST", body: { login: "user", password: "password", number: "123", customerInn: cargo.INN, ...extra } } as any, res as any);
  return res;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.verify.mockResolvedValue({ inn: cargo.INN, accessAllInns: false });
  mocks.read.mockResolvedValue([cargo]);
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("registered_users")) return { rows: [{ login: "user" }] };
    if (sql.includes("account_companies")) return { rows: [] };
    if (sql.includes("FROM pickup_jobs")) return { rows: [{ id: "job", job_number: "ZB-001", data: { customerInn: cargo.INN, zayavkaNumber: "1" } }] };
    if (sql.includes("FROM pickup_photos")) return { rows: [{ id: "photo", content_type: "image/jpeg", base64: "abc" }] };
    throw new Error("Unexpected query");
  });
});
describe("cargo pickup photos access", () => {
  it("returns photos for the authorized stored cargo", async () => {
    const res = await call();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ photos: [{ id: "photo", content_type: "image/jpeg", base64: "abc" }] });
  });
  it("rejects invalid credentials before reading cargo or photos", async () => {
    mocks.verify.mockResolvedValue(null);
    expect((await call()).status).toHaveBeenCalledWith(401);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("ignores a forged serviceMode and denies another company's cargo", async () => {
    mocks.verify.mockResolvedValue({ inn: "999", accessAllInns: false });
    expect((await call({ serviceMode: true })).status).toHaveBeenCalledWith(404);
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes("pickup_photos"))).toBe(false);
  });
  it("does not trust a supplied order or pickup ID", async () => {
    mocks.read.mockResolvedValue([{ ...cargo, ZayavkaNumber: "other" }]);
    expect((await call({ zayavkaNumber: "1", id: "job" })).json).toHaveBeenCalledWith({ photos: [] });
  });
  it("denies ambiguous cargo numbers", async () => {
    mocks.read.mockResolvedValue([cargo, cargo]);
    expect((await call()).status).toHaveBeenCalledWith(404);
  });
  it("allows verified access-all users", async () => {
    mocks.verify.mockResolvedValue({ inn: null, accessAllInns: true });
    expect((await call()).status).toHaveBeenCalledWith(200);
  });
});
