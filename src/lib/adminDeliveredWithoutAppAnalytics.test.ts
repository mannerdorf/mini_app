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

import {filterSortDeliveredAppRows} from './adminDeliveredWithoutAppAnalytics';
it('retains all delivered rows for metric filters, including APP without an invoice',()=>{
 const report=buildDeliveredWithoutAppReport([
  {Number:'10001',State:'Доставлено'},
  {Number:'10002',State:'Доставлено',DDRecipientResponseStatus_APP:'RecipientResponseStatusSigned'},
  {Number:'10003',State:'Доставлено'},
  {Number:'10004',State:'В пути'},
 ] as CargoItem[],[{Number:'С-3',List:[{Number:'10003'}]}]);
 expect(report.allRows).toHaveLength(3);expect(report.rows).toHaveLength(2);
 expect(report.noLinkedInvoice).toBe(2);
 expect(filterSortDeliveredAppRows(report.allRows,'withoutInvoice','cargoNumber','asc').map(r=>r.cargoNumber)).toEqual(['10001','10002']);
 expect(filterSortDeliveredAppRows(report.allRows,'withApp','cargoNumber','asc').map(r=>r.cargoNumber)).toEqual(['10002']);
 expect(filterSortDeliveredAppRows(report.allRows,'withoutApp','cargoNumber','asc').map(r=>r.cargoNumber)).toEqual(['10001','10003']);
});
it('sorts numbers naturally and dates chronologically, leaving missing values last',()=>{
 const report=buildDeliveredWithoutAppReport([
  {Number:'10',State:'Доставлено',DateVr:'2026-01-03',DatePrih:''},
  {Number:'2',State:'Доставлено',DateVr:'2026-01-01',DatePrih:'2026-01-02'},
  {Number:'3',State:'Доставлено',DateVr:'2026-01-02',DatePrih:'2026-01-01'},
 ] as CargoItem[],[]);
 const numbers=(column:any,order:'asc'|'desc')=>filterSortDeliveredAppRows(report.allRows,'all',column,order).map(r=>r.cargoNumber);
 expect(numbers('cargoNumber','asc')).toEqual(['2','3','10']);
 expect(numbers('dateVr','desc')).toEqual(['10','3','2']);
 expect(numbers('datePrih','asc')).toEqual(['3','2','10']);
 expect(numbers('datePrih','desc')).toEqual(['2','3','10']);
});
