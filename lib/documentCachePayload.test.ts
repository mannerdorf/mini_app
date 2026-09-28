import { describe, it, expect, vi, afterEach } from "vitest";
import { validatedFinancialDocumentRows } from "./documentCachePayload.js";
import { refreshDatedKindForWindow } from "./documentCacheRefreshCore.js";

afterEach(() => vi.unstubAllGlobals());
describe.each(["perevozki", "invoices"] as const)("%s payload validation", kind => {
  it.each([null, {}, { unexpected: [] }, { error: "unavailable", Items: [] }, { success: false, Items: [] }, [null], [{ Sum: 100 }], ["bad"], [{ Number: {} }]])("preserves DB on malformed HTTP 200: %j", async payload => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload))));
    const pool = { query: vi.fn(), connect: vi.fn() };
    await expect(refreshDatedKindForWindow(pool as any, "test", "test", kind, "2026-09-01", "2026-09-01", "recent")).rejects.toThrow();
    expect(pool.query).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  });
  it("accepts an explicitly empty window", () => {
    expect(validatedFinancialDocumentRows([], kind)).toEqual([]);
    expect(validatedFinancialDocumentRows({ Items: [] }, kind)).toEqual([]);
  });
  it("preserves the complete document payload", () => {
    const row = { Number: "000001", StateBill: "Оплачен", Sum: 100, extra: { raw: true } };
    expect(validatedFinancialDocumentRows({ Items: [row] }, kind)).toEqual([row]);
  });
});
