import { describe, expect, it } from "vitest";
import { buildLastMileVehicleReport, extractLastMileTimelineMoments } from "./lastMileVehicleReport.js";

describe("extractLastMileTimelineMoments", () => {
  it("reads scheduled and delivered timestamps from Statuses", () => {
    const moments = extractLastMileTimelineMoments({
      Statuses: [
        { Stage: "Поставлена на доставку в месте прибытия", Date: "2026-08-28T09:15:00" },
        { Stage: "Доставлена", Date: "2026-08-28T14:30:00" },
      ],
    });
    expect(moments.scheduledAt?.toISOString()).toContain("2026-08-28T09:15:00");
    expect(moments.deliveredAt?.toISOString()).toContain("2026-08-28T14:30:00");
  });
});

describe("buildLastMileVehicleReport", () => {
  it("groups trips by vehicle and day with work window and totals", () => {
    const report = buildLastMileVehicleReport(
      [
        {
          Number: "000141572",
          Receiver: "Гончаров ИП",
          CityReceiver: "Калининград",
          LMAutoReg: "У706АР/39",
          LMAutoType: "Мерседес",
          LMDriver: "Ругалев И.Ф.",
          LMDriverTel: "+79953889445",
          PW: 1500,
          W: 1473,
          Value: 14.951,
          Mest: 251,
          Statuses: [
            { Stage: "Поставлена на доставку", Date: "2026-08-28T09:15:00" },
            { Stage: "Доставлена", Date: "2026-08-28T11:00:00" },
          ],
        },
        {
          Number: "000141573",
          Receiver: "Иванов ИП",
          CityReceiver: "Калининград",
          LMAutoReg: "У706АР/39",
          LMAutoType: "Мерседес",
          LMDriver: "Ругалев И.Ф.",
          LMDriverTel: "+79953889445",
          PW: 800,
          W: 790,
          Value: 8.2,
          Mest: 40,
          Statuses: [
            { Stage: "Поставлена на доставку", Date: "2026-08-28T12:00:00" },
            { Stage: "Доставлена", Date: "2026-08-28T16:45:00" },
          ],
        },
      ],
      "2026-08-01",
      "2026-08-31",
    );

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].autoReg).toBe("У706АР");
    expect(report.rows[0].trips).toHaveLength(2);
    expect(report.rows[0].firstAt).toBe("09:15");
    expect(report.rows[0].lastAt).toBe("16:45");
    expect(report.rows[0].workMinutes).toBe(450);
    expect(report.rows[0].totals.pw).toBe(2300);
    expect(report.rows[0].totals.volume).toBeCloseTo(23.151, 3);
    expect(report.summary.tripCount).toBe(2);
  });

  it("skips self pickup and rows without last mile meta", () => {
    const report = buildLastMileVehicleReport(
      [
        {
          Number: "0001",
          CitySender: "Москва",
          CityReceiver: "Калининград",
          PZV_Receiver: "Железнодорожная",
          LMAutoReg: "A111AA/77",
          DateVr: "2026-08-28",
        },
        {
          Number: "0002",
          DateVr: "2026-08-28",
        },
      ],
      "2026-08-01",
      "2026-08-31",
    );
    expect(report.rows).toHaveLength(0);
  });
});
