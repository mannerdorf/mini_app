import React, { useEffect, useRef, useState } from "react";
import { Loader2, Map } from "lucide-react";
import type { AuthData } from "../../types";
import type { AddressSelection, CityCode } from "../../../lib/haulzCalculator/types";
import { warehouseForCity } from "../../../lib/haulzCalculator/warehouses";
import {
  fetchHaulzAddressSuggest,
  fetchHaulzGeocode,
  fetchHaulzPartyByInn,
  fetchHaulzRingDistance,
  type HaulzRingDistance,
  type HaulzSuggestItem,
} from "../../api/client/haulzCalculator";
import { HaulzCalcMapPicker } from "./HaulzCalcMapPicker";
import { HaulzCalcRingDistanceHint } from "./HaulzCalcRingDistanceHint";
import { formatPhoneMask } from "../../lib/formatPhoneMask";

function formatHaulzCalcFetchError(e: unknown, fallback: string): string {
  const msg = (e as Error)?.message || "";
  if (/failed to fetch/i.test(msg)) {
    return "Не удалось связаться с сервером. Обновите страницу или попробуйте позже.";
  }
  return msg || fallback;
}

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
  title: string;
  side: "from" | "to";
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
  inn: string;
  setInn: (v: string) => void;
  companyName: string;
  setCompanyName: (v: string) => void;
  contactName: string;
  setContactName: (v: string) => void;
  onQuickCity: (city: CityCode) => void;
  /** Без обёртки-карточки — для мобильного подэкрана */
  embedded?: boolean;
  /** Открыть карту сразу (мобильный сценарий «как в СДЭК») */
  openMapOnMount?: boolean;
  /** ИНН и наименование — в блоке «Заказчик» */
  showIdentityFields?: boolean;
};

export function HaulzCalcAddressField({
  title,
  side,
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
  inn,
  setInn,
  companyName,
  setCompanyName,
  contactName,
  setContactName,
  onQuickCity,
  embedded = false,
  openMapOnMount = false,
  showIdentityFields = true,
}: Props) {
  const [suggestions, setSuggestions] = useState<HaulzSuggestItem[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [innLoading, setInnLoading] = useState(false);
  const [innError, setInnError] = useState<string | null>(null);
  const [innTouched, setInnTouched] = useState(false);
  const [partnerHint, setPartnerHint] = useState<{
    label: string;
    kind: "active_partner" | "need_contract" | "new_partner";
    hasEdo: boolean;
  } | null>(null);
  const [ringDistance, setRingDistance] = useState<HaulzRingDistance | null>(null);
  const [open, setOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const mapAutoOpenedRef = useRef(false);
  const [pickLoading, setPickLoading] = useState(false);
  const [mapDraftAddr, setMapDraftAddr] = useState<AddressSelection | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebounced(query, 300);
  const debouncedInn = useDebounced(inn.replace(/\D/g, ""), 500);
  const ringLabel = city === "moscow" ? "МКАД" : "КАД";
  const warehouseLabel = side === "from" ? "Со Склада" : "на Складе";
  const isWarehouseMode = mode === "point";
  const screenTitle = side === "from" ? "Откуда отправить" : "Куда вручить";
  const confirmLabel = side === "from" ? "Отправить отсюда" : "Вручить сюда";

  const pickCity = (picked: CityCode) => {
    onQuickCity(picked);
    setAddr(null);
    setSuggestions([]);
    setOpen(false);
    setSuggestError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  useEffect(() => {
    if (!isWarehouseMode) return;
    const wh = warehouseForCity(city);
    setAddr({
      label: wh.label,
      fullAddress: wh.fullAddress,
      point: wh.point,
      city,
      sourceId: wh.code,
    });
    setQuery(wh.fullAddress);
    setSuggestions([]);
    setOpen(false);
  }, [isWarehouseMode, city, setAddr, setQuery]);

  useEffect(() => {
    if (!addr?.point) {
      setRingDistance(null);
      return;
    }
    let cancelled = false;
    fetchHaulzRingDistance(auth, city, addr.point)
      .then((dist) => {
        if (!cancelled) setRingDistance(dist);
      })
      .catch(() => {
        if (!cancelled) setRingDistance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [addr?.point?.lat, addr?.point?.lon, auth, city]);

  useEffect(() => {
    if (!isWarehouseMode && !addr && debouncedQuery.trim().length >= 2) {
      setOpen(true);
    }
  }, [debouncedQuery, addr, isWarehouseMode]);

  useEffect(() => {
    if (isWarehouseMode || addr || debouncedQuery.trim().length < 2) {
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
          setSuggestError(formatHaulzCalcFetchError(e, "Ошибка подсказок"));
        }
      })
      .finally(() => {
        if (!cancelled) setSuggestLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [auth, debouncedQuery, city, addr, isWarehouseMode]);

  useEffect(() => {
    if (!showIdentityFields || !innTouched) return;
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
  }, [auth, debouncedInn, innTouched, setCompanyName, setInn, showIdentityFields]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const showPanel = !isWarehouseMode && open && !addr && query.trim().length >= 2;

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

  const pickSuggestion = async (s: HaulzSuggestItem) => {
    if (s.point) {
      applyAddress(s.fullAddress, s.label, s.point, s.id || s.uri);
      return;
    }
    setPickLoading(true);
    setSuggestError(null);
    try {
      const r = await fetchHaulzGeocode(auth, {
        address: s.fullAddress,
        uri: s.uri || s.id,
        city,
      });
      const vague =
        /городской округ|муниципальный округ/i.test(r.fullAddress) &&
        !/ул\.? |пер\.? |пр\.? |ш\.? |д\.? /i.test(r.fullAddress);
      applyAddress(
        vague ? s.fullAddress : r.fullAddress,
        s.label || r.label,
        r.point,
        s.uri || s.id,
      );
    } catch (e) {
      setSuggestError((e as Error)?.message || "Не удалось получить координаты адреса");
    } finally {
      setPickLoading(false);
    }
  };

  const openMap = () => {
    setMapDraftAddr(addr);
    setMapOpen(true);
  };

  useEffect(() => {
    if (!openMapOnMount || mapAutoOpenedRef.current || isWarehouseMode) return;
    mapAutoOpenedRef.current = true;
    setMapDraftAddr(addr);
    setMapOpen(true);
  }, [openMapOnMount, isWarehouseMode, addr]);

  const body = (
    <>
      {!embedded && <h2 className="haulz-calc-card__title">{title}</h2>}

      <div className="haulz-calc-segment" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "courier"}
          className={`haulz-calc-segment__btn${mode === "courier" ? " haulz-calc-segment__btn--active" : ""}`}
          onClick={() => {
            setMode("courier");
            setAddr(null);
            setQuery("");
          }}
        >
          Курьером
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "point"}
          className={`haulz-calc-segment__btn${mode === "point" ? " haulz-calc-segment__btn--active" : ""}`}
          onClick={() => setMode("point")}
        >
          {warehouseLabel}
        </button>
      </div>

      {isWarehouseMode ? (
        <div className="haulz-calc-warehouse">
          <p className="haulz-calc-warehouse__title">{warehouseForCity(city).label}</p>
          <p className="haulz-calc-warehouse__address">{warehouseForCity(city).fullAddress}</p>
          <p className="haulz-calc-warehouse__meta">
            {warehouseForCity(city).hours} · {warehouseForCity(city).phone}
          </p>
          {addr && ringDistance != null && (
            <HaulzCalcRingDistanceHint ringLabel={ringLabel} distance={ringDistance} />
          )}
        </div>
      ) : (
        <label className="haulz-calc-field">
          <span className="haulz-calc-label haulz-calc-label--cities">
            Адрес{" "}
            {(["moscow", "kaliningrad"] as const).map((c, i) => (
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
            ))}
          </span>
          <div className="haulz-calc-address-wrap haulz-calc-address-wrap--with-map" ref={wrapRef}>
            <input
              ref={inputRef}
              type="search"
              className="haulz-calc-input haulz-calc-input--with-map-btn"
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
            <button
              type="button"
              className="haulz-calc-map-icon-btn"
              onClick={openMap}
              aria-label="Указать на карте"
              title="Указать на карте"
            >
              <Map className="w-5 h-5" />
            </button>
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
          {addr && ringDistance != null && (
            <HaulzCalcRingDistanceHint ringLabel={ringLabel} distance={ringDistance} />
          )}
        </label>
      )}

      <div className="haulz-calc-contacts">
        {showIdentityFields && (
          <>
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
              {innError && !innLoading && (
                <span className="haulz-calc-field-hint haulz-calc-field-hint--error">{innError}</span>
              )}
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

      <HaulzCalcMapPicker
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        auth={auth}
        city={city}
        side={side}
        screenTitle={screenTitle}
        confirmLabel={confirmLabel}
        mode={mode}
        setMode={setMode}
        query={query}
        setQuery={setQuery}
        draftAddr={mapDraftAddr}
        setDraftAddr={setMapDraftAddr}
        onConfirm={(a) => {
          setAddr(a);
          setQuery(a.fullAddress);
        }}
      />
      {pickLoading && (
        <p className="haulz-calc-hint">
          <Loader2 className="w-3 h-3 animate-spin" style={{ display: "inline", marginRight: "0.25rem" }} />
          Уточняем координаты…
        </p>
      )}
    </>
  );

  return (
    <div className={embedded ? "haulz-calc-address-embedded" : "haulz-calc-card"}>
      {body}
    </div>
  );
}
