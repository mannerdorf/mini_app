import { describe, expect, it } from "vitest";
import { buildFilteredInvoices, buildInvoicesSummary, groupInvoicesByCustomer, getFirstCargoNumberFromInvoice } from "./documentsPipeline";
import type { SharedBillStatusKey } from "../../../lib/sharedListFilters";

const items = [
  { Customer: "5 ПОСТ", Number: "1", SumDoc: 1000, SumPaid: 1000 },
  { Customer: "5 ПОСТ", Number: "2", SumDoc: 2000, SumPaid: 0 },
  { Customer: "5 ПОСТ", Number: "3", SumDoc: 3000, SumPaid: 1000 },
  { Customer: "Другой заказчик", Number: "4", SumDoc: 4000, SumPaid: 4000 },
];
function filtered(statuses: SharedBillStatusKey[] = []) {
  return buildFilteredInvoices({
    items, useServiceRequest: true, customerFilter: "", invoiceFavoritesOnly: false,
    billStatusFilterSet: new Set(statuses), typeFilterSet: new Set(), routeFilterSet: new Set(),
    deliveryStatusFilterSet: new Set(), transportFilter: "", searchText: "", edoStatusFilterSet: new Set(),
    sortBy: null, sortOrder: "asc", isInvoiceFavorite: () => false, getFirstCargoNumberFromInvoice,
    cargoStateByNumber: new Map(), cargoRouteByNumber: new Map(), cargoTransportByNumber: new Map(),
  });
}
describe("invoice totals use full document amounts after filtering", () => {
  it("includes paid, unpaid and partially paid invoices in customer and header totals", () => {
    const list = filtered();
    const groups = groupInvoicesByCustomer(list);
    expect(groups.map(({ customer, sum, items }) => [customer, sum, items.length])).toEqual([
      ["5 ПОСТ", 6000, 3], ["Другой заказчик", 4000, 1],
    ]);
    expect(buildInvoicesSummary(list, []).sum).toBe(10000);
    expect(groups.reduce((sum, group) => sum + group.sum, 0)).toBe(10000);
  });
  it.each([
    ["paid", 5000, 2], ["unpaid", 2000, 1], ["partial", 3000, 1],
  ] as const)("respects the %s filter without replacing amount with balance", (status, sum, count) => {
    const list = filtered([status]);
    expect(buildInvoicesSummary(list, [])).toMatchObject({ sum, count });
    expect(groupInvoicesByCustomer(list).reduce((total, group) => total + group.sum, 0)).toBe(sum);
  });
  it("totals all three 5 POST invoices from the reported example", () => {
    const invoices = [
      { Customer: "5 ПОСТ", Number: "3914", SumDoc: 3843480.90, SumPaid: 0 },
      { Customer: "5 ПОСТ", Number: "3764", SumDoc: 4232983.65, SumPaid: 0 },
      { Customer: "5 ПОСТ", Number: "3485", SumDoc: 3008699.40, SumPaid: 3008699.40 },
    ];
    expect(groupInvoicesByCustomer(invoices)[0].sum).toBeCloseTo(11085163.95, 2);
    expect(buildInvoicesSummary(invoices, []).sum).toBeCloseTo(11085163.95, 2);
  });
  it("returns zero and no customer rows when nothing matches", () => {
    expect(buildInvoicesSummary([], [])).toMatchObject({ sum: 0, count: 0 });
    expect(groupInvoicesByCustomer([])).toEqual([]);
  });
});
