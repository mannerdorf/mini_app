import { describe, expect, it } from "vitest";
import {
  buildCargoTimelineReportRow,
  buildCargoTimelineStageGaps,
  CARGO_TIMELINE_NORM_HOURS,
  filterCargoTimelineRowsByDelay,
  resolveCargoTimelineSteps,
} from "./cargoTimelineReport.js";

const sampleItem = {
  Number: "000141572",
  Customer: "Тест ООО",
  CitySender: "Москва",
  CityReceiver: "Калининград",
  DatePrih: "2026-08-24",
};

describe("resolveCargoTimelineSteps", () => {
  it("maps embedded Statuses to canonical labels", () => {
    const steps = resolveCargoTimelineSteps(
      {
        Statuses: [
          { Stage: "Получена на складе", Date: "2026-08-24T10:00:00" },
          { Stage: "Упакована", Date: "2026-08-24T12:00:00" },
          { Stage: "Загружена", Date: "2026-08-25T14:00:00" },
          { Stage: "К вручению", Date: "2026-09-01T08:00:00" },
          { Stage: "Доставлена", Date: "2026-09-02T10:00:00" },
        ],
      },
      sampleItem,
    );
    expect(steps.map((s) => s.label)).toEqual([
      "Получена в MSK",
      "Измерена",
      "Загружена в ТС",
      "Прибыла в KGD",
      "Доставлена",
    ]);
  });
});

describe("buildCargoTimelineReportRow", () => {
  it("flags loading and delivery overdue when gaps exceed 24h", () => {
    const steps = resolveCargoTimelineSteps(
      {
        Statuses: [
          { Stage: "Получена на складе", Date: "2026-08-24T10:00:00" },
          { Stage: "Загружена", Date: "2026-08-26T14:00:00" },
          { Stage: "К вручению", Date: "2026-09-01T08:00:00" },
          { Stage: "Доставлена", Date: "2026-09-04T10:00:00" },
        ],
      },
      sampleItem,
    );
    const row = buildCargoTimelineReportRow(sampleItem, steps, "embedded");
    expect(row?.loadingOverdue).toBe(true);
    expect(row?.deliveryOverdue).toBe(true);
    expect(row?.loadingGapHours).toBeGreaterThan(CARGO_TIMELINE_NORM_HOURS);
    expect(row?.deliveryGapHours).toBeGreaterThan(CARGO_TIMELINE_NORM_HOURS);
  });

  it("does not flag on-time gaps within 24h", () => {
    const steps = resolveCargoTimelineSteps(
      {
        Statuses: [
          { Stage: "Получена на складе", Date: "2026-08-24T10:00:00" },
          { Stage: "Загружена", Date: "2026-08-25T08:00:00" },
          { Stage: "К вручению", Date: "2026-09-01T08:00:00" },
          { Stage: "Доставлена", Date: "2026-09-02T06:00:00" },
        ],
      },
      sampleItem,
    );
    const row = buildCargoTimelineReportRow(sampleItem, steps, "embedded");
    expect(row?.loadingOverdue).toBe(false);
    expect(row?.deliveryOverdue).toBe(false);
  });
});

describe("filterCargoTimelineRowsByDelay", () => {
  const rows = [
    { loadingOverdue: true, deliveryOverdue: false } as any,
    { loadingOverdue: false, deliveryOverdue: true } as any,
    { loadingOverdue: false, deliveryOverdue: false } as any,
  ];

  it("filters loading delays", () => {
    expect(filterCargoTimelineRowsByDelay(rows, "loading")).toHaveLength(1);
  });

  it("filters delivery delays", () => {
    expect(filterCargoTimelineRowsByDelay(rows, "delivery")).toHaveLength(1);
  });
});

describe("buildCargoTimelineStageGaps", () => {
  it("marks overdue kind for norm pairs", () => {
    const steps = resolveCargoTimelineSteps(
      {
        Statuses: [
          { Stage: "Получена на складе", Date: "2026-08-24T10:00:00" },
          { Stage: "Загружена", Date: "2026-08-26T14:00:00" },
        ],
      },
      sampleItem,
    );
    const gaps = buildCargoTimelineStageGaps(steps, sampleItem);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.overdueKind).toBe("loading");
    expect(gaps[0]?.overdue).toBe(true);
  });
});
