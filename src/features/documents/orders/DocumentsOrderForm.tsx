import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { AuthData } from "../../../types";
import type {
  CalculatorOptions,
  CityCode,
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
} from "../../../api/client/documentsOrder";
import {
  DocumentsOrderPvzSection,
  useDocumentsOrderPvzList,
  type PvzSelectionState,
} from "./DocumentsOrderPvzSection";
import {
  createDefaultCargoState,
  DocumentsOrderCargoSection,
  type DocumentsOrderCargoState,
} from "./DocumentsOrderCargoSection";
import { DocumentsOrderQuoteSummary } from "./DocumentsOrderQuoteSummary";
import "../../../styles/haulz-calculator.css";

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

function inferDirectionFromCities(from?: CityCode | null, to?: CityCode | null): Direction | null {
  if (from === "kaliningrad") return "kgd_mow";
  if (from === "moscow") return "mow_kgd";
  if (to === "moscow" && to !== from) return "kgd_mow";
  return null;
}

function defaultPvzState(city: CityCode): PvzSelectionState {
  return {
    mode: "pvz",
    pvzRef: "",
    pvzItem: null,
    addr: null,
    query: "",
    city,
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

  const { pvzList, pvzLoading } = useDocumentsOrderPvzList(authScope, true);

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
  const [orderMessage, setOrderMessage] = useState<string | null>(null);
  const [nomerZayavki, setNomerZayavki] = useState("");
  const [dataZabora, setDataZabora] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });

  const fromAddr = fromState.addr;
  const toAddr = toState.addr;

  const inferredDirection = useMemo(
    () => inferDirectionFromCities(fromAddr?.city, toAddr?.city) ?? "mow_kgd",
    [fromAddr?.city, toAddr?.city],
  );

  const suggestCityFrom = inferredDirection === "kgd_mow" ? "kaliningrad" : "moscow";
  const suggestCityTo = inferredDirection === "kgd_mow" ? "moscow" : "kaliningrad";

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
    fetchDocumentsOrderOptions(authScope, inferredDirection, chargeableHint.ch)
      .then((o) => {
        if (!cancelled) setOptions(o);
      })
      .catch(() => {
        if (!cancelled) setOptions(null);
      });
    return () => {
      cancelled = true;
    };
  }, [authScope, inferredDirection, chargeableHint.ch]);

  const canQuote = Boolean(fromAddr?.point && toAddr?.point && chargeableHint.ch > 0);

  const quoteDepsKey = useMemo(
    () =>
      JSON.stringify({
        from: fromAddr?.point,
        to: toAddr?.point,
        places,
        mainlineMode,
        direction: inferredDirection,
        declaredValue: cargo.declaredValue,
        extraCodes,
      }),
    [fromAddr?.point, toAddr?.point, places, mainlineMode, inferredDirection, cargo.declaredValue, extraCodes],
  );

  const debouncedQuoteDeps = useDebounced(quoteDepsKey, 700);
  const prevQuoteDepsRef = useRef<string | null>(null);

  useEffect(() => {
    if (!canQuote) {
      prevQuoteDepsRef.current = null;
      setQuote(null);
      return;
    }
    if (prevQuoteDepsRef.current === debouncedQuoteDeps) return;
    prevQuoteDepsRef.current = debouncedQuoteDeps;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchDocumentsOrderQuote(authScope, {
      from: fromAddr!,
      to: toAddr!,
      places,
      mainlineMode,
      direction: inferredDirection,
      declaredValueRub: Number(cargo.declaredValue) || 0,
      extraCodes,
    })
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
  }, [canQuote, debouncedQuoteDeps, authScope, fromAddr, toAddr, places, mainlineMode, inferredDirection, cargo.declaredValue, extraCodes]);

  const punktOtpravki = fromState.mode === "pvz" && fromState.pvzRef
    ? fromState.pvzRef
    : fromAddr?.fullAddress || "";
  const punktNaznacheniya = toState.mode === "pvz" && toState.pvzRef
    ? toState.pvzRef
    : toAddr?.fullAddress || "";

  const canSubmit = Boolean(
    canQuote &&
      quote &&
      !loading &&
      !orderLoading &&
      punktOtpravki &&
      punktNaznacheniya &&
      dataZabora,
  );

  const toggleExtra = (code: string) => {
    setExtraCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const submitOrder = useCallback(async () => {
    if (!canSubmit || !quote || !fromAddr || !toAddr) return;
    setOrderLoading(true);
    setOrderMessage(null);
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

      const result = await submitDocumentsOrder(authScope, {
        from: fromAddr,
        to: toAddr,
        places,
        mainlineMode,
        direction: inferredDirection,
        declaredValueRub: Number(cargo.declaredValue) || 0,
        extraCodes,
        punktOtpravki,
        punktNaznacheniya,
        fromPvzRef: fromState.mode === "pvz" ? fromState.pvzRef : undefined,
        toPvzRef: toState.mode === "pvz" ? toState.pvzRef : undefined,
        fromAddressType: fromState.mode,
        toAddressType: toState.mode,
        nomerZayavki: nomerZayavki.trim() || undefined,
        dataZabora,
        tableRows: cargo.tableRows,
        attachments: attachments.length ? attachments : undefined,
      });

      setOrderMessage(result.message);
      setNomerZayavki(result.nomerZayavki);
      onSuccess?.();
    } catch (e) {
      setError((e as Error)?.message || "Ошибка оформления");
    } finally {
      setOrderLoading(false);
    }
  }, [
    canSubmit,
    quote,
    fromAddr,
    toAddr,
    authScope,
    places,
    mainlineMode,
    inferredDirection,
    cargo,
    punktOtpravki,
    punktNaznacheniya,
    fromState,
    toState,
    nomerZayavki,
    dataZabora,
    onSuccess,
  ]);

  const mainlineCards = quote?.mainlineOptions?.length ? quote.mainlineOptions : options?.mainlineOptions ?? [];

  const emptyHint =
    !fromAddr?.point || !toAddr?.point
      ? "Выберите пункты отправки и назначения — расчёт обновится автоматически"
      : chargeableHint.ch <= 0
        ? "Укажите вес или объём груза"
        : "Заполните адреса — расчёт обновится автоматически";

  return (
    <div className="haulz-calc-page haulz-calc-page--cdek documents-order-form">
      <div className="haulz-calc-page__head">
        <button type="button" className="haulz-calc-back" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
          Назад к заявкам
        </button>
        <h1 className="haulz-calc-page__title">Новая заявка</h1>
      </div>

      <div className="haulz-calc-grid">
        <div className="haulz-calc-main">
          <div className="haulz-calc-card">
            <h2 className="haulz-calc-card__title">Заказчик</h2>
            <p className="haulz-calc-customer-readonly">
              {activeCustomerName ? (
                <>
                  <strong>{activeCustomerName}</strong>
                  <br />
                </>
              ) : null}
              ИНН {activeInn}
            </p>
          </div>

          <DocumentsOrderPvzSection
            title="Отправить"
            authScope={authScope}
            pvzList={pvzList}
            pvzLoading={pvzLoading}
            state={fromState}
            onChange={setFromState}
            defaultCity={suggestCityFrom}
          />

          <DocumentsOrderPvzSection
            title="Вручить"
            authScope={authScope}
            pvzList={pvzList}
            pvzLoading={pvzLoading}
            state={toState}
            onChange={setToState}
            defaultCity={suggestCityTo}
          />

          <DocumentsOrderCargoSection state={cargo} onChange={setCargo} chargeableHint={chargeableHint} />

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
          canSubmit={canSubmit}
          orderLoading={orderLoading}
          orderMessage={orderMessage}
          dataZabora={dataZabora}
          setDataZabora={setDataZabora}
          nomerZayavki={nomerZayavki}
          setNomerZayavki={setNomerZayavki}
          emptyHint={emptyHint}
          onSubmit={() => void submitOrder()}
        />
      </div>
    </div>
  );
}
