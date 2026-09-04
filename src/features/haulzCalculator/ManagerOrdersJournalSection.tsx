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
  type HaulzCalcDraftStatus,
} from "../../../lib/haulzCalculator/draftStatus";
import { draftToManagerJournalRow } from "./draftToManagerJournalRow";
import {
  buildManagerJournalFilterOptions,
  EMPTY_MANAGER_JOURNAL_FILTERS,
  filterManagerJournalRows,
} from "./filterManagerJournalRows";
import { ManagerOrdersJournalFilters } from "./ManagerOrdersJournalFilters";
import { ManagerJournalStatusSelect } from "./ManagerJournalStatusSelect";

type Props = {
  drafts: HaulzCalcDraft[];
  statusLoadingId: number | null;
  deletingId: number | null;
  submitTo1cLoadingId?: number | null;
  onStatusChange: (id: number, status: HaulzCalcDraftStatus) => void;
  onSubmitTo1c?: (id: number) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
};

export function ManagerOrdersJournalSection({
  drafts,
  statusLoadingId,
  deletingId,
  submitTo1cLoadingId = null,
  onStatusChange,
  onSubmitTo1c,
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
              const customerRequestNumber = String(row.НомерЗаявкиКлиента ?? row.ClientRequestNumber ?? "");
              const sender = String(row.ОтправительНаименование ?? "");
              const receiver = String(row.ПолучательНаименование ?? "");
              const pickupDate = String(row.ДатаЗабораПлан ?? row.PickupDatePlan ?? "");
              const rawDate = String(row.Дата ?? row.DateZayavki ?? draft.updatedAt ?? "");
              const fivepostRows = (row._fivepostRows as PendingFivepostRow[]) ?? [];
              const legacyRows = (row._legacyTableRows as PendingLegacyTableRow[]) ?? [];
              const statusBusy = statusLoadingId === draft.id;
              const deleteBusy = deletingId === draft.id;
              const submitBusy = submitTo1cLoadingId === draft.id;

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
                      <ManagerJournalStatusSelect
                        value={draft.status}
                        disabled={statusBusy}
                        loading={statusBusy}
                        onChange={(status) => onStatusChange(draft.id, status)}
                      />
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
                          customerRequestNumber={customerRequestNumber}
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
                          onSubmitTo1c={
                            draft.status === "agreed" && onSubmitTo1c
                              ? () => onSubmitTo1c(draft.id)
                              : undefined
                          }
                          submitTo1cLoading={submitBusy}
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
