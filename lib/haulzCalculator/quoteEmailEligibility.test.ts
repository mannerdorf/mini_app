import { describe, expect, it, vi } from "vitest";
import { resolveQuoteEmailNomerZayavki } from "./quoteEmailEligibility.js";

vi.mock("./calculatorDraft.js", () => ({
  getHaulzCalcDraft: vi.fn(),
}));

import { getHaulzCalcDraft } from "./calculatorDraft.js";

describe("resolveQuoteEmailNomerZayavki", () => {
  it("returns nomer from body when provided", async () => {
    const pool = {} as import("pg").Pool;
    const nomer = await resolveQuoteEmailNomerZayavki(pool, "user@test", {
      nomerZayavki: "  Z-100  ",
    });
    expect(nomer).toBe("Z-100");
    expect(getHaulzCalcDraft).not.toHaveBeenCalled();
  });

  it("loads nomer from draft when body empty", async () => {
    vi.mocked(getHaulzCalcDraft).mockResolvedValueOnce({
      id: 1,
      nomerZayavki: "Z-200",
    } as Awaited<ReturnType<typeof getHaulzCalcDraft>>);

    const pool = {} as import("pg").Pool;
    const nomer = await resolveQuoteEmailNomerZayavki(pool, "user@test", { draftId: 5 });
    expect(nomer).toBe("Z-200");
  });

  it("returns null when no nomer anywhere", async () => {
    vi.mocked(getHaulzCalcDraft).mockResolvedValueOnce({
      id: 1,
      nomerZayavki: null,
    } as Awaited<ReturnType<typeof getHaulzCalcDraft>>);

    const pool = {} as import("pg").Pool;
    const nomer = await resolveQuoteEmailNomerZayavki(pool, "user@test", { draftId: 5 });
    expect(nomer).toBeNull();
  });
});
