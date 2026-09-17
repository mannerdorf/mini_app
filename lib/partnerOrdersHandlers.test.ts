import { expect, it, vi } from "vitest";
vi.mock("./requestErrorLog.js", () => ({ withErrorLog: (handler: unknown) => handler }));
vi.mock("../api/_lib/observability.js", () => ({ initRequestContext: () => ({ requestId: "test" }), logError: vi.fn() }));
vi.mock("./partnerOrUserApiAuth.js", () => ({ resolvePartnerOrUserApiAuth: vi.fn(async (_req, res) => { res.status(401).json({ error: "Unauthorized" }); return { ok: false }; }) }));

it.each(["read", "create"])("loads the %s handler and rejects a request without authorization", async (route) => {
  const { default: handler } = route === "read"
    ? await import("../api/partner/v1/orders.js")
    : await import("../api/partner/v1/orders/create.js");
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() };
  await handler({ method: "POST", body: {} } as never, res as never);
  expect(res.status).toHaveBeenCalledWith(401);
});
