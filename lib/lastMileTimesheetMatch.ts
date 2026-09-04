import type { TimesheetDailyAccrualIndex, TimesheetEmployeeRef } from "../src/lib/timesheetFotAnalytics.js";

export function normalizePersonName(name: string): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parsePersonName(name: string): { surname: string; initials: string } {
  const parts = normalizePersonName(name).split(" ").filter(Boolean);
  if (parts.length === 0) return { surname: "", initials: "" };
  const surname = parts[0];
  const initials = parts.slice(1).map((p) => p.charAt(0)).join("");
  return { surname, initials };
}

export function personNamesMatch(a: string, b: string): boolean {
  const left = normalizePersonName(a);
  const right = normalizePersonName(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const pa = parsePersonName(a);
  const pb = parsePersonName(b);
  if (!pa.surname || !pb.surname || pa.surname !== pb.surname) return false;
  if (!pa.initials || !pb.initials) return left.includes(pb.surname) && right.includes(pa.surname);
  return pa.initials.startsWith(pb.initials) || pb.initials.startsWith(pa.initials);
}

export function matchDriverToEmployee(
  driverName: string,
  employees: TimesheetEmployeeRef[],
): TimesheetEmployeeRef | null {
  const name = String(driverName ?? "").trim();
  if (!name || name === "—") return null;
  const exact = employees.find((e) => normalizePersonName(e.fullName) === normalizePersonName(name));
  if (exact) return exact;
  const fuzzy = employees.filter((e) => personNamesMatch(name, e.fullName));
  if (fuzzy.length === 1) return fuzzy[0];
  return null;
}

export function lookupTimesheetDayAccrual(
  index: TimesheetDailyAccrualIndex,
  driverName: string,
  date: string,
): { amount: number; employee: TimesheetEmployeeRef | null; matched: boolean } {
  const employee = matchDriverToEmployee(driverName, index.employees);
  if (!employee) return { amount: 0, employee: null, matched: false };
  const amount = index.byEmployeeDay.get(`${employee.employeeId}__${date}`) ?? 0;
  return { amount, employee, matched: true };
}

export function lookupTimesheetMonthAccrual(
  index: TimesheetDailyAccrualIndex,
  driverName: string,
): { amount: number; employee: TimesheetEmployeeRef | null; matched: boolean } {
  const employee = matchDriverToEmployee(driverName, index.employees);
  if (!employee) return { amount: 0, employee: null, matched: false };
  const amount = index.byEmployeeMonth.get(employee.employeeId) ?? 0;
  return { amount, employee, matched: true };
}
