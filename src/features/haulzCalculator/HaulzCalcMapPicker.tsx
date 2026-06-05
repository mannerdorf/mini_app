import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Loader2, MapPin, X } from "lucide-react";
import type { AuthData } from "../../types";
import type { AddressSelection, CityCode } from "../../../lib/haulzCalculator/types";
import { warehouseForCity } from "../../../lib/haulzCalculator/warehouses";
import {
  fetchHaulzAddressSuggest,
  fetchHaulzGeocode,
  fetchHaulzMapsConfig,
  type HaulzSuggestItem,
} from "../../api/client/haulzCalculator";

type MapGL = {
  Map: new (
    el: HTMLElement,
    opts: { key: string; center: [number, number]; zoom: number; zoomControl?: boolean },
  ) => {
    on: (ev: string, cb: (e: { lngLat: [number, number] }) => void) => void;
    setCenter: (c: [number, number]) => void;
    setZoom: (z: number) => void;
    destroy: () => void;
  };
  Marker: new (
    map: InstanceType<MapGL["Map"]>,
    opts: { coordinates: [number, number]; draggable?: boolean },
  ) => {
    on: (ev: string, cb: () => void) => void;
    getCoordinates: () => [number, number];
    setCoordinates: (c: [number, number]) => void;
    destroy: () => void;
  };
};

declare global {
  interface Window {
    mapgl?: MapGL;
  }
}

function loadMapglScript(): Promise<MapGL> {
  return new Promise((resolve, reject) => {
    if (window.mapgl) {
      resolve(window.mapgl);
      return;
    }
    const id = "dgis-mapgl-haulz";
    if (document.getElementById(id)) {
      const wait = () => {
        if (window.mapgl) resolve(window.mapgl);
        else setTimeout(wait, 100);
      };
      wait();
      return;
    }
    const s = document.createElement("script");
    s.id = id;
    s.src = "https://mapgl.2gis.com/api/js/v1";
    s.async = true;
    s.onload = () => {
      if (!window.mapgl) reject(new Error("2GIS MapGL не загрузился"));
      else resolve(window.mapgl);
    };
    s.onerror = () => reject(new Error("Ошибка загрузки 2GIS MapGL"));
    document.head.appendChild(s);
  });
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export type HaulzCalcMapPickerProps = {
  open: boolean;
  onClose: () => void;
  auth: AuthData;
  city: CityCode;
  side: "from" | "to";
  screenTitle: string;
  confirmLabel: string;
  mode: "courier" | "point";
  setMode: (m: "courier" | "point") => void;
  query: string;
  setQuery: (v: string) => void;
  draftAddr: AddressSelection | null;
  setDraftAddr: (a: AddressSelection | null) => void;
  onConfirm: (addr: AddressSelection) => void;
};

export function HaulzCalcMapPicker({
  open,
  onClose,
  auth,
  city,
  side,
  screenTitle,
  confirmLabel,
  mode,
  setMode,
  query,
  setQuery,
  draftAddr,
  setDraftAddr,
  onConfirm,
}: HaulzCalcMapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<InstanceType<MapGL["Map"]> | null>(null);
  const placemarkRef = useRef<InstanceType<MapGL["Marker"]> | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [suggestions, setSuggestions] = useState<HaulzSuggestItem[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounced(query, 300);
  const warehouseLabel = side === "from" ? "Со Склада" : "на Складе";
  const isWarehouse = mode === "point";
  const wh = warehouseForCity(city);

  useEffect(() => {
    if (!open || !isWarehouse) return;
    setDraftAddr({
      label: wh.label,
      fullAddress: wh.fullAddress,
      point: wh.point,
      city,
      sourceId: wh.code,
    });
    setQuery(wh.fullAddress);
  }, [open, isWarehouse, city, wh, setDraftAddr, setQuery]);

  useEffect(() => {
    if (!open || isWarehouse) {
      setSuggestions([]);
      return;
    }
    if (debouncedQuery.trim().length < 2) {
      setSuggestions([]);
      setSuggestLoading(false);
      return;
    }
    if (
      draftAddr?.point &&
      debouncedQuery.trim() === draftAddr.fullAddress.trim()
    ) {
      setSuggestions([]);
      setSuggestLoading(false);
      setSuggestError(null);
      return;
    }
    let cancelled = false;
    setSuggestLoading(true);
    setSuggestError(null);
    fetchHaulzAddressSuggest(auth, debouncedQuery, city)
      .then((items) => {
        if (!cancelled) setSuggestions(items);
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
  }, [open, auth, debouncedQuery, city, isWarehouse, draftAddr?.point, draftAddr?.fullAddress]);

  const setPlacemark = (lat: number, lon: number) => {
    const map = mapInstance.current;
    const mapgl = window.mapgl;
    if (!map || !mapgl) return;
    if (placemarkRef.current) {
      placemarkRef.current.destroy();
      placemarkRef.current = null;
    }
    const pm = new mapgl.Marker(map, {
      coordinates: [lon, lat],
      draggable: true,
    });
    pm.on("dragend", () => {
      const [plon, plat] = pm.getCoordinates();
      void resolveOnMap(plat, plon);
    });
    placemarkRef.current = pm;
  };

  const applyDraft = (fullAddress: string, label: string, point: { lat: number; lon: number }, sourceId?: string) => {
    setDraftAddr({ label, fullAddress, point, city, sourceId });
    setQuery(fullAddress);
    setSuggestions([]);
    setSuggestError(null);
    if (mapInstance.current) {
      setPlacemark(point.lat, point.lon);
      mapInstance.current.setCenter([point.lon, point.lat]);
      mapInstance.current.setZoom(16);
    }
  };

  const resolveOnMap = async (lat: number, lon: number) => {
    setResolving(true);
    setMapError(null);
    try {
      const r = await fetchHaulzGeocode(auth, { lat, lon, city });
      applyDraft(r.fullAddress, r.label, r.point);
    } catch (e) {
      setMapError((e as Error)?.message || "Не удалось определить адрес");
    } finally {
      setResolving(false);
    }
  };

  const pickSuggestion = async (s: HaulzSuggestItem) => {
    if (s.point) {
      applyDraft(s.fullAddress, s.label, s.point, s.id || s.uri);
      return;
    }
    setResolving(true);
    try {
      const r = await fetchHaulzGeocode(auth, { address: s.fullAddress, uri: s.uri || s.id, city });
      applyDraft(r.fullAddress, r.label, r.point, s.uri || s.id);
    } catch (e) {
      setSuggestError((e as Error)?.message || "Не удалось получить координаты");
    } finally {
      setResolving(false);
    }
  };

  useEffect(() => {
    if (!open) return;

    let destroyed = false;
    setMapLoading(true);
    setMapError(null);

    (async () => {
      try {
        const cfg = await fetchHaulzMapsConfig(auth);
        const center = cfg.cityCenters[city] ?? cfg.cityCenters.moscow;
        const mapgl = await loadMapglScript();
        if (destroyed || !mapRef.current) return;

        const start = draftAddr?.point ?? center;
        const map = new mapgl.Map(mapRef.current, {
          key: cfg.mapsApiKey,
          center: [start.lon, start.lat],
          zoom: draftAddr?.point ? 16 : center.zoom,
          zoomControl: true,
        });
        mapInstance.current = map;

        if (draftAddr?.point) {
          setPlacemark(draftAddr.point.lat, draftAddr.point.lon);
        }

        if (!isWarehouse) {
          map.on("click", (e) => {
            const [lon, lat] = e.lngLat;
            setPlacemark(lat, lon);
            void resolveOnMap(lat, lon);
          });
        }
      } catch (e) {
        if (!destroyed) setMapError((e as Error)?.message || "Карта недоступна");
      } finally {
        if (!destroyed) setMapLoading(false);
      }
    })();

    return () => {
      destroyed = true;
      placemarkRef.current?.destroy();
      placemarkRef.current = null;
      mapInstance.current?.destroy();
      mapInstance.current = null;
    };
  }, [open, auth, city, isWarehouse]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setSuggestions([]);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.documentElement.classList.add("haulz-calc-map-screen-open");
    document.body.classList.add("haulz-calc-map-screen-open");
    return () => {
      document.documentElement.classList.remove("haulz-calc-map-screen-open");
      document.body.classList.remove("haulz-calc-map-screen-open");
    };
  }, [open]);

  const handleConfirm = () => {
    if (!draftAddr?.point) return;
    onConfirm(draftAddr);
    onClose();
  };

  if (!open) return null;

  const pickedDiffersFromInput =
    draftAddr &&
    draftAddr.fullAddress.trim() !== query.trim() &&
    draftAddr.label.trim() !== query.trim();

  return createPortal(
    <div className="haulz-calc-page--cdek haulz-calc-map-screen" role="dialog" aria-modal="true">
      <div className="haulz-calc-map-screen__layout">
        <aside className="haulz-calc-map-screen__panel">
          <div className="haulz-calc-map-screen__panel-top">
            <button type="button" className="haulz-calc-map-screen__back" onClick={onClose}>
              <ArrowLeft className="w-5 h-5" />
              Назад
            </button>
            <button type="button" className="haulz-calc-map-screen__close" onClick={onClose} aria-label="Закрыть">
              <X className="w-5 h-5" />
            </button>
          </div>

          <h2 className="haulz-calc-map-screen__title">{screenTitle}</h2>

          <div className="haulz-calc-segment haulz-calc-map-screen__segment" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "point"}
              className={`haulz-calc-segment__btn${mode === "point" ? " haulz-calc-segment__btn--active" : ""}`}
              onClick={() => setMode("point")}
            >
              {warehouseLabel}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "courier"}
              className={`haulz-calc-segment__btn${mode === "courier" ? " haulz-calc-segment__btn--active" : ""}`}
              onClick={() => {
                setMode("courier");
                setDraftAddr(null);
              }}
            >
              Курьером
            </button>
          </div>

          {isWarehouse ? (
            <div className="haulz-calc-warehouse haulz-calc-map-screen__warehouse">
              <p className="haulz-calc-warehouse__title">{wh.label}</p>
              <p className="haulz-calc-warehouse__address">{wh.fullAddress}</p>
              <p className="haulz-calc-warehouse__meta">
                {wh.hours} · {wh.phone}
              </p>
            </div>
          ) : (
            <div className="haulz-calc-map-screen__search" ref={wrapRef}>
              <label className="haulz-calc-map-screen__search-label">Город, адрес</label>
              <input
                type="search"
                className="haulz-calc-input haulz-calc-map-screen__input"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setDraftAddr(null);
                }}
                placeholder="Начните вводить адрес"
                autoComplete="off"
              />
              {(suggestLoading || suggestions.length > 0 || (suggestError && !draftAddr?.point)) && (
                <div className="haulz-calc-suggest-panel haulz-calc-map-screen__suggest">
                  {suggestLoading && (
                    <div className="haulz-calc-suggest-row haulz-calc-suggest-muted">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Поиск…
                    </div>
                  )}
                  {suggestError && !suggestLoading && (
                    <div className="haulz-calc-suggest-row haulz-calc-suggest-error">{suggestError}</div>
                  )}
                  {!suggestLoading &&
                    suggestions.map((s, i) => (
                      <button
                        key={s.id || `${s.fullAddress}-${i}`}
                        type="button"
                        className="haulz-calc-suggest-row"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickSuggestion(s)}
                      >
                        {s.fullAddress}
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}

          {pickedDiffersFromInput && draftAddr && (
            <div className="haulz-calc-map-screen__picked">
              <MapPin className="w-4 h-4 haulz-calc-map-screen__picked-icon" aria-hidden />
              <p className="haulz-calc-map-screen__picked-line">
                {draftAddr.label !== draftAddr.fullAddress ? draftAddr.label : draftAddr.fullAddress}
              </p>
            </div>
          )}

          {resolving && (
            <p className="haulz-calc-hint">
              <Loader2 className="w-3 h-3 animate-spin" style={{ display: "inline", marginRight: "0.25rem" }} />
              Определяем адрес…
            </p>
          )}
          {mapError && <p className="haulz-calc-map-screen__error">{mapError}</p>}

          <div className="haulz-calc-map-screen__footer">
            <button
              type="button"
              className="haulz-calc-btn-primary haulz-calc-map-screen__confirm"
              disabled={!draftAddr?.point || resolving}
              onClick={handleConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </aside>

        <div className="haulz-calc-map-screen__map-area">
          {mapLoading && (
            <div className="haulz-calc-map-screen__map-loader">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          )}
          <div ref={mapRef} className="haulz-calc-map-screen__map" />
        </div>
      </div>
    </div>,
    document.body,
  );
}
