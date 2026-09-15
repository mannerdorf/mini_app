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

type Props = {
  city: City;
  data: JobData;
  call: PickupCall;
  onPatch: (patch: Partial<JobData>) => void;
  num: (v: string) => number | null;
};

export function PickupCustomerQuoteSection({ city, data, call, onPatch, num }: Props) {
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
        mkadKm: city === "moscow" || city === "kaliningrad" ? q.km : data.mkadKm,
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
        Расчёт по матрице забора из админки HAULZ (как первая миля в заявках). После
        расчёта значения можно скорректировать вручную.
      </p>
      <button
        type="button"
        className="pk-primary pk-customer-quote__btn"
        disabled={busy}
        onClick={() => void runQuote()}
      >
        {busy ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Рассчитываем…
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
      {lastQuote && (
        <p className="pk-customer-quote__summary" role="status">
          {lastQuote.summary}
        </p>
      )}
      <div className="pk-grid pk-customer-quote__fields">
        <Field
          label="Стоимость для заказчика, ₽"
          type="number"
          min="0"
          step="0.01"
          value={data.priceRub}
          onChange={(v) => onPatch({ priceRub: num(v) })}
        />
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
