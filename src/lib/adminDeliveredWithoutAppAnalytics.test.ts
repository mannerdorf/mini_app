import { describe, expect, it } from "vitest";
import {
  buildDeliveredWithoutAppReport,
  cargoHasAppDocument,
  expandInvoiceLookupDateFrom,
} from "./adminDeliveredWithoutAppAnalytics";
import type { CargoItem } from "../types";

describe("cargoHasAppDocument", () => {
  it("returns true when APP status exists on linked invoice", () => {
    const inv = { DDRecipientResponseStatus_APP: "RecipientResponseStatusSigned" };
    expect(cargoHasAppDocument({ State: "Доставлено" } as CargoItem, inv)).toBe(true);
  });

  it("returns false when APP status is empty", () => {
    const inv = { Number: "С-1" };
    expect(cargoHasAppDocument({ State: "Доставлено" } as CargoItem, inv)).toBe(false);
  });
});

describe("buildDeliveredWithoutAppReport", () => {
  it("includes only delivered cargo without APP", () => {
    const cargo = [
      { Number: "10001", State: "Доставлено", Customer: "ООО Альфа", DatePrih: "2026-01-01", DateVr: "2026-01-10" },
      { Number: "10002", State: "Доставлено", Customer: "ООО Бета", DatePrih: "2026-01-02", DateVr: "2026-01-11" },
      { Number: "10003", State: "В пути", Customer: "ООО Гamma", DatePrih: "2026-01-03" },
    ] as CargoItem[];

    const invoices = [
      {
        Number: "С-100",
        List: [{ Number: "10001" }],
      },
      {
        Number: "С-200",
        DDRecipientResponseStatus_APP: "RecipientResponseStatusSigned",
        List: [{ Number: "10002" }],
      },
    ];

    const report = buildDeliveredWithoutAppReport(cargo, invoices);

    expect(report.deliveredTotal).toBe(2);
    expect(report.withApp).toBe(1);
    expect(report.withoutApp).toBe(1);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]?.cargoNumber).toBe("10001");
    expect(report.rows[0]?.invoiceNumber).toBe("С-100");
  });
});

describe("expandInvoiceLookupDateFrom", () => {
  it("shifts date back by requested days", () => {
    expect(expandInvoiceLookupDateFrom("2026-03-01", 30)).toBe("2026-01-30");
  });
});
