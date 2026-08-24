import React from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { DateText } from "../../../components/ui/DateText";
import { formatQuoteVatLine } from "../../../../lib/haulzCalculator/quoteVat";
import type { QuoteResult } from "../../../../lib/haulzCalculator/types";
import type { HaulzCalcDraftStatus } from "../../../../lib/haulzCalculator/draftStatus";
import { ManagerJournalStatusSelect } from "../../haulzCalculator/ManagerJournalStatusSelect";
import { DocumentsRouteBadge } from "../views/documentsViewBlocks";
import {
  DocumentsOrdersPendingCargo,
  type PendingFivepostRow,
  type PendingLegacyTableRow,
} from "./DocumentsOrdersPendingCargo";

function JournalGridRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <span style={{ color: "var(--color-text-secondary)", fontWeight: 600 }}>{label}</span>
      <span>{value || "—"}</span>
    </>
  );
}

type Props = {
  customer: string;
  senderPoint: string;
  destinationPoint: string;
  sender: string;
  receiver: string;
  routeLabel: string;
  pickupDate?: string;
  fivepostRows?: PendingFivepostRow[];
  legacyRows?: PendingLegacyTableRow[];
  quote?: QuoteResult | null;
  managerStatus?: HaulzCalcDraftStatus;
  managerStatusLoading?: boolean;
  onStatusChange?: (status: HaulzCalcDraftStatus) => void;
  onSubmitTo1c?: () => void;
  submitTo1cLoading?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  deleteLoading?: boolean;
};

export function DocumentsOrderJournalExpand({
  customer,
  senderPoint,
  destinationPoint,
  sender,
  receiver,
  routeLabel,
  pickupDate,
  fivepostRows = [],
  legacyRows = [],
  quote,
  managerStatus,
  managerStatusLoading,
  onStatusChange,
  onSubmitTo1c,
  submitTo1cLoading,
  onEdit,
  onDelete,
  deleteLoading,
}: Props) {
  const hasCargo = fivepostRows.length > 0 || legacyRows.length > 0;

  return (
    <div style={{ padding: "0.75rem", borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-primary)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "0.65rem",
          flexWrap: "wrap",
        }}
      >
        <DocumentsRouteBadge>{routeLabel || "—"}</DocumentsRouteBadge>
        {pickupDate && (
          <span style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
            Забор: <DateText value={pickupDate} />
          </span>
        )}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(170px, 220px) 1fr",
          gap: "0.35rem 0.75rem",
          fontSize: "0.85rem",
          marginBottom: hasCargo || quote ? "0.75rem" : 0,
        }}
      >
        <JournalGridRow label="Заказчик:" value={customer} />
        <JournalGridRow label="Пункт отправки:" value={senderPoint} />
        <JournalGridRow label="Отправитель:" value={sender} />
        <JournalGridRow label="Пункт назначения:" value={destinationPoint} />
        <JournalGridRow label="Получатель:" value={receiver} />
      </div>
      {hasCargo ? (
        <DocumentsOrdersPendingCargo fivepostRows={fivepostRows} legacyRows={legacyRows} />
      ) : (
        <p style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
          Нет данных по посылкам
        </p>
      )}
      {quote && (
        <div style={{ marginTop: "0.75rem" }}>
          <p style={{ fontSize: "0.8rem", fontWeight: 600, margin: "0 0 0.35rem", color: "var(--color-text-secondary)" }}>
            Расчёт
          </p>
          <table className="doc-inner-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <tbody>
              {quote.lines.map((line) => (
                <tr key={line.key} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.35rem 0.3rem" }}>{line.label}</td>
                  <td style={{ padding: "0.35rem 0.3rem", textAlign: "right", whiteSpace: "nowrap" }}>
                    {line.meta?.informational ? "—" : `${line.amountRub.toLocaleString("ru-RU")} ₽`}
                  </td>
                </tr>
              ))}
              <tr style={{ fontWeight: 600 }}>
                <td style={{ padding: "0.35rem 0.3rem" }}>Итого</td>
                <td style={{ padding: "0.35rem 0.3rem", textAlign: "right", whiteSpace: "nowrap" }}>
                  {quote.totalRub.toLocaleString("ru-RU")} ₽
                </td>
              </tr>
            </tbody>
          </table>
          <p style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", margin: "0.35rem 0 0" }}>
            {formatQuoteVatLine(quote.totalRub)}
          </p>
        </div>
      )}
      {managerStatus && onStatusChange && (
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            flexWrap: "wrap",
            marginTop: "0.75rem",
            alignItems: "center",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem" }}>
            <span style={{ color: "var(--color-text-secondary)", fontWeight: 600 }}>Статус:</span>
            <ManagerJournalStatusSelect
              value={managerStatus}
              disabled={managerStatusLoading}
              loading={managerStatusLoading}
              onChange={onStatusChange}
            />
          </label>
          {managerStatus === "awaiting_call" && (
            <>
              <button
                type="button"
                className="haulz-calc-btn-primary"
                disabled={managerStatusLoading}
                onClick={() => onStatusChange("agreed")}
              >
                Согласовано
              </button>
              <button
                type="button"
                className="haulz-calc-btn-secondary"
                disabled={managerStatusLoading}
                onClick={() => onStatusChange("rejected")}
              >
                Не согласовано
              </button>
            </>
          )}
          {managerStatus === "agreed" && onSubmitTo1c && (
            <button
              type="button"
              className="haulz-calc-btn-primary"
              disabled={submitTo1cLoading || managerStatusLoading}
              onClick={onSubmitTo1c}
            >
              {submitTo1cLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Отправить в 1С
            </button>
          )}
          {onEdit && (
            <button type="button" className="haulz-calc-btn-secondary" onClick={onEdit}>
              <Pencil className="w-4 h-4" style={{ display: "inline", marginRight: "0.25rem" }} />
              Изменить
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="haulz-calc-btn-secondary haulz-calc-drafts-delete"
              disabled={deleteLoading}
              onClick={onDelete}
            >
              {deleteLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" style={{ display: "inline", marginRight: "0.25rem" }} />
              )}
              Удалить
            </button>
          )}
        </div>
      )}
    </div>
  );
}
