import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AuthData } from "../../types";
import type { AddressSelection, CityCode } from "../../../lib/haulzCalculator/types";
import { fetchHaulzAddressSuggest, fetchHaulzRingDistance, type HaulzSuggestItem } from "../../api/client/haulzCalculator";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

type Props = {
  title: string;
  city: CityCode;
  auth: AuthData;
  query: string;
  setQuery: (v: string) => void;
  addr: AddressSelection | null;
  setAddr: (a: AddressSelection | null) => void;
  mode: "courier" | "point";
  setMode: (m: "courier" | "point") => void;
  phone: string;
  setPhone: (v: string) => void;
  fullName: string;
  setFullName: (v: string) => void;
};

export function HaulzCalcAddressField({
  title,
  city,
  auth,
  query,
  setQuery,
  addr,
  setAddr,
  mode,
  setMode,
  phone,
  setPhone,
  fullName,
  setFullName,
}: Props) {
  const [suggestions, setSuggestions] = useState<HaulzSuggestItem[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [ringKm, setRingKm] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounced(query, 300);
  const ringLabel = city === "moscow" ? "МКАД" : "КАД";
  const cityLabel = city === "moscow" ? "Москва" : "Калининград";

  useEffect(() => {
    if (!addr?.point) {
      setRingKm(null);
      return;
    }
    let cancelled = false;
    fetchHaulzRingDistance(auth, city, addr.point)
      .then((km) => {
        if (!cancelled) setRingKm(km);
      })
      .catch(() => {
        if (!cancelled) setRingKm(null);
      });
    return () => {
      cancelled = true;
    };
  }, [addr?.point?.lat, addr?.point?.lon, auth, city]);

  useEffect(() => {
    if (!addr && debouncedQuery.trim().length >= 2) {
      setOpen(true);
    }
  }, [debouncedQuery, addr]);

  useEffect(() => {
    if (addr || debouncedQuery.trim().length < 2) {
      setSuggestions([]);
      setSuggestError(null);
      setSuggestLoading(false);
      return;
    }
    let cancelled = false;
    setSuggestLoading(true);
    setSuggestError(null);
    fetchHaulzAddressSuggest(auth, debouncedQuery, city)
      .then((items) => {
        if (!cancelled) {
          setSuggestions(items);
          setOpen(true);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setSuggestions([]);
          setSuggestError((e as Error)?.message || "Ошибка подсказок");
        }
      })
      .finally(() => {
        if (!cancelled) setSuggestLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [auth, debouncedQuery, city, addr]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const showPanel = open && !addr && query.trim().length >= 2;

  const pickSuggestion = (s: HaulzSuggestItem) => {
    if (!s.point) {
      setSuggestError("Выберите адрес с координатами из списка");
      return;
    }
    setAddr({
      label: s.label,
      fullAddress: s.fullAddress,
      point: s.point,
      city,
      sourceId: s.id,
    });
    setQuery(s.fullAddress);
    setSuggestions([]);
    setOpen(false);
    setSuggestError(null);
  };

  return (
    <div className="haulz-calc-card">
      <h2 className="haulz-calc-card__title">{title}</h2>

      <div className="haulz-calc-segment" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "courier"}
          className={`haulz-calc-segment__btn${mode === "courier" ? " haulz-calc-segment__btn--active" : ""}`}
          onClick={() => setMode("courier")}
        >
          Курьер
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "point"}
          className={`haulz-calc-segment__btn${mode === "point" ? " haulz-calc-segment__btn--active" : ""}`}
          onClick={() => setMode("point")}
        >
          Из пункта
        </button>
      </div>

      <label className="haulz-calc-field">
        <span className="haulz-calc-label">Адрес · {cityLabel}</span>
        <div className="haulz-calc-address-wrap" ref={wrapRef}>
          <input
            type="search"
            className="haulz-calc-input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setAddr(null);
              setOpen(true);
            }}
            onFocus={() => {
              if (query.trim().length >= 2) setOpen(true);
            }}
            placeholder="Начните вводить адрес"
            autoComplete="off"
          />
          {showPanel && (
            <div className="haulz-calc-suggest-panel" role="listbox">
              {suggestLoading && (
                <div className="haulz-calc-suggest-row haulz-calc-suggest-muted">
                  <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.35rem" }} />
                  Поиск адреса…
                </div>
              )}
              {suggestError && !suggestLoading && (
                <div className="haulz-calc-suggest-row haulz-calc-suggest-error">{suggestError}</div>
              )}
              {!suggestLoading &&
                !suggestError &&
                suggestions.map((s, i) => (
                  <button
                    key={s.id || `${s.fullAddress}-${i}`}
                    type="button"
                    className="haulz-calc-suggest-row"
                    role="option"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickSuggestion(s)}
                  >
                    {s.fullAddress}
                  </button>
                ))}
              {!suggestLoading && !suggestError && suggestions.length === 0 && (
                <div className="haulz-calc-suggest-row haulz-calc-suggest-muted">Ничего не найдено</div>
              )}
            </div>
          )}
        </div>
        {addr && ringKm != null && (
          <p className="haulz-calc-hint">
            км за {ringLabel}: {ringKm.toFixed(1)}
          </p>
        )}
      </label>

      <div className="haulz-calc-contacts">
        <label className="haulz-calc-field">
          <span className="haulz-calc-label">Телефон</span>
          <input
            type="tel"
            className="haulz-calc-input"
            placeholder="+7"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="haulz-calc-field">
          <span className="haulz-calc-label">ФИО</span>
          <input
            className="haulz-calc-input"
            placeholder="Фамилия и имя"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
