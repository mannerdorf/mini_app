import React from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { Copy } from "lucide-react";
import { formatDisplayDate, formatDisplayDateFromDate } from "../../../lib/dateUtils";
import type { AdminExpenseRequestsState } from "../hooks/useAdminExpenseRequests";

type Props = Pick<
  AdminExpenseRequestsState,
  | "adminExpenseSortCol"
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
  | "totalAmount"
  | "filtered"
  | "sorted"
  | "toggleSort"
  | "arrow"
  | "getLoginDisplayName"
  | "checkPnlExpenseCombination"
  | "openPnlExpenseDirectory"
  | "beginExpenseEdit"
  | "updateExpenseStatus"
  | "deleteExpenseRequest"
  | "isAccounting"
> & {
  adminToken: string;
  onError: (msg: string | null) => void;
  setExpenseRejectId: AdminExpenseRequestsState["setExpenseRejectId"];
  setExpenseRejectComment: AdminExpenseRequestsState["setExpenseRejectComment"];
  setExpenseViewId: AdminExpenseRequestsState["setExpenseViewId"];
  statusBadge: (s: string) => React.ReactNode;
};

export function AdminExpenseRequestsTablePanel(props: Props) {
  const {
    adminToken,
    onError,
    isAccounting,
    adminExpenseSortCol,
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
    totalAmount,
    filtered,
    sorted,
    toggleSort,
    arrow,
    getLoginDisplayName,
    checkPnlExpenseCombination,
    openPnlExpenseDirectory,
    beginExpenseEdit,
    updateExpenseStatus,
    deleteExpenseRequest,
    setExpenseRejectId,
    setExpenseRejectComment,
    setExpenseViewId,
    statusBadge,
  } = props;

  return (
    <>
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

      <div style={{ marginBottom: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--color-bg-hover)", borderRadius: 8, fontSize: "0.9rem", fontWeight: 600 }}>
        Итого: {totalAmount.toLocaleString("ru-RU")} ₽
      </div>

      {filtered.length === 0 ? (
        <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>Нет заявок</Typography.Body>
      ) : (
        <div style={{ maxHeight: 600, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, background: "var(--color-bg-card, #fff)", zIndex: 1 }}>
                {([
                  ["createdAt", "Создано"],
                  ["docNumber", "№ док."],
                  ["docDate", "Дата док."],
                  ["period", "Период"],
                  ["login", "ФИО"],
                  ["department", "Подразделение"],
                  ["categoryName", "Статья"],
                  ["amount", "Сумма"],
                  ["status", "Статус"],
                ] as [typeof adminExpenseSortCol, string][]).map(([col, label]) => (
                  <th key={col} onClick={() => toggleSort(col)} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)", cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}>{label}{arrow(col)}</th>
                ))}
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Комментарий</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>ТС</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Сотрудник</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Поставщик услуг</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Вложения</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.id}
                  style={{ borderBottom: "1px solid var(--color-border)", cursor: "pointer" }}
                  onClick={() => setExpenseViewId(r.id)}
                >
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{formatDisplayDate(r.createdAt)}</td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{(r as any).docNumber || "—"}</td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                    {(() => {
                      const raw = String((r as any).docDate ?? "").trim();
                      if (!raw) return "—";
                      const normalized = /^\d{4}-\d{2}$/.test(raw) ? `${raw}-01` : raw;
                      const parsed = new Date(`${normalized}T00:00:00`);
                      if (Number.isNaN(parsed.getTime())) return "—";
                      return formatDisplayDateFromDate(parsed);
                    })()}
                  </td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{(r as any).period || "—"}</td>
                  <td style={{ padding: "6px 8px" }}>{getLoginDisplayName(r.login)}</td>
                  <td style={{ padding: "6px 8px" }}>{r.department}</td>
                  <td style={{ padding: "6px 8px" }}>{r.categoryName}</td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{`${r.amount.toLocaleString("ru-RU")}\u00A0₽`}{(r as any).vatRate ? ` (${(r as any).vatRate}%)` : ""}</td>
                  <td style={{ padding: "6px 8px" }}>{statusBadge(r.status)}</td>
                  <td style={{ padding: "6px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.comment || "—"}
                    {(r as any).rejectionReason && <div style={{ fontSize: "0.68rem", color: "#ef4444" }}>Причина: {(r as any).rejectionReason}</div>}
                  </td>
                  <td style={{ padding: "6px 8px" }}>{r.vehicleOrEmployee || "—"}</td>
                  <td style={{ padding: "6px 8px" }}>{(r as any).employeeName || "—"}</td>
                  <td style={{ padding: "6px 8px" }}>
                    {(() => {
                      const sn = (r as any).supplierName;
                      const inn = (r as any).supplierInn;
                      return sn || inn ? [sn, inn ? `ИНН ${inn}` : ""].filter(Boolean).join(", ") : "—";
                    })()}
                  </td>
                  <td style={{ padding: "6px 8px", fontSize: "0.7rem" }} onClick={(e) => e.stopPropagation()}>
                    {(r as any).attachments?.length
                      ? (r as any).attachments.map((att: { id?: number; fileName?: string; name?: string; dataUrl?: string }, i: number) => (
                          <React.Fragment key={att.id ?? att.fileName ?? att.name ?? i}>
                            {i > 0 && ", "}
                            <button
                              type="button"
                              onClick={async (ev) => {
                                ev.stopPropagation();
                                if (att.dataUrl) {
                                  const a = document.createElement("a");
                                  a.href = att.dataUrl;
                                  a.download = att.name ?? att.fileName ?? "file";
                                  a.click();
                                } else if (att.id != null && adminToken) {
                                  try {
                                    const res = await fetch(
                                      `/api/admin-expense-attachment?requestUid=${encodeURIComponent(r.id)}&attachmentId=${att.id}`,
                                      { headers: { Authorization: `Bearer ${adminToken}` } }
                                    );
                                    if (!res.ok) return;
                                    const blob = await res.blob();
                                    const url = URL.createObjectURL(blob);
                                    window.open(url, "_blank", "noopener");
                                    setTimeout(() => URL.revokeObjectURL(url), 60000);
                                  } catch { /* ignore */ }
                                }
                              }}
                              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--color-primary-blue, #2563eb)", textDecoration: "underline", fontSize: "inherit" }}
                            >
                              {att.fileName ?? att.name ?? "файл"}
                            </button>
                          </React.Fragment>
                        ))
                      : r.attachmentNames.length > 0
                        ? r.attachmentNames.join(", ")
                        : "—"}
                  </td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                    <Flex gap="0.25rem" wrap="wrap">
                      {!checkPnlExpenseCombination(r) && (
                        <button
                          type="button"
                          onClick={() => openPnlExpenseDirectory(r)}
                          style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #f97316", background: "rgba(249,115,22,0.12)", color: "#c2410c", cursor: "pointer", fontWeight: 600 }}
                        >
                          Добавить в PnL
                        </button>
                      )}
                      {!isAccounting && r.status !== "approved" && r.status !== "rejected" && r.status !== "paid" && (
                        <button type="button" onClick={() => updateExpenseStatus(r.id, (r as any).login ?? "", "approved", undefined, r)} style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #10b981", background: "transparent", color: "#10b981", cursor: "pointer" }}>Согласовать</button>
                      )}
                      {!isAccounting && r.status !== "approved" && r.status !== "rejected" && r.status !== "paid" && (
                        <button type="button" onClick={() => { setExpenseRejectId(r.id); setExpenseRejectComment(""); }} style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", cursor: "pointer" }}>Отказать</button>
                      )}
                      {isAccounting && r.status === "approved" && (
                        <button type="button" onClick={() => updateExpenseStatus(r.id, r.login, "sent", undefined, r)} style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #2563eb", background: "transparent", color: "#2563eb", cursor: "pointer" }}>Ожидает оплату</button>
                      )}
                      {isAccounting && (r.status === "approved" || r.status === "sent") && (
                        <button type="button" onClick={() => updateExpenseStatus(r.id, r.login, "paid", undefined, r)} style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #8b5cf6", background: "transparent", color: "#8b5cf6", cursor: "pointer" }}>Оплачено</button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const supplierName = (r as any).supplierName || "";
                            const supplierInn = (r as any).supplierInn || "";
                            const supplier = supplierName || supplierInn
                              ? [supplierName, supplierInn ? `ИНН ${supplierInn}` : ""].filter(Boolean).join(", ")
                              : "—";
                            const text = [
                              `№ док.: ${(r as any).docNumber || "—"}`,
                              `Дата док.: ${(r as any).docDate || "—"}`,
                              `Период: ${(r as any).period || "—"}`,
                              `ФИО: ${getLoginDisplayName(r.login)}`,
                              `Подразделение: ${r.department || "—"}`,
                              `Статья: ${r.categoryName || "—"}`,
                              `Сумма: ${r.amount.toLocaleString("ru-RU")} ₽${(r as any).vatRate ? ` (НДС ${(r as any).vatRate}%)` : ""}`,
                              `Комментарий: ${r.comment || "—"}`,
                              `ТС: ${r.vehicleOrEmployee || "—"}`,
                              `Сотрудник: ${(r as any).employeeName || "—"}`,
                              `Поставщик услуг: ${supplier}`,
                            ].join("\n");
                            await navigator.clipboard?.writeText(text);
                          } catch {
                            onError("Не удалось скопировать заявку");
                          }
                        }}
                        style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid var(--color-border)", background: "transparent", color: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.2rem" }}
                        title="Копировать данные заявки"
                        aria-label="Копировать данные заявки"
                      >
                        <Copy size={12} />
                        Копировать
                      </button>
                      <button type="button" onClick={() => beginExpenseEdit(r)} style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid var(--color-border)", background: "transparent", color: "inherit", cursor: "pointer" }}>Изменить</button>
                      <button type="button" onClick={() => { if (window.confirm("Удалить заявку? Действие нельзя отменить.")) deleteExpenseRequest(r.id, r.login); }} style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", cursor: "pointer" }}>Удалить</button>
                    </Flex>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
