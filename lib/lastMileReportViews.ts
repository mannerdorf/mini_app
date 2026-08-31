import type { LastMileVehicleDayRow, LastMileVehicleReport } from "../src/api/client/admin/lastMileReport.js";
import type { TimesheetDailyAccrualIndex } from "../src/lib/timesheetFotAnalytics.js";
import { lookupTimesheetDayAccrual } from "./lastMileTimesheetMatch.js";

export type LastMileEntityDayRow = LastMileVehicleDayRow & {
  timesheetAccrual: number;
  timesheetMatched: boolean;
  timesheetEmployeeName: string | null;
};

export type LastMileEntityGroup = {
  key: string;
  label: string;
  subtitle: string;
  days: LastMileEntityDayRow[];
  totals: {
    dayCount: number;
    tripCount: number;
    pw: number;
    weight: number;
    volume: number;
    places: number;
    timesheetAccrual: number;
    timesheetMatchedDays: number;
    costPerKg: number;
  };
};

/** Стоимость на 1 кг PW = начисление табеля / платный вес. */
export function computeLastMileCostPerKg(timesheetAccrual: number, pw: number): number {
  if (!(pw > 0) || !(timesheetAccrual > 0)) return 0;
  return timesheetAccrual / pw;
}

function sumDayRows(rows: LastMileEntityDayRow[]) {
  const base = rows.reduce(
    (acc, row) => {
      acc.dayCount += 1;
      acc.tripCount += row.totals.tripCount;
      acc.pw += row.totals.pw;
      acc.weight += row.totals.weight;
      acc.volume += row.totals.volume;
      acc.places += row.totals.places;
      acc.timesheetAccrual += row.timesheetAccrual;
      if (row.timesheetMatched) acc.timesheetMatchedDays += 1;
      return acc;
    },
    {
      dayCount: 0,
      tripCount: 0,
      pw: 0,
      weight: 0,
      volume: 0,
      places: 0,
      timesheetAccrual: 0,
      timesheetMatchedDays: 0,
    },
  );
  return {
    ...base,
    costPerKg: computeLastMileCostPerKg(base.timesheetAccrual, base.pw),
  };
}

function enrichRow(row: LastMileVehicleDayRow, index: TimesheetDailyAccrualIndex | null): LastMileEntityDayRow {
  const lookup = index ? lookupTimesheetDayAccrual(index, row.driver, row.date) : { amount: 0, employee: null, matched: false };
  return {
    ...row,
    timesheetAccrual: lookup.amount,
    timesheetMatched: lookup.matched,
    timesheetEmployeeName: lookup.employee?.fullName ?? null,
  };
}

export function groupLastMileReportByDays(
  report: LastMileVehicleReport,
  index: TimesheetDailyAccrualIndex | null,
): Array<{ date: string; rows: LastMileEntityDayRow[] }> {
  const map = new Map<string, LastMileEntityDayRow[]>();
  for (const row of report.rows) {
    const list = map.get(row.date) ?? [];
    list.push(enrichRow(row, index));
    map.set(row.date, list);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, rows]) => ({ date, rows }));
}

export function groupLastMileReportByVehicle(
  report: LastMileVehicleReport,
  index: TimesheetDailyAccrualIndex | null,
): LastMileEntityGroup[] {
  const map = new Map<string, LastMileEntityDayRow[]>();
  for (const row of report.rows) {
    const key = row.vehicleKey !== "—" ? row.vehicleKey : row.autoReg !== "—" ? row.autoReg : `unknown-${row.driver}`;
    const list = map.get(key) ?? [];
    list.push(enrichRow(row, index));
    map.set(key, list);
  }

  return Array.from(map.entries())
    .map(([key, days]) => {
      const sample = days[0];
      const label = sample.autoReg !== "—" ? sample.autoReg : key;
      const subtitle = sample.autoType !== "—" ? sample.autoType : "Тип не указан";
      const sortedDays = [...days].sort((a, b) => b.date.localeCompare(a.date));
      return {
        key,
        label,
        subtitle,
        days: sortedDays,
        totals: sumDayRows(sortedDays),
      };
    })
    .sort((a, b) => b.totals.pw - a.totals.pw);
}

export function groupLastMileReportByDriver(
  report: LastMileVehicleReport,
  index: TimesheetDailyAccrualIndex | null,
): LastMileEntityGroup[] {
  const map = new Map<string, LastMileEntityDayRow[]>();
  for (const row of report.rows) {
    const key = row.driver !== "—" ? row.driver : row.driverTel !== "—" ? row.driverTel : `unknown-${row.vehicleKey}`;
    const list = map.get(key) ?? [];
    list.push(enrichRow(row, index));
    map.set(key, list);
  }

  return Array.from(map.entries())
    .map(([key, days]) => {
      const sample = days[0];
      const sortedDays = [...days].sort((a, b) => b.date.localeCompare(a.date));
      const totals = sumDayRows(sortedDays);
      return {
        key,
        label: sample.driver !== "—" ? sample.driver : "Водитель не указан",
        subtitle: sample.driverTel !== "—" ? sample.driverTel : sample.timesheetEmployeeName ?? "—",
        days: sortedDays,
        totals,
      };
    })
    .sort((a, b) => b.totals.pw - a.totals.pw);
}
