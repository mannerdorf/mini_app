import { useState, useEffect, useMemo, useRef } from "react";
import type { UseAdminEmployeeDirectoryReturn } from "./useAdminEmployeeDirectory";
import {
  SHIFT_MARK_OPTIONS,
  SHIFT_MARK_CODES,
  toHalfHourValue,
  buildTimesheetDays,
  buildTimesheetHalfHourOptions,
  getAdminHourlyCellMark,
  getAdminShiftMarkStyle,
} from "../lib/adminTimesheetHelpers";
import {
  groupTimesheetEmployeesByDepartment,
  filterTimesheetVisibleGroups,
  computeTimesheetDepartmentSummaries,
  computeTimesheetCompanySummary,
  computeTimesheetMonthPaymentStatus,
  computeTimesheetPaidDateKeys,
} from "../lib/adminTimesheetSummaries";
import type { AdminTimesheetMutationsState } from "./useAdminTimesheetMutations";

type Params = {
  employeeDir: UseAdminEmployeeDirectoryReturn;
  mutations: AdminTimesheetMutationsState;
  timesheetMonth: string;
  setTimesheetMonth: (value: string) => void;
};

export function useAdminTimesheetViewState({
  employeeDir,
  mutations,
  timesheetMonth,
  setTimesheetMonth,
}: Params) {
  const [timesheetSearch, setTimesheetSearch] = useState("");
  const [timesheetDepartmentFilter, setTimesheetDepartmentFilter] = useState<string>("all");
  const [timesheetExpandedEmployeeId, setTimesheetExpandedEmployeeId] = useState<number | null>(null);
  const [timesheetMobilePicker, setTimesheetMobilePicker] = useState(false);
  const [adminShiftPicker, setAdminShiftPicker] = useState<{ key: string; employeeId: number; dateIso: string; x: number; y: number; isShift: boolean } | null>(null);
  const adminShiftHoldTimerRef = useRef<number | null>(null);
  const adminShiftHoldTriggeredRef = useRef(false);

  const timesheetHalfHourOptions = useMemo(() => buildTimesheetHalfHourOptions(), []);
  const timesheetDays = useMemo(() => buildTimesheetDays(timesheetMonth), [timesheetMonth]);

  const timesheetEmployeesByDepartment = useMemo(
    () => groupTimesheetEmployeesByDepartment(employeeDir.items, timesheetSearch),
    [employeeDir.items, timesheetSearch],
  );

  const timesheetDepartmentOptions = useMemo(
    () => timesheetEmployeesByDepartment.map((group) => group.department),
    [timesheetEmployeesByDepartment],
  );

  const timesheetVisibleGroups = useMemo(
    () => filterTimesheetVisibleGroups(timesheetEmployeesByDepartment, timesheetDepartmentFilter),
    [timesheetDepartmentFilter, timesheetEmployeesByDepartment],
  );

  const timesheetDepartmentSummaries = useMemo(
    () => computeTimesheetDepartmentSummaries(
      timesheetEmployeesByDepartment,
      timesheetDays,
      mutations.timesheetHours,
      mutations.timesheetPaymentMarks,
      mutations.timesheetShiftRateOverrides,
      mutations.timesheetPayoutsByEmployee,
    ),
    [
      timesheetEmployeesByDepartment,
      timesheetDays,
      mutations.timesheetHours,
      mutations.timesheetPaymentMarks,
      mutations.timesheetShiftRateOverrides,
      mutations.timesheetPayoutsByEmployee,
    ],
  );

  const timesheetCompanySummary = useMemo(
    () => computeTimesheetCompanySummary(timesheetDepartmentSummaries),
    [timesheetDepartmentSummaries],
  );

  const timesheetMonthPaymentStatus = useMemo(
    () => computeTimesheetMonthPaymentStatus(timesheetCompanySummary, mutations.timesheetPayoutsByEmployee),
    [timesheetCompanySummary, mutations.timesheetPayoutsByEmployee],
  );

  const timesheetPaidDateKeys = useMemo(
    () => computeTimesheetPaidDateKeys(mutations.timesheetPayoutsByEmployee),
    [mutations.timesheetPayoutsByEmployee],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setTimesheetMobilePicker(window.matchMedia("(max-width: 768px)").matches);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (timesheetDepartmentFilter !== "all" && !timesheetDepartmentOptions.includes(timesheetDepartmentFilter)) {
      setTimesheetDepartmentFilter("all");
    }
  }, [timesheetDepartmentFilter, timesheetDepartmentOptions]);

  return {
    timesheetMonth,
    setTimesheetMonth,
    timesheetSearch,
    setTimesheetSearch,
    timesheetDepartmentFilter,
    setTimesheetDepartmentFilter,
    timesheetExpandedEmployeeId,
    setTimesheetExpandedEmployeeId,
    timesheetMobilePicker,
    SHIFT_MARK_OPTIONS,
    SHIFT_MARK_CODES,
    adminShiftPicker,
    setAdminShiftPicker,
    adminShiftHoldTimerRef,
    adminShiftHoldTriggeredRef,
    toHalfHourValue,
    timesheetHalfHourOptions,
    timesheetDays,
    timesheetEmployeesByDepartment,
    timesheetDepartmentOptions,
    timesheetVisibleGroups,
    timesheetDepartmentSummaries,
    timesheetCompanySummary,
    timesheetMonthPaymentStatus,
    timesheetPaidDateKeys,
    getShiftMarkStyle: getAdminShiftMarkStyle,
    getHourlyCellMark: getAdminHourlyCellMark,
  };
}

export type AdminTimesheetViewState = ReturnType<typeof useAdminTimesheetViewState>;
