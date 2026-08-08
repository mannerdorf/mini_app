import React, { useMemo, useState } from "react";
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
  type HaulzCalcDraftStatus,
} from "../../../lib/haulzCalculator/draftStatus";
import { draftToManagerJournalRow } from "./draftToManagerJournalRow";

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
  onAgreed: (id: number) => void;
  onRejected: (id: number) => void;
};

export function ManagerOrdersJournalSection({
  drafts,
  statusLoadingId,
  onAgreed,
  onRejected,
}: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const rows = useMemo(() => drafts.map(draftToManagerJournalRow), [drafts]);

  return (
    <div className="cargo-card documents-zayavki-below-new-order haulz-calc-manager-journal" style={{ overflowX: "auto", marginBottom: "1rem" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
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
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
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
                  <td style={{ padding: "0.5rem 0.4rem" }}>
                    <span className={`haulz-calc-requests-badge ${statusBadgeClass(draft.status)}`}>
                      {HAULZ_CALC_DRAFT_STATUS_LABELS[draft.status] ?? draft.status}
                    </span>
                  </td>
                  <td style={{ padding: "0.5rem 0.4rem", textAlign: "right", whiteSpace: "nowrap" }}>
                    {draft.quoteResult ? `${draft.quoteResult.totalRub.toLocaleString("ru-RU")} ₽` : "—"}
                  </td>
                </tr>
                {expanded && (
                  <tr>
                    <td colSpan={9} style={{ padding: 0, borderBottom: "1px solid var(--color-border)", verticalAlign: "top" }}>
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
                        managerStatusLoading={statusLoadingId === draft.id}
                        onAgreed={() => onAgreed(draft.id)}
                        onRejected={() => onRejected(draft.id)}
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
