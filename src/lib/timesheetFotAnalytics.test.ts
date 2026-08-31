import { describe, expect, it } from "vitest";
import { buildTimesheetFotAnalytics, groupTimesheetFotByDepartment } from "./timesheetFotAnalytics";

describe("buildTimesheetFotAnalytics", () => {
  it("calculates hourly employee cost", () => {
    const analytics = buildTimesheetFotAnalytics({
      employees: [{ id: 1, fullName: "Иван", department: "Склад Москва", accrualType: "hour", accrualRate: 300 }],
      entries: { "1__2026-03-01": "8:00", "1__2026-03-02": "4" },
      payoutsByEmployee: { "1": 1000 },
    });
    expect(analytics.totalHours).toBe(12);
    expect(analytics.totalCost).toBe(3600);
    expect(analytics.totalPaid).toBe(1000);
    expect(analytics.totalOutstanding).toBe(2600);
  });

  it("calculates shift employee cost", () => {
    const analytics = buildTimesheetFotAnalytics({
      employees: [{ id: 2, fullName: "Пётр", department: "Последняя миля", accrualType: "shift", accrualRate: 5000 }],
      entries: { "2__2026-03-01": "Я", "2__2026-03-02": "Я", "2__2026-03-03": "В" },
      payoutsByEmployee: {},
    });
    expect(analytics.totalShifts).toBe(2);
    expect(analytics.totalCost).toBe(10000);
  });
});

describe("groupTimesheetFotByDepartment", () => {
  it("groups employees and computes share and cost per kg", () => {
    const analytics = buildTimesheetFotAnalytics({
      employees: [
        { id: 1, fullName: "A", department: "Склад Москва", accrualType: "hour", accrualRate: 100 },
        { id: 2, fullName: "B", department: "Склад Москва", accrualType: "hour", accrualRate: 100 },
        { id: 3, fullName: "C", department: "Администрация", accrualType: "hour", accrualRate: 100 },
      ],
      entries: {
        "1__2026-03-01": "10",
        "2__2026-03-01": "10",
        "3__2026-03-01": "10",
      },
      payoutsByEmployee: {},
    });
    const rows = groupTimesheetFotByDepartment(analytics, 1000);
    expect(rows).toHaveLength(2);
    expect(rows[0].department).toBe("Склад Москва");
    expect(rows[0].totalCost).toBe(2000);
    expect(rows[0].share).toBe(66.66666666666666);
    expect(rows[0].costPerKg).toBe(2);
    expect(rows[0].employeeCount).toBe(2);
  });
});
