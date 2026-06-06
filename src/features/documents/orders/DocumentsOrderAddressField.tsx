import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AddressSelection, CityCode } from "../../../../lib/haulzCalculator/types";
import {
  fetchDocumentsAddressSuggest,
  fetchDocumentsGeocode,
  type DocumentsAuthScope,
  type DocumentsSuggestItem,
} from "../../../api/client/documentsOrder";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const CITY_LABELS: Record<CityCode, string> = {
  moscow: "Москва",
  kaliningrad: "Калининград",
};

type Props = {
  authScope: DocumentsAuthScope;
  city: CityCode;
  query: string;
  setQuery: (v: string) => void;
  addr: AddressSelection | null;
  setAddr: (a: AddressSelection | null) => void;
  onQuickCity: (city: CityCode) => void;
};

export function DocumentsOrderAddressField({
  authScope,
  city,
  query,
  setQuery,
  addr,
  setAddr,
  onQuickCity,
}: Props) {
  const [suggestions, setSuggestions] = useState<DocumentsSuggestItem[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pickLoading, setPickLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebounced(query, 300);

  useEffect(() => {
    if (!addr && debouncedQuery.trim().length >= 2) setOpen(true);
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
    fetchDocumentsAddressSuggest(authScope, debouncedQuery, city)
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
  }, [authScope, debouncedQuery, city, addr]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const applyAddress = (fullAddress: string, label: string, point: { lat: number; lon: number }, sourceId?: string) => {
    setAddr({
      label,
      fullAddress,
      point,
      city,
      sourceId,
    });
    setQuery(fullAddress);
    setSuggestions([]);
    setOpen(false);
    setSuggestError(null);
  };

  const pickSuggestion = async (s: DocumentsSuggestItem) => {
    if (s.point) {
      applyAddress(s.fullAddress, s.label, s.point, s.id || s.uri);
      return;
    }
    setPickLoading(true);
    setSuggestError(null);
    try {
      const r = await fetchDocumentsGeocode(authScope, {
        address: s.fullAddress,
        uri: s.uri || s.id,
        city,
      });
      applyAddress(r.fullAddress, s.label || r.label, r.point, s.uri || s.id);
    } catch (e) {
      setSuggestError((e as Error)?.message || "Не удалось определить адрес");
    } finally {
      setPickLoading(false);
    }
  };

  const showPanel = open && !addr && query.trim().length >= 2;

  return (
    <div className="haulz-calc-address-field" ref={wrapRef}>
      <div className="haulz-calc-city-row">
        {(["moscow", "kaliningrad"] as CityCode[]).map((c) => (
          <button
            key={c}
            type="button"
            className={`haulz-calc-city-chip${city === c ? " haulz-calc-city-chip--active" : ""}`}
            onClick={() => onQuickCity(c)}
          >
            {CITY_LABELS[c]}
          </button>
        ))}
      </div>

      <div className="haulz-calc-address-input-wrap">
        <input
          ref={inputRef}
          type="text"
          className="haulz-calc-input haulz-calc-address-input"
          placeholder="Введите адрес"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (addr) setAddr(null);
          }}
          onFocus={() => {
            if (!addr && query.trim().length >= 2) setOpen(true);
          }}
        />
        {(suggestLoading || pickLoading) && (
          <Loader2 className="w-4 h-4 animate-spin haulz-calc-address-input__spinner" />
        )}
      </div>

      {addr && (
        <p className="haulz-calc-address-confirmed">
          {addr.fullAddress || addr.label}
          <button
            type="button"
            className="haulz-calc-text-btn"
            onClick={() => {
              setAddr(null);
              setQuery("");
            }}
          >
            Изменить
          </button>
        </p>
      )}

      {suggestError && <p className="haulz-calc-hint haulz-calc-hint--error">{suggestError}</p>}

      {showPanel && (
        <ul className="haulz-calc-suggest-list" role="listbox">
          {suggestions.length === 0 && !suggestLoading && (
            <li className="haulz-calc-suggest-item haulz-calc-suggest-item--empty">Ничего не найдено</li>
          )}
          {suggestions.map((s, i) => (
            <li key={s.uri || s.id || i}>
              <button type="button" className="haulz-calc-suggest-item" onClick={() => void pickSuggestion(s)}>
                <span className="haulz-calc-suggest-item__label">{s.label}</span>
                {s.fullAddress !== s.label && (
                  <span className="haulz-calc-suggest-item__sub">{s.fullAddress}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
