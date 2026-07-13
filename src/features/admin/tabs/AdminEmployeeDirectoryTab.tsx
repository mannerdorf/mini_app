import React from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { TapSwitch } from "../../../components/TapSwitch";
import {
  createAdminEmployee,
  deleteAdminEmployee,
  deleteAdminEmployeeRateHistory,
  patchAdminEmployee,
  patchAdminEmployeeRateHistory,
} from "../../../api/client/admin/employees";
import {
  COOPERATION_TYPE_OPTIONS,
  EMPLOYEE_DEPARTMENTS_FALLBACK,
  WORK_DAYS_IN_MONTH,
  cooperationTypeLabel,
  isShiftAccrualType,
  normalizeAccrualType,
  normalizeCooperationType,
  todayIsoDateMoscow,
  type CooperationType,
} from "../types/adminUsers";
import type { UseAdminEmployeeDirectoryReturn } from "../hooks/useAdminEmployeeDirectory";

type AdminEmployeeDirectoryTabProps = {
  adminToken: string;
  onError: (msg: string | null) => void;
  employeeDir: UseAdminEmployeeDirectoryReturn;
};

export function AdminEmployeeDirectoryTab({ adminToken, onError, employeeDir }: AdminEmployeeDirectoryTabProps) {
  const {
    items: employeeDirectoryItems,
    setItems: setEmployeeDirectoryItems,
    loading: employeeDirectoryLoading,
    departments: employeeDepartments,
    fetch: fetchEmployeeDirectory,
    loadRateHistory: loadEmployeeRateHistory,
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
    saving: employeeDirectorySaving,
    setSaving: setEmployeeDirectorySaving,
    editingId: employeeDirectoryEditingId,
    setEditingId: setEmployeeDirectoryEditingId,
    editFullName: employeeDirectoryEditFullName,
    setEditFullName: setEmployeeDirectoryEditFullName,
    editDepartment: employeeDirectoryEditDepartment,
    setEditDepartment: setEmployeeDirectoryEditDepartment,
    editDepartments: employeeDirectoryEditDepartments,
    setEditDepartments: setEmployeeDirectoryEditDepartments,
    editPrimaryDepartment: employeeDirectoryEditPrimaryDepartment,
    setEditPrimaryDepartment: setEmployeeDirectoryEditPrimaryDepartment,
    editPosition: employeeDirectoryEditPosition,
    setEditPosition: setEmployeeDirectoryEditPosition,
    editAccrualType: employeeDirectoryEditAccrualType,
    setEditAccrualType: setEmployeeDirectoryEditAccrualType,
    editAccrualRate: employeeDirectoryEditAccrualRate,
    setEditAccrualRate: setEmployeeDirectoryEditAccrualRate,
    editCooperationType: employeeDirectoryEditCooperationType,
    setEditCooperationType: setEmployeeDirectoryEditCooperationType,
    editRole: employeeDirectoryEditRole,
    setEditRole: setEmployeeDirectoryEditRole,
    editRateEffectiveFrom: employeeDirectoryEditRateEffectiveFrom,
    setEditRateEffectiveFrom: setEmployeeDirectoryEditRateEffectiveFrom,
    rateHistory: employeeDirectoryRateHistory,
    setRateHistory: setEmployeeDirectoryRateHistory,
    historyEditingId: employeeDirectoryHistoryEditingId,
    setHistoryEditingId: setEmployeeDirectoryHistoryEditingId,
    historyEditDate: employeeDirectoryHistoryEditDate,
    setHistoryEditDate: setEmployeeDirectoryHistoryEditDate,
    historyEditRate: employeeDirectoryHistoryEditRate,
    setHistoryEditRate: setEmployeeDirectoryHistoryEditRate,
    historySaving: employeeDirectoryHistorySaving,
    setHistorySaving: setEmployeeDirectoryHistorySaving,
    editSaving: employeeDirectoryEditSaving,
    setEditSaving: setEmployeeDirectoryEditSaving,
    monthlyEstimate: employeeDirectoryMonthlyEstimate,
    editMonthlyEstimate: employeeDirectoryEditMonthlyEstimate,
  } = employeeDir;

  return (
        <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Справочник сотрудников HAULZ</Typography.Body>
          <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "0.9rem" }}>
            Назначение атрибутов сотруднику (email опционален): ФИО, структурное подразделение, должность, тип сотрудничества и роль.
          </Typography.Body>

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
                  {(employeeDepartments.length ? employeeDepartments : EMPLOYEE_DEPARTMENTS_FALLBACK).map((dep) => (
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
                disabled={(employeeDepartments.length ? employeeDepartments : EMPLOYEE_DEPARTMENTS_FALLBACK).length === 0}
              >
                {(employeeDepartments.length ? employeeDepartments : EMPLOYEE_DEPARTMENTS_FALLBACK).map((dep) => (
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
            <Button
              type="button"
              className="button-primary"
              disabled={employeeDirectorySaving || !employeeDirectoryFullName.trim() || !Number.isFinite(Number(employeeDirectoryAccrualRate)) || Number(employeeDirectoryAccrualRate) < 0 || (employeeDirectoryRole === "department_head" ? (employeeDirectoryDepartments.length === 0 || !employeeDirectoryPrimaryDepartment) : !employeeDirectoryDepartment)}
              onClick={async () => {
                setEmployeeDirectorySaving(true);
                setError(null);
                try {
                  const departmentValue = employeeDirectoryRole === "department_head"
                    ? [employeeDirectoryPrimaryDepartment, ...employeeDirectoryDepartments.filter((d) => d !== employeeDirectoryPrimaryDepartment)].join(", ")
                    : employeeDirectoryDepartment;
                  await createAdminEmployee(adminToken, {
                    email: employeeDirectoryEmail.trim() ? employeeDirectoryEmail.trim().toLowerCase() : "",
                    full_name: employeeDirectoryFullName.trim(),
                    department: departmentValue,
                    position: employeeDirectoryPosition.trim(),
                    cooperation_type: employeeDirectoryCooperationType,
                    accrual_type: employeeDirectoryAccrualType,
                    accrual_rate: Number(employeeDirectoryAccrualRate),
                    employee_role: employeeDirectoryRole,
                  });
                  setEmployeeDirectoryEmail("");
                  setEmployeeDirectoryFullName("");
                  setEmployeeDirectoryDepartment("");
                  setEmployeeDirectoryDepartments([]);
                  setEmployeeDirectoryPrimaryDepartment("");
                  setEmployeeDirectoryPosition("");
                  setEmployeeDirectoryCooperationType("staff");
                  setEmployeeDirectoryAccrualType("hour");
                  setEmployeeDirectoryAccrualRate("0");
                  await fetchEmployeeDirectory();
                } catch (e: unknown) {
                  setError((e as Error)?.message || "Ошибка сохранения атрибутов сотрудника");
                } finally {
                  setEmployeeDirectorySaving(false);
                }
              }}
            >
              {employeeDirectorySaving ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.35rem" }} /> : null}
              Сохранить атрибуты
            </Button>
          </Flex>

          {employeeDirectoryLoading ? (
            <Flex align="center" gap="0.5rem">
              <Loader2 className="w-4 h-4 animate-spin" />
              <Typography.Body>Загрузка...</Typography.Body>
            </Flex>
          ) : employeeDirectoryItems.length === 0 ? (
            <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>Сотрудники пока не заведены.</Typography.Body>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
              {employeeDirectoryItems.map((emp) => (
                <div
                  key={emp.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setEmployeeDirectoryEditingId(emp.id);
                    setEmployeeDirectoryEditFullName(emp.full_name || "");
                    const depStr = emp.department || (employeeDepartments[0] ?? EMPLOYEE_DEPARTMENTS_FALLBACK[0] ?? "");
                    setEmployeeDirectoryEditDepartment(depStr);
                    const depList = depStr ? depStr.split(",").map((d) => d.trim()).filter(Boolean) : [];
                    setEmployeeDirectoryEditDepartments(depList);
                    setEmployeeDirectoryEditPrimaryDepartment(depList[0] || "");
                    setEmployeeDirectoryEditPosition(emp.position || "");
                    setEmployeeDirectoryEditCooperationType(normalizeCooperationType(emp.cooperation_type || "staff"));
                    setEmployeeDirectoryEditAccrualType(normalizeAccrualType(emp.accrual_type));
                    setEmployeeDirectoryEditAccrualRate(String(emp.accrual_rate ?? 0));
                    setEmployeeDirectoryEditRateEffectiveFrom(todayIsoDateMoscow());
                    setEmployeeDirectoryHistoryEditingId(null);
                    void loadEmployeeRateHistory(emp.id);
                    setEmployeeDirectoryEditRole(emp.employee_role === "department_head" ? "department_head" : "employee");
                  }}
                  onKeyDown={(e) => {
                    const target = e.target as HTMLElement;
                    const tag = target?.tagName?.toLowerCase();
                    if (tag === "input" || tag === "select" || tag === "textarea" || tag === "button") return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setEmployeeDirectoryEditingId(emp.id);
                      setEmployeeDirectoryEditFullName(emp.full_name || "");
                      const depStr = emp.department || (employeeDepartments[0] ?? EMPLOYEE_DEPARTMENTS_FALLBACK[0] ?? "");
                      setEmployeeDirectoryEditDepartment(depStr);
                      const depList = depStr ? depStr.split(",").map((d) => d.trim()).filter(Boolean) : [];
                      setEmployeeDirectoryEditDepartments(depList);
                      setEmployeeDirectoryEditPrimaryDepartment(depList[0] || "");
                      setEmployeeDirectoryEditPosition(emp.position || "");
                      setEmployeeDirectoryEditCooperationType(normalizeCooperationType(emp.cooperation_type || "staff"));
                      setEmployeeDirectoryEditAccrualType(normalizeAccrualType(emp.accrual_type));
                      setEmployeeDirectoryEditAccrualRate(String(emp.accrual_rate ?? 0));
                      setEmployeeDirectoryEditRateEffectiveFrom(todayIsoDateMoscow());
                      setEmployeeDirectoryHistoryEditingId(null);
                      void loadEmployeeRateHistory(emp.id);
                      setEmployeeDirectoryEditRole(emp.employee_role === "department_head" ? "department_head" : "employee");
                    }
                  }}
                  style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.6rem 0.7rem", background: "var(--color-bg-hover)", cursor: "pointer" }}
                  aria-label={`Редактировать сотрудника ${emp.full_name || emp.login}`}
                >
                  <Flex align="center" justify="space-between" wrap="wrap" gap="0.5rem">
                    <div>
                      <Typography.Body style={{ fontWeight: 600 }}>{emp.full_name || emp.login}</Typography.Body>
                      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                        Подразделение: {emp.department || "—"} · Должность: {emp.position || "—"} · Тип сотрудничества: {cooperationTypeLabel(emp.cooperation_type)} · Начисление: {normalizeAccrualType(emp.accrual_type) === "month" ? "Месяц" : (isShiftAccrualType(emp.accrual_type) ? "Смена" : "Часы")} · Ставка: {emp.accrual_rate ?? 0} · Роль: {emp.employee_role === "department_head" ? "Руководитель подразделения" : "Сотрудник"} · Логин: {emp.login}
                      </Typography.Body>
                    </div>
                    <Flex align="center" gap="0.45rem" onClick={(e) => e.stopPropagation()}>
                      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>{emp.active ? "Вкл" : "Выкл"}</Typography.Body>
                      <TapSwitch
                        checked={emp.active}
                        onToggle={async () => {
                          try {
                            await patchAdminEmployee(adminToken, emp.id, { active: !emp.active });
                            setEmployeeDirectoryItems((prev) => prev.map((x) => (x.id === emp.id ? { ...x, active: !x.active } : x)));
                          } catch (e: unknown) {
                            setError((e as Error)?.message || "Ошибка обновления");
                          }
                        }}
                      />
                      <Button
                        type="button"
                        className="filter-button"
                        style={{ padding: "0.35rem" }}
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await deleteAdminEmployee(adminToken, emp.id);
                            setEmployeeDirectoryItems((prev) => prev.filter((x) => x.id !== emp.id));
                          } catch (e: unknown) {
                            setError((e as Error)?.message || "Ошибка удаления");
                          }
                        }}
                        aria-label="Удалить сотрудника"
                      >
                        <Trash2 className="w-4 h-4" style={{ color: "var(--color-error)" }} />
                      </Button>
                    </Flex>
                  </Flex>
                  {employeeDirectoryEditingId === emp.id && (
                    <div style={{ marginTop: "0.65rem", borderTop: "1px dashed var(--color-border)", paddingTop: "0.65rem" }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.5rem" }}>
                        <input
                          type="text"
                          className="admin-form-input"
                          value={employeeDirectoryEditFullName}
                          placeholder="ФИО"
                          onChange={(e) => setEmployeeDirectoryEditFullName(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: "100%" }}
                          autoComplete="off"
                        />
                        {employeeDirectoryEditRole === "department_head" ? (
                          <div style={{ minWidth: 180 }}>
                            <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.25rem" }}>Подразделения (можно несколько)</label>
                            <div style={{ maxHeight: 120, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.35rem", background: "var(--color-bg-card)" }}>
                              {(() => {
                                const base = employeeDepartments.length ? employeeDepartments : EMPLOYEE_DEPARTMENTS_FALLBACK;
                                const opts = [...new Set([...base, ...employeeDirectoryEditDepartments])].sort((a, b) => a.localeCompare(b, "ru"));
                                return opts.map((dep) => (
                                  <label key={dep} style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.2rem 0", cursor: "pointer", fontSize: "0.85rem" }}>
                                    <input
                                      type="checkbox"
                                      checked={employeeDirectoryEditDepartments.includes(dep)}
                                      onChange={(e) => {
                                        setEmployeeDirectoryEditDepartments((prev) => {
                                          const next = e.target.checked ? [...prev, dep] : prev.filter((d) => d !== dep);
                                          if (e.target.checked && !employeeDirectoryEditPrimaryDepartment) {
                                            setEmployeeDirectoryEditPrimaryDepartment(dep);
                                          }
                                          if (!e.target.checked && employeeDirectoryEditPrimaryDepartment === dep) {
                                            setEmployeeDirectoryEditPrimaryDepartment(next[0] || "");
                                          }
                                          return next;
                                        });
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    {dep}
                                  </label>
                                ));
                              })()}
                            </div>
                            <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", display: "block", marginTop: "0.35rem", marginBottom: "0.2rem" }}>Основное подразделение</label>
                            <select
                              className="admin-form-input"
                              value={employeeDirectoryEditPrimaryDepartment}
                              onChange={(e) => setEmployeeDirectoryEditPrimaryDepartment(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ padding: "0 0.5rem", width: "100%" }}
                              disabled={employeeDirectoryEditDepartments.length === 0}
                            >
                              <option value="">Выберите</option>
                              {employeeDirectoryEditDepartments.map((dep) => (
                                <option key={`edit-primary-${dep}`} value={dep}>{dep}</option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <select
                            className="admin-form-input"
                            value={employeeDirectoryEditDepartment}
                            onChange={(e) => setEmployeeDirectoryEditDepartment(e.target.value)}
                            style={{ padding: "0 0.5rem" }}
                          >
                            {(() => {
                              const base = employeeDepartments.length ? employeeDepartments : EMPLOYEE_DEPARTMENTS_FALLBACK;
                              const opts = [...base];
                              if (employeeDirectoryEditDepartment && !opts.includes(employeeDirectoryEditDepartment)) opts.unshift(employeeDirectoryEditDepartment);
                              return opts.map((dep) => <option key={dep} value={dep}>{dep}</option>);
                            })()}
                          </select>
                        )}
                        <input
                          type="text"
                          className="admin-form-input"
                          value={employeeDirectoryEditPosition}
                          placeholder="Должность"
                          onChange={(e) => setEmployeeDirectoryEditPosition(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: "100%" }}
                          autoComplete="off"
                        />
                        <select
                          className="admin-form-input"
                          value={employeeDirectoryEditCooperationType}
                          onChange={(e) => setEmployeeDirectoryEditCooperationType(e.target.value as CooperationType)}
                          style={{ padding: "0 0.5rem" }}
                        >
                          {COOPERATION_TYPE_OPTIONS.map((item) => (
                            <option key={item.value} value={item.value}>{item.label}</option>
                          ))}
                        </select>
                        <select
                          className="admin-form-input"
                          value={employeeDirectoryEditAccrualType}
                          onChange={(e) => setEmployeeDirectoryEditAccrualType(normalizeAccrualType(e.target.value))}
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
                          value={employeeDirectoryEditAccrualRate}
                          placeholder={employeeDirectoryEditAccrualType === "month" ? "Ставка за месяц" : (employeeDirectoryEditAccrualType === "shift" ? "Ставка за смену" : "Ставка за час")}
                          onChange={(e) => setEmployeeDirectoryEditAccrualRate(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: "100%" }}
                          autoComplete="off"
                        />
                        <div style={{ minWidth: 160 }}>
                          <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.25rem" }}>Ставка с даты</label>
                          <input
                            type="date"
                            className="admin-form-input"
                            value={employeeDirectoryEditRateEffectiveFrom}
                            onChange={(e) => setEmployeeDirectoryEditRateEffectiveFrom(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: "100%" }}
                          />
                        </div>
                        <select
                          className="admin-form-input"
                          value={employeeDirectoryEditRole}
                          onChange={(e) => {
                            const v = e.target.value as "employee" | "department_head";
                            setEmployeeDirectoryEditRole(v);
                            if (v === "department_head" && employeeDirectoryEditDepartments.length === 0 && employeeDirectoryEditDepartment) {
                              setEmployeeDirectoryEditDepartments([employeeDirectoryEditDepartment]);
                              setEmployeeDirectoryEditPrimaryDepartment(employeeDirectoryEditDepartment);
                            } else if (v === "department_head" && employeeDirectoryEditDepartments.length > 0 && !employeeDirectoryEditPrimaryDepartment) {
                              setEmployeeDirectoryEditPrimaryDepartment(employeeDirectoryEditDepartments[0] || "");
                            }
                            if (v === "employee" && employeeDirectoryEditDepartments.length > 0) {
                              setEmployeeDirectoryEditDepartment(employeeDirectoryEditDepartments[0] || "");
                            }
                          }}
                          style={{ padding: "0 0.5rem" }}
                        >
                          <option value="employee">Сотрудник</option>
                          <option value="department_head">Руководитель подразделения</option>
                        </select>
                      </div>
                      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "0.35rem" }}>
                        За {employeeDirectoryEditAccrualType === "month" ? "месяц" : (employeeDirectoryEditAccrualType === "shift" ? "смену" : "час")}: {Number(employeeDirectoryEditAccrualRate || 0).toLocaleString("ru-RU")} ₽ ·
                        За месяц ({WORK_DAYS_IN_MONTH} раб. дн.): {Math.round(employeeDirectoryEditMonthlyEstimate).toLocaleString("ru-RU")} ₽
                      </Typography.Body>
                      {employeeDirectoryRateHistory.length > 0 ? (
                        <div style={{ marginTop: "0.5rem", overflowX: "auto" }} onClick={(e) => e.stopPropagation()}>
                          <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>История ставок</Typography.Body>
                          <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                                <th style={{ padding: "0.25rem 0.35rem" }}>С даты</th>
                                <th style={{ padding: "0.25rem 0.35rem" }}>Ставка</th>
                                <th style={{ padding: "0.25rem 0.35rem", width: 100 }}> </th>
                              </tr>
                            </thead>
                            <tbody>
                              {employeeDirectoryRateHistory.map((h) => (
                                <tr key={h.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                                  <td style={{ padding: "0.25rem 0.35rem", verticalAlign: "middle" }}>
                                    {employeeDirectoryHistoryEditingId === h.id ? (
                                      <input
                                        type="date"
                                        className="admin-form-input"
                                        value={employeeDirectoryHistoryEditDate}
                                        onChange={(e) => setEmployeeDirectoryHistoryEditDate(e.target.value)}
                                        style={{ width: "100%", maxWidth: 160 }}
                                      />
                                    ) : (
                                      h.effective_from
                                    )}
                                  </td>
                                  <td style={{ padding: "0.25rem 0.35rem", verticalAlign: "middle" }}>
                                    {employeeDirectoryHistoryEditingId === h.id ? (
                                      <input
                                        type="number"
                                        min={0}
                                        step={0.01}
                                        className="admin-form-input"
                                        value={employeeDirectoryHistoryEditRate}
                                        onChange={(e) => setEmployeeDirectoryHistoryEditRate(e.target.value)}
                                        style={{ width: "100%", maxWidth: 140 }}
                                      />
                                    ) : (
                                      `${Number(h.accrual_rate).toLocaleString("ru-RU")} ₽`
                                    )}
                                  </td>
                                  <td style={{ padding: "0.25rem 0.35rem", verticalAlign: "middle" }}>
                                    <Flex align="center" gap="0.25rem" wrap="wrap">
                                      {employeeDirectoryHistoryEditingId === h.id ? (
                                        <>
                                          <Button
                                            type="button"
                                            className="button-primary"
                                            style={{ padding: "0.25rem 0.45rem", fontSize: "0.75rem", minHeight: 28 }}
                                            disabled={
                                              employeeDirectoryHistorySaving
                                              || !Number.isFinite(Number(employeeDirectoryHistoryEditRate))
                                              || Number(employeeDirectoryHistoryEditRate) < 0
                                            }
                                            onClick={async () => {
                                              setEmployeeDirectoryHistorySaving(true);
                                              setError(null);
                                              try {
                                                const data = await patchAdminEmployeeRateHistory(adminToken, h.id, {
                                                  accrual_rate: Number(employeeDirectoryHistoryEditRate),
                                                  effective_from: employeeDirectoryHistoryEditDate || h.effective_from,
                                                });
                                                setEmployeeDirectoryHistoryEditingId(null);
                                                void loadEmployeeRateHistory(emp.id);
                                                if (Number.isFinite(data?.accrual_rate)) {
                                                  const nr = Number(data.accrual_rate);
                                                  setEmployeeDirectoryItems((prev) =>
                                                    prev.map((x) => (x.id === emp.id ? { ...x, accrual_rate: nr } : x))
                                                  );
                                                  setEmployeeDirectoryEditAccrualRate(String(nr));
                                                }
                                              } catch (e: unknown) {
                                                setError((e as Error)?.message || "Ошибка сохранения записи истории");
                                              } finally {
                                                setEmployeeDirectoryHistorySaving(false);
                                              }
                                            }}
                                          >
                                            {employeeDirectoryHistorySaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "OK"}
                                          </Button>
                                          <Button
                                            type="button"
                                            className="filter-button"
                                            style={{ padding: "0.25rem 0.45rem", fontSize: "0.75rem", minHeight: 28 }}
                                            disabled={employeeDirectoryHistorySaving}
                                            onClick={() => setEmployeeDirectoryHistoryEditingId(null)}
                                          >
                                            Отмена
                                          </Button>
                                        </>
                                      ) : (
                                        <>
                                          <button
                                            type="button"
                                            className="filter-button"
                                            style={{ padding: "0.3rem" }}
                                            title="Изменить"
                                            aria-label="Изменить запись истории ставки"
                                            disabled={employeeDirectoryHistorySaving}
                                            onClick={() => {
                                              setEmployeeDirectoryHistoryEditingId(h.id);
                                              setEmployeeDirectoryHistoryEditDate(h.effective_from);
                                              setEmployeeDirectoryHistoryEditRate(String(h.accrual_rate));
                                            }}
                                          >
                                            <Pencil className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            className="filter-button"
                                            style={{ padding: "0.3rem" }}
                                            title="Удалить"
                                            aria-label="Удалить запись истории ставки"
                                            disabled={employeeDirectoryHistorySaving}
                                            onClick={async () => {
                                              if (!window.confirm("Удалить эту запись из истории ставок?")) return;
                                              setEmployeeDirectoryHistorySaving(true);
                                              setError(null);
                                              try {
                                                const data = await deleteAdminEmployeeRateHistory(adminToken, h.id, emp.id);
                                                if (employeeDirectoryHistoryEditingId === h.id) setEmployeeDirectoryHistoryEditingId(null);
                                                void loadEmployeeRateHistory(emp.id);
                                                if (Number.isFinite(data?.accrual_rate)) {
                                                  const nr = Number(data.accrual_rate);
                                                  setEmployeeDirectoryItems((prev) =>
                                                    prev.map((x) => (x.id === emp.id ? { ...x, accrual_rate: nr } : x))
                                                  );
                                                  setEmployeeDirectoryEditAccrualRate(String(nr));
                                                }
                                              } catch (e: unknown) {
                                                setError((e as Error)?.message || "Ошибка удаления записи истории");
                                              } finally {
                                                setEmployeeDirectoryHistorySaving(false);
                                              }
                                            }}
                                          >
                                            <Trash2 className="w-3.5 h-3.5" style={{ color: "var(--color-error)" }} />
                                          </button>
                                        </>
                                      )}
                                    </Flex>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                      <Flex align="center" gap="0.5rem" style={{ marginTop: "0.55rem" }}>
                        <Button
                          type="button"
                          className="button-primary"
                          disabled={employeeDirectoryEditSaving || !Number.isFinite(Number(employeeDirectoryEditAccrualRate)) || Number(employeeDirectoryEditAccrualRate) < 0 || (employeeDirectoryEditRole === "department_head" ? (employeeDirectoryEditDepartments.length === 0 || !employeeDirectoryEditPrimaryDepartment) : !employeeDirectoryEditDepartment)}
                          onClick={async () => {
                            setEmployeeDirectoryEditSaving(true);
                            setError(null);
                            try {
                              const departmentValue = employeeDirectoryEditRole === "department_head"
                                ? [employeeDirectoryEditPrimaryDepartment, ...employeeDirectoryEditDepartments.filter((d) => d !== employeeDirectoryEditPrimaryDepartment)].join(", ")
                                : employeeDirectoryEditDepartment;
                              const data = await patchAdminEmployee(adminToken, emp.id, {
                                full_name: employeeDirectoryEditFullName.trim(),
                                department: departmentValue,
                                position: employeeDirectoryEditPosition.trim(),
                                cooperation_type: employeeDirectoryEditCooperationType,
                                accrual_type: employeeDirectoryEditAccrualType,
                                accrual_rate: Number(employeeDirectoryEditAccrualRate),
                                accrual_rate_effective_from: employeeDirectoryEditRateEffectiveFrom || todayIsoDateMoscow(),
                                employee_role: employeeDirectoryEditRole,
                              });
                              const savedRate =
                                typeof data?.accrual_rate === "number" && Number.isFinite(data.accrual_rate)
                                  ? data.accrual_rate
                                  : Number(employeeDirectoryEditAccrualRate);
                              setEmployeeDirectoryItems((prev) =>
                                prev.map((x) =>
                                  x.id === emp.id
                                    ? {
                                        ...x,
                                        full_name: employeeDirectoryEditFullName.trim(),
                                        department: employeeDirectoryEditRole === "department_head"
                                          ? [employeeDirectoryEditPrimaryDepartment, ...employeeDirectoryEditDepartments.filter((d) => d !== employeeDirectoryEditPrimaryDepartment)].join(", ")
                                          : employeeDirectoryEditDepartment,
                                        position: employeeDirectoryEditPosition.trim(),
                                        cooperation_type: employeeDirectoryEditCooperationType,
                                        accrual_type: employeeDirectoryEditAccrualType,
                                        accrual_rate: savedRate,
                                        employee_role: employeeDirectoryEditRole,
                                      }
                                    : x
                                )
                              );
                              setEmployeeDirectoryEditingId(null);
                              setEmployeeDirectoryRateHistory([]);
                            } catch (e: unknown) {
                              setError((e as Error)?.message || "Ошибка сохранения атрибутов");
                            } finally {
                              setEmployeeDirectoryEditSaving(false);
                            }
                          }}
                        >
                          {employeeDirectoryEditSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сохранить"}
                        </Button>
                        <Button
                          type="button"
                          className="filter-button"
                          disabled={employeeDirectoryEditSaving}
                          onClick={() => {
                            setEmployeeDirectoryEditingId(null);
                            setEmployeeDirectoryRateHistory([]);
                            setEmployeeDirectoryHistoryEditingId(null);
                          }}
                        >
                          Отмена
                        </Button>
                      </Flex>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>

  );
}
