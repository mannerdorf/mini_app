import { describe, expect, it } from "vitest";
import {
  extractInvoicesFromResponse,
  hasRealBillNumber,
  pickBillNumber,
} from "./notificationPoll.js";

describe("pickBillNumber", () => {
  it("reads BillNum on the cargo without using cargo Number", () => {
    expect(pickBillNumber({ Number: "000141896", BillNum: "000001529" })).toBe("000001529");
  });

  it("reads Number from nested Invoice object", () => {
    expect(
      pickBillNumber({
        Number: "000141896",
        Invoice: { Number: "000001529", SumDoc: 125000 },
      }),
    ).toBe("000001529");
  });

  it("does not treat cargo Number as a bill number", () => {
    expect(pickBillNumber({ Number: "000141896", StateBill: "Не оплачен" })).toBe("");
  });

  it("ignores nested Invoice.Number when it repeats the cargo number", () => {
    expect(pickBillNumber({ Number: "000141896", Invoice: { Number: "000141896" } })).toBe("");
  });

  it("ignores junk Счет / Invoice markers that are not numbers", () => {
    expect(pickBillNumber({ Number: "000141896", Счет: "выставлен", Invoice: true })).toBe("");
    expect(hasRealBillNumber({ Number: "000141896", Invoice: { Number: "000001529" } })).toBe(true);
  });
});

describe("pickBillSumRaw", () => {
  it("reads SumDoc from nested Invoice", async () => {
    const { pickBillSumRaw } = await import("./notificationPoll.js");
    expect(pickBillSumRaw({ Number: "000141896", Invoice: { Number: "000001529", SumDoc: 44941 } })).toBe(44941);
  });
});

describe("extractInvoicesFromResponse", () => {
  it("reads Items from 1C GetIinvoices wrapper", () => {
    const items = extractInvoicesFromResponse({
      Success: true,
      Items: [{ Number: "000001529", List: [{ Operation: "Перевозка 000141896" }] }],
    });
    expect(items).toHaveLength(1);
    expect(items[0].Number).toBe("000001529");
  });

  it("reads a raw array", () => {
    expect(extractInvoicesFromResponse([{ Number: "1" }])).toEqual([{ Number: "1" }]);
  });
});
