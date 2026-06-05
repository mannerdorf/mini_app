import { describe, expect, it, vi } from "vitest";
import { lookupPartnerDirectoryByInn } from "./partnerDirectory.js";

describe("lookupPartnerDirectoryByInn", () => {
  it("returns active partner when customer and contract exist", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ customer_name: "ООО Тест" }] })
        .mockResolvedValueOnce({ rows: [{ doc_number: "8888" }] }),
    };
    const r = await lookupPartnerDirectoryByInn(pool as never, "7706037094");
    expect(r.kind).toBe("active_partner");
    expect(r.label).toBe("Действующий партнёр, номер договора 8888");
  });

  it("returns need contract when customer without contract", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ customer_name: "ООО Тест" }] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const r = await lookupPartnerDirectoryByInn(pool as never, "7706037094");
    expect(r.kind).toBe("need_contract");
    expect(r.label).toBe("Необходимо заключить договор");
  });

  it("returns new partner when not in directory", async () => {
    const pool = {
      query: vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }),
    };
    const r = await lookupPartnerDirectoryByInn(pool as never, "1234567890");
    expect(r.kind).toBe("new_partner");
    expect(r.label).toBe("Новый партнёр, необходимо заключить договор");
  });
});
