import React, { useEffect, useState } from "react";
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
  data,
  onPatch,
  num,
}: Props) {
  const [issueBill, setIssueBill] = useState(() => legacyIssueBill(data));
  const [billMode, setBillMode] = useState<BillMode>(() => legacyBillMode(data));
  useEffect(() => {
    setIssueBill(legacyIssueBill(data));
    setBillMode(legacyBillMode(data));
  }, [data.issueCustomerBill, data.customerBillMode, data.priceRub]);

  const setIssue = (on: boolean) => {
    setIssueBill(on);
    if (!on) {
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

            {billMode === "manual" && (
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
