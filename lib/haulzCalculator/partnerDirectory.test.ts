import { describe, expect, it, vi } from "vitest";
import { lookupPartnerDirectoryByInn } from "./partnerDirectory.js";

function mockPool(
  customer: { customer_name: string } | null,
  contract: { doc_number: string; doc_date?: string | null } | null,
  supplier: { counterparty_status: string } | null,
) {
  return {
    query: vi
      .fn()
      .mockResolvedValueOnce({ rows: customer ? [customer] : [] })
      .mockResolvedValueOnce({ rows: contract ? [contract] : [] })
      .mockResolvedValueOnce({ rows: supplier ? [supplier] : [] }),
  };
}

describe("lookupPartnerDirectoryByInn", () => {
  it("returns active partner when customer and contract exist", async () => {
    const pool = mockPool(
      { customer_name: "ООО Тест" },
      { doc_number: "8888", doc_date: "2024-06-01T00:00:00.000Z" },
      null,
    );
    const r = await lookupPartnerDirectoryByInn(pool as never, "7706037094");
    expect(r.kind).toBe("active_partner");
    expect(r.label).toBe("Действующий партнёр, номер договора 8888");
    expect(r.contractDate).toBe("2024-06-01T00:00:00.000Z");
    expect(r.hasEdo).toBe(false);
  });

  it("returns hasEdo when supplier is IsMyCounteragent", async () => {
    const pool = mockPool(
      { customer_name: "ООО Тест" },
      { doc_number: "8888" },
      { counterparty_status: "IsMyCounteragent" },
    );
    const r = await lookupPartnerDirectoryByInn(pool as never, "7706037094");
    expect(r.hasEdo).toBe(true);
  });

  it("returns need contract when customer without contract", async () => {
    const pool = mockPool({ customer_name: "ООО Тест" }, null, null);
    const r = await lookupPartnerDirectoryByInn(pool as never, "7706037094");
    expect(r.kind).toBe("need_contract");
    expect(r.label).toBe("Необходимо заключить договор");
  });

  it("returns new partner when not in directory", async () => {
    const pool = mockPool(null, null, null);
    const r = await lookupPartnerDirectoryByInn(pool as never, "1234567890");
    expect(r.kind).toBe("new_partner");
    expect(r.label).toBe("Новый партнёр, необходимо заключить договор");
  });
});
