import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import type { City, JobData } from "../../../lib/pickup/model";
import type { PickupCall } from "./client";
import { Field, Textarea } from "./Forms";

export type PickupCustomerQuoteView = {
  totalRub: number;
  km: number;
  chargeableWeightKg: number;
  summary: string;
};

type PriceMode = "auto" | "manual";

type Props = {
  city: City;
  data: JobData;
  call: PickupCall;
  onPatch: (patch: Partial<JobData>) => void;
  num: (v: string) => number | null;
};

export function PickupCustomerQuoteSection({ city, data, call, onPatch, num }: Props) {
  const [priceMode, setPriceMode] = useState<PriceMode>(() =>
    data.priceRub != null ? "manual" : "auto",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastQuote, setLastQuote] = useState<PickupCustomerQuoteView | null>(null);

  const ringLabel = city === "moscow" ? "МКАД" : "КАД";

  const runQuote = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await call({
        action: "customer_quote",
        city,
        weight_kg: data.weightKg,
        volume_m3: data.volumeM3,
        latitude: data.latitude,
        longitude: data.longitude,
        km_override: data.mkadKm,
      });
      const q = r.quote as PickupCustomerQuoteView;
      setLastQuote(q);
      onPatch({
        priceRub: q.totalRub,
        mkadKm: q.km,
        payment:
          data.payment === "Не указано" || !data.payment.trim()
            ? `Забор по тарифу (${ringLabel})`
            : data.payment,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="pk-customer-quote">
      <h3>Расчёты с заказчиком</h3>
      <p className="pk-hint">
        Стоимость — по матрице забора из админки HAULZ или вручную. Оплата и километры
        можно править отдельно.
      </p>

      <div className="pk-grid pk-customer-quote__fields">
        <div className="pk-field pk-customer-quote__price-mode">
          <span>Стоимость для заказчика, ₽</span>
          <select
            className="pk-customer-quote__select"
            value={priceMode}
            onChange={(e) => {
              const mode = e.target.value as PriceMode;
              setPriceMode(mode);
              setError("");
              if (mode === "auto") setLastQuote(null);
            }}
          >
            <option value="auto">Рассчитать автоматически</option>
            <option value="manual">Ввести вручную</option>
          </select>

          {priceMode === "auto" ? (
            <div className="pk-customer-quote__auto">
              <button
                type="button"
                className="pk-primary pk-customer-quote__btn"
                disabled={busy}
                onClick={() => void runQuote()}
              >
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden />{" "}
                    Рассчитываем…
                  </>
                ) : (
                  "Рассчитать"
                )}
              </button>
              {error && (
                <p className="pk-hint haulz-calc-hint--error" role="alert">
                  {error}
                </p>
              )}
              {(lastQuote || data.priceRub != null) && (
                <p className="pk-customer-quote__summary" role="status">
                  {lastQuote?.summary ??
                    (data.priceRub != null
                      ? `Стоимость: ${data.priceRub.toLocaleString("ru-RU")} ₽`
                      : "")}
                </p>
              )}
            </div>
          ) : (
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Сумма, ₽"
              value={data.priceRub ?? ""}
              onChange={(e) => onPatch({ priceRub: num(e.target.value) })}
            />
          )}
        </div>

        <Field
          label="Оплата / указание бухгалтерии"
          value={data.payment}
          onChange={(v) => onPatch({ payment: v })}
        />
        <Field
          label={`Километры от ${ringLabel}`}
          type="number"
          min="0"
          step="any"
          value={data.mkadKm}
          onChange={(v) => onPatch({ mkadKm: num(v) })}
        />
      </div>
      <Textarea
        label="Примечание"
        value={data.note}
        onChange={(v) => onPatch({ note: v })}
      />
    </section>
  );
}
