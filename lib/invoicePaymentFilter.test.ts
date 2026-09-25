import { describe, expect, it } from "vitest";
import { getInvoicePaymentFilterKey } from "./invoicePaymentFilter.js";

describe("getInvoicePaymentFilterKey with finance", () => {
  it("maps delivery-only Status to unpaid when balance equals sum", () => {
    const inv = { Status: "Доставлено", SumDoc: 3843480.9 };
    expect(getInvoicePaymentFilterKey(inv, { sum: 3843480.9, paid: 0, balance: 3843480.9 })).toBe("unpaid");
  });
});
