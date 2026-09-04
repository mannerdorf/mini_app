import { describe, expect, it } from "vitest";
import {
  buildByCargoSummaries,
  buildCounterpartySummaries,
  formatSendingSummaryNum,
  getAllCounterpartySelectionKeys,
  parseSendingSummaryNumber,
  resolveSendingPartyFromParcel,
  resolveSendingPlanDate,
  sendingSummaryDensityColor,
  sendingSummaryDensityOf,
  sortByCargoSummaries,
  sortCounterpartySummaries,
  sumByCargoSummaryTotals,
} from "./sendingsByCustomerSummaryHelpers";

const sampleParcels = [
  {
    Перевозка: "1001",
    ЗаказчикНаименование: "ООО Альфа",
    ПолучательНаименование: "ООО Бета",
    ОбъемДляОтчета: "2",
    ВесДляОтчета: "400",
    ПлатныйВес: "400",
  },
  {
    Перевозка: "1001",
    ЗаказчикНаименование: "ООО Альфа",
    ПолучательНаименование: "ООО Бета",
    ОбъемДляОтчета: "1",
    ВесДляОтчета: "200",
    ПлатныйВес: "200",
  },
  {
    Перевозка: "2002",
    Заказчик: "ООО Гамма",
    Получатель: "ООО Дельта",
    ОбъемДляОтчета: "3",
    ВесДляОтчета: "600",
    ПлатныйВес: "600",
  },
];

describe("parseSendingSummaryNumber", () => {
  it("parses comma decimals", () => {
    expect(parseSendingSummaryNumber("12,5")).toBe(12.5);
  });

  it("returns 0 for invalid values", () => {
    expect(parseSendingSummaryNumber("abc")).toBe(0);
  });
});

describe("formatSendingSummaryNum", () => {
  it("rounds to integer string", () => {
    expect(formatSendingSummaryNum(12.6)).toBe("13");
  });

  it("returns dash for non-finite", () => {
    expect(formatSendingSummaryNum(Number.NaN)).toBe("—");
  });
});

describe("sendingSummaryDensityOf", () => {
  it("computes weight over volume", () => {
    expect(sendingSummaryDensityOf(400, 2)).toBe("200");
  });

  it("returns dash when volume is zero", () => {
    expect(sendingSummaryDensityOf(400, 0)).toBe("—");
  });
});

describe("sendingSummaryDensityColor", () => {
  it("returns green in ideal band", () => {
    expect(sendingSummaryDensityColor(400, 2)).toBe("#16a34a");
  });

  it("returns red below 150", () => {
    expect(sendingSummaryDensityColor(100, 2)).toBe("#dc2626");
  });
});

describe("resolveSendingPartyFromParcel", () => {
  const row = { Заказчик: "Fallback Customer", Получатель: "Fallback Receiver" };
  const cargoCustomerByNumber = new Map([["1001", "Customer From Cargo Map"]]);
  const cargoReceiverByNumber = new Map<string, string>();

  it("prefers parcel customer name when grouping by customer", () => {
    expect(
      resolveSendingPartyFromParcel(sampleParcels[0], row, "customer", cargoCustomerByNumber, cargoReceiverByNumber),
    ).toBe("ООО Альфа");
  });

  it("prefers parcel receiver when grouping by receiver", () => {
    expect(
      resolveSendingPartyFromParcel(sampleParcels[0], row, "receiver", cargoCustomerByNumber, cargoReceiverByNumber),
    ).toBe("ООО Бета");
  });
});

describe("buildCounterpartySummaries", () => {
  it("aggregates parcels by customer party", () => {
    const rows = buildCounterpartySummaries(
      sampleParcels,
      {},
      "row-1",
      "customer",
      new Map(),
      new Map(),
    );
    const alpha = rows.find((r) => r.party === "ООО Альфа");
    const gamma = rows.find((r) => r.party === "ООО Гамма");
    expect(alpha?.count).toBe(2);
    expect(alpha?.weight).toBe(600);
    expect(alpha?.cargoNumbers).toEqual(["1001"]);
    expect(gamma?.count).toBe(1);
    expect(alpha?.selectionKey).toBe("row-1::ООО Альфа");
  });
});

describe("sortCounterpartySummaries", () => {
  it("sorts by count descending", () => {
    const rows = buildCounterpartySummaries(sampleParcels, {}, "row-1", "customer", new Map(), new Map());
    const sorted = sortCounterpartySummaries(rows, "count", "desc");
    expect(sorted[0].count).toBeGreaterThanOrEqual(sorted[1].count);
  });
});

describe("getAllCounterpartySelectionKeys", () => {
  it("builds unique selection keys per party", () => {
    const keys = getAllCounterpartySelectionKeys(sampleParcels, {}, "row-1", "customer", new Map(), new Map());
    expect(keys.size).toBe(2);
    expect(keys.has("row-1::ООО Альфа")).toBe(true);
    expect(keys.has("row-1::ООО Гамма")).toBe(true);
  });
});

describe("buildByCargoSummaries", () => {
  it("aggregates metrics per cargo number", () => {
    const rows = buildByCargoSummaries(
      sampleParcels,
      { Заказчик: "Row Customer" },
      new Map([["1001", "In transit"]]),
      new Map([["1001", "Mapped Customer"]]),
    );
    const cargo1001 = rows.find((r) => r.cargo === "1001");
    expect(cargo1001?.count).toBe(2);
    expect(cargo1001?.volume).toBe(3);
    expect(cargo1001?.weight).toBe(600);
    expect(cargo1001?.customer).toBe("Mapped Customer");
  });
});

describe("sortByCargoSummaries", () => {
  it("sorts cargo numbers numerically", () => {
    const rows = buildByCargoSummaries(sampleParcels, {}, new Map(), new Map());
    const sorted = sortByCargoSummaries(rows, "cargo", "asc");
    expect(sorted.map((r) => r.cargo)).toEqual(["1001", "2002"]);
  });
});

describe("sumByCargoSummaryTotals", () => {
  it("sums count and weight across cargo rows", () => {
    const rows = buildByCargoSummaries(sampleParcels, {}, new Map(), new Map());
    expect(sumByCargoSummaryTotals(rows)).toEqual({ count: 3, volume: 6, weight: 1200, paidWeight: 1200, cost: 0 });
  });
});

describe("resolveSendingPlanDate", () => {
  it("prefers cargo-specific plan date from map", () => {
    const plan = new Date("2026-08-10T00:00:00.000Z");
    const map = new Map<string, Date>([["1001", plan]]);
    expect(resolveSendingPlanDate("1001", map, null)).toBe(plan);
  });

  it("falls back to sending planned arrival", () => {
    const fallback = new Date("2026-08-15T00:00:00.000Z");
    expect(resolveSendingPlanDate("9999", new Map(), fallback)).toBe(fallback);
  });
});
