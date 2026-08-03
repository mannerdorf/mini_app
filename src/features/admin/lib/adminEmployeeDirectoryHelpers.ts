import {
  EMPLOYEE_DEPARTMENTS_FALLBACK,
  normalizeAccrualType,
  normalizeCooperationType,
  todayIsoDateMoscow,
  type AccrualType,
  type CooperationType,
  type EmployeeDirectoryRow,
} from "../types/adminUsers";

export function formatEmployeeDepartment(
  role: "employee" | "department_head",
  primaryDepartment: string,
  departmentList: string[],
  singleDepartment: string,
): string {
  if (role === "department_head") {
    return [primaryDepartment, ...departmentList.filter((d) => d !== primaryDepartment)].join(", ");
  }
  return singleDepartment;
}

export function departmentOptions(
  employeeDepartments: string[],
  extra: string[] = [],
): string[] {
  const base = employeeDepartments.length ? employeeDepartments : EMPLOYEE_DEPARTMENTS_FALLBACK;
  return [...new Set([...base, ...extra])].sort((a, b) => a.localeCompare(b, "ru"));
}

export function parseEmployeeDepartments(
  emp: EmployeeDirectoryRow,
  employeeDepartments: string[],
): { department: string; list: string[]; primary: string } {
  const fallback = employeeDepartments[0] ?? EMPLOYEE_DEPARTMENTS_FALLBACK[0] ?? "";
  const department = emp.department || fallback;
  const list = department ? department.split(",").map((d) => d.trim()).filter(Boolean) : [];
  return { department, list, primary: list[0] || "" };
}

export function fillEmployeeEditFields(
  emp: EmployeeDirectoryRow,
  employeeDepartments: string[],
  setters: {
    setEditingId: (id: number) => void;
    setEditFullName: (v: string) => void;
    setEditDepartment: (v: string) => void;
    setEditDepartments: (v: string[]) => void;
    setEditPrimaryDepartment: (v: string) => void;
    setEditPosition: (v: string) => void;
    setEditCooperationType: (v: CooperationType) => void;
    setEditAccrualType: (v: AccrualType) => void;
    setEditAccrualRate: (v: string) => void;
    setEditRateEffectiveFrom: (v: string) => void;
    setHistoryEditingId: (v: number | null) => void;
    setEditRole: (v: "employee" | "department_head") => void;
  },
) {
  const { department, list, primary } = parseEmployeeDepartments(emp, employeeDepartments);
  setters.setEditingId(emp.id);
  setters.setEditFullName(emp.full_name || "");
  setters.setEditDepartment(department);
  setters.setEditDepartments(list);
  setters.setEditPrimaryDepartment(primary);
  setters.setEditPosition(emp.position || "");
  setters.setEditCooperationType(normalizeCooperationType(emp.cooperation_type || "staff"));
  setters.setEditAccrualType(normalizeAccrualType(emp.accrual_type));
  setters.setEditAccrualRate(String(emp.accrual_rate ?? 0));
  setters.setEditRateEffectiveFrom(todayIsoDateMoscow());
  setters.setHistoryEditingId(null);
  setters.setEditRole(emp.employee_role === "department_head" ? "department_head" : "employee");
}
