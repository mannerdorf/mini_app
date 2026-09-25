import { describe, expect, it } from "vitest";
import { invoicePaymentStatusForUi } from "./formatUtils";

describe("invoicePaymentStatusForUi", () => {
  it("infers unpaid when StateBill empty but balance positive", () => {
    expect(invoicePaymentStatusForUi("", 3843480.9, 0, 3843480.9)).toBe("Не оплачен");
  });

  it("does not treat delivery Status as payment label", () => {
    expect(invoicePaymentStatusForUi("Доставлено", 1000, 0, 1000)).toBe("Не оплачен");
  });

  it("respects explicit unpaid from 1C", () => {
    expect(invoicePaymentStatusForUi("НеОплачен", 1000, 0, 1000)).toBe("Не оплачен");
  });

  it("marks paid when balance zero before unpaid status text", () => {
    expect(invoicePaymentStatusForUi("Не оплачен", 1000, 1000, 0)).toBe("Оплачен");
    expect(invoicePaymentStatusForUi("", 1000, 1000, 0)).toBe("Оплачен");
  });
});
