import React, { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AuthData } from "../../../types";
import type { PvzItem } from "../../../api/client/documentsOrders";
import { fetchHaulzPartyByInn } from "../../../api/client/haulzCalculator";
import { formatHaulzCalcFetchError } from "../../../lib/haulzCalcFetchError";
import {
  buildDocumentsOrderSendersDirectory,
  pickDefaultDocumentsOrderSender,
  type DocumentsOrderSenderOption,
} from "../../../../lib/documentsOrderSendersDirectory";

const MANUAL_KEY = "__manual__";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export type DocumentsOrderSenderState = {
  inn: string;
  companyName: string;
};

type Props = {
  auth: AuthData;
  pvzList: PvzItem[];
  activeInn: string;
  activeCustomerName?: string | null;
  value: DocumentsOrderSenderState;
  onChange: (next: DocumentsOrderSenderState) => void;
};

export function DocumentsOrderSenderBlock({
  auth,
  pvzList,
  activeInn,
  activeCustomerName,
  value,
  onChange,
}: Props) {
  const options = useMemo(
    () =>
      buildDocumentsOrderSendersDirectory(pvzList, {
        inn: activeInn,
        name: activeCustomerName,
      }),
    [pvzList, activeInn, activeCustomerName],
  );

  const matchedKey = useMemo(() => {
    const inn = value.inn.replace(/\D/g, "");
    const name = value.companyName.trim().toLowerCase();
    const match = options.find(
      (o) => o.inn === inn && o.name.trim().toLowerCase() === name,
    );
    if (match) return match.key;
    if (inn || value.companyName.trim()) return MANUAL_KEY;
    return options[0]?.key ?? MANUAL_KEY;
  }, [options, value.inn, value.companyName]);

  const [selectKey, setSelectKey] = useState(matchedKey);
  const [innLoading, setInnLoading] = useState(false);
  const [innError, setInnError] = useState<string | null>(null);
  const [innTouched, setInnTouched] = useState(false);

  useEffect(() => {
    setSelectKey(matchedKey);
  }, [matchedKey]);

  useEffect(() => {
    if (value.inn || value.companyName) return;
    const def = pickDefaultDocumentsOrderSender(options, activeInn, activeCustomerName);
    if (!def) return;
    onChange({ inn: def.inn, companyName: def.name });
    setSelectKey(def.key);
  }, [options, activeInn, activeCustomerName, value.inn, value.companyName, onChange]);

  const isManual = selectKey === MANUAL_KEY;
  const selected: DocumentsOrderSenderOption | null = useMemo(() => {
    if (isManual) return null;
    return options.find((o) => o.key === selectKey) ?? null;
  }, [isManual, options, selectKey]);

  const debouncedInn = useDebounced(value.inn.replace(/\D/g, ""), 500);

  useEffect(() => {
    if (!isManual || !innTouched) return;
    const digits = debouncedInn;
    if (digits.length !== 10 && digits.length !== 12) {
      setInnLoading(false);
      setInnError(digits.length > 0 ? "ИНН: 10 цифр (ЮЛ) или 12 (ИП)" : null);
      return;
    }
    let cancelled = false;
    setInnLoading(true);
    setInnError(null);
    fetchHaulzPartyByInn(auth, digits)
      .then(({ party }) => {
        if (!cancelled) {
          onChange({ inn: party.inn, companyName: party.fullName });
          setInnError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setInnError(formatHaulzCalcFetchError(e, "Не удалось найти организацию"));
        }
      })
      .finally(() => {
        if (!cancelled) setInnLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [auth, debouncedInn, innTouched, isManual, onChange]);

  const pickOption = (key: string) => {
    setSelectKey(key);
    setInnError(null);
    if (key === MANUAL_KEY) {
      setInnTouched(false);
      onChange({ inn: "", companyName: "" });
      return;
    }
    const opt = options.find((o) => o.key === key);
    if (!opt) return;
    onChange({ inn: opt.inn, companyName: opt.name });
  };

  return (
    <div className="haulz-calc-card">
      <h2 className="haulz-calc-card__title">Отправитель</h2>
      <p className="haulz-calc-hint" style={{ marginBottom: "0.75rem" }}>
        Выберите из справочника отправителей или укажите ИНН вручную
      </p>

      <label className="haulz-calc-field">
        <span className="haulz-calc-label">Из справочника</span>
        <select
          className="haulz-calc-input"
          value={selectKey}
          onChange={(e) => pickOption(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.name}
              {o.inn ? ` · ${o.inn}` : ""}
            </option>
          ))}
          <option value={MANUAL_KEY}>Другой ИНН…</option>
        </select>
      </label>

      {isManual ? (
        <div className="haulz-calc-contacts" style={{ marginTop: "0.75rem" }}>
          <label className="haulz-calc-field haulz-calc-contacts__inn">
            <span className="haulz-calc-label">ИНН отправителя</span>
            <input
              type="text"
              inputMode="numeric"
              className="haulz-calc-input"
              placeholder="10 или 12 цифр"
              value={value.inn}
              maxLength={12}
              onChange={(e) => {
                setInnTouched(true);
                onChange({
                  inn: e.target.value.replace(/\D/g, "").slice(0, 12),
                  companyName: value.companyName,
                });
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
          {value.inn.replace(/\D/g, "").length > 0 && (
            <label className="haulz-calc-field haulz-calc-contacts__company">
              <span className="haulz-calc-label">Наименование</span>
              <input
                className="haulz-calc-input"
                placeholder="Заполнится по ИНН или введите вручную"
                value={value.companyName}
                onChange={(e) => onChange({ inn: value.inn, companyName: e.target.value })}
              />
            </label>
          )}
        </div>
      ) : selected ? (
        <div className="haulz-calc-warehouse" style={{ marginTop: "0.75rem" }}>
          <p className="haulz-calc-warehouse__title">{selected.name}</p>
          {selected.inn ? (
            <p className="haulz-calc-warehouse__meta">ИНН {selected.inn}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
