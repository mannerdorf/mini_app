import React from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { formatDisplayDate } from "../../../lib/dateUtils";
import {
  downloadAdminExpenseAttachment,
  openAdminExpenseAttachment,
  type AdminExpenseModalSharedProps,
} from "../lib/adminExpenseModalShared";

export function AdminExpenseViewModal(props: AdminExpenseModalSharedProps) {
  const {
    adminToken,
    adminExpenseRequests,
    expenseViewId,
    setExpenseViewId,
    getLoginDisplayName,
    beginExpenseEdit,
    statusBadge,
  } = props;

  if (!expenseViewId) return null;
  const item = adminExpenseRequests.find((r) => r.id === expenseViewId);
  if (!item) return null;

  const atts = (item as { attachments?: { id: number; fileName: string }[] }).attachments ?? [];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setExpenseViewId(null)}>
      <div style={{ background: "var(--color-bg-card, #fff)", borderRadius: 12, padding: "1.25rem", maxWidth: 520, width: "92%", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <Typography.Body style={{ fontWeight: 600, marginBottom: "0.75rem" }}>
          Заявка {(item as { docNumber?: string }).docNumber || item.id.slice(-8)}
        </Typography.Body>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
          <div><span style={{ color: "var(--color-text-secondary)" }}>Создано:</span> {formatDisplayDate(item.createdAt)}</div>
          <div><span style={{ color: "var(--color-text-secondary)" }}>№ док.:</span> {(item as { docNumber?: string }).docNumber || "—"}</div>
          <div><span style={{ color: "var(--color-text-secondary)" }}>Дата док.:</span> {(item as { docDate?: string }).docDate || "—"}</div>
          <div><span style={{ color: "var(--color-text-secondary)" }}>Период:</span> {(item as { period?: string }).period || "—"}</div>
          <div><span style={{ color: "var(--color-text-secondary)" }}>ФИО:</span> {getLoginDisplayName(item.login)}</div>
          <div><span style={{ color: "var(--color-text-secondary)" }}>Подразделение:</span> {item.department || "—"}</div>
          <div><span style={{ color: "var(--color-text-secondary)" }}>Статья:</span> {item.categoryName || "—"}</div>
          <div><span style={{ color: "var(--color-text-secondary)" }}>Сумма:</span> {item.amount.toLocaleString("ru-RU")} ₽</div>
          <div><span style={{ color: "var(--color-text-secondary)" }}>Статус:</span> {statusBadge(item.status)}</div>
          <div><span style={{ color: "var(--color-text-secondary)" }}>Комментарий:</span> {item.comment || "—"}</div>
          <div><span style={{ color: "var(--color-text-secondary)" }}>ТС:</span> {item.vehicleOrEmployee || "—"}</div>
          <div><span style={{ color: "var(--color-text-secondary)" }}>Сотрудник:</span> {(item as { employeeName?: string }).employeeName || "—"}</div>
          <div><span style={{ color: "var(--color-text-secondary)" }}>Поставщик услуг:</span> {(() => {
            const sn = (item as { supplierName?: string }).supplierName;
            const inn = (item as { supplierInn?: string }).supplierInn;
            return sn || inn ? [sn, inn ? `ИНН ${inn}` : ""].filter(Boolean).join(", ") : "—";
          })()}</div>
          <div>
            <Typography.Body style={{ fontWeight: 600, fontSize: "0.82rem", marginBottom: "0.25rem", display: "block" }}>Прикреплённые документы</Typography.Body>
            {atts.length > 0 ? (
              atts.map((att) => (
                <div key={att.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.35rem", flexWrap: "wrap" }}>
                  <Typography.Body style={{ fontSize: "0.82rem", minWidth: 0, flex: "1 1 200px" }}>{att.fileName}</Typography.Body>
                  <Flex gap="0.25rem">
                    <button
                      type="button"
                      className="filter-button"
                      style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
                      onClick={() => { if (adminToken) void openAdminExpenseAttachment(adminToken, item.id, att.id); }}
                    >
                      Открыть
                    </button>
                    <button
                      type="button"
                      className="filter-button"
                      style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
                      onClick={() => { if (adminToken) void downloadAdminExpenseAttachment(adminToken, item.id, att.id, att.fileName); }}
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
}
