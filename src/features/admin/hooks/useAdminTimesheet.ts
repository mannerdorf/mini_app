import { useState, useEffect } from "react";
import type { UseAdminEmployeeDirectoryReturn } from "./useAdminEmployeeDirectory";
import { useAdminTimesheetMutations } from "./useAdminTimesheetMutations";
import { useAdminTimesheetViewState } from "./useAdminTimesheetViewState";

export type UseAdminTimesheetParams = {
  adminToken: string;
  isSuperAdmin: boolean;
  onLogout?: (reason?: "expired") => void;
  onError: (msg: string | null) => void;
  employeeDir: UseAdminEmployeeDirectoryReturn;
};

function initialTimesheetMonth(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

export function useAdminTimesheet({
  adminToken,
  isSuperAdmin,
  onLogout,
  onError,
  employeeDir,
}: UseAdminTimesheetParams) {
  const [timesheetMonth, setTimesheetMonth] = useState(initialTimesheetMonth);

  const mutations = useAdminTimesheetMutations({
    adminToken,
    isSuperAdmin,
    timesheetMonth,
    onLogout,
    onError,
  });

  const view = useAdminTimesheetViewState({
    employeeDir,
    mutations,
    timesheetMonth,
    setTimesheetMonth,
  });

  useEffect(() => {
    if (isSuperAdmin) employeeDir.fetch(timesheetMonth);
  }, [isSuperAdmin, employeeDir.fetch, timesheetMonth]);

  useEffect(() => {
    mutations.fetchTimesheetEntries();
  }, [mutations.fetchTimesheetEntries]);

  return {
    ...view,
    ...mutations,
  };
}

export type AdminTimesheetState = ReturnType<typeof useAdminTimesheet>;
