import React from "react";
import { Flex } from "@maxhub/max-ui";
import type { AdminExpenseRequestsState } from "../hooks/useAdminExpenseRequests";

type Props = Pick<
  AdminExpenseRequestsState,
  | "expenseFilterDate"
  | "setExpenseFilterDate"
  | "expenseFilterDepartment"
  | "setExpenseFilterDepartment"
  | "expenseFilterCategory"
  | "setExpenseFilterCategory"
  | "expenseFilterVehicle"
  | "setExpenseFilterVehicle"
  | "expenseFilterEmployee"
  | "setExpenseFilterEmployee"
  | "expenseFilterSupplier"
  | "setExpenseFilterSupplier"
  | "expenseFilterStatus"
  | "setExpenseFilterStatus"
  | "depOptions"
  | "catOptions"
  | "vehicleOptions"
  | "employeeOptions"
  | "supplierOptions"
  | "statusOptions"
  | "statusLabels"
>;

export function AdminExpenseRequestsFiltersBar(props: Props) {
  const {
    expenseFilterDate,
    setExpenseFilterDate,
    expenseFilterDepartment,
    setExpenseFilterDepartment,
    expenseFilterCategory,
    setExpenseFilterCategory,
    expenseFilterVehicle,
    setExpenseFilterVehicle,
    expenseFilterEmployee,
    setExpenseFilterEmployee,
    expenseFilterSupplier,
    setExpenseFilterSupplier,
    expenseFilterStatus,
    setExpenseFilterStatus,
    depOptions,
    catOptions,
    vehicleOptions,
    employeeOptions,
    supplierOptions,
    statusOptions,
    statusLabels,
  } = props;

  return (
    <Flex gap="0.5rem" wrap="wrap" align="center" style={{ marginBottom: "0.75rem" }}>
      <div>
        <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", marginRight: "0.25rem" }}>Дата (период)</label>
        <input type="month" className="admin-form-input" value={expenseFilterDate} onChange={(e) => setExpenseFilterDate(e.target.value)} style={{ padding: "0.3rem 0.5rem", height: 32 }} />
      </div>
      <div>
        <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", marginRight: "0.25rem" }}>Подразделение</label>
        <select className="admin-form-input" value={expenseFilterDepartment} onChange={(e) => setExpenseFilterDepartment(e.target.value)} style={{ padding: "0.3rem 0.5rem", height: 32, minWidth: 140 }}>
          <option value="">Все</option>
          {depOptions.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", marginRight: "0.25rem" }}>Статья</label>
        <select className="admin-form-input" value={expenseFilterCategory} onChange={(e) => setExpenseFilterCategory(e.target.value)} style={{ padding: "0.3rem 0.5rem", height: 32, minWidth: 140 }}>
          <option value="">Все</option>
          {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", marginRight: "0.25rem" }}>ТС</label>
        <select className="admin-form-input" value={expenseFilterVehicle} onChange={(e) => setExpenseFilterVehicle(e.target.value)} style={{ padding: "0.3rem 0.5rem", height: 32, minWidth: 120 }}>
          <option value="">Все</option>
          {vehicleOptions.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", marginRight: "0.25rem" }}>Сотрудник</label>
        <select className="admin-form-input" value={expenseFilterEmployee} onChange={(e) => setExpenseFilterEmployee(e.target.value)} style={{ padding: "0.3rem 0.5rem", height: 32, minWidth: 140 }}>
          <option value="">Все</option>
          {employeeOptions.map((emp) => <option key={emp} value={emp}>{emp}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", marginRight: "0.25rem" }}>Поставщик услуг</label>
        <select className="admin-form-input" value={expenseFilterSupplier} onChange={(e) => setExpenseFilterSupplier(e.target.value)} style={{ padding: "0.3rem 0.5rem", height: 32, minWidth: 180 }}>
          <option value="">Все</option>
          {supplierOptions.map((supplier) => <option key={supplier} value={supplier}>{supplier}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", marginRight: "0.25rem" }}>Действия</label>
        <select className="admin-form-input" value={expenseFilterStatus} onChange={(e) => setExpenseFilterStatus(e.target.value)} style={{ padding: "0.3rem 0.5rem", height: 32, minWidth: 140 }}>
          <option value="">Все</option>
          {statusOptions.map((s) => <option key={s} value={s}>{statusLabels[s] ?? s}</option>)}
        </select>
      </div>
    </Flex>
  );
}
