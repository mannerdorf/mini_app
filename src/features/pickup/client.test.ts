import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/resolveApiOrigin", () => ({
  resolveApiOrigin: () => "http://localhost",
}));
import { pickupClient, ApiError } from "./client";
import type { Account } from "../../types";
afterEach(() => vi.unstubAllGlobals());
describe("pickup request delivery", () => {
  it("reuses the idempotency key when retrying an uncertain form save", async () => {
    const bodies: any[] = [];
    let fail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: any, init: any) => {
        bodies.push(JSON.parse(init.body));
        if (fail) {
          fail = false;
          throw new TypeError("offline");
        }
        return { ok: true, json: async () => ({ id: "saved" }) };
      }),
    );
    const call = pickupClient({ login: "driver", password: "test" } as Account);
    await expect(
      call({
        action: "save_job",
        data: { address: "Адрес" },
        requestId: "first",
      }),
    ).rejects.toThrow("offline");
    await call({
      action: "save_job",
      data: { address: "Адрес" },
      requestId: "second",
    });
    expect(bodies[1].requestId).toBe("first");
  });
  it("does not treat an authorization denial as an offline success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: "Нет доступа" }),
      })),
    );
    const call = pickupClient({ login: "driver", password: "test" } as Account);
    await expect(call({ action: "snapshot" })).rejects.toEqual(
      new ApiError("Нет доступа", 403),
    );
  });
});
