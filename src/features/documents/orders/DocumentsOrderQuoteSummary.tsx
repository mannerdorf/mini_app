import React from "react";
import { Loader2 } from "lucide-react";
import type { QuoteResult } from "../../../../lib/haulzCalculator/types";
import { formatQuoteVatLine } from "../../../../lib/haulzCalculator/quoteVat";
import { HaulzCalcTariffBasisFootnote } from "../../haulzCalculator/HaulzCalcTariffBasisFootnote";

export type Order1cSandboxSnapshot = {
  at: string;
  ok: boolean;
  status?: number;
  error?: string | null;
  request: unknown;
  response: unknown;
  requestId?: string;
};

type Props = {
  quote: QuoteResult | null;
  loading: boolean;
  error: string | null;
  canQuote: boolean;
  canSubmit: boolean;
  orderLoading: boolean;
  dataZabora: string;
  setDataZabora: (v: string) => void;
  nomerZayavki: string;
  setNomerZayavki: (v: string) => void;
  emptyHint: string;
  onSubmit: () => void;
};

export function DocumentsOrderQuoteSummary({
  quote,
  loading,
  error,
  canQuote,
  canSubmit,
  orderLoading,
  dataZabora,
  setDataZabora,
  nomerZayavki,
  setNomerZayavki,
  emptyHint,
  onSubmit,
}: Props) {
  return (
    <aside className="haulz-calc-summary-wrap" aria-label="Ваш расчёт">
      <div className="haulz-calc-summary">
        <h2 className="haulz-calc-summary__title">Ваш расчёт</h2>

        {loading && (
          <p className="haulz-calc-summary__empty" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <Loader2 className="w-4 h-4 animate-spin" />
            Пересчёт…
          </p>
        )}

        {!quote && !loading && (
          <p className={`haulz-calc-summary__empty${error && canQuote ? " haulz-calc-summary__empty--error" : ""}`}>
            {error && canQuote ? error : emptyHint}
          </p>
        )}

        {quote && (
          <>
            {quote.warnings.map((w) => (
              <div key={w} className="haulz-calc-alert haulz-calc-alert--warn" style={{ marginBottom: "0.5rem" }}>
                {w}
              </div>
            ))}

            {quote.lines.map((line) => {
              const info = line.meta?.informational === true;
              return (
                <div
                  key={line.key}
                  className={`haulz-calc-summary__line${info ? " haulz-calc-summary__line--muted" : ""}`}
                >
                  <span>{line.label}</span>
                  <span>{info ? "—" : `${line.amountRub.toLocaleString("ru-RU")} ₽`}</span>
                </div>
              );
            })}

            <div className="haulz-calc-summary__divider" />

            <div className="haulz-calc-summary__total">
              <span>Итого</span>
              <span className="haulz-calc-summary__total-value">{quote.totalRub.toLocaleString("ru-RU")} ₽</span>
            </div>
            <p className="haulz-calc-summary__vat">{formatQuoteVatLine(quote.totalRub)}</p>
            <HaulzCalcTariffBasisFootnote footnote={quote.tariffBasisFootnote} />

            {quote.deliveryDays > 0 && (
              <p className="haulz-calc-summary__days">Срок доставки: ~{quote.deliveryDays} дн.</p>
            )}
          </>
        )}

        <label className="haulz-calc-field">
          <span className="haulz-calc-label">Дата забора</span>
          <input
            type="date"
            className="haulz-calc-input"
            value={dataZabora}
            onChange={(e) => setDataZabora(e.target.value)}
          />
        </label>

        <label className="haulz-calc-field">
          <span className="haulz-calc-label">Номер заявки заказчика</span>
          <input
            type="text"
            className="haulz-calc-input"
            placeholder="Необязательно"
            value={nomerZayavki}
            onChange={(e) => setNomerZayavki(e.target.value)}
          />
        </label>

        {error ? <div className="haulz-calc-alert haulz-calc-alert--error">{error}</div> : null}

        <p className="haulz-calc-1c-sandbox__empty" style={{ marginTop: "0.65rem" }}>
          После «Оформить» заявка попадёт менеджеру на согласование; отправка в 1С — после статуса «Согласовано».
        </p>

        <div className="haulz-calc-summary__actions" style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className="haulz-calc-btn-primary"
            disabled={!canSubmit || orderLoading}
            onClick={onSubmit}
          >
            {orderLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Оформить
          </button>
        </div>
      </div>
    </aside>
  );
}
