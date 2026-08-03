import React from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { TapSwitch } from "../../../components/TapSwitch";
import {
  COOPERATION_TYPE_OPTIONS,
  WORK_DAYS_IN_MONTH,
  cooperationTypeLabel,
  isShiftAccrualType,
  normalizeAccrualType,
  type CooperationType,
  type EmployeeDirectoryRow,
} from "../types/adminUsers";
import { departmentOptions } from "../lib/adminEmployeeDirectoryHelpers";
import type { UseAdminEmployeeDirectoryReturn } from "../hooks/useAdminEmployeeDirectory";
import type { AdminEmployeeDirectoryMutations } from "../hooks/useAdminEmployeeDirectoryMutations";

export type AdminEmployeeDirectoryRowProps = {
  emp: EmployeeDirectoryRow;
  employeeDir: UseAdminEmployeeDirectoryReturn;
  mutations: AdminEmployeeDirectoryMutations;
};

export function AdminEmployeeDirectoryRow({ emp, employeeDir, mutations }: AdminEmployeeDirectoryRowProps) {
  const {
    departments: employeeDepartments,
    editingId: employeeDirectoryEditingId,
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
    editCooperationType: employeeDirectoryEditCooperationType,
    setEditCooperationType: setEmployeeDirectoryEditCooperationType,
    editAccrualType: employeeDirectoryEditAccrualType,
    setEditAccrualType: setEmployeeDirectoryEditAccrualType,
    editAccrualRate: employeeDirectoryEditAccrualRate,
    setEditAccrualRate: setEmployeeDirectoryEditAccrualRate,
    editRole: employeeDirectoryEditRole,
    setEditRole: setEmployeeDirectoryEditRole,
    editRateEffectiveFrom: employeeDirectoryEditRateEffectiveFrom,
    setEditRateEffectiveFrom: setEmployeeDirectoryEditRateEffectiveFrom,
    rateHistory: employeeDirectoryRateHistory,
    historyEditingId: employeeDirectoryHistoryEditingId,
    setHistoryEditingId: setEmployeeDirectoryHistoryEditingId,
    historyEditDate: employeeDirectoryHistoryEditDate,
    setHistoryEditDate: setEmployeeDirectoryHistoryEditDate,
    historyEditRate: employeeDirectoryHistoryEditRate,
    setHistoryEditRate: setEmployeeDirectoryHistoryEditRate,
    editMonthlyEstimate: employeeDirectoryEditMonthlyEstimate,
  } = employeeDir;

  const openEditor = () => mutations.openEmployeeEditor(emp);

  return (
                <div
                  key={emp.id}
                  role="button"
                  tabIndex={0}
                  onClick={openEditor}
                  onKeyDown={(e) => {
                    const target = e.target as HTMLElement;
                    const tag = target?.tagName?.toLowerCase();
                    if (tag === "input" || tag === "select" || tag === "textarea" || tag === "button") return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openEditor();
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
                        onToggle={() => void mutations.toggleEmployeeActive(emp)}
                      />
                      <Button
                        type="button"
                        className="filter-button"
                        style={{ padding: "0.35rem" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          void mutations.removeEmployee(emp.id);
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
                              {departmentOptions(employeeDepartments, employeeDirectoryEditDepartments).map((dep) => (
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
                                ))}
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
                            {departmentOptions(employeeDepartments, employeeDirectoryEditDepartment ? [employeeDirectoryEditDepartment] : []).map((dep) => (
                              <option key={dep} value={dep}>{dep}</option>
                            ))}
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
                                              mutations.historySaving
                                              || !Number.isFinite(Number(employeeDirectoryHistoryEditRate))
                                              || Number(employeeDirectoryHistoryEditRate) < 0
                                            }
                                            onClick={() => void mutations.saveRateHistoryEntry(h.id, emp.id, h.effective_from)}
                                          >
                                            {mutations.historySaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "OK"}
                                          </Button>
                                          <Button
                                            type="button"
                                            className="filter-button"
                                            style={{ padding: "0.25rem 0.45rem", fontSize: "0.75rem", minHeight: 28 }}
                                            disabled={mutations.historySaving}
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
                                            disabled={mutations.historySaving}
                                            onClick={() => mutations.beginRateHistoryEdit(h)}
                                          >
                                            <Pencil className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            className="filter-button"
                                            style={{ padding: "0.3rem" }}
                                            title="Удалить"
                                            aria-label="Удалить запись истории ставки"
                                            disabled={mutations.historySaving}
                                            onClick={() => void mutations.removeRateHistoryEntry(h.id, emp.id)}
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
                          disabled={mutations.editSaving || !Number.isFinite(Number(employeeDirectoryEditAccrualRate)) || Number(employeeDirectoryEditAccrualRate) < 0 || (employeeDirectoryEditRole === "department_head" ? (employeeDirectoryEditDepartments.length === 0 || !employeeDirectoryEditPrimaryDepartment) : !employeeDirectoryEditDepartment)}
                          onClick={() => void mutations.saveEmployeeEdit(emp.id)}
                        >
                          {mutations.editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сохранить"}
                        </Button>
                        <Button
                          type="button"
                          className="filter-button"
                          disabled={mutations.editSaving}
                          onClick={() => mutations.closeEmployeeEditor()}
                        >
                          Отмена
                        </Button>
                      </Flex>
                    </div>
                  )}
                </div>
  );
}
