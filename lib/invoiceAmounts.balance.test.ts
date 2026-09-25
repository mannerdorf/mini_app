import { describe, expect, it } from "vitest";
import { invoiceBalance, invoiceBalanceFrom1C, invoiceSumPaid } from "./invoiceAmounts.js";
import { invoicePaymentStatusForUi } from "../src/lib/formatUtils.js";

describe("invoiceBalanceFrom1C", () => {
  it("reads zero remainder as paid", () => {
    const inv = { SumDoc: 235950.75, Balance: 0, Status: "Доставлено" };
    expect(invoiceBalanceFrom1C(inv)).toBe(0);
    expect(invoiceBalance(inv)).toBe(0);
    expect(invoiceSumPaid(inv)).toBe(235950.75);
    expect(invoicePaymentStatusForUi("", 235950.75, 235950.75, 0)).toBe("Оплачен");
  });

  it("reads StateBill Оплачен on invoice", () => {
    const inv = { SumDoc: 1000, StateBill: "Оплачен" };
    expect(invoiceSumPaid(inv)).toBe(1000);
    expect(invoiceBalance(inv)).toBe(0);
  });
});
