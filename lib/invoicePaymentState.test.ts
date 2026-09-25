import { describe, expect, it } from "vitest";
import { invoicePaymentStateRaw, looksLikeLogisticsStatus } from "./invoicePaymentState.js";
import { getInvoicePaymentFilterKey } from "./invoicePaymentFilter.js";
import { invoiceSumPaid } from "./invoiceAmounts.js";

describe("invoicePaymentStateRaw", () => {
  it("ignores delivery Status and uses cargo StateBill", () => {
    const inv = { Status: "Доставлено", SumDoc: 1000 };
    const cargoState = new Map([["141896", "Оплачен"]]);
    expect(invoicePaymentStateRaw(inv, cargoState, () => "141896")).toBe("Оплачен");
  });

  it("detects logistics labels", () => {
    expect(looksLikeLogisticsStatus("Доставлено")).toBe(true);
    expect(looksLikeLogisticsStatus("Не оплачен")).toBe(false);
  });
});

describe("paid invoice with cargo StateBill", () => {
  it("marks filter key paid and sum paid full", () => {
    const inv = { Number: "3719", Status: "Доставлено", SumDoc: 235950.75 };
    const cargoState = new Map([["999", "Оплачен"]]);
    const getCargo = () => "999";
    expect(
      getInvoicePaymentFilterKey(inv, {
        finance: { sum: 235950.75, paid: 235950.75, balance: 0 },
        cargoStateBillByNumber: cargoState,
        getFirstCargoNumber: getCargo,
      }),
    ).toBe("paid");
    expect(invoiceSumPaid(inv, undefined, getCargo, cargoState)).toBe(235950.75);
  });
});
