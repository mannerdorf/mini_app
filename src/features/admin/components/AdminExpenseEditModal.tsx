import React from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import {
  EXPENSE_EDIT_FIELD_INPUT,
  EXPENSE_EDIT_FIELD_LABEL,
  type AdminExpenseModalSharedProps,
} from "../lib/adminExpenseModalShared";

export function AdminExpenseEditModal(props: AdminExpenseModalSharedProps) {
  const {
    employeeDir,
    adminExpenseRequests,
    expenseEditId,
    setExpenseEditId,
    expenseEditDocNumber,
    setExpenseEditDocNumber,
    expenseEditDocDate,
    setExpenseEditDocDate,
    expenseEditPeriod,
    setExpenseEditPeriod,
    expenseEditDepartment,
    setExpenseEditDepartment,
    expenseEditCategory,
    setExpenseEditCategory,
    expenseEditAmount,
    setExpenseEditAmount,
    expenseEditVatRate,
    setExpenseEditVatRate,
    expenseEditComment,
    setExpenseEditComment,
    expenseEditVehicle,
    setExpenseEditVehicle,
    expenseEditTransportType,
    setExpenseEditTransportType,
    expenseEditEmployee,
    setExpenseEditEmployee,
    expenseEditSupplierName,
    setExpenseEditSupplierName,
    expenseEditSupplierInn,
    setExpenseEditSupplierInn,
    expenseCategories,
    depOptions,
    saveExpenseEdit,
  } = props;

  if (!expenseEditId) return null;
  const item = adminExpenseRequests.find((r) => r.id === expenseEditId);
  if (!item) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setExpenseEditId(null)}>
      <div style={{ background: "var(--color-bg-card, #fff)", borderRadius: 12, padding: "1.25rem", maxWidth: 520, width: "92%", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <Typography.Body style={{ fontWeight: 600, marginBottom: "0.75rem" }}>Изменить заявку #{expenseEditDocNumber || item.id.slice(-6)}</Typography.Body>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem", marginBottom: "0.75rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 40%", minWidth: 120 }}>
              <label style={EXPENSE_EDIT_FIELD_LABEL}>№ документа</label>
              <input type="text" className="admin-form-input" value={expenseEditDocNumber} onChange={(e) => setExpenseEditDocNumber(e.target.value)} style={EXPENSE_EDIT_FIELD_INPUT} />
            </div>
            <div style={{ flex: "1 1 28%", minWidth: 110 }}>
              <label style={EXPENSE_EDIT_FIELD_LABEL}>Дата документа</label>
              <input type="date" className="admin-form-input" value={expenseEditDocDate} onChange={(e) => setExpenseEditDocDate(e.target.value)} style={EXPENSE_EDIT_FIELD_INPUT} />
            </div>
            <div style={{ flex: "1 1 28%", minWidth: 110 }}>
              <label style={EXPENSE_EDIT_FIELD_LABEL}>Период</label>
              <input type="month" className="admin-form-input" value={expenseEditPeriod} onChange={(e) => setExpenseEditPeriod(e.target.value)} style={EXPENSE_EDIT_FIELD_INPUT} />
            </div>
          </div>
          <div>
            <label style={EXPENSE_EDIT_FIELD_LABEL}>Подразделение</label>
            <select className="admin-form-input" value={expenseEditDepartment} onChange={(e) => setExpenseEditDepartment(e.target.value)} style={{ ...EXPENSE_EDIT_FIELD_INPUT, height: 36 }}>
              {(() => {
                const opts = [...depOptions];
                if (expenseEditDepartment && !opts.includes(expenseEditDepartment)) opts.unshift(expenseEditDepartment);
                if (!expenseEditDepartment && opts.length === 0) opts.push("—");
                return opts.map((dep) => <option key={dep} value={dep}>{dep}</option>);
              })()}
            </select>
          </div>
          <div>
            <label style={EXPENSE_EDIT_FIELD_LABEL}>Статья расхода</label>
            <select className="admin-form-input" value={expenseEditCategory} onChange={(e) => setExpenseEditCategory(e.target.value)} style={{ ...EXPENSE_EDIT_FIELD_INPUT, height: 36 }}>
              {(() => {
                const options = [...expenseCategories];
                if (options.length === 0) options.push({ id: "", name: "Нет статей для подразделения" });
                return options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>);
              })()}
            </select>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 55%", minWidth: 120 }}>
              <label style={EXPENSE_EDIT_FIELD_LABEL}>Сумма (₽)</label>
              <input type="text" inputMode="decimal" className="admin-form-input" value={expenseEditAmount} onChange={(e) => setExpenseEditAmount(e.target.value)} style={EXPENSE_EDIT_FIELD_INPUT} />
            </div>
            <div style={{ flex: "1 1 40%", minWidth: 100 }}>
              <label style={EXPENSE_EDIT_FIELD_LABEL}>НДС</label>
              <select className="admin-form-input" value={expenseEditVatRate} onChange={(e) => setExpenseEditVatRate(e.target.value)} style={{ ...EXPENSE_EDIT_FIELD_INPUT, height: 36 }}>
                <option value="">Без НДС</option>
                <option value="0">0%</option>
                <option value="5">5%</option>
                <option value="7">7%</option>
                <option value="10">10%</option>
                <option value="20">20%</option>
                <option value="22">22%</option>
              </select>
            </div>
          </div>
          <div>
            <label style={EXPENSE_EDIT_FIELD_LABEL}>Тип ТС</label>
            <select className="admin-form-input" value={expenseEditTransportType} onChange={(e) => setExpenseEditTransportType(e.target.value === "ferry" ? "ferry" : "auto")} style={{ ...EXPENSE_EDIT_FIELD_INPUT, height: 36 }}>
              <option value="auto">Авто</option>
              <option value="ferry">Паром</option>
            </select>
          </div>
          <div>
            <label style={EXPENSE_EDIT_FIELD_LABEL}>Транспортное средство</label>
            <input
              list="expense-edit-vehicle-list"
              type="text"
              className="admin-form-input"
              value={expenseEditVehicle}
              onChange={(e) => setExpenseEditVehicle(e.target.value)}
              style={EXPENSE_EDIT_FIELD_INPUT}
              placeholder="Выберите или введите номер / модель ТС"
            />
            <datalist id="expense-edit-vehicle-list">
              {[...new Set(adminExpenseRequests.map((r) => r.vehicleOrEmployee).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "ru")).map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>
          <div>
            <label style={EXPENSE_EDIT_FIELD_LABEL}>Сотрудник</label>
            <select className="admin-form-input" value={expenseEditEmployee} onChange={(e) => setExpenseEditEmployee(e.target.value)} style={{ ...EXPENSE_EDIT_FIELD_INPUT, height: 36 }}>
              <option value="">—</option>
              {(() => {
                const names = employeeDir.items.map((e) => e.full_name || e.login).filter(Boolean);
                const uniq = [...new Set(names)];
                const opts = [...uniq];
                if (expenseEditEmployee && !opts.includes(expenseEditEmployee)) opts.unshift(expenseEditEmployee);
                return opts.map((n) => <option key={n} value={n}>{n}</option>);
              })()}
            </select>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 180px", minWidth: 0 }}>
              <label style={EXPENSE_EDIT_FIELD_LABEL}>Поставщик услуг (название)</label>
              <input type="text" className="admin-form-input" value={expenseEditSupplierName} onChange={(e) => setExpenseEditSupplierName(e.target.value)} style={EXPENSE_EDIT_FIELD_INPUT} placeholder="Название поставщика" />
            </div>
            <div style={{ flex: "0 1 140px", minWidth: 100 }}>
              <label style={EXPENSE_EDIT_FIELD_LABEL}>ИНН поставщика</label>
              <input type="text" className="admin-form-input" value={expenseEditSupplierInn} onChange={(e) => setExpenseEditSupplierInn(e.target.value)} style={EXPENSE_EDIT_FIELD_INPUT} placeholder="ИНН" />
            </div>
          </div>
          <div>
            <label style={EXPENSE_EDIT_FIELD_LABEL}>Комментарий</label>
            <textarea value={expenseEditComment} onChange={(e) => setExpenseEditComment(e.target.value)} className="admin-form-input" style={{ width: "100%", minHeight: 60, resize: "vertical" }} rows={2} />
          </div>
        </div>
        <Flex gap="0.5rem" justify="flex-end">
          <Button type="button" className="filter-button" onClick={() => setExpenseEditId(null)}>Отмена</Button>
          <Button type="button" className="filter-button" style={{ background: "var(--color-primary-blue)", color: "white" }} onClick={() => saveExpenseEdit(item.id, item.login)} disabled={!expenseEditCategory}>Сохранить</Button>
        </Flex>
      </div>
    </div>
  );
}
