import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AuthData } from "../../../types";
import { fetchHaulzPartyByInn } from "../../../api/client/haulzCalculator";
import { formatPhoneMask } from "../../../lib/formatPhoneMask";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

type Props = {
  side: "from" | "to";
  auth: AuthData;
  inn: string;
  setInn: (v: string) => void;
  companyName: string;
  setCompanyName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  contactName: string;
  setContactName: (v: string) => void;
  /** Как в калькуляторе: по умолчанию только телефон и ФИО */
  showInnFields?: boolean;
};

export function DocumentsOrderCustomAddressContacts({
  side,
  auth,
  inn,
  setInn,
  companyName,
  setCompanyName,
  phone,
  setPhone,
  contactName,
  setContactName,
  showInnFields = false,
}: Props) {
  const [innLoading, setInnLoading] = useState(false);
  const [innError, setInnError] = useState<string | null>(null);
  const [innTouched, setInnTouched] = useState(false);
  const lastFetchedInnRef = useRef("");

  const innDigits = inn.replace(/\D/g, "");
  const debouncedInn = useDebounced(innDigits, 500);
  const innLabel = side === "from" ? "ИНН отправителя" : "ИНН получателя";

  useEffect(() => {
    if (!showInnFields || !innTouched) return;
    if (debouncedInn.length !== 10 && debouncedInn.length !== 12) {
      setInnLoading(false);
      setInnError(debouncedInn.length > 0 ? "ИНН: 10 цифр (ЮЛ) или 12 (ИП)" : null);
      lastFetchedInnRef.current = "";
      return;
    }
    if (lastFetchedInnRef.current === debouncedInn) return;
    lastFetchedInnRef.current = debouncedInn;

    let cancelled = false;
    setInnLoading(true);
    setInnError(null);
    fetchHaulzPartyByInn(auth, debouncedInn)
      .then(({ party }) => {
        if (!cancelled) {
          if (party.inn !== innDigits) setInn(party.inn);
          if (party.fullName !== companyName) setCompanyName(party.fullName);
          setInnError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          lastFetchedInnRef.current = "";
          setInnError((e as Error)?.message || "Не удалось найти организацию");
        }
      })
      .finally(() => {
        if (!cancelled) setInnLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [auth, debouncedInn, innTouched, showInnFields]);

  return (
    <div className="haulz-calc-contacts">
      {showInnFields && (
        <>
          <label className="haulz-calc-field haulz-calc-contacts__inn">
            <span className="haulz-calc-label">{innLabel}</span>
            <input
              type="text"
              inputMode="numeric"
              className="haulz-calc-input"
              placeholder="10 или 12 цифр"
              value={inn}
              maxLength={12}
              onChange={(e) => {
                setInnTouched(true);
                lastFetchedInnRef.current = "";
                setInn(e.target.value.replace(/\D/g, "").slice(0, 12));
                if (innError) setInnError(null);
              }}
            />
            {innLoading && (
              <span className="haulz-calc-field-hint">
                <Loader2 className="w-3 h-3 animate-spin" style={{ display: "inline", marginRight: "0.25rem" }} />
                Загружаем наименование…
              </span>
            )}
            {innError && !innLoading && (
              <span className="haulz-calc-field-hint haulz-calc-field-hint--error">{innError}</span>
            )}
          </label>

          {innDigits.length > 0 && (
            <label className="haulz-calc-field haulz-calc-contacts__company">
              <span className="haulz-calc-label">Наименование</span>
              <input
                className="haulz-calc-input"
                placeholder="Заполнится по ИНН или введите вручную"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </label>
          )}
        </>
      )}

      <label className="haulz-calc-field">
        <span className="haulz-calc-label">Телефон</span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          className="haulz-calc-input"
          placeholder="+7 (___) ___-__-__"
          value={phone}
          onChange={(e) => setPhone(formatPhoneMask(e.target.value))}
        />
      </label>
      <label className="haulz-calc-field">
        <span className="haulz-calc-label">ФИО контактного лица</span>
        <input
          className="haulz-calc-input"
          placeholder="Иванов Иван Иванович"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
        />
      </label>
    </div>
  );
}
