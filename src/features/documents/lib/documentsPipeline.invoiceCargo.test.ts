import { describe, expect, it } from "vitest";
import { collectInvoiceLinkedCargoNumbers, getFirstCargoNumberFromInvoice } from "./documentsPipeline";

describe("invoice cargo number extraction", () => {
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
      getFirstCargoNumberFromInvoice({
        Number: "000001529",
        List: [{ Name: "Перевозка", Number: "000141896" }],
      }),
    ).toBe("000141896");
  });

  it("reads cargo from List as a string", () => {
    expect(collectInvoiceLinkedCargoNumbers({ Number: "000001529", List: "Перевозка 000141896" })).toContain(
      "000141896",
    );
  });
});
