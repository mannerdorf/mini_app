import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { AuthData } from "../../../types";
import type {
  CalculatorOptions,
  CityCode,
  DeliveryParty,
  Direction,
  MainlineMode,
  QuoteResult,
} from "../../../../lib/haulzCalculator/types";
import {
  fetchDocumentsOrderOptions,
  fetchDocumentsOrderQuote,
  fileToBase64,
  submitDocumentsOrder,
  type DocumentsAuthScope,
  type DocumentsOrderQuotePayload,
} from "../../../api/client/documentsOrder";
import { buildDocumentsOrderZayavkaPayload } from "../../../../lib/documentsOrderZayavkaPayload";
import { warehouseForCity } from "../../../../lib/haulzCalculator/warehouses";
import { citiesForDirection } from "../../../../lib/haulzCalculator/direction";
import { HaulzCalcDirectionCard } from "../../haulzCalculator/HaulzCalcDirectionCard";
import {
  DocumentsOrderPvzSection,
  emptyPvzContactFields,
  useDocumentsOrderPvzList,
  type PvzSelectionState,
} from "./DocumentsOrderPvzSection";
import {
  createDefaultCargoState,
  DocumentsOrderCargoSection,
  type DocumentsOrderCargoState,
} from "./DocumentsOrderCargoSection";
import { resolveDocumentsOrderLegParty } from "../../../../lib/documentsOrderLegParty";
import {
  DocumentsOrderQuoteSummary,
} from "./DocumentsOrderQuoteSummary";
import { DocumentsOrderSuccessModal } from "./DocumentsOrderSuccessModal";
import { useDocumentsOrderSummaryTopSync } from "./useDocumentsOrderSummaryTopSync";
import { filterDocumentsOrderPvzByCity, inferPvzCityCode } from "./documentsOrderPvzFilter";
import { isFivepostCustomer } from "../../../../lib/fivepost/customerAccess";
import "../../../styles/haulz-calculator.css";

function resolveLegEndpoint(state: PvzSelectionState) {
  if (state.deliveryMode === "point") {
    return {
      punkt: state.addr?.sourceId || state.addr?.fullAddress || "",
      addressType: "warehouse" as const,
      pvzRef: undefined as string | undefined,
    };
  }
  if (state.addressKind === "pvz" && state.pvzRef) {
    return { punkt: state.pvzRef, addressType: "pvz" as const, pvzRef: state.pvzRef };
  }
  return {
    punkt: state.addr?.fullAddress || "",
    addressType: "custom" as const,
    pvzRef: undefined as string | undefined,
  };
}

function legParty(state: PvzSelectionState): DeliveryParty {
  return resolveDocumentsOrderLegParty(state);
}

type Props = {
  auth: AuthData;
  activeInn: string;
  activeCustomerName?: string | null;
  onBack: () => void;
  onSuccess?: () => void;
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function resetLegStateForCity(prev: PvzSelectionState, city: CityCode): PvzSelectionState {
  if (prev.deliveryMode === "point") {
    const wh = warehouseForCity(city);
    return {
      deliveryMode: "point",
      addressKind: "pvz",
      pvzRef: "",
      pvzItem: null,
      city,
      addr: {
        label: wh.label,
        fullAddress: wh.fullAddress,
        point: wh.point,
        city,
        sourceId: wh.code,
      },
      query: wh.fullAddress,
      ...emptyPvzContactFields,
    };
  }

  const wrongPvz = prev.pvzItem != null && inferPvzCityCode(prev.pvzItem, city) !== city;
  const wrongAddr = prev.addr?.city != null && prev.addr.city !== city;

  if (prev.city !== city || wrongPvz || wrongAddr) {
    return {
      deliveryMode: "courier",
      addressKind: "pvz",
      pvzRef: "",
      pvzItem: null,
      addr: null,
      query: "",
      city,
      ...emptyPvzContactFields,
    };
  }

  return { ...prev, city };
}

function defaultPvzState(city: CityCode): PvzSelectionState {
  const wh = warehouseForCity(city);
  return {
    deliveryMode: "point",
    addressKind: "pvz",
    pvzRef: "",
    pvzItem: null,
    addr: {
      label: wh.label,
      fullAddress: wh.fullAddress,
      point: wh.point,
      city,
      sourceId: wh.code,
    },
    query: wh.fullAddress,
    city,
    ...emptyPvzContactFields,
  };
}

export function DocumentsOrderForm({ auth, activeInn, activeCustomerName, onBack, onSuccess }: Props) {
  const authScope: DocumentsAuthScope = useMemo(
    () => ({
      login: auth.login,
      password: auth.password,
      inn: activeInn,
      customerName: activeCustomerName,
    }),
    [auth.login, auth.password, activeInn, activeCustomerName],
  );

  const fivepostCustomer = useMemo(
    () => isFivepostCustomer(activeInn, activeCustomerName),
    [activeInn, activeCustomerName],
  );

  const { pvzList, pvzLoading, pvzError } = useDocumentsOrderPvzList(authScope, true);

  const [direction, setDirection] = useState<Direction>("mow_kgd");
  const [fromState, setFromState] = useState<PvzSelectionState>(() => defaultPvzState("moscow"));
  const [toState, setToState] = useState<PvzSelectionState>(() => defaultPvzState("kaliningrad"));
  const [cargo, setCargo] = useState<DocumentsOrderCargoState>(createDefaultCargoState);
  const [mainlineMode, setMainlineMode] = useState<MainlineMode>("ferry");
  const [extraCodes, setExtraCodes] = useState<string[]>([]);
  const [options, setOptions] = useState<CalculatorOptions | null>(null);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [submittedNomerZayavki, setSubmittedNomerZayavki] = useState<string | null>(null);
  const [nomerZayavki, setNomerZayavki] = useState("");
  const [dataZabora, setDataZabora] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });

  const formRef = useRef<HTMLDivElement>(null);
  const routeRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  useDocumentsOrderSummaryTopSync(formRef, routeRef, mainRef);

  const fromAddr = fromState.addr;
  const toAddr = toState.addr;
  const fromParty = useMemo(() => legParty(fromState), [fromState]);
  const toParty = useMemo(() => legParty(toState), [toState]);
  const fromEndpoint = useMemo(() => resolveLegEndpoint(fromState), [fromState]);
  const toEndpoint = useMemo(() => resolveLegEndpoint(toState), [toState]);

  const { from: suggestCityFrom, to: suggestCityTo } = useMemo(() => citiesForDirection(direction), [direction]);

  const fromPvzList = useMemo(
    () => filterDocumentsOrderPvzByCity(pvzList, suggestCityFrom, activeInn),
    [pvzList, suggestCityFrom, activeInn],
  );
  const toPvzList = useMemo(
    () => filterDocumentsOrderPvzByCity(pvzList, suggestCityTo, activeInn),
    [pvzList, suggestCityTo, activeInn],
  );

  const handleDirectionChange = useCallback((next: Direction) => {
    setDirection(next);
    const { from, to } = citiesForDirection(next);
    setFromState((prev) => resetLegStateForCity(prev, from));
    setToState((prev) => resetLegStateForCity(prev, to));
  }, []);

  const places = cargo.attachEnabled && cargo.tableRows.length > 0
    ? cargo.tableRows.map(() => ({ weightKg: 1, volumeM3: 0.01 }))
    : cargo.places;

  const chargeableHint = useMemo(() => {
    const factor = options?.volumetricFactor ?? 200;
    let w = 0;
    let v = 0;
    for (const p of places) {
      w += Number(p.weightKg) || 0;
      v += Number(p.volumeM3) || 0;
    }
    const volW = v * factor;
    const ch = Math.max(w, volW);
    return { w, v, volW, ch, factor };
  }, [places, options?.volumetricFactor]);

  useEffect(() => {
    let cancelled = false;
    fetchDocumentsOrderOptions(authScope, direction, chargeableHint.ch)
      .then((o) => {
        if (!cancelled) setOptions(o);
      })
      .catch(() => {
        if (!cancelled) setOptions(null);
      });
    return () => {
      cancelled = true;
    };
  }, [authScope, direction, chargeableHint.ch]);

  const canQuote = Boolean(fromAddr?.point && toAddr?.point && chargeableHint.ch > 0);

  const quoteDepsKey = useMemo(
    () =>
      JSON.stringify({
        from: fromAddr?.point,
        to: toAddr?.point,
        places,
        mainlineMode,
        direction,
        declaredValue: cargo.declaredValue,
        extraCodes,
        fromParty,
        toParty,
      }),
    [
      fromAddr?.point,
      toAddr?.point,
      places,
      mainlineMode,
      direction,
      cargo.declaredValue,
      extraCodes,
      fromParty,
      toParty,
    ],
  );

  const debouncedQuoteDeps = useDebounced(quoteDepsKey, 700);
  const prevQuoteDepsRef = useRef<string | null>(null);
  const quoteRequestRef = useRef<DocumentsOrderQuotePayload | null>(null);

  quoteRequestRef.current =
    canQuote && fromAddr && toAddr
      ? {
          from: fromAddr,
          to: toAddr,
          places,
          mainlineMode,
          direction,
          declaredValueRub: Number(cargo.declaredValue) || 0,
          extraCodes,
          fromParty,
          toParty,
        }
      : null;

  useEffect(() => {
    if (!canQuote || !quoteRequestRef.current) {
      prevQuoteDepsRef.current = null;
      setQuote(null);
      setLoading(false);
      return;
    }
    if (prevQuoteDepsRef.current === debouncedQuoteDeps) return;
    prevQuoteDepsRef.current = debouncedQuoteDeps;

    const payload = quoteRequestRef.current;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchDocumentsOrderQuote(authScope, payload)
      .then((q) => {
        if (!cancelled) setQuote(q);
      })
      .catch((e) => {
        if (!cancelled) {
          setQuote(null);
          setError((e as Error)?.message || "Ошибка расчёта");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canQuote, debouncedQuoteDeps, authScope]);

  const punktOtpravki = fromEndpoint.punkt;
  const punktNaznacheniya = toEndpoint.punkt;

  const canSubmit = Boolean(
    canQuote &&
      quote &&
      !loading &&
      !orderLoading &&
      punktOtpravki &&
      punktNaznacheniya &&
      dataZabora,
  );

  const submitBlockReason = useMemo((): string | null => {
    if (orderLoading) return null;
    if (!fromAddr?.point || !toAddr?.point) {
      return "Укажите адреса отправки и назначения";
    }
    if (chargeableHint.ch <= 0) return "Укажите вес или объём груза";
    if (!dataZabora) return "Укажите дату забора";
    if (!punktOtpravki || !punktNaznacheniya) return "Укажите пункты отправки и назначения";
    if (loading) return "Дождитесь окончания расчёта";
    if (!quote) return "Дождитесь расчёта стоимости";
    return null;
  }, [
    orderLoading,
    fromAddr?.point,
    toAddr?.point,
    chargeableHint.ch,
    dataZabora,
    punktOtpravki,
    punktNaznacheniya,
    loading,
    quote,
  ]);

  const toggleExtra = (code: string) => {
    setExtraCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const submitOrder = useCallback(async () => {
    if (submitBlockReason) {
      setError(submitBlockReason);
      return;
    }
    if (!canSubmit || !quote || !fromAddr || !toAddr) {
      setError("Нельзя оформить: заполните адреса, груз и дождитесь расчёта.");
      return;
    }
    setOrderLoading(true);
    setError(null);
    try {
      const attachments: { name: string; mimeType?: string; base64: string }[] = [];
      if (cargo.attachEnabled && cargo.fileUpd) {
        attachments.push({
          name: cargo.fileUpd.name,
          mimeType: cargo.fileUpd.type || undefined,
          base64: await fileToBase64(cargo.fileUpd),
        });
      }
      if (cargo.attachEnabled && cargo.fileZayavki) {
        attachments.push({
          name: cargo.fileZayavki.name,
          mimeType: cargo.fileZayavki.type || undefined,
          base64: await fileToBase64(cargo.fileZayavki),
        });
      }

      const zayavkaPayload = buildDocumentsOrderZayavkaPayload({
        customerInn: authScope.inn,
        senderInn: fromParty.inn,
        receiverInn: toParty.inn,
        punktOtpravki,
        punktNaznacheniya,
        dataZabora,
        nomerZayavkiKlienta: nomerZayavki.trim() || undefined,
        declaredValueRub: Number(cargo.declaredValue) || 0,
        placeCount: places.length,
        fivepostRows: cargo.fivepostRows.length
          ? cargo.fivepostRows.map((row) => ({
              omniBarcode: row.omniBarcode,
              teBarcode: row.teBarcode,
              clientOrderNo: row.clientOrderNo,
              partnerOrderNo: row.partnerOrderNo,
              itemNameRu: row.itemNameRu,
              itemName: row.itemName,
              unitCost: row.unitCost,
              totalCost: row.totalCost,
              placesCount: row.placesCount,
            }))
          : undefined,
        tableRows: cargo.tableRows.length
          ? cargo.tableRows.map((row) => ({
              posylka: row.posylka,
              perevozka: row.perevozka,
              idOtpravleniya: row.idOtpravleniya,
              items: row.items?.map((item) => ({
                name: item.name,
                quantity: item.quantity,
                price: item.price,
              })),
            }))
          : undefined,
      });

      const result = await submitDocumentsOrder(authScope, {
        from: fromAddr,
        to: toAddr,
        places,
        mainlineMode,
        direction,
        declaredValueRub: Number(cargo.declaredValue) || 0,
        extraCodes,
        fromParty,
        toParty,
        punktOtpravki,
        punktNaznacheniya,
        fromPvzRef: fromEndpoint.pvzRef,
        toPvzRef: toEndpoint.pvzRef,
        fromAddressType: fromEndpoint.addressType,
        toAddressType: toEndpoint.addressType,
        nomerZayavkiKlienta: nomerZayavki.trim() || undefined,
        dataZabora,
        tableRows: cargo.tableRows,
        fivepostBatchId: fivepostCustomer && cargo.fivepostBatchId ? cargo.fivepostBatchId : undefined,
        attachments: attachments.length ? attachments : undefined,
        zayavkaPayload,
      });

      setSubmittedNomerZayavki(result.nomerZayavki.trim());
    } catch (e) {
      setError((e as Error)?.message || "Ошибка оформления");
    } finally {
      setOrderLoading(false);
    }
  }, [
    canSubmit,
    submitBlockReason,
    quote,
    fromAddr,
    toAddr,
    authScope,
    places,
    mainlineMode,
    direction,
    cargo,
    punktOtpravki,
    punktNaznacheniya,
    fromEndpoint,
    toEndpoint,
    fromParty,
    toParty,
    nomerZayavki,
    dataZabora,
    fivepostCustomer,
    extraCodes,
  ]);

  const dismissSuccessModal = useCallback(() => {
    setSubmittedNomerZayavki(null);
    onSuccess?.();
  }, [onSuccess]);

  const mainlineCards = quote?.mainlineOptions?.length ? quote.mainlineOptions : options?.mainlineOptions ?? [];

  const emptyHint =
    !fromAddr?.point || !toAddr?.point
      ? "Укажите адреса отправки и назначения (из ПВЗ или новый адрес) — расчёт обновится автоматически"
      : chargeableHint.ch <= 0
        ? "Укажите вес или объём груза"
        : "Заполните параметры груза — расчёт обновится автоматически";

  return (
    <div ref={formRef} className="haulz-calc-page--cdek haulz-calc-summary-layout-sync documents-order-form">
      <div className="haulz-calc-shell-bg">
        <header className="haulz-calc-header">
          <button type="button" className="haulz-calc-header__back" onClick={onBack} aria-label="Назад к заявкам">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="haulz-calc-header__title">Новая заявка</h1>
        </header>

        <div className="haulz-calc-grid">
        <div ref={mainRef} className="haulz-calc-main">
          <HaulzCalcDirectionCard
            cardRef={routeRef}
            direction={direction}
            onDirectionChange={handleDirectionChange}
          />

          <DocumentsOrderPvzSection
            title="Отправить"
            side="from"
            auth={auth}
            authScope={authScope}
            pvzList={fromPvzList}
            pvzLoading={pvzLoading}
            pvzError={pvzError}
            pvzCatalogEmpty={!pvzLoading && !pvzError && pvzList.length === 0}
            pvzTotalCount={pvzList.length}
            state={fromState}
            onChange={setFromState}
            defaultCity={suggestCityFrom}
          />

          <DocumentsOrderPvzSection
            title="Вручить"
            side="to"
            auth={auth}
            authScope={authScope}
            pvzList={toPvzList}
            pvzLoading={pvzLoading}
            pvzError={pvzError}
            pvzCatalogEmpty={!pvzLoading && !pvzError && pvzList.length === 0}
            pvzTotalCount={pvzList.length}
            state={toState}
            onChange={setToState}
            defaultCity={suggestCityTo}
          />

          <DocumentsOrderCargoSection
            authScope={authScope}
            direction={direction}
            isFivepostCustomer={fivepostCustomer}
            state={cargo}
            onChange={setCargo}
            chargeableHint={chargeableHint}
          />

          {mainlineCards.length > 0 && (
            <div className="haulz-calc-card">
              <h2 className="haulz-calc-card__title">Тарифы</h2>
              <div className="haulz-calc-tariff-grid">
                {mainlineCards.map((m) => (
                  <button
                    key={m.mode}
                    type="button"
                    className={`haulz-calc-tariff-card${mainlineMode === m.mode ? " haulz-calc-tariff-card--selected" : ""}`}
                    onClick={() => setMainlineMode(m.mode)}
                  >
                    <div className="haulz-calc-tariff-card__name">{m.label}</div>
                    <div className="haulz-calc-tariff-card__days">~{m.deliveryDays} дн.</div>
                    <div className="haulz-calc-tariff-card__price">{m.estimatedRub.toLocaleString("ru-RU")} ₽</div>
                    <div className="haulz-calc-tariff-card__sub">
                      {Math.round(m.billableWeightKg)} кг · {m.pricePerKg} ₽/кг
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(options?.extras?.length ?? 0) > 0 && (
            <div className="haulz-calc-card">
              <h2 className="haulz-calc-card__title">Может пригодиться</h2>
              {options!.extras.map((ex) => (
                <div key={ex.code} className="haulz-calc-extra">
                  <div className="haulz-calc-extra__text">
                    <strong>{ex.label}</strong>
                    {ex.description && <span className="haulz-calc-extra__desc">{ex.description}</span>}
                  </div>
                  <label className="haulz-calc-switch">
                    <input
                      type="checkbox"
                      checked={extraCodes.includes(ex.code)}
                      onChange={() => toggleExtra(ex.code)}
                    />
                    <span className="haulz-calc-switch__track" />
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>

        <DocumentsOrderQuoteSummary
          quote={quote}
          loading={loading}
          error={error}
          canQuote={canQuote}
          submitBlockReason={submitBlockReason}
          orderLoading={orderLoading}
          dataZabora={dataZabora}
          setDataZabora={setDataZabora}
          nomerZayavki={nomerZayavki}
          setNomerZayavki={setNomerZayavki}
          emptyHint={emptyHint}
          onSubmit={() => void submitOrder()}
        />
        </div>
      </div>

      {submittedNomerZayavki && (
        <DocumentsOrderSuccessModal nomerZayavki={submittedNomerZayavki} onClose={dismissSuccessModal} />
      )}
    </div>
  );
}
