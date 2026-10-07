import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  read: vi.fn(),
  check: vi.fn(),
}));
vi.mock("./_db.js", () => ({ getPool: () => ({}) }));
vi.mock("./_haulzCalculator.js", () => ({
  resolveHaulzCalculatorAccess: mocks.auth,
}));
vi.mock("../lib/tms/backlog.js", async (original) => ({
  ...(await original<typeof import("../lib/tms/backlog")>()),
  readBacklog: mocks.read,
  checkCargo: mocks.check,
}));
import handler from "./tms-backlog";
async function call(body: unknown, method = "POST") {
  const res: any = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ body, method, headers: {} } as any, res);
  return res;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ login: "staff" });
  mocks.read.mockResolvedValue({
    rows: [
      {
        payload: {
          Number: "000123",
          INN: "1",
          State: "В пути",
          W: 10,
          Value: 1,
        },
        updated_at: new Date("2026-10-01"),
      },
    ],
    assigned: 7,
  });
  mocks.check.mockResolvedValue({ readiness: "ready", reason: "Подтверждено" });
});
it("rejects unprivileged callers even if browser claims HAULZ or service mode", async () => {
  mocks.auth.mockResolvedValue(null);
  expect(
    (await call({ permissions: { haulz: true }, serviceMode: true })).status,
  ).toHaveBeenCalledWith(403);
  expect(mocks.read).not.toHaveBeenCalled();
});
it("lists candidates without interpreting in-transit summary as warehouse readiness", async () => {
  const res = await call({});
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json.mock.calls[0][0].items[0].readiness).toBe("pending");
  expect(mocks.check).not.toHaveBeenCalled();
});
it("re-reads authoritative availability for each verification batch", async () => {
  const res = await call({ numbers: ["000123"] });
  expect(mocks.read).toHaveBeenCalledWith({}, ["123"]);
  expect(res.json.mock.calls[0][0].items[0].readiness).toBe("ready");
  mocks.read.mockResolvedValue({ rows: [], assigned: 1 });
  expect(
    (await call({ numbers: ["123"] })).json.mock.calls[0][0].items,
  ).toEqual([]);
});
it("bounds upstream requests and validates payloads", async () => {
  expect(
    (await call({ numbers: ["1", "2", "3", "4", "5"] })).status,
  ).toHaveBeenCalledWith(400);
  expect((await call("{")).status).toHaveBeenCalledWith(400);
  expect((await call({ numbers: ["no"] })).status).toHaveBeenCalledWith(400);
  expect((await call({}, "GET")).status).toHaveBeenCalledWith(405);
});
