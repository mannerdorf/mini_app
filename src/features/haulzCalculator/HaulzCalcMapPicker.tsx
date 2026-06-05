import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Loader2, MapPin, X } from "lucide-react";
import type { AuthData } from "../../types";
import type { AddressSelection, CityCode } from "../../../lib/haulzCalculator/types";
import { warehouseForCity } from "../../../lib/haulzCalculator/warehouses";
import {
  fetchHaulzAddressSuggest,
  fetchHaulzGeocode,
  type HaulzSuggestItem,
} from "../../api/client/haulzCalculator";

const CITY_CENTERS: Record<CityCode, { lat: number; lon: number; zoom: number }> = {
  moscow: { lat: 55.7558, lon: 37.6173, zoom: 10 },
  kaliningrad: { lat: 54.7104, lon: 20.5103, zoom: 11 },
};

const LEAFLET_VERSION = "1.9.4";
const LEAFLET_BASE = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist`;

type LeafletMap = {
  setView: (center: [number, number], zoom: number) => void;
  on: (ev: string, cb: (e: { latlng: { lat: number; lng: number } }) => void) => void;
  invalidateSize: () => void;
  remove: () => void;
};

type LeafletMarker = {
  setLatLng: (latlng: [number, number]) => void;
  getLatLng: () => { lat: number; lng: number };
  on: (ev: string, cb: () => void) => void;
  remove: () => void;
};

type LeafletApi = {
  map: (el: HTMLElement, opts: { center: [number, number]; zoom: number }) => LeafletMap;
  tileLayer: (
    url: string,
    opts: { attribution: string; maxZoom?: number },
  ) => { addTo: (map: LeafletMap) => void };
  marker: (
    latlng: [number, number],
    opts?: { draggable?: boolean; icon?: unknown },
  ) => LeafletMarker & { addTo: (map: LeafletMap) => LeafletMarker };
  icon: (opts: Record<string, unknown>) => unknown;
};

declare global {
  interface Window {
    L?: LeafletApi;
  }
}

function loadLeaflet(): Promise<LeafletApi> {
  return new Promise((resolve, reject) => {
    if (window.L) {
      resolve(window.L);
      return;
    }

    const cssId = "leaflet-css-haulz";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = `${LEAFLET_BASE}/leaflet.css`;
      document.head.appendChild(link);
    }

    const scriptId = "leaflet-js-haulz";
    if (document.getElementById(scriptId)) {
      const wait = () => {
        if (window.L) resolve(window.L);
        else setTimeout(wait, 100);
      };
      wait();
      return;
    }

    const s = document.createElement("script");
    s.id = scriptId;
    s.src = `${LEAFLET_BASE}/leaflet.js`;
    s.async = true;
    s.onload = () => {
      if (!window.L) reject(new Error("Leaflet не загрузился"));
      else resolve(window.L);
    };
    s.onerror = () => reject(new Error("Ошибка загрузки Leaflet"));
    document.head.appendChild(s);
  });
}

function defaultMarkerIcon(L: LeafletApi) {
  return L.icon({
    iconUrl: `${LEAFLET_BASE}/images/marker-icon.png`,
    iconRetinaUrl: `${LEAFLET_BASE}/images/marker-icon-2x.png`,
    shadowUrl: `${LEAFLET_BASE}/images/marker-shadow.png`,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
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
  const mapInstance = useRef<LeafletMap | null>(null);
  const placemarkRef = useRef<LeafletMarker | null>(null);
  const leafletRef = useRef<LeafletApi | null>(null);
  const resolveOnMapRef = useRef<(lat: number, lon: number) => void>(() => {});
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
    const L = leafletRef.current;
    if (!map || !L) return;

    if (placemarkRef.current) {
      placemarkRef.current.setLatLng([lat, lon]);
      return;
    }

    const pm = L.marker([lat, lon], { draggable: true, icon: defaultMarkerIcon(L) }).addTo(map);
    pm.on("dragend", () => {
      const pos = pm.getLatLng();
      resolveOnMapRef.current(pos.lat, pos.lng);
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
      mapInstance.current.setView([point.lat, point.lon], 16);
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

  resolveOnMapRef.current = (lat, lon) => {
    void resolveOnMap(lat, lon);
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
        const L = await loadLeaflet();
        if (destroyed || !mapRef.current) return;

        leafletRef.current = L;
        const center = CITY_CENTERS[city];
        const start = draftAddr?.point ?? center;

        const map = L.map(mapRef.current, {
          center: [start.lat, start.lon],
          zoom: draftAddr?.point ? 16 : center.zoom,
        });
        mapInstance.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        if (draftAddr?.point) {
          setPlacemark(draftAddr.point.lat, draftAddr.point.lon);
        }

        if (!isWarehouse) {
          map.on("click", (e) => {
            const { lat, lng } = e.latlng;
            setPlacemark(lat, lng);
            void resolveOnMap(lat, lng);
          });
        }

        requestAnimationFrame(() => {
          if (!destroyed) map.invalidateSize();
        });
      } catch (e) {
        if (!destroyed) setMapError((e as Error)?.message || "Карта недоступна");
      } finally {
        if (!destroyed) setMapLoading(false);
      }
    })();

    return () => {
      destroyed = true;
      placemarkRef.current?.remove();
      placemarkRef.current = null;
      mapInstance.current?.remove();
      mapInstance.current = null;
      leafletRef.current = null;
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
