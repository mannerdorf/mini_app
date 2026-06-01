import { describe, expect, it } from "vitest";
import {
  calcTransitHours,
  hasTimeComponent,
  parseDateTimeValue,
  pickSendingDepartureStart,
  resolveMetricsTransitHours,
} from "./transitDateTime";

describe("parseDateTimeValue", () => {
  it("parses date with time", () => {
    const d = parseDateTimeValue("01.06.2026 09:30:00");
    expect(d?.getHours()).toBe(9);
    expect(d?.getMinutes()).toBe(30);
  });

  it("defaults missing time to midnight", () => {
    const d = parseDateTimeValue("01.06.2026");
    expect(d?.getHours()).toBe(0);
  });
});

describe("hasTimeComponent", () => {
  it("detects explicit time in string", () => {
    expect(hasTimeComponent("01.06.2026 09:30")).toBe(true);
    expect(hasTimeComponent("2026-06-01T09:30:00")).toBe(true);
    expect(hasTimeComponent("01.06.2026")).toBe(false);
  });
});

describe("pickSendingDepartureStart", () => {
  const norm = (n: string | null | undefined) => String(n ?? "").replace(/^0+/, "");

  it("prefers departure field with time over date-only", () => {
    const start = pickSendingDepartureStart(
      { DateOtpr: "01.06.2026", DateSend: "01.06.2026 09:30:00" },
      [],
      new Map(),
      norm,
    );
    expect(start?.getHours()).toBe(9);
    expect(start?.getMinutes()).toBe(30);
  });

  it("falls back to linked cargo departure when sending row is date-only", () => {
    const cargoMap = new Map<string, Date>();
    const cargoStart = parseDateTimeValue("01.06.2026 09:30:00")!;
    cargoMap.set("2643906", cargoStart);
    const start = pickSendingDepartureStart(
      { DateOtpr: "01.06.2026" },
      ["2643906"],
      cargoMap,
      norm,
    );
    expect(start?.getTime()).toBe(cargoStart.getTime());
  });

  it("uses date-only as last fallback", () => {
    const start = pickSendingDepartureStart({ DateOtpr: "01.06.2026" }, [], new Map(), norm);
    expect(start?.getHours()).toBe(0);
  });
});

describe("calcTransitHours", () => {
  it("computes fractional hours", () => {
    const start = new Date(2026, 5, 1, 9, 30, 0);
    const end = new Date(2026, 5, 1, 12, 0, 0);
    expect(calcTransitHours(start, end)).toBe(2.5);
  });
});

describe("resolveMetricsTransitHours", () => {
  it("uses live now when first_ready_at is missing", () => {
    const now = new Date(2026, 5, 1, 12, 0, 0);
    const hours = resolveMetricsTransitHours(
      { send_start_at_metric: "2026-06-01T09:30:00" },
      now,
    );
    expect(hours).toBe(2.5);
  });

  it("uses frozen hours when first_ready_at is present", () => {
    const hours = resolveMetricsTransitHours({
      send_start_at_metric: "2026-05-29T08:00:00",
      first_ready_at_metric: "2026-05-31T18:00:00",
    });
    expect(hours).toBe(58);
  });
});
