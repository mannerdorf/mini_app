import React, { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AddressSelection, CityCode } from "../../../../lib/haulzCalculator/types";
import { warehouseForCity } from "../../../../lib/haulzCalculator/warehouses";
import {
  fetchPvzList,
  pvzItemConfirmedCoords,
  type PvzItem,
} from "../../../api/client/documentsOrders";
import {
  fetchDocumentsGeocode,
  fetchSavePvzConfirmedCoords,
  type DocumentsAuthScope,
} from "../../../api/client/documentsOrder";
import type { AuthData } from "../../../types";
import { DocumentsOrderAddressField } from "./DocumentsOrderAddressField";
import { DocumentsOrderCustomAddressContacts } from "./DocumentsOrderCustomAddressContacts";
import { DocumentsOrderMapPicker } from "./DocumentsOrderMapPicker";
import { filterDocumentsOrderPvzList, inferPvzCityCode } from "./documentsOrderPvzFilter";

const CITY_LABELS: Record<CityCode, string> = {
  moscow: "Москве",
  kaliningrad: "Калининграде",
};

export type PvzSelectionState = {
  deliveryMode: "courier" | "point";
  addressKind: "pvz" | "custom";
  pvzRef: string;
  pvzItem: PvzItem | null;
  addr: AddressSelection | null;
  query: string;
  city: CityCode;
  inn: string;
  companyName: string;
  phone: string;
  contactName: string;
};

export const emptyPvzContactFields = {
  inn: "",
  companyName: "",
  phone: "",
  contactName: "",
} as const;

type Props = {
  title: string;
  side: "from" | "to";
  auth: AuthData;
  authScope: DocumentsAuthScope;
  pvzList: PvzItem[];
  pvzLoading: boolean;
  pvzError?: string | null;
  pvzCatalogEmpty?: boolean;
  pvzTotalCount?: number;
  state: PvzSelectionState;
  onChange: React.Dispatch<React.SetStateAction<PvzSelectionState>>;
  defaultCity: CityCode;
  /** Забор: только адрес курьером, без «Со склада / на складе». */
  courierOnly?: boolean;
  courierLabel?: string;
  /** Первый выбор ПВЗ — подтверждение на карте и запись в pickup_pvz_coords. */
  confirmPvzOnMap?: boolean;
};

function pvzLabel(p: PvzItem): string {
  return p.ГородНаименование ? `${p.Наименование} · ${p.ГородНаименование}` : p.Наименование;
}

function geocodeQueryForPvz(p: PvzItem): string {
  const parts = [p.Наименование, p.ГородНаименование, p.РегионНаименование].filter(Boolean);
  return parts.join(", ");
}

function warehouseAddr(city: CityCode): AddressSelection {
  const wh = warehouseForCity(city);
  return {
    label: wh.label,
    fullAddress: wh.fullAddress,
    point: wh.point,
    city,
    sourceId: wh.code,
  };
}

function clearContacts<T extends PvzSelectionState>(state: T): T {
  return { ...state, ...emptyPvzContactFields };
}

export function DocumentsOrderPvzSection({
  title,
  side,
  auth,
  authScope,
  pvzList,
  pvzLoading,
  pvzError = null,
  pvzCatalogEmpty = false,
  pvzTotalCount = 0,
  state,
  onChange,
  defaultCity,
  courierOnly = false,
  courierLabel = "Курьером",
  confirmPvzOnMap = false,
}: Props) {
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [pvzMapOpen, setPvzMapOpen] = useState(false);
  const [pvzMapQuery, setPvzMapQuery] = useState("");
  const [pvzMapDraft, setPvzMapDraft] = useState<AddressSelection | null>(null);
  const [pendingPvz, setPendingPvz] = useState<{ item: PvzItem; city: CityCode } | null>(null);
  const warehouseLabel = side === "from" ? "Со Склада" : "на Складе";
  const isWarehouseMode = !courierOnly && state.deliveryMode === "point";

  useEffect(() => {
    if (!courierOnly) return;
    onChange((prev) => {
      if (prev.deliveryMode !== "point") return prev;
      return clearContacts({
        ...prev,
        deliveryMode: "courier",
        pvzRef: "",
        pvzItem: null,
        addr: null,
        query: "",
        addressKind: "pvz",
        city: defaultCity,
      });
    });
  }, [courierOnly, defaultCity, onChange]);

  const applyPvzSelection = useCallback(
    (p: PvzItem, city: CityCode, addr: AddressSelection) => {
      onChange((prev) => ({
        ...prev,
        deliveryMode: "courier",
        addressKind: "pvz",
        pvzRef: p.Ссылка,
        pvzItem: p,
        addr,
        query: addr.fullAddress,
        city,
      }));
    },
    [onChange],
  );

  const geocodePvz = useCallback(
    async (p: PvzItem, city: CityCode, requireMapConfirm: boolean) => {
      setGeocodeLoading(true);
      setGeocodeError(null);
      try {
        const q = geocodeQueryForPvz(p);
        const r = await fetchDocumentsGeocode(authScope, { address: q, city });
        const draft: AddressSelection = {
          label: pvzLabel(p),
          fullAddress: r.fullAddress || q,
          point: r.point,
          city,
          sourceId: p.Ссылка,
        };
        if (requireMapConfirm) {
          setPendingPvz({ item: p, city });
          setPvzMapQuery(draft.fullAddress);
          setPvzMapDraft(draft);
          setPvzMapOpen(true);
          return;
        }
        applyPvzSelection(p, city, draft);
      } catch (e) {
        setGeocodeError((e as Error)?.message || "Не удалось определить координаты ПВЗ");
        onChange((prev) => ({
          ...prev,
          deliveryMode: "courier",
          addressKind: "pvz",
          pvzRef: p.Ссылка,
          pvzItem: p,
          addr: null,
          query: geocodeQueryForPvz(p),
          city,
        }));
      } finally {
        setGeocodeLoading(false);
      }
    },
    [applyPvzSelection, authScope, onChange],
  );

  const selectPvzItem = useCallback(
    (item: PvzItem, city: CityCode) => {
      const confirmed = pvzItemConfirmedCoords(item);
      if (confirmed) {
        applyPvzSelection(item, city, {
          label: pvzLabel(item),
          fullAddress: confirmed.fullAddress || geocodeQueryForPvz(item),
          point: { lat: confirmed.latitude, lon: confirmed.longitude },
          city,
          sourceId: item.Ссылка,
        });
        return;
      }
      void geocodePvz(item, city, confirmPvzOnMap);
    },
    [applyPvzSelection, confirmPvzOnMap, geocodePvz],
  );

  const setDeliveryMode = (deliveryMode: "courier" | "point") => {
    if (deliveryMode === "point") {
      const wh = warehouseForCity(defaultCity);
      onChange({
        ...state,
        deliveryMode: "point",
        addressKind: "pvz",
        city: defaultCity,
        pvzRef: "",
        pvzItem: null,
        addr: warehouseAddr(defaultCity),
        query: wh.fullAddress,
      });
      return;
    }
    onChange(
      clearContacts({
        ...state,
        deliveryMode: "courier",
        pvzRef: "",
        pvzItem: null,
        addr: null,
        query: "",
        addressKind: "pvz",
      }),
    );
    setGeocodeError(null);
  };

  return (
    <div className="haulz-calc-card">
      <h2 className="haulz-calc-card__title">{title}</h2>

      {!courierOnly && (
        <div className="haulz-calc-segment" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={state.deliveryMode === "courier"}
            className={`haulz-calc-segment__btn${state.deliveryMode === "courier" ? " haulz-calc-segment__btn--active" : ""}`}
            onClick={() => setDeliveryMode("courier")}
          >
            {courierLabel}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={state.deliveryMode === "point"}
            className={`haulz-calc-segment__btn${state.deliveryMode === "point" ? " haulz-calc-segment__btn--active" : ""}`}
            onClick={() => setDeliveryMode("point")}
          >
            {warehouseLabel}
          </button>
        </div>
      )}

      {isWarehouseMode ? (
        <div className="haulz-calc-warehouse">
          <p className="haulz-calc-warehouse__title">{warehouseForCity(defaultCity).label}</p>
          <p className="haulz-calc-warehouse__address">{warehouseForCity(defaultCity).fullAddress}</p>
          <p className="haulz-calc-warehouse__meta">
            {warehouseForCity(defaultCity).hours} · {warehouseForCity(defaultCity).phone}
          </p>
        </div>
      ) : (
        <>
          <p className="haulz-calc-hint" style={{ marginBottom: "0.75rem" }}>
            Выберите адрес из ранее использованных или введите новый
          </p>

          {state.addressKind === "pvz" ? (
            <>
              <label className="haulz-calc-field">
                <span className="haulz-calc-label">Пункт из справочника</span>
                <select
                  className="haulz-calc-input"
                  value={state.pvzRef}
                  disabled={pvzLoading || geocodeLoading}
                  onChange={(e) => {
                    const ref = e.target.value;
                    const item = pvzList.find((p) => p.Ссылка === ref) || null;
                    if (!item) {
                      onChange({
                        ...state,
                        deliveryMode: "courier",
                        addressKind: "pvz",
                        pvzRef: "",
                        pvzItem: null,
                        addr: null,
                        query: "",
                        city: defaultCity,
                      });
                      return;
                    }
                    const city = inferPvzCityCode(item, defaultCity) ?? defaultCity;
                    selectPvzItem(item, city);
                  }}
                >
                  <option value="">— Выберите ПВЗ —</option>
                  {pvzList.map((p) => (
                    <option key={p.Ссылка} value={p.Ссылка}>
                      {pvzLabel(p)}
                    </option>
                  ))}
                </select>
              </label>

              {(pvzLoading || geocodeLoading) && (
                <p className="haulz-calc-hint" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {pvzLoading ? "Загрузка ПВЗ…" : "Определяем адрес…"}
                </p>
              )}

              {geocodeError && <p className="haulz-calc-hint haulz-calc-hint--error">{geocodeError}</p>}

              {!pvzLoading && !geocodeLoading && pvzError && (
                <p className="haulz-calc-hint haulz-calc-hint--error">{pvzError}</p>
              )}

              {!pvzLoading && !geocodeLoading && !pvzError && pvzList.length === 0 && (
                <p className="haulz-calc-hint haulz-calc-hint--error">
                  {pvzCatalogEmpty || pvzTotalCount === 0
                    ? "Нет ПВЗ у выбранного заказчика. Проверьте заказчика в шапке или обновите справочник в CMS."
                    : `Нет ПВЗ в ${CITY_LABELS[defaultCity]} для этого заказчика и маршрута. Нажмите «Новый адрес» или выберите другой пункт.`}
                </p>
              )}

              {state.addr && (
                <p className="haulz-calc-hint" style={{ marginTop: "0.5rem" }}>
                  {state.addr.fullAddress}
                </p>
              )}

              <button
                type="button"
                className="haulz-calc-link-btn"
                style={{ marginTop: "0.75rem" }}
                onClick={() =>
                  onChange(
                    clearContacts({
                      ...state,
                      deliveryMode: "courier",
                      addressKind: "custom",
                      pvzRef: "",
                      pvzItem: null,
                      addr: null,
                      query: "",
                      city: defaultCity,
                    }),
                  )
                }
              >
                Новый адрес
              </button>
            </>
          ) : (
            <>
              <DocumentsOrderAddressField
                authScope={authScope}
                side={side}
                city={state.city}
                query={state.query}
                setQuery={(q) => onChange((prev) => ({ ...prev, query: q }))}
                addr={state.addr}
                setAddr={(a) =>
                  onChange((prev) =>
                    a ? { ...prev, addr: a } : { ...prev, addr: null },
                  )
                }
                onQuickCity={(c) =>
                  onChange((prev) => ({ ...prev, city: c, addr: null, query: "" }))
                }
              />

              <DocumentsOrderCustomAddressContacts
                side={side}
                auth={auth}
                inn={state.inn}
                setInn={(inn) => onChange((prev) => ({ ...prev, inn }))}
                companyName={state.companyName}
                setCompanyName={(companyName) => onChange((prev) => ({ ...prev, companyName }))}
                phone={state.phone}
                setPhone={(phone) => onChange((prev) => ({ ...prev, phone }))}
                contactName={state.contactName}
                setContactName={(contactName) => onChange((prev) => ({ ...prev, contactName }))}
              />

              <button
                type="button"
                className="haulz-calc-link-btn"
                style={{ marginTop: "0.75rem" }}
                onClick={() =>
                  onChange(
                    clearContacts({
                      ...state,
                      deliveryMode: "courier",
                      addressKind: "pvz",
                      pvzRef: "",
                      pvzItem: null,
                      addr: null,
                      query: "",
                      city: defaultCity,
                    }),
                  )
                }
              >
                Выбрать из ПВЗ
              </button>
            </>
          )}
        </>
      )}

      {confirmPvzOnMap && pendingPvz && (
        <DocumentsOrderMapPicker
          open={pvzMapOpen}
          onClose={() => {
            setPvzMapOpen(false);
            setPendingPvz(null);
            setPvzMapDraft(null);
          }}
          authScope={authScope}
          city={pendingPvz.city}
          side={side}
          screenTitle="Подтвердите точку ПВЗ на карте"
          confirmLabel="Сохранить координаты ПВЗ"
          query={pvzMapQuery}
          setQuery={setPvzMapQuery}
          draftAddr={pvzMapDraft}
          setDraftAddr={setPvzMapDraft}
          onConfirm={async (addr) => {
            if (!addr.point || !pendingPvz) return;
            try {
              await fetchSavePvzConfirmedCoords(authScope, {
                pvzRef: pendingPvz.item.Ссылка,
                city: pendingPvz.city,
                latitude: addr.point.lat,
                longitude: addr.point.lon,
                fullAddress: addr.fullAddress,
              });
              pendingPvz.item.ПодтвержденныеКоординаты = {
                latitude: addr.point.lat,
                longitude: addr.point.lon,
                fullAddress: addr.fullAddress,
              };
              applyPvzSelection(pendingPvz.item, pendingPvz.city, addr);
              setPvzMapOpen(false);
              setPendingPvz(null);
              setPvzMapDraft(null);
              setGeocodeError(null);
            } catch (e) {
              setGeocodeError((e as Error)?.message || "Не удалось сохранить координаты ПВЗ");
            }
          }}
        />
      )}
    </div>
  );
}

export function useDocumentsOrderPvzList(authScope: DocumentsAuthScope, enabled: boolean) {
  const [pvzList, setPvzList] = useState<PvzItem[]>([]);
  const [pvzLoading, setPvzLoading] = useState(false);
  const [pvzError, setPvzError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !authScope.login || !authScope.password) return;
    setPvzLoading(true);
    setPvzError(null);
    fetchPvzList({ login: authScope.login, password: authScope.password, inn: authScope.inn })
      .then((list) => setPvzList(filterDocumentsOrderPvzList(list)))
      .catch((e) => {
        setPvzList([]);
        setPvzError((e as Error)?.message || "Не удалось загрузить ПВЗ");
      })
      .finally(() => setPvzLoading(false));
  }, [enabled, authScope.login, authScope.password, authScope.inn]);

  return { pvzList, pvzLoading, pvzError };
}
