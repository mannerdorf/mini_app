import React, { useMemo, useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import type { HaulzCalcDraft } from "../../api/client/haulzCalculator";
import { formatInvoiceNumber, stripOoo } from "../../lib/formatUtils";
import { DateText } from "../../components/ui/DateText";
import { DocumentsRouteBadge } from "../documents/views/documentsViewBlocks";
import { DocumentsOrderJournalExpand } from "../documents/orders/DocumentsOrderJournalExpand";
import {
  orderRouteLabel,
  pendingPointLabel,
} from "../documents/orders/documentsOrderJournalUtils";
import type { PendingFivepostRow, PendingLegacyTableRow } from "../documents/orders/DocumentsOrdersPendingCargo";
import {
  HAULZ_CALC_DRAFT_STATUS_LABELS,
  MANAGER_JOURNAL_STATUSES,
  type HaulzCalcDraftStatus,
} from "../../../lib/haulzCalculator/draftStatus";
import { draftToManagerJournalRow } from "./draftToManagerJournalRow";
import {
  buildManagerJournalFilterOptions,
  EMPTY_MANAGER_JOURNAL_FILTERS,
  filterManagerJournalRows,
} from "./filterManagerJournalRows";
import { ManagerOrdersJournalFilters } from "./ManagerOrdersJournalFilters";

function statusBadgeClass(status: HaulzCalcDraftStatus): string {
  if (status === "awaiting_call") return "haulz-calc-requests-badge--awaiting";
  if (status === "agreed" || status === "submitted") return "haulz-calc-requests-badge--ok";
  if (status === "rejected") return "haulz-calc-requests-badge--reject";
  if (status === "new") return "haulz-calc-requests-badge--new";
  return "";
}

type Props = {
  drafts: HaulzCalcDraft[];
  statusLoadingId: number | null;
  deletingId: number | null;
  onStatusChange: (id: number, status: HaulzCalcDraftStatus) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
};

export function ManagerOrdersJournalSection({
  drafts,
  statusLoadingId,
  deletingId,
  onStatusChange,
  onEdit,
  onDelete,
}: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [filters, setFilters] = useState(EMPTY_MANAGER_JOURNAL_FILTERS);
  const allRows = useMemo(() => drafts.map(draftToManagerJournalRow), [drafts]);
  const filterOptions = useMemo(() => buildManagerJournalFilterOptions(allRows), [allRows]);
  const rows = useMemo(() => filterManagerJournalRows(allRows, filters), [allRows, filters]);

  return (
    <div className="cargo-card documents-zayavki-below-new-order haulz-calc-manager-journal" style={{ overflowX: "auto", marginBottom: "1rem" }}>
      <ManagerOrdersJournalFilters filters={filters} onChange={setFilters} options={filterOptions} />
      {rows.length === 0 && (
        <p style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
          Нет заявок по выбранным фильтрам.
        </p>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", minWidth: 980 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
            <th style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}>Дата</th>
            <th style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}>Дата забора план</th>
            <th style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}>Номер заявки</th>
            <th style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}>Заказчик</th>
            <th style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}>Отправитель</th>
            <th style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}>Получатель</th>
            <th style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}>Маршрут</th>
            <th style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}>Статус</th>
            <th style={{ padding: "0.5rem 0.4rem", textAlign: "right", fontWeight: 600 }}>Сумма</th>
            <th style={{ padding: "0.5rem 0.4rem", textAlign: "center", fontWeight: 600 }} aria-label="Действия" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const draft = row._draft;
            const requestNumber = String(row.НомерЗаявки ?? draft.nomerZayavki ?? "");
            const rowKey = `${requestNumber || "row"}-${draft.id}`;
            const expanded = expandedKey === rowKey;
            const senderPoint = pendingPointLabel(row, "from");
            const destinationPoint = pendingPointLabel(row, "to");
            const route = orderRouteLabel(row, senderPoint, destinationPoint);
            const customer = String(row.ЗаказчикНаименование ?? "");
            const sender = String(row.ОтправительНаименование ?? "");
            const receiver = String(row.ПолучательНаименование ?? "");
            const pickupDate = String(row.ДатаЗабораПлан ?? row.PickupDatePlan ?? "");
            const rawDate = String(row.Дата ?? row.DateZayavki ?? draft.updatedAt ?? "");
            const fivepostRows = (row._fivepostRows as PendingFivepostRow[]) ?? [];
            const legacyRows = (row._legacyTableRows as PendingLegacyTableRow[]) ?? [];
            const statusBusy = statusLoadingId === draft.id;
            const deleteBusy = deletingId === draft.id;

            return (
              <React.Fragment key={rowKey}>
                <tr
                  style={{
                    borderBottom: expanded ? undefined : "1px solid var(--color-border)",
                    cursor: "pointer",
                    background: expanded ? "var(--color-bg-hover)" : undefined,
                  }}
                  onClick={() => setExpandedKey((prev) => (prev === rowKey ? null : rowKey))}
                  title={expanded ? "Свернуть" : "Показать детали заявки"}
                >
                  <td style={{ padding: "0.5rem 0.4rem", whiteSpace: "nowrap" }}>
                    <DateText value={rawDate || undefined} />
                  </td>
                  <td style={{ padding: "0.5rem 0.4rem", whiteSpace: "nowrap" }}>
                    <DateText value={pickupDate || undefined} />
                  </td>
                  <td style={{ padding: "0.5rem 0.4rem", whiteSpace: "nowrap" }}>
                    {requestNumber ? formatInvoiceNumber(requestNumber) : "—"}
                  </td>
                  <td style={{ padding: "0.5rem 0.4rem", maxWidth: 180, verticalAlign: "top" }} title={stripOoo(customer)}>
                    <div style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {stripOoo(customer) || "—"}
                    </div>
                  </td>
                  <td style={{ padding: "0.5rem 0.4rem", maxWidth: 160, verticalAlign: "top" }} title={stripOoo(sender)}>
                    <div style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {stripOoo(sender) || "—"}
                    </div>
                  </td>
                  <td style={{ padding: "0.5rem 0.4rem", maxWidth: 160, verticalAlign: "top" }} title={stripOoo(receiver)}>
                    <div style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {stripOoo(receiver) || "—"}
                    </div>
                  </td>
                  <td style={{ padding: "0.5rem 0.4rem" }}>
                    <DocumentsRouteBadge>{route}</DocumentsRouteBadge>
                  </td>
                  <td style={{ padding: "0.5rem 0.4rem" }} onClick={(e) => e.stopPropagation()}>
                    <select
                      value={draft.status}
                      disabled={statusBusy}
                      onChange={(e) => onStatusChange(draft.id, e.target.value as HaulzCalcDraftStatus)}
                      className={`haulz-calc-manager-journal-status ${statusBadgeClass(draft.status)}`}
                      style={{
                        fontSize: "0.78rem",
                        padding: "0.25rem 0.35rem",
                        borderRadius: 6,
                        border: "1px solid var(--color-border)",
                        maxWidth: 190,
                      }}
                      aria-label="Статус заявки"
                    >
                      {MANAGER_JOURNAL_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {HAULZ_CALC_DRAFT_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                    {statusBusy && (
                      <Loader2
                        className="w-3 h-3 animate-spin"
                        style={{ display: "inline-block", marginLeft: "0.25rem", verticalAlign: "middle" }}
                      />
                    )}
                  </td>
                  <td style={{ padding: "0.5rem 0.4rem", textAlign: "right", whiteSpace: "nowrap" }}>
                    {draft.quoteResult ? `${draft.quoteResult.totalRub.toLocaleString("ru-RU")} ₽` : "—"}
                  </td>
                  <td
                    style={{ padding: "0.5rem 0.35rem", textAlign: "center", whiteSpace: "nowrap" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="haulz-calc-text-btn"
                      title="Изменить в калькуляторе"
                      aria-label="Изменить заявку"
                      onClick={() => onEdit(draft.id)}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      className="haulz-calc-text-btn haulz-calc-drafts-delete"
                      title="Удалить заявку"
                      aria-label="Удалить заявку"
                      disabled={deleteBusy}
                      onClick={() => onDelete(draft.id)}
                    >
                      {deleteBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </td>
                </tr>
                {expanded && (
                  <tr>
                    <td colSpan={10} style={{ padding: 0, borderBottom: "1px solid var(--color-border)", verticalAlign: "top" }}>
                      <DocumentsOrderJournalExpand
                        customer={customer}
                        senderPoint={senderPoint}
                        destinationPoint={destinationPoint}
                        sender={sender}
                        receiver={receiver}
                        routeLabel={route}
                        pickupDate={pickupDate}
                        fivepostRows={fivepostRows}
                        legacyRows={legacyRows}
                        quote={draft.quoteResult}
                        managerStatus={draft.status}
                        managerStatusLoading={statusBusy}
                        onStatusChange={(status) => onStatusChange(draft.id, status)}
                        onEdit={() => onEdit(draft.id)}
                        onDelete={() => onDelete(draft.id)}
                        deleteLoading={deleteBusy}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
