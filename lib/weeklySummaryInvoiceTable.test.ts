import { describe, expect, it } from "vitest";
import { collectInvoiceLinkedCargoNumbers, getFirstCargoNumberFromInvoice } from "./weeklySummaryInvoiceTable.js";

describe("collectInvoiceLinkedCargoNumbers", () => {
  it("reads cargo from List.Operation", () => {
    expect(
      collectInvoiceLinkedCargoNumbers({
        Number: "000001529",
        List: [{ Operation: "Перевозка 000141896" }],
      }),
    ).toContain("000141896");
  });

  it("reads cargo from List row Number when Operation has no digits", () => {
    expect(
      collectInvoiceLinkedCargoNumbers({
        Number: "000001529",
        List: [{ Name: "Перевозка", Number: "000141896" }],
      }),
    ).toContain("000141896");
  });

  it("reads cargo from List as a string", () => {
    expect(collectInvoiceLinkedCargoNumbers({ Number: "000001529", List: "Перевозка 000141896" })).toContain(
      "000141896",
    );
  });

  it("does not treat invoice header Number as a cargo number", () => {
    expect(collectInvoiceLinkedCargoNumbers({ Number: "000001529" })).toEqual([]);
    expect(getFirstCargoNumberFromInvoice({ Number: "000001529" })).toBeNull();
  });
});
