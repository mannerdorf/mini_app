import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { City, JobData } from "../../../lib/pickup/model";
import type { PickupCall } from "./client";
import { Textarea } from "./Forms";
import { TapSwitch } from "../../components/TapSwitch";

export type PickupCustomerQuoteView = {
  totalRub: number;
  km: number;
  chargeableWeightKg: number;
  summary: string;
};

type BillMode = "auto" | "manual";

type Props = {
  city: City;
  data: JobData;
  call: PickupCall;
  onPatch: (patch: Partial<JobData>) => void;
  num: (v: string) => number | null;
};

function legacyIssueBill(data: JobData): boolean {
  if (data.issueCustomerBill) return true;
  return data.priceRub != null;
}

function legacyBillMode(data: JobData): BillMode {
  if (data.customerBillMode === "manual" || data.customerBillMode === "auto") {
    return data.customerBillMode;
  }
  return data.priceRub != null ? "manual" : "auto";
}

export function PickupCustomerQuoteSection({
  city,
  data,
  call,
  onPatch,
  num,
}: Props) {
  const [issueBill, setIssueBill] = useState(() => legacyIssueBill(data));
  const [billMode, setBillMode] = useState<BillMode>(() => legacyBillMode(data));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastQuote, setLastQuote] = useState<PickupCustomerQuoteView | null>(
    null,
  );

  useEffect(() => {
    setIssueBill(legacyIssueBill(data));
    setBillMode(legacyBillMode(data));
  }, [data.issueCustomerBill, data.customerBillMode, data.priceRub]);

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
        km_override: null,
      });
      const q = r.quote as PickupCustomerQuoteView;
      setLastQuote(q);
      onPatch({
        priceRub: q.totalRub,
        mkadKm: q.km,
        issueCustomerBill: true,
        customerBillMode: "auto",
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setIssue = (on: boolean) => {
    setIssueBill(on);
    setError("");
    if (!on) {
      setLastQuote(null);
      onPatch({
        issueCustomerBill: false,
        customerBillMode: "",
        priceRub: null,
        mkadKm: null,
      });
      return;
    }
    const mode: BillMode = billMode === "manual" ? "manual" : "auto";
    setBillMode(mode);
    onPatch({
      issueCustomerBill: true,
      customerBillMode: mode,
    });
  };

  const setMode = (mode: BillMode) => {
    setBillMode(mode);
    setError("");
    if (mode === "auto") setLastQuote(null);
    onPatch({
      issueCustomerBill: true,
      customerBillMode: mode,
    });
  };

  return (
    <section className="pk-customer-quote">
      <h3>Расчёты с заказчиком</h3>

      <div className="pk-customer-quote__toggle-row">
        <span className="pk-customer-quote__toggle-label">Выставлять счёт</span>
        <TapSwitch
          variant="comfortable"
          checked={issueBill}
          onToggle={() => setIssue(!issueBill)}
          aria-label={
            issueBill ? "Не выставлять счёт заказчику" : "Выставлять счёт заказчику"
          }
        />
      </div>

      {issueBill ? (
        <div className="pk-grid pk-customer-quote__fields">
          <div className="pk-field pk-customer-quote__price-mode">
            <span>Способ расчёта суммы</span>
            <select
              className="pk-customer-quote__select"
              value={billMode}
              onChange={(e) => setMode(e.target.value as BillMode)}
            >
              <option value="auto">Автоматически</option>
              <option value="manual">Вручную</option>
            </select>

            {billMode === "auto" ? (
              <div className="pk-customer-quote__auto">
                <p className="pk-hint">
                  По матрице забора HAULZ, расстояние от {ringLabel} считается
                  автоматически.
                </p>
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
                placeholder="Сумма счёта, ₽"
                value={data.priceRub ?? ""}
                onChange={(e) =>
                  onPatch({
                    priceRub: num(e.target.value),
                    issueCustomerBill: true,
                    customerBillMode: "manual",
                  })
                }
              />
            )}
          </div>
        </div>
      ) : null}

      <Textarea
        label="Примечание"
        value={data.note}
        onChange={(v) => onPatch({ note: v })}
      />
    </section>
  );
}
