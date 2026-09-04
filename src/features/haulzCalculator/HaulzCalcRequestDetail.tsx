import React from "react";
import { Loader2, X } from "lucide-react";
import type { DocumentsOrderJournalView, HaulzCalcDraft } from "../../api/client/haulzCalculator";
import { formatQuoteVatLine } from "../../../lib/haulzCalculator/quoteVat";
import {
  HAULZ_CALC_DRAFT_STATUS_LABELS,
  type HaulzCalcDraftStatus,
} from "../../../lib/haulzCalculator/draftStatus";
import {
  legRequiresPvzCreation,
  PVZ_CREATION_REQUIRED_NOTE,
} from "../../../lib/haulzCalculator/orderAddressKind";
import { formatHaulzCalcDraftCustomer } from "../../../lib/haulzCalculator/draftCustomerDisplay";
import { mainlineModeLabelRu } from "../../../lib/haulzCalculator/mainlineMode";
import { DocumentsRouteBadge } from "../documents/views/documentsViewBlocks";
import { DateText } from "../../components/ui/DateText";
import {
  DocumentsOrdersPendingCargo,
  type PendingFivepostRow,
  type PendingLegacyTableRow,
} from "../documents/orders/DocumentsOrdersPendingCargo";
import { haulzCalcDraftStatusBadgeClass } from "./haulzCalcDraftStatusBadge";

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function partyModeLabel(mode: string): string {
  return mode === "point" ? "Со склада" : "Курьером";
}

type Props = {
  draft: HaulzCalcDraft;
  managerMode?: boolean;
  statusLoading: boolean;
  submitTo1cLoading?: boolean;
  onClose?: () => void;
  onAgreed: () => void;
  onRejected: () => void;
  onSubmitTo1c?: () => void;
  onContinue: () => void;
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="haulz-calc-requests-detail__row">
      <dt className="haulz-calc-requests-detail__label">{label}</dt>
      <dd className="haulz-calc-requests-detail__value">{value}</dd>
    </div>
  );
}

function RouteAddressValue({
  address,
  partyMode,
  addressKind,
}: {
  address: string;
  partyMode?: "courier" | "point";
  addressKind?: "pvz" | "custom" | "warehouse";
}) {
  const needsPvz = legRequiresPvzCreation(partyMode ?? "courier", addressKind);
  return (
    <>
      <span className={needsPvz ? "haulz-calc-requests-detail__address--needs-pvz" : undefined}>{address}</span>
      {partyMode && (
        <span className="haulz-calc-requests-detail__muted"> · {partyModeLabel(partyMode)}</span>
      )}
      {needsPvz && (
        <span className="haulz-calc-requests-detail__pvz-warn">{PVZ_CREATION_REQUIRED_NOTE}</span>
      )}
    </>
  );
}

function JournalGridRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <span style={{ color: "var(--color-text-secondary)", fontWeight: 600 }}>{label}</span>
      <span>{value || "—"}</span>
    </>
  );
}

function DocumentsOrderJournalBlock({ journal }: { journal: DocumentsOrderJournalView }) {
  const fivepostRows = journal.fivepostRows as PendingFivepostRow[];
  const legacyRows = journal.legacyTableRows as PendingLegacyTableRow[];
  const hasCargo = fivepostRows.length > 0 || legacyRows.length > 0;

  return (
    <section className="haulz-calc-requests-detail__section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginBottom: "0.65rem", flexWrap: "wrap" }}>
        <DocumentsRouteBadge>{journal.routeLabel || "—"}</DocumentsRouteBadge>
        {journal.pickupDate && (
          <span style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
            Забор: <DateText value={journal.pickupDate} />
          </span>
        )}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(130px, 170px) 1fr",
          gap: "0.35rem 0.75rem",
          fontSize: "0.85rem",
          marginBottom: hasCargo ? "0.75rem" : 0,
        }}
      >
        <JournalGridRow label="Заказчик:" value={journal.customerName} />
        <JournalGridRow label="Номер заявки заказчика:" value={journal.customerRequestNumber} />
        <JournalGridRow label="Пункт отправки:" value={journal.senderPoint} />
        <JournalGridRow label="Отправитель:" value={journal.senderName} />
        <JournalGridRow label="Пункт назначения:" value={journal.destinationPoint} />
        <JournalGridRow label="Получатель:" value={journal.receiverName} />
      </div>
      {hasCargo ? (
        <DocumentsOrdersPendingCargo fivepostRows={fivepostRows} legacyRows={legacyRows} />
      ) : (
        <p className="haulz-calc-requests-detail__muted">Нет данных по грузу</p>
      )}
    </section>
  );
}

export function HaulzCalcRequestDetail({
  draft: d,
  managerMode,
  statusLoading,
  submitTo1cLoading,
  onClose,
  onAgreed,
  onRejected,
  onSubmitTo1c,
  onContinue,
}: Props) {
  const f = d.formState;
  const q = d.quoteResult;
  const journal = d.documentsOrderJournal;
  const showDocumentsJournal = Boolean(journal);

  return (
    <article className="haulz-calc-requests-detail">
      <header className="haulz-calc-requests-detail__head">
        <div className="haulz-calc-requests-detail__head-text">
          <h2 className="haulz-calc-requests-detail__title">{d.title || `Заявка #${d.id}`}</h2>
          <p className="haulz-calc-requests-detail__sub">
            <span className={`haulz-calc-requests-badge ${haulzCalcDraftStatusBadgeClass(d.status)}`}>
              {HAULZ_CALC_DRAFT_STATUS_LABELS[d.status] ?? d.status}
            </span>
            {d.nomerZayavki && <span className="haulz-calc-requests-detail__nomer">№ {d.nomerZayavki}</span>}
          </p>
        </div>
        {onClose && (
          <button type="button" className="haulz-calc-requests-detail__close" onClick={onClose} aria-label="Закрыть">
            <X className="w-5 h-5" />
          </button>
        )}
      </header>

      <div className="haulz-calc-requests-detail__body">
        <section className="haulz-calc-requests-detail__section">
          <h3 className="haulz-calc-requests-detail__section-title">Общее</h3>
          <dl className="haulz-calc-requests-detail__grid">
            <DetailRow label="ID" value={String(d.id)} />
            {managerMode && (
              <>
                <DetailRow
                  label="Заказчик"
                  value={
                    d.loginKey === "__guest__"
                      ? String(f.guestContactEmail || "").trim() || "Гость (сайт)"
                      : formatHaulzCalcDraftCustomer(f, d.loginKey)
                  }
                />
                {d.loginKey && d.loginKey !== "__guest__" && <DetailRow label="Логин ЛК" value={d.loginKey} />}
                {d.loginKey === "__guest__" && (
                  <>
                    <DetailRow label="Телефон" value={f.guestContactPhone} />
                    <DetailRow label="Email" value={f.guestContactEmail} />
                  </>
                )}
              </>
            )}
            <DetailRow label="Создано" value={formatWhen(d.createdAt)} />
            <DetailRow label="Обновлено" value={formatWhen(d.updatedAt)} />
            {d.recipientEmail && <DetailRow label="КП на почту" value={d.recipientEmail} />}
            {!showDocumentsJournal && f.dataZabora && <DetailRow label="Дата забора" value={f.dataZabora} />}
          </dl>
        </section>

        {showDocumentsJournal && journal ? (
          <DocumentsOrderJournalBlock journal={journal} />
        ) : (
          <>
            <section className="haulz-calc-requests-detail__section">
              <h3 className="haulz-calc-requests-detail__section-title">Маршрут</h3>
              <dl className="haulz-calc-requests-detail__grid">
                <DetailRow
                  label="Откуда"
                  value={
                    <RouteAddressValue
                      address={f.from?.fullAddress || f.fromQuery || "—"}
                      partyMode={f.fromMode}
                      addressKind={f.fromAddressKind}
                    />
                  }
                />
                <DetailRow
                  label="Куда"
                  value={
                    <RouteAddressValue
                      address={f.to?.fullAddress || f.toQuery || "—"}
                      partyMode={f.toMode}
                      addressKind={f.toAddressKind}
                    />
                  }
                />
                {f.mainlineMode && (
                  <DetailRow label="Перевозка" value={mainlineModeLabelRu(f.mainlineMode)} />
                )}
              </dl>
            </section>

            <section className="haulz-calc-requests-detail__section">
              <h3 className="haulz-calc-requests-detail__section-title">Отправитель</h3>
              <dl className="haulz-calc-requests-detail__grid">
                <DetailRow label="ИНН" value={f.fromInn} />
                <DetailRow label="Наименование" value={f.fromCompanyName} />
                <DetailRow label="Контакт" value={f.fromName} />
                <DetailRow label="Телефон" value={f.fromPhone} />
              </dl>
            </section>

            <section className="haulz-calc-requests-detail__section">
              <h3 className="haulz-calc-requests-detail__section-title">Получатель</h3>
              <dl className="haulz-calc-requests-detail__grid">
                <DetailRow label="ИНН" value={f.toInn} />
                <DetailRow label="Наименование" value={f.toCompanyName} />
                <DetailRow label="Контакт" value={f.toName} />
                <DetailRow label="Телефон" value={f.toPhone} />
              </dl>
            </section>

            {f.places?.length > 0 && (
              <section className="haulz-calc-requests-detail__section">
                <h3 className="haulz-calc-requests-detail__section-title">Груз</h3>
                <ul className="haulz-calc-requests-detail__places">
                  {f.places.map((p, i) => (
                    <li key={i}>
                      Место {i + 1}: {p.weightKg} кг, {p.volumeM3} м³
                    </li>
                  ))}
                </ul>
                {f.declaredValue && (
                  <p className="haulz-calc-requests-detail__muted">Объявленная стоимость: {f.declaredValue}</p>
                )}
              </section>
            )}
          </>
        )}

        {q && (
          <section className="haulz-calc-requests-detail__section">
            <h3 className="haulz-calc-requests-detail__section-title">Расчёт</h3>
            <table className="haulz-calc-requests-detail__quote">
              <tbody>
                {q.lines.map((line) => (
                  <tr key={line.key}>
                    <td>{line.label}</td>
                    <td>{line.meta?.informational ? "—" : `${line.amountRub.toLocaleString("ru-RU")} ₽`}</td>
                  </tr>
                ))}
                <tr className="haulz-calc-requests-detail__quote-total">
                  <td>Итого</td>
                  <td>{q.totalRub.toLocaleString("ru-RU")} ₽</td>
                </tr>
              </tbody>
            </table>
            <p className="haulz-calc-requests-detail__vat">{formatQuoteVatLine(q.totalRub)}</p>
            {q.deliveryDays > 0 && (
              <p className="haulz-calc-requests-detail__muted">Срок доставки: ~{q.deliveryDays} дн.</p>
            )}
          </section>
        )}
      </div>

      <footer className="haulz-calc-requests-detail__footer">
        {managerMode && d.status === "awaiting_call" && (
          <div className="haulz-calc-requests-detail__footer-actions">
            <button
              type="button"
              className="haulz-calc-btn-primary"
              disabled={statusLoading}
              onClick={onAgreed}
            >
              {statusLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Согласовано
            </button>
            <button
              type="button"
              className="haulz-calc-btn-secondary"
              disabled={statusLoading}
              onClick={onRejected}
            >
              Не согласовано
            </button>
          </div>
        )}
        {managerMode && d.status === "agreed" && onSubmitTo1c && (
          <div className="haulz-calc-requests-detail__footer-actions">
            <button
              type="button"
              className="haulz-calc-btn-primary"
              disabled={submitTo1cLoading || statusLoading}
              onClick={onSubmitTo1c}
            >
              {submitTo1cLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Отправить в 1С
            </button>
          </div>
        )}
        {!managerMode && (
          <div className="haulz-calc-requests-detail__footer-actions">
            <button type="button" className="haulz-calc-btn-primary" onClick={onContinue}>
              Открыть в калькуляторе
            </button>
          </div>
        )}
      </footer>
    </article>
  );
}
