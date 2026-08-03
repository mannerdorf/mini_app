import { Button, Flex, Input, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import {
  COOPERATION_TYPE_OPTIONS,
  WORK_DAYS_IN_MONTH,
  normalizeAccrualType,
  type CooperationType,
} from "../types/adminUsers";
import { departmentOptions } from "../lib/adminEmployeeDirectoryHelpers";
import type { UseAdminEmployeeDirectoryReturn } from "../hooks/useAdminEmployeeDirectory";
import type { AdminEmployeeDirectoryMutations } from "../hooks/useAdminEmployeeDirectoryMutations";

export type AdminEmployeeAddFormPanelProps = {
  employeeDir: UseAdminEmployeeDirectoryReturn;
  mutations: AdminEmployeeDirectoryMutations;
};

export function AdminEmployeeAddFormPanel({ employeeDir, mutations }: AdminEmployeeAddFormPanelProps) {
  const {
    departments: employeeDepartments,
    email: employeeDirectoryEmail,
    setEmail: setEmployeeDirectoryEmail,
    fullName: employeeDirectoryFullName,
    setFullName: setEmployeeDirectoryFullName,
    department: employeeDirectoryDepartment,
    setDepartment: setEmployeeDirectoryDepartment,
    departmentList: employeeDirectoryDepartments,
    setDepartmentList: setEmployeeDirectoryDepartments,
    primaryDepartment: employeeDirectoryPrimaryDepartment,
    setPrimaryDepartment: setEmployeeDirectoryPrimaryDepartment,
    position: employeeDirectoryPosition,
    setPosition: setEmployeeDirectoryPosition,
    accrualType: employeeDirectoryAccrualType,
    setAccrualType: setEmployeeDirectoryAccrualType,
    accrualRate: employeeDirectoryAccrualRate,
    setAccrualRate: setEmployeeDirectoryAccrualRate,
    cooperationType: employeeDirectoryCooperationType,
    setCooperationType: setEmployeeDirectoryCooperationType,
    role: employeeDirectoryRole,
    setRole: setEmployeeDirectoryRole,
    monthlyEstimate: employeeDirectoryMonthlyEstimate,
  } = employeeDir;

  const departmentChoices = departmentOptions(employeeDepartments);
  const canSave =
    !mutations.saving
    && employeeDirectoryFullName.trim()
    && Number.isFinite(Number(employeeDirectoryAccrualRate))
    && Number(employeeDirectoryAccrualRate) >= 0
    && (employeeDirectoryRole === "department_head"
      ? employeeDirectoryDepartments.length > 0 && !!employeeDirectoryPrimaryDepartment
      : !!employeeDirectoryDepartment);

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <input
          type="email"
          className="admin-form-input"
          value={employeeDirectoryEmail}
          placeholder="Email сотрудника (необязательно)"
          onChange={(e) => setEmployeeDirectoryEmail(e.target.value)}
          style={{ width: "100%" }}
          autoComplete="off"
        />
        <Input
          type="text"
          className="admin-form-input"
          value={employeeDirectoryFullName}
          placeholder="ФИО"
          onChange={(e) => setEmployeeDirectoryFullName(e.target.value)}
        />
        {employeeDirectoryRole === "department_head" ? (
          <div style={{ minWidth: 180 }}>
            <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.25rem" }}>Подразделения (можно несколько)</label>
            <div style={{ maxHeight: 120, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.35rem", background: "var(--color-bg-card)" }}>
              {departmentChoices.map((dep) => (
                <label key={dep} style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.2rem 0", cursor: "pointer", fontSize: "0.85rem" }}>
                  <input
                    type="checkbox"
                    checked={employeeDirectoryDepartments.includes(dep)}
                    onChange={(e) => {
                      setEmployeeDirectoryDepartments((prev) => {
                        const next = e.target.checked ? [...prev, dep] : prev.filter((d) => d !== dep);
                        if (e.target.checked && !employeeDirectoryPrimaryDepartment) {
                          setEmployeeDirectoryPrimaryDepartment(dep);
                        }
                        if (!e.target.checked && employeeDirectoryPrimaryDepartment === dep) {
                          setEmployeeDirectoryPrimaryDepartment(next[0] || "");
                        }
                        return next;
                      });
                    }}
                  />
                  {dep}
                </label>
              ))}
            </div>
            <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", display: "block", marginTop: "0.35rem", marginBottom: "0.2rem" }}>Основное подразделение</label>
            <select
              className="admin-form-input"
              value={employeeDirectoryPrimaryDepartment}
              onChange={(e) => setEmployeeDirectoryPrimaryDepartment(e.target.value)}
              style={{ padding: "0 0.5rem", width: "100%" }}
              disabled={employeeDirectoryDepartments.length === 0}
            >
              <option value="">Выберите</option>
              {employeeDirectoryDepartments.map((dep) => (
                <option key={`primary-${dep}`} value={dep}>{dep}</option>
              ))}
            </select>
          </div>
        ) : (
          <select
            className="admin-form-input"
            value={employeeDirectoryDepartment}
            onChange={(e) => setEmployeeDirectoryDepartment(e.target.value)}
            style={{ padding: "0 0.5rem" }}
            disabled={departmentChoices.length === 0}
          >
            {departmentChoices.map((dep) => (
              <option key={dep} value={dep}>{dep}</option>
            ))}
          </select>
        )}
        <Input
          type="text"
          className="admin-form-input"
          value={employeeDirectoryPosition}
          placeholder="Должность"
          onChange={(e) => setEmployeeDirectoryPosition(e.target.value)}
        />
        <select
          className="admin-form-input"
          value={employeeDirectoryCooperationType}
          onChange={(e) => setEmployeeDirectoryCooperationType(e.target.value as CooperationType)}
          style={{ padding: "0 0.5rem" }}
        >
          {COOPERATION_TYPE_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
        <select
          className="admin-form-input"
          value={employeeDirectoryAccrualType}
          onChange={(e) => setEmployeeDirectoryAccrualType(normalizeAccrualType(e.target.value))}
          style={{ padding: "0 0.5rem" }}
        >
          <option value="hour">Начисление по часам</option>
          <option value="shift">Начисление по сменам</option>
          <option value="month">Начисление за месяц (21 раб. дн.)</option>
        </select>
        <input
          type="number"
          min={0}
          step={0.01}
          className="admin-form-input"
          value={employeeDirectoryAccrualRate}
          placeholder={employeeDirectoryAccrualType === "month" ? "Ставка за месяц" : (employeeDirectoryAccrualType === "shift" ? "Ставка за смену" : "Ставка за час")}
          onChange={(e) => setEmployeeDirectoryAccrualRate(e.target.value)}
          style={{ width: "100%" }}
        />
        <select
          className="admin-form-input"
          value={employeeDirectoryRole}
          onChange={(e) => {
            const v = e.target.value as "employee" | "department_head";
            setEmployeeDirectoryRole(v);
            if (v === "department_head" && employeeDirectoryDepartments.length === 0 && employeeDirectoryDepartment) {
              setEmployeeDirectoryDepartments([employeeDirectoryDepartment]);
              setEmployeeDirectoryPrimaryDepartment(employeeDirectoryDepartment);
            } else if (v === "department_head" && employeeDirectoryDepartments.length > 0 && !employeeDirectoryPrimaryDepartment) {
              setEmployeeDirectoryPrimaryDepartment(employeeDirectoryDepartments[0] || "");
            }
            if (v === "employee" && employeeDirectoryDepartments.length > 0) {
              setEmployeeDirectoryDepartment(employeeDirectoryDepartments[0] || "");
            }
          }}
          style={{ padding: "0 0.5rem" }}
        >
          <option value="employee">Сотрудник</option>
          <option value="department_head">Руководитель подразделения</option>
        </select>
      </div>
      <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)", marginTop: "-0.25rem", marginBottom: "0.55rem" }}>
        За {employeeDirectoryAccrualType === "month" ? "месяц" : (employeeDirectoryAccrualType === "shift" ? "смену" : "час")}: {Number(employeeDirectoryAccrualRate || 0).toLocaleString("ru-RU")} ₽ ·
        За месяц ({WORK_DAYS_IN_MONTH} раб. дн.): {Math.round(employeeDirectoryMonthlyEstimate).toLocaleString("ru-RU")} ₽
      </Typography.Body>
      <Flex align="center" gap="0.6rem" wrap="wrap" style={{ marginBottom: "0.9rem" }}>
        <Button type="button" className="button-primary" disabled={!canSave} onClick={() => void mutations.createEmployee()}>
          {mutations.saving ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.35rem" }} /> : null}
          Сохранить атрибуты
        </Button>
      </Flex>
    </>
  );
}
