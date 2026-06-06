import React, { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AddressSelection, CityCode } from "../../../../lib/haulzCalculator/types";
import { warehouseForCity } from "../../../../lib/haulzCalculator/warehouses";
import { fetchPvzList, type PvzItem } from "../../../api/client/documentsOrders";
import {
  fetchDocumentsGeocode,
  type DocumentsAuthScope,
} from "../../../api/client/documentsOrder";
import type { AuthData } from "../../../types";
import { DocumentsOrderAddressField } from "./DocumentsOrderAddressField";
import { DocumentsOrderCustomAddressContacts } from "./DocumentsOrderCustomAddressContacts";
import { filterDocumentsOrderPvzList, inferPvzCityCode } from "./documentsOrderPvzFilter";

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
  state: PvzSelectionState;
  onChange: (next: PvzSelectionState) => void;
  defaultCity: CityCode;
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
  state,
  onChange,
  defaultCity,
}: Props) {
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const warehouseLabel = side === "from" ? "Со Склада" : "на Складе";
  const isWarehouseMode = state.deliveryMode === "point";

  const geocodePvz = useCallback(
    async (p: PvzItem, city: CityCode) => {
      setGeocodeLoading(true);
      setGeocodeError(null);
      try {
        const q = geocodeQueryForPvz(p);
        const r = await fetchDocumentsGeocode(authScope, { address: q, city });
        onChange({
          ...state,
          deliveryMode: "courier",
          addressKind: "pvz",
          pvzRef: p.Ссылка,
          pvzItem: p,
          addr: {
            label: pvzLabel(p),
            fullAddress: r.fullAddress || q,
            point: r.point,
            city,
            sourceId: p.Ссылка,
          },
          query: r.fullAddress || q,
          city,
        });
      } catch (e) {
        setGeocodeError((e as Error)?.message || "Не удалось определить координаты ПВЗ");
        onChange({
          ...state,
          deliveryMode: "courier",
          addressKind: "pvz",
          pvzRef: p.Ссылка,
          pvzItem: p,
          addr: null,
          query: geocodeQueryForPvz(p),
          city,
        });
      } finally {
        setGeocodeLoading(false);
      }
    },
    [authScope, onChange, state],
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

      <div className="haulz-calc-segment" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={state.deliveryMode === "courier"}
          className={`haulz-calc-segment__btn${state.deliveryMode === "courier" ? " haulz-calc-segment__btn--active" : ""}`}
          onClick={() => setDeliveryMode("courier")}
        >
          Курьером
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
                    void geocodePvz(item, city);
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
                city={state.city}
                lockCity={defaultCity}
                geocodeOnIdle
                query={state.query}
                setQuery={(q) => onChange({ ...state, query: q })}
                addr={state.addr}
                setAddr={(a) =>
                  onChange(
                    a
                      ? { ...state, addr: a }
                      : clearContacts({ ...state, addr: null }),
                  )
                }
                onQuickCity={(c) =>
                  onChange(clearContacts({ ...state, city: c, addr: null, query: "" }))
                }
              />

              {state.addr?.point && (
                <DocumentsOrderCustomAddressContacts
                  side={side}
                  auth={auth}
                  inn={state.inn}
                  setInn={(inn) => onChange({ ...state, inn })}
                  companyName={state.companyName}
                  setCompanyName={(companyName) => onChange({ ...state, companyName })}
                  phone={state.phone}
                  setPhone={(phone) => onChange({ ...state, phone })}
                  contactName={state.contactName}
                  setContactName={(contactName) => onChange({ ...state, contactName })}
                />
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
    </div>
  );
}

export function useDocumentsOrderPvzList(authScope: DocumentsAuthScope, enabled: boolean) {
  const [pvzList, setPvzList] = useState<PvzItem[]>([]);
  const [pvzLoading, setPvzLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !authScope.login || !authScope.password) return;
    setPvzLoading(true);
    fetchPvzList({ login: authScope.login, password: authScope.password, inn: authScope.inn })
      .then((list) => setPvzList(filterDocumentsOrderPvzList(list)))
      .catch(() => setPvzList([]))
      .finally(() => setPvzLoading(false));
  }, [enabled, authScope.login, authScope.password, authScope.inn]);

  return { pvzList, pvzLoading };
}
