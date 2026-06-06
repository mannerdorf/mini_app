import React, { useCallback, useEffect, useRef, useState } from "react";
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
  /** При маршруте МСК↔КГД — только город отправления/назначения на этой стороне. */
  lockCity?: CityCode;
  query: string;
  setQuery: (v: string) => void;
  addr: AddressSelection | null;
  setAddr: (a: AddressSelection | null) => void;
  onQuickCity: (city: CityCode) => void;
  /** После паузы в вводе — геокод для расчёта по введённому адресу */
  geocodeOnIdle?: boolean;
};

export function DocumentsOrderAddressField({
  authScope,
  city,
  lockCity,
  query,
  setQuery,
  addr,
  setAddr,
  onQuickCity,
  geocodeOnIdle = false,
}: Props) {
  const effectiveCity = lockCity ?? city;
  const [suggestions, setSuggestions] = useState<DocumentsSuggestItem[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pickLoading, setPickLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const geocodeInFlightRef = useRef(false);
  const lastIdleGeocodeRef = useRef("");

  const debouncedQuery = useDebounced(query, 300);
  const debouncedQueryGeocode = useDebounced(query, 1200);

  const pickCity = (picked: CityCode) => {
    onQuickCity(picked);
    setAddr(null);
    setSuggestions([]);
    setOpen(false);
    setSuggestError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  useEffect(() => {
    if (!addr && debouncedQuery.trim().length >= 2) setOpen(true);
  }, [debouncedQuery, addr]);

  useEffect(() => {
    if (addr || pickLoading || debouncedQuery.trim().length < 2) {
      setSuggestions([]);
      if (!pickLoading) setSuggestError(null);
      setSuggestLoading(false);
      return;
    }
    let cancelled = false;
    setSuggestLoading(true);
    setSuggestError(null);
    fetchDocumentsAddressSuggest(authScope, debouncedQuery, effectiveCity)
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
  }, [authScope, debouncedQuery, effectiveCity, addr, pickLoading]);

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
      city: effectiveCity,
      sourceId,
    });
    setQuery(fullAddress);
    setSuggestions([]);
    setOpen(false);
    setSuggestError(null);
  };

  const geocodeQuery = useCallback(
    async (address: string, label?: string, uri?: string) => {
      const q = address.trim();
      if (!q || geocodeInFlightRef.current) return;
      geocodeInFlightRef.current = true;
      setPickLoading(true);
      setSuggestError(null);
      try {
        const r = await fetchDocumentsGeocode(authScope, {
          address: q,
          uri,
          city: effectiveCity,
        });
        applyAddress(r.fullAddress, label || r.label, r.point, uri);
      } catch (e) {
        setSuggestError((e as Error)?.message || "Не удалось определить адрес");
      } finally {
        setPickLoading(false);
        geocodeInFlightRef.current = false;
      }
    },
    [authScope, effectiveCity, setAddr, setQuery],
  );

  const pickSuggestion = async (s: DocumentsSuggestItem) => {
    lastIdleGeocodeRef.current = s.fullAddress.trim();
    if (s.point) {
      applyAddress(s.fullAddress, s.label, s.point, s.id || s.uri);
      return;
    }
    await geocodeQuery(s.fullAddress, s.label, s.uri || s.id);
  };

  const confirmTypedAddress = useCallback(async () => {
    const q = query.trim();
    if (addr || geocodeInFlightRef.current || q.length < 5) return;
    lastIdleGeocodeRef.current = q;
    await geocodeQuery(q);
  }, [addr, geocodeQuery, query]);

  useEffect(() => {
    if (!geocodeOnIdle || addr || geocodeInFlightRef.current) return;
    const q = debouncedQueryGeocode.trim();
    if (q.length < 10) return;
    if (lastIdleGeocodeRef.current === q) return;
    lastIdleGeocodeRef.current = q;
    void geocodeQuery(q);
  }, [geocodeOnIdle, debouncedQueryGeocode, addr, geocodeQuery]);

  const showPanel = open && !addr && query.trim().length >= 2;

  return (
    <label className="haulz-calc-field">
      <span className="haulz-calc-label haulz-calc-label--cities">
        Адрес{" "}
        {lockCity ? (
          <span className="haulz-calc-city-link haulz-calc-city-link--active">{CITY_LABELS[lockCity]}</span>
        ) : (
          (["moscow", "kaliningrad"] as const).map((c, i) => (
            <span key={c}>
              {i > 0 && " "}
              <button
                type="button"
                className={`haulz-calc-city-link${city === c ? " haulz-calc-city-link--active" : ""}`}
                onClick={() => pickCity(c)}
              >
                {CITY_LABELS[c]}
              </button>
            </span>
          ))
        )}
      </span>
      <div className="haulz-calc-address-wrap" ref={wrapRef}>
        <input
          ref={inputRef}
          type="search"
          className="haulz-calc-input"
          placeholder="Введите адрес"
          value={query}
          autoComplete="off"
          onChange={(e) => {
            const next = e.target.value;
            lastIdleGeocodeRef.current = "";
            setQuery(next);
            if (addr && next !== (addr.fullAddress || addr.label)) {
              setAddr(null);
            }
            setOpen(true);
          }}
          onFocus={() => {
            if (!addr && query.trim().length >= 2) setOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => {
              void confirmTypedAddress();
            }, 150);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void confirmTypedAddress();
            }
          }}
        />
        {(suggestLoading || pickLoading) && (
          <Loader2
            className="w-4 h-4 animate-spin"
            style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)" }}
          />
        )}
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
                  key={s.id || s.uri || `${s.fullAddress}-${i}`}
                  type="button"
                  className="haulz-calc-suggest-row"
                  role="option"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void pickSuggestion(s)}
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
      {addr && (
        <p className="haulz-calc-hint" style={{ marginTop: "0.5rem" }}>
          {addr.fullAddress || addr.label}{" "}
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
    </label>
  );
}
