import React from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { formatDisplayDate } from "../../../lib/dateUtils";
import type { useAdminEmployeeDirectory } from "../hooks/useAdminEmployeeDirectory";
import type { AdminExpenseRequestsState } from "../hooks/useAdminExpenseRequests";

type EmployeeDir = ReturnType<typeof useAdminEmployeeDirectory>;

type Props = Pick<
  AdminExpenseRequestsState,
  | "adminExpenseRequests"
  | "expenseViewId"
  | "setExpenseViewId"
  | "expenseRejectId"
  | "setExpenseRejectId"
  | "expenseRejectComment"
  | "setExpenseRejectComment"
  | "expenseEditId"
  | "setExpenseEditId"
  | "expenseEditDocNumber"
  | "setExpenseEditDocNumber"
  | "expenseEditDocDate"
  | "setExpenseEditDocDate"
  | "expenseEditPeriod"
  | "setExpenseEditPeriod"
  | "expenseEditDepartment"
  | "setExpenseEditDepartment"
  | "expenseEditCategory"
  | "setExpenseEditCategory"
  | "expenseEditAmount"
  | "setExpenseEditAmount"
  | "expenseEditVatRate"
  | "setExpenseEditVatRate"
  | "expenseEditComment"
  | "setExpenseEditComment"
  | "expenseEditVehicle"
  | "setExpenseEditVehicle"
  | "expenseEditTransportType"
  | "setExpenseEditTransportType"
  | "expenseEditEmployee"
  | "setExpenseEditEmployee"
  | "expenseEditSupplierName"
  | "setExpenseEditSupplierName"
  | "expenseEditSupplierInn"
  | "setExpenseEditSupplierInn"
  | "expenseCategories"
  | "depOptions"
  | "getLoginDisplayName"
  | "beginExpenseEdit"
  | "updateExpenseStatus"
  | "saveExpenseEdit"
> & {
  adminToken: string;
  employeeDir: EmployeeDir;
  statusBadge: (s: string) => React.ReactNode;
};

export function AdminExpenseRequestModals(props: Props) {
  const {
    adminToken,
    employeeDir,
    adminExpenseRequests,
    expenseViewId,
    setExpenseViewId,
    expenseRejectId,
    setExpenseRejectId,
    expenseRejectComment,
    setExpenseRejectComment,
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
    getLoginDisplayName,
    beginExpenseEdit,
    updateExpenseStatus,
    saveExpenseEdit,
    statusBadge,
  } = props;

  return (
    <>
{/* View modal */}
      {expenseViewId && (() => {
        const item = adminExpenseRequests.find((r) => r.id === expenseViewId);
        if (!item) return null;
        const atts = (item as any).attachments ?? [];
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setExpenseViewId(null)}>
            <div style={{ background: "var(--color-bg-card, #fff)", borderRadius: 12, padding: "1.25rem", maxWidth: 520, width: "92%", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
              <Typography.Body style={{ fontWeight: 600, marginBottom: "0.75rem" }}>
                Заявка {(item as any).docNumber || item.id.slice(-8)}
              </Typography.Body>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
                <div><span style={{ color: "var(--color-text-secondary)" }}>Создано:</span> {formatDisplayDate(item.createdAt)}</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>№ док.:</span> {(item as any).docNumber || "—"}</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>Дата док.:</span> {(item as any).docDate || "—"}</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>Период:</span> {(item as any).period || "—"}</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>ФИО:</span> {getLoginDisplayName(item.login)}</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>Подразделение:</span> {item.department || "—"}</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>Статья:</span> {item.categoryName || "—"}</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>Сумма:</span> {item.amount.toLocaleString("ru-RU")} ₽</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>Статус:</span> {statusBadge(item.status)}</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>Комментарий:</span> {item.comment || "—"}</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>ТС:</span> {item.vehicleOrEmployee || "—"}</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>Сотрудник:</span> {(item as any).employeeName || "—"}</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>Поставщик услуг:</span> {(() => {
                  const sn = (item as any).supplierName;
                  const inn = (item as any).supplierInn;
                  return sn || inn ? [sn, inn ? `ИНН ${inn}` : ""].filter(Boolean).join(", ") : "—";
                })()}</div>
                <div>
                  <Typography.Body style={{ fontWeight: 600, fontSize: "0.82rem", marginBottom: "0.25rem", display: "block" }}>Прикреплённые документы</Typography.Body>
                  {atts.length > 0 ? (
                    atts.map((att: { id: number; fileName: string }) => (
                      <div key={att.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.35rem", flexWrap: "wrap" }}>
                        <Typography.Body style={{ fontSize: "0.82rem", minWidth: 0, flex: "1 1 200px" }}>{att.fileName}</Typography.Body>
                        <Flex gap="0.25rem">
                          <button
                            type="button"
                            className="filter-button"
                            style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
                            onClick={async () => {
                              if (!adminToken) return;
                              try {
                                const res = await fetch(
                                  `/api/admin-expense-attachment?requestUid=${encodeURIComponent(item.id)}&attachmentId=${att.id}`,
                                  { headers: { Authorization: `Bearer ${adminToken}` } }
                                );
                                if (!res.ok) return;
                                const blob = await res.blob();
                                const url = URL.createObjectURL(blob);
                                window.open(url, "_blank", "noopener");
                                setTimeout(() => URL.revokeObjectURL(url), 60000);
                              } catch { /* ignore */ }
                            }}
                          >
                            Открыть
                          </button>
                          <button
                            type="button"
                            className="filter-button"
                            style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
                            onClick={async () => {
                              if (!adminToken) return;
                              try {
                                const res = await fetch(
                                  `/api/admin-expense-attachment?requestUid=${encodeURIComponent(item.id)}&attachmentId=${att.id}`,
                                  { headers: { Authorization: `Bearer ${adminToken}` } }
                                );
                                if (!res.ok) return;
                                const blob = await res.blob();
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = att.fileName || "файл";
                                a.click();
                                setTimeout(() => URL.revokeObjectURL(url), 5000);
                              } catch { /* ignore */ }
                            }}
                          >
                            Скачать
                          </button>
                        </Flex>
                      </div>
                    ))
                  ) : (
                    <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
                      Нет. Вложения сохраняются в БД при отправке заявки «На согласование» из мини-приложения. Заявки, созданные до обновления, могли не содержать файлов.
                    </Typography.Body>
                  )}
                </div>
              </div>
              <Flex gap="0.5rem" justify="flex-end">
                <Button type="button" className="filter-button" onClick={() => setExpenseViewId(null)}>Закрыть</Button>
                <Button type="button" className="filter-button" onClick={() => { setExpenseViewId(null); beginExpenseEdit(item); }}>Изменить</Button>
              </Flex>
            </div>
          </div>
        );
      })()}

      {/* Reject modal */}
      {expenseRejectId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setExpenseRejectId(null)}>
          <div style={{ background: "var(--color-bg-card, #fff)", borderRadius: 12, padding: "1.25rem", maxWidth: 400, width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <Typography.Body style={{ fontWeight: 600, marginBottom: "0.75rem" }}>Отказать в заявке</Typography.Body>
            <textarea
              placeholder="Причина отказа (обязательно)"
              value={expenseRejectComment}
              onChange={(e) => setExpenseRejectComment(e.target.value)}
              className="admin-form-input"
              style={{ width: "100%", minHeight: 80, resize: "vertical", marginBottom: "0.75rem" }}
              rows={3}
              autoFocus
            />
            <Flex gap="0.5rem" justify="flex-end">
              <Button type="button" className="filter-button" onClick={() => setExpenseRejectId(null)}>Отмена</Button>
              <Button type="button" className="filter-button" style={{ background: "#ef4444", color: "white" }} disabled={!expenseRejectComment.trim()} onClick={() => {
                const item = adminExpenseRequests.find((r) => r.id === expenseRejectId);
                if (item) updateExpenseStatus(item.id, item.login, "rejected", expenseRejectComment.trim(), item);
                setExpenseRejectId(null);
              }}>Отказать</Button>
            </Flex>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {expenseEditId && (() => {
        const item = adminExpenseRequests.find((r) => r.id === expenseEditId);
        if (!item) return null;
        const fieldLabel = { fontSize: "0.72rem", color: "var(--color-text-secondary)", display: "block" as const, marginBottom: "0.15rem" };
        const fieldInput = { width: "100%", padding: "0.45rem", height: 36, boxSizing: "border-box" as const };
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setExpenseEditId(null)}>
            <div style={{ background: "var(--color-bg-card, #fff)", borderRadius: 12, padding: "1.25rem", maxWidth: 520, width: "92%", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
              <Typography.Body style={{ fontWeight: 600, marginBottom: "0.75rem" }}>Изменить заявку #{expenseEditDocNumber || item.id.slice(-6)}</Typography.Body>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem", marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 40%", minWidth: 120 }}>
                    <label style={fieldLabel}>№ документа</label>
                    <input type="text" className="admin-form-input" value={expenseEditDocNumber} onChange={(e) => setExpenseEditDocNumber(e.target.value)} style={fieldInput} />
                  </div>
                  <div style={{ flex: "1 1 28%", minWidth: 110 }}>
                    <label style={fieldLabel}>Дата документа</label>
                    <input type="date" className="admin-form-input" value={expenseEditDocDate} onChange={(e) => setExpenseEditDocDate(e.target.value)} style={fieldInput} />
                  </div>
                  <div style={{ flex: "1 1 28%", minWidth: 110 }}>
                    <label style={fieldLabel}>Период</label>
                    <input type="month" className="admin-form-input" value={expenseEditPeriod} onChange={(e) => setExpenseEditPeriod(e.target.value)} style={fieldInput} />
                  </div>
                </div>
                <div>
                  <label style={fieldLabel}>Подразделение</label>
                  <select
                    className="admin-form-input"
                    value={expenseEditDepartment}
                    onChange={(e) => setExpenseEditDepartment(e.target.value)}
                    style={{ ...fieldInput, height: 36 }}
                  >
                    {(() => {
                      const opts = [...depOptions];
                      if (expenseEditDepartment && !opts.includes(expenseEditDepartment)) opts.unshift(expenseEditDepartment);
                      if (!expenseEditDepartment && opts.length === 0) opts.push("—");
                      return opts.map((dep) => <option key={dep} value={dep}>{dep}</option>);
                    })()}
                  </select>
                </div>
                <div>
                  <label style={fieldLabel}>Статья расхода</label>
                  <select className="admin-form-input" value={expenseEditCategory} onChange={(e) => setExpenseEditCategory(e.target.value)} style={{ ...fieldInput, height: 36 }}>
                    {(() => {
                      const options = [...expenseCategories];
                      if (options.length === 0) {
                        options.push({ id: "", name: "Нет статей для подразделения" });
                      }
                      return options.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ));
                    })()}
                  </select>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 55%", minWidth: 120 }}>
                    <label style={fieldLabel}>Сумма (₽)</label>
                    <input type="text" inputMode="decimal" className="admin-form-input" value={expenseEditAmount} onChange={(e) => setExpenseEditAmount(e.target.value)} style={fieldInput} />
                  </div>
                  <div style={{ flex: "1 1 40%", minWidth: 100 }}>
                    <label style={fieldLabel}>НДС</label>
                    <select className="admin-form-input" value={expenseEditVatRate} onChange={(e) => setExpenseEditVatRate(e.target.value)} style={{ ...fieldInput, height: 36 }}>
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
                  <label style={fieldLabel}>Тип ТС</label>
                  <select
                    className="admin-form-input"
                    value={expenseEditTransportType}
                    onChange={(e) => setExpenseEditTransportType(e.target.value === "ferry" ? "ferry" : "auto")}
                    style={{ ...fieldInput, height: 36 }}
                  >
                    <option value="auto">Авто</option>
                    <option value="ferry">Паром</option>
                  </select>
                </div>
                <div>
                  <label style={fieldLabel}>Транспортное средство</label>
                  <input
                    list="expense-edit-vehicle-list"
                    type="text"
                    className="admin-form-input"
                    value={expenseEditVehicle}
                    onChange={(e) => setExpenseEditVehicle(e.target.value)}
                    style={fieldInput}
                    placeholder="Выберите или введите номер / модель ТС"
                  />
                  <datalist id="expense-edit-vehicle-list">
                    {[...new Set(adminExpenseRequests.map((r) => (r as any).vehicleOrEmployee).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "ru")).map((v) => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label style={fieldLabel}>Сотрудник</label>
                  <select
                    className="admin-form-input"
                    value={expenseEditEmployee}
                    onChange={(e) => setExpenseEditEmployee(e.target.value)}
                    style={{ ...fieldInput, height: 36 }}
                  >
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
                    <label style={fieldLabel}>Поставщик услуг (название)</label>
                    <input type="text" className="admin-form-input" value={expenseEditSupplierName} onChange={(e) => setExpenseEditSupplierName(e.target.value)} style={fieldInput} placeholder="Название поставщика" />
                  </div>
                  <div style={{ flex: "0 1 140px", minWidth: 100 }}>
                    <label style={fieldLabel}>ИНН поставщика</label>
                    <input type="text" className="admin-form-input" value={expenseEditSupplierInn} onChange={(e) => setExpenseEditSupplierInn(e.target.value)} style={fieldInput} placeholder="ИНН" />
                  </div>
                </div>
                <div>
                  <label style={fieldLabel}>Комментарий</label>
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
      })()}
    </>
  );
}
