import { describe, expect, it } from "vitest";
import {
  buildSendingsAnalysis,
  buildSendingsDeliveryWithinDays,
  getSendingsTransitDays,
  getSendingsTransitHours,
  sendingsTransitHoursToDays,
} from "./adminSendingsAnalytics";

describe("sendingsTransitHoursToDays", () => {
  it("converts hours to calendar days", () => {
    expect(sendingsTransitHoursToDays(48)).toBe(2);
    expect(sendingsTransitHoursToDays(36)).toBe(1.5);
  });
});

describe("getSendingsTransitHours", () => {
  it("returns hours only for completed sendings", () => {
    expect(
      getSendingsTransitHours({
        first_ready_at_metric: "2026-01-03T12:00:00",
        send_start_at_metric: "2026-01-01T00:00:00",
        in_transit_hours: 60,
      }),
    ).toBe(60);

    expect(getSendingsTransitHours({ in_transit_hours: 24 })).toBeNull();
  });
});

describe("buildSendingsAnalysis", () => {
  it("aggregates transit stats by transport type", () => {
    const items = [
      {
        АвтомобильCMRНаименование: "A123BC77",
        first_ready_at_metric: "2026-01-03T00:00:00",
        send_start_at_metric: "2026-01-01T00:00:00",
        in_transit_hours: 48,
      },
      {
        АвтомобильCMRНаименование: "B456CD77",
        first_ready_at_metric: "2026-01-05T00:00:00",
        send_start_at_metric: "2026-01-01T00:00:00",
        in_transit_hours: 96,
      },
      {
        АвтомобильCMRНаименование: "Паром Ирма",
        AK: true,
        first_ready_at_metric: "2026-01-22T00:00:00",
        send_start_at_metric: "2026-01-01T00:00:00",
        in_transit_hours: 504,
      },
    ];

    const result = buildSendingsAnalysis(items);
    const auto = result.byType.find((row) => row.type === "auto")!;
    const ferry = result.byType.find((row) => row.type === "ferry")!;

    expect(auto.count).toBe(2);
    expect(auto.minDays).toBe(2);
    expect(auto.maxDays).toBe(4);
    expect(ferry.count).toBe(1);
    expect(ferry.minDays).toBe(21);
    expect(result.completedCount).toBe(3);
  });
});

describe("buildSendingsDeliveryWithinDays", () => {
  it("returns cumulative non-zero percentages", () => {
    const items = [
      {
        АвтомобильCMRНаименование: "A123BC77",
        first_ready_at_metric: "2026-01-02T00:00:00",
        send_start_at_metric: "2026-01-01T00:00:00",
        in_transit_hours: 24,
      },
      {
        АвтомобильCMRНаименование: "B456CD77",
        first_ready_at_metric: "2026-01-04T00:00:00",
        send_start_at_metric: "2026-01-01T00:00:00",
        in_transit_hours: 72,
      },
      {
        АвтомобильCMRНаименование: "C789DE77",
        first_ready_at_metric: "2026-01-04T00:00:00",
        send_start_at_metric: "2026-01-01T00:00:00",
        in_transit_hours: 72,
      },
    ];

    const result = buildSendingsDeliveryWithinDays(items);
    const auto = result.byType.find((row) => row.type === "auto")!;
    expect(auto.total).toBe(3);
    expect(auto.buckets).toEqual([
      { day: 1, percent: 33, count: 1 },
      { day: 3, percent: 100, count: 3 },
    ]);
  });
});

describe("getSendingsTransitDays", () => {
  it("derives days from transit hours", () => {
    expect(
      getSendingsTransitDays({
        first_ready_at_metric: "2026-01-03T00:00:00",
        send_start_at_metric: "2026-01-01T00:00:00",
        in_transit_hours: 48,
      }),
    ).toBe(2);
  });
});
