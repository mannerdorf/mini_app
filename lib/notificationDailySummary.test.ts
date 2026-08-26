import { describe, expect, it } from "vitest";
import {
  computeDailySummaryStatsFromCache,
  formatDailySummaryPlainText,
  aggregateDailySummaryCargoCounts,
  normalizeStatus,
  type DailySummaryCacheIndex,
} from "./notificationDailySummary.js";

describe("normalizeStatus", () => {
  it("reads nested State objects from 1C", () => {
    expect(normalizeStatus({ Name: "В пути" })).toBe("В пути");
  });

  it("falls back to Без статуса", () => {
    expect(normalizeStatus(null)).toBe("Без статуса");
  });
});

describe("computeDailySummaryStatsFromCache", () => {
  it("counts active cargo and unpaid invoices for scoped INN", () => {
    const index: DailySummaryCacheIndex = {
      source: "normalized",
      cargoByInn: new Map([
        [
          "1234567890",
          [
            { Number: "1", State: "В пути" },
            { Number: "2", State: "Доставлена" },
            { Number: "3", State: "Готово к выдаче" },
          ],
        ],
      ]),
      invoicesByInn: new Map([
        [
          "1234567890",
          [
            { Number: "A", StateBill: "Не оплачен", SumDoc: 1000 },
            { Number: "B", StateBill: "Оплачен", SumDoc: 500 },
          ],
        ],
      ]),
    };

    const stats = computeDailySummaryStatsFromCache(["1234567890"], index);
    expect(stats.activeStatusCounts.get("В пути")).toBe(1);
    expect(stats.activeStatusCounts.get("Готово к выдаче")).toBe(1);
    expect(stats.activeStatusCounts.has("Доставлена")).toBe(false);
    expect(stats.unpaidCount).toBe(1);
    expect(stats.unpaidSum).toBe(1000);
  });
});

describe("aggregateDailySummaryCargoCounts", () => {
  it("groups active statuses into in-transit and ready buckets", () => {
    const counts = new Map([
      ["В пути", 2],
      ["Отправлена", 1],
      ["Готово к выдаче", 3],
      ["Принята", 4],
    ]);
    expect(aggregateDailySummaryCargoCounts(counts)).toEqual({
      inTransit: 3,
      readyForPickup: 3,
    });
  });
});

describe("formatDailySummaryPlainText", () => {
  it("formats fixed daily summary lines", () => {
    const text = formatDailySummaryPlainText({
      activeStatusCounts: new Map([
        ["В пути", 2],
        ["Готово к выдаче", 1],
      ]),
      unpaidCount: 3,
      unpaidSum: 12345.67,
    });
    expect(text).toContain("В пути: 2");
    expect(text).toContain("Готово к выдаче: 1");
    expect(text).toContain("Неоплаченные счета: 3 шт. на сумму");
    expect(text).toContain("346 ₽");
  });
});
