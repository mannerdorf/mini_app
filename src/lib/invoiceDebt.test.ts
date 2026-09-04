import { describe, expect, it } from "vitest";
import { invoiceBalance, isOutstandingDebtInvoice } from "./invoiceAmounts";

describe("isOutstandingDebtInvoice", () => {
  it("includes unpaid status", () => {
    expect(isOutstandingDebtInvoice({ Status: "Не оплачен", SumDoc: 1000 })).toBe(true);
  });

  it("excludes partial even with balance", () => {
    expect(
      isOutstandingDebtInvoice(
        { Status: "Оплачен частично", SumDoc: 1000, Sum_paid: 400 },
        undefined,
        () => null,
      ),
    ).toBe(false);
  });

  it("excludes unknown even with balance", () => {
    expect(
      isOutstandingDebtInvoice({ SumDoc: 500 }, undefined, () => null),
    ).toBe(false);
  });

  it("excludes paid", () => {
    expect(isOutstandingDebtInvoice({ Status: "Оплачен", SumDoc: 1000 })).toBe(false);
  });
});

describe("invoiceBalance", () => {
  it("returns remainder for unpaid invoice", () => {
    const balance = invoiceBalance({ Status: "Не оплачен", SumDoc: 1000 });
    expect(balance).toBe(1000);
  });
});
