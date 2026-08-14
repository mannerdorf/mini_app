import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AuthData } from "../../types";
import { fetchHaulzPartyByInn } from "../../api/client/haulzCalculator";
import { formatHaulzCalcFetchError } from "../../lib/haulzCalcFetchError";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

type Props = {
  auth: AuthData;
  inn: string;
  setInn: (v: string) => void;
  companyName: string;
  setCompanyName: (v: string) => void;
  embedded?: boolean;
};

export function HaulzCalcCustomerBlock({
  auth,
  inn,
  setInn,
  companyName,
  setCompanyName,
  embedded = false,
}: Props) {
  const [innLoading, setInnLoading] = useState(false);
  const [innError, setInnError] = useState<string | null>(null);
  const [innTouched, setInnTouched] = useState(() => inn.replace(/\D/g, "").length > 0);
  const [partnerHint, setPartnerHint] = useState<{
    label: string;
    kind: "active_partner" | "need_contract" | "new_partner";
    hasEdo: boolean;
  } | null>(null);

  const debouncedInn = useDebounced(inn.replace(/\D/g, ""), 500);

  useEffect(() => {
    if (!innTouched) return;
    const digits = debouncedInn;
    if (digits.length !== 10 && digits.length !== 12) {
      setInnLoading(false);
      setInnError(digits.length > 0 ? "ИНН: 10 цифр (ЮЛ) или 12 (ИП)" : null);
      setPartnerHint(null);
      return;
    }
    let cancelled = false;
    setInnLoading(true);
    setInnError(null);
    setPartnerHint(null);
    fetchHaulzPartyByInn(auth, digits)
      .then(({ party, partnerDirectory }) => {
        if (!cancelled) {
          setInn(party.inn);
          setCompanyName(party.fullName);
          setPartnerHint({ label: partnerDirectory.label, kind: partnerDirectory.kind, hasEdo: partnerDirectory.hasEdo });
          setInnError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setPartnerHint(null);
          setInnError(formatHaulzCalcFetchError(e, "Не удалось найти организацию"));
        }
      })
      .finally(() => {
        if (!cancelled) setInnLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [auth, debouncedInn, innTouched, setCompanyName, setInn]);

  const body = (
    <div className="haulz-calc-contacts haulz-calc-contacts--customer">
      <label className="haulz-calc-field haulz-calc-contacts__inn">
        <span className="haulz-calc-label">ИНН</span>
        <input
          type="text"
          inputMode="numeric"
          className="haulz-calc-input"
          placeholder="10 или 12 цифр"
          value={inn}
          maxLength={12}
          onChange={(e) => {
            setInnTouched(true);
            setInn(e.target.value.replace(/\D/g, "").slice(0, 12));
            if (innError) setInnError(null);
            setPartnerHint(null);
          }}
        />
        {innLoading && (
          <span className="haulz-calc-field-hint">
            <Loader2 className="w-3 h-3 animate-spin" style={{ display: "inline", marginRight: "0.25rem" }} />
            Загружаем наименование…
          </span>
        )}
        {innError && !innLoading && <span className="haulz-calc-field-hint haulz-calc-field-hint--error">{innError}</span>}
      </label>
      {inn.replace(/\D/g, "").length > 0 && (
        <label className="haulz-calc-field haulz-calc-contacts__company">
          <span className="haulz-calc-label">Полное наименование</span>
          <input
            className="haulz-calc-input"
            placeholder="Заполнится по ИНН или введите вручную"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
          {partnerHint && (
            <div className="haulz-calc-partner-hints">
              <span
                className={`haulz-calc-field-hint haulz-calc-partner-hint haulz-calc-partner-hint--${partnerHint.kind}`}
              >
                {partnerHint.label}
              </span>
              <span
                className={`haulz-calc-field-hint haulz-calc-partner-hint haulz-calc-partner-hint--edo-${partnerHint.hasEdo ? "yes" : "no"}`}
              >
                {partnerHint.hasEdo ? "Есть ЭДО" : "Нет ЭДО"}
              </span>
            </div>
          )}
        </label>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="haulz-calc-customer-embedded">
        <h2 className="haulz-calc-card__title">Заказчик</h2>
        {body}
      </div>
    );
  }

  return (
    <div className="haulz-calc-card haulz-calc-card--customer">
      <h2 className="haulz-calc-card__title">Заказчик</h2>
      <p className="haulz-calc-card__subtitle">По ИНН заказчика подставляется согласованный тариф при наличии договора</p>
      {body}
    </div>
  );
}
