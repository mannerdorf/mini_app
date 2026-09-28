import { describe, expect, it } from "vitest";
import { invoiceBalance, invoiceBalanceFrom1C, invoiceSumPaid } from "./invoiceAmounts.js";
import { getInvoicePaymentFilterKey } from "./invoicePaymentFilter.js";
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

describe("financial values take precedence over stale payment text", () => {
  it.each([
    [{ Sum: 1000, Sum_paid: 400, StateBill: "Не оплачен" }, 400, 600, "Оплачен частично"],
    [{ Sum: 1000, Sum_paid: 400, StateBill: "Оплачен" }, 400, 600, "Оплачен частично"],
    [{ Sum: 1000, Sum_paid: 0, StateBill: "Оплачен" }, 0, 1000, "Не оплачен"],
    [{ Sum: 1000, Balance: 1000, StateBill: "Оплачен" }, 0, 1000, "Не оплачен"],
    [{ Sum: 1000, Balance: 600, Sum_paid: 1000, StateBill: "Оплачен" }, 400, 600, "Оплачен частично"],
    [{ Sum: 1000, Balance: 0, Sum_paid: 0, StateBill: "Не оплачен" }, 1000, 0, "Оплачен"],
    [{ Sum: 1000, Sum_paid: 1000, StateBill: "Не оплачен" }, 1000, 0, "Оплачен"],
    [{ Sum: 1000, Balance: "invalid", Sum_paid: "400,00", StateBill: "Не оплачен" }, 400, 600, "Оплачен частично"],
    [{ Sum: 1000, Sum_paid: "", PaidAmount: 400, StateBill: "Оплачен" }, 400, 600, "Оплачен частично"],
  ])("keeps paid, balance and badge consistent: %j", (inv, paid, balance, status) => {
    expect(invoiceSumPaid(inv)).toBe(paid);
    expect(invoiceBalance(inv)).toBe(balance);
    expect(getInvoicePaymentFilterKey(inv, { sum: inv.Sum, paid: invoiceSumPaid(inv), balance: invoiceBalance(inv) })).toBe(status === "Оплачен" ? "paid" : status === "Не оплачен" ? "unpaid" : "partial");
    expect(invoicePaymentStatusForUi(inv.StateBill, inv.Sum, invoiceSumPaid(inv), invoiceBalance(inv))).toBe(status);
  });

  it.each(["bad", "", null, false, {}, -1, Infinity])("does not turn invalid balance into full payment: %j", value => {
    expect(invoiceBalanceFrom1C({ Balance: value })).toBeNull();
  });
});
