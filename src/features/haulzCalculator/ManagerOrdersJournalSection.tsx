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
    <div className="cargo-card documents-zayavki-below-new-order haulz-calc-manager-journal">
      <ManagerOrdersJournalFilters filters={filters} onChange={setFilters} options={filterOptions} />
      {rows.length === 0 && (
        <p className="haulz-calc-manager-journal__empty">Нет заявок по выбранным фильтрам.</p>
      )}
      <div className="haulz-calc-manager-journal__table-wrap">
        <table className="haulz-calc-manager-journal__table">
          <thead>
            <tr>
              <th className="haulz-calc-manager-journal__col-date">Дата</th>
              <th className="haulz-calc-manager-journal__col-date">Дата забора план</th>
              <th className="haulz-calc-manager-journal__col-number">Номер заявки</th>
              <th className="haulz-calc-manager-journal__col-party">Заказчик</th>
              <th className="haulz-calc-manager-journal__col-party">Отправитель</th>
              <th className="haulz-calc-manager-journal__col-party">Получатель</th>
              <th className="haulz-calc-manager-journal__col-route">Маршрут</th>
              <th className="haulz-calc-manager-journal__col-status">Статус</th>
              <th className="haulz-calc-manager-journal__col-sum">Сумма</th>
              <th className="haulz-calc-manager-journal__col-actions" aria-label="Действия" />
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
                    className={`haulz-calc-manager-journal__row${expanded ? " haulz-calc-manager-journal__row--expanded" : ""}`}
                    onClick={() => setExpandedKey((prev) => (prev === rowKey ? null : rowKey))}
                    title={expanded ? "Свернуть" : "Показать детали заявки"}
                  >
                    <td className="haulz-calc-manager-journal__cell-date">
                      <DateText value={rawDate || undefined} />
                    </td>
                    <td className="haulz-calc-manager-journal__cell-date">
                      <DateText value={pickupDate || undefined} />
                    </td>
                    <td className="haulz-calc-manager-journal__cell-number">
                      {requestNumber ? formatInvoiceNumber(requestNumber) : "—"}
                    </td>
                    <td className="haulz-calc-manager-journal__cell-party" title={stripOoo(customer)}>
                      <div className="haulz-calc-manager-journal__cell-clamp">{stripOoo(customer) || "—"}</div>
                    </td>
                    <td className="haulz-calc-manager-journal__cell-party" title={stripOoo(sender)}>
                      <div className="haulz-calc-manager-journal__cell-clamp">{stripOoo(sender) || "—"}</div>
                    </td>
                    <td className="haulz-calc-manager-journal__cell-party" title={stripOoo(receiver)}>
                      <div className="haulz-calc-manager-journal__cell-clamp">{stripOoo(receiver) || "—"}</div>
                    </td>
                    <td className="haulz-calc-manager-journal__cell-route">
                      <DocumentsRouteBadge>{route}</DocumentsRouteBadge>
                    </td>
                    <td className="haulz-calc-manager-journal__cell-status" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={draft.status}
                        disabled={statusBusy}
                        onChange={(e) => onStatusChange(draft.id, e.target.value as HaulzCalcDraftStatus)}
                        className={`haulz-calc-manager-journal-status ${statusBadgeClass(draft.status)}`}
                        aria-label="Статус заявки"
                      >
                        {MANAGER_JOURNAL_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {HAULZ_CALC_DRAFT_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                      {statusBusy && <Loader2 className="w-3 h-3 animate-spin haulz-calc-manager-journal__status-spinner" />}
                    </td>
                    <td className="haulz-calc-manager-journal__cell-sum">
                      {draft.quoteResult ? `${draft.quoteResult.totalRub.toLocaleString("ru-RU")} ₽` : "—"}
                    </td>
                    <td className="haulz-calc-manager-journal__cell-actions" onClick={(e) => e.stopPropagation()}>
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
                    <tr className="haulz-calc-manager-journal__expand-row">
                      <td colSpan={10}>
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
    </div>
  );
}
