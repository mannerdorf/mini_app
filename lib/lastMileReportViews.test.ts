import { describe, expect, it } from "vitest";
import { buildTimesheetDailyAccrualIndex } from "../src/lib/timesheetFotAnalytics.js";
import {
  lookupTimesheetDayAccrual,
  matchDriverToEmployee,
  personNamesMatch,
} from "./lastMileTimesheetMatch.js";
import { groupLastMileReportByDriver, groupLastMileReportByVehicle, computeLastMileCostPerKg } from "./lastMileReportViews.js";
import type { LastMileVehicleReport } from "../src/api/client/admin/lastMileReport.js";

describe("computeLastMileCostPerKg", () => {
  it("returns accrual divided by pw", () => {
    expect(computeLastMileCostPerKg(252000, 129898)).toBeCloseTo(1.94, 2);
    expect(computeLastMileCostPerKg(0, 1000)).toBe(0);
    expect(computeLastMileCostPerKg(1000, 0)).toBe(0);
  });
});

describe("personNamesMatch", () => {
  it("matches full name and initials", () => {
    expect(personNamesMatch("Ругалев Иван Федорович", "Ругалев И.Ф.")).toBe(true);
    expect(personNamesMatch("Иванов Петр", "Петров Иван")).toBe(false);
  });
});

describe("timesheet accrual lookup", () => {
  const index = buildTimesheetDailyAccrualIndex({
    employees: [
      {
        id: 10,
        fullName: "Ругалев Иван Федорович",
        department: "Последняя миля",
        accrualType: "shift",
        accrualRate: 5000,
      },
    ],
    entries: {
      "10__2026-08-31": "Я",
    },
    shiftRateOverrides: {},
  });

  it("matches driver from 1C to timesheet employee", () => {
    expect(matchDriverToEmployee("Ругалев И.Ф.", index.employees)?.employeeId).toBe(10);
  });

  it("returns day accrual for matched driver", () => {
    const result = lookupTimesheetDayAccrual(index, "Ругалев Иван Федорович", "2026-08-31");
    expect(result.matched).toBe(true);
    expect(result.amount).toBe(5000);
  });
});

describe("groupLastMileReportByVehicle", () => {
  const report: LastMileVehicleReport = {
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
    rows: [
      {
        date: "2026-08-31",
        vehicleKey: "У706АР",
        autoReg: "У706АР",
        autoType: "Мерседес",
        driver: "Ругалев И.Ф.",
        driverTel: "+79953889445",
        firstAt: null,
        lastAt: null,
        workMinutes: null,
        trips: [],
        totals: { tripCount: 6, pw: 7079, weight: 4000, volume: 40, places: 70 },
      },
    ],
    summary: { vehicleDays: 1, tripCount: 6, pw: 7079, weight: 4000, volume: 40, places: 70 },
  };

  const index = buildTimesheetDailyAccrualIndex({
    employees: [{ id: 10, fullName: "Ругалев Иван Федорович", department: "Последняя миля", accrualType: "shift", accrualRate: 5000 }],
    entries: { "10__2026-08-31": "Я" },
  });

  it("groups by vehicle and attaches accruals", () => {
    const groups = groupLastMileReportByVehicle(report, index);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("У706АР");
    expect(groups[0].totals.timesheetAccrual).toBe(5000);
    expect(groups[0].totals.costPerKg).toBeCloseTo(5000 / 7079, 4);
  });
});

describe("groupLastMileReportByDriver", () => {
  const report: LastMileVehicleReport = {
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
    rows: [
      {
        date: "2026-08-30",
        vehicleKey: "A111AA",
        autoReg: "A111AA",
        autoType: "Газель",
        driver: "Петров П.П.",
        driverTel: "+79991112233",
        firstAt: null,
        lastAt: null,
        workMinutes: null,
        trips: [],
        totals: { tripCount: 2, pw: 1000, weight: 800, volume: 8, places: 10 },
      },
      {
        date: "2026-08-31",
        vehicleKey: "A111AA",
        autoReg: "A111AA",
        autoType: "Газель",
        driver: "Петров П.П.",
        driverTel: "+79991112233",
        firstAt: null,
        lastAt: null,
        workMinutes: null,
        trips: [],
        totals: { tripCount: 3, pw: 1500, weight: 900, volume: 9, places: 12 },
      },
    ],
    summary: { vehicleDays: 2, tripCount: 5, pw: 2500, weight: 1700, volume: 17, places: 22 },
  };

  const index = buildTimesheetDailyAccrualIndex({
    employees: [{ id: 20, fullName: "Петров Петр Петрович", department: "Последняя миля", accrualType: "shift", accrualRate: 4000 }],
    entries: {
      "20__2026-08-30": "Я",
      "20__2026-08-31": "Я",
    },
  });

  it("groups by driver with summed accruals", () => {
    const groups = groupLastMileReportByDriver(report, index);
    expect(groups).toHaveLength(1);
    expect(groups[0].totals.dayCount).toBe(2);
    expect(groups[0].totals.timesheetAccrual).toBe(8000);
  });
});
