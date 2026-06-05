import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Copy, Loader2, Mail, Plus, X } from "lucide-react";
import type { AuthData } from "../types";
import type {
  AddressSelection,
  CalculatorOptions,
  CityCode,
  Direction,
  MainlineMode,
  ParcelPlace,
  QuoteResult,
} from "../../lib/haulzCalculator/types";
import {
  fetchHaulzCalcDraft,
  fetchHaulzCalculatorOptions,
  fetchHaulzQuote,
  saveHaulzCalcDraft,
  sendHaulzQuoteEmail,
  submitHaulzCalculatorOrder,
  type HaulzCalculatorFormState,
} from "../api/client/haulzCalculator";
import { HaulzCalcAddressField } from "../features/haulzCalculator/HaulzCalcAddressField";
import { HaulzCalcMobileFlow } from "../features/haulzCalculator/HaulzCalcMobileFlow";
import type { HaulzCalcMobileRoute } from "../features/haulzCalculator/haulzCalcMobileLabels";
import { useHaulzCalcMobile } from "../features/haulzCalculator/useHaulzCalcMobile";
import { formatQuoteVatLine } from "../../lib/haulzCalculator/quoteVat";

type Props = {
  auth: AuthData | null;
  onBack: () => void;
  restoreDraftId?: number | null;
  onDraftConsumed?: () => void;
};

const BOX_PRESETS: { label: string; weightKg: number; volumeM3: number }[] = [
  { label: "XS", weightKg: 1, volumeM3: 0.005 },
  { label: "S", weightKg: 3, volumeM3: 0.02 },
  { label: "M", weightKg: 10, volumeM3: 0.08 },
  { label: "L", weightKg: 25, volumeM3: 0.2 },
  { label: "XL", weightKg: 50, volumeM3: 0.5 },
];

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

export function HaulzCalculatorPage({ auth, onBack, restoreDraftId, onDraftConsumed }: Props) {
  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [fromAddr, setFromAddr] = useState<AddressSelection | null>(null);
  const [toAddr, setToAddr] = useState<AddressSelection | null>(null);
  const [fromMode, setFromMode] = useState<"courier" | "point">("courier");
  const [toMode, setToMode] = useState<"courier" | "point">("courier");
  const [fromPhone, setFromPhone] = useState("");
  const [toPhone, setToPhone] = useState("");
  const [fromInn, setFromInn] = useState("");
  const [toInn, setToInn] = useState("");
  const [fromCompanyName, setFromCompanyName] = useState("");
  const [toCompanyName, setToCompanyName] = useState("");
  const [fromName, setFromName] = useState("");
  const [toName, setToName] = useState("");
  const [places, setPlaces] = useState<ParcelPlace[]>([{ weightKg: 100, volumeM3: 0.5 }]);
  const [activePresetIdx, setActivePresetIdx] = useState<Record<number, string>>({ 0: "XL" });
  const [declaredValue, setDeclaredValue] = useState("");
  const [mainlineMode, setMainlineMode] = useState<MainlineMode>("ferry");
  const [directionOverride, setDirectionOverride] = useState<Direction | null>(null);
  const [extraCodes, setExtraCodes] = useState<string[]>([]);
  const [options, setOptions] = useState<CalculatorOptions | null>(null);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoQuoteEnabled] = useState(true);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderMessage, setOrderMessage] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [dataZabora, setDataZabora] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [registeredNomerZayavki, setRegisteredNomerZayavki] = useState<string | null>(null);
  const [mobileRoute, setMobileRoute] = useState<HaulzCalcMobileRoute>("hub");
  const isMobileLayout = useHaulzCalcMobile();
  const prevQuoteDepsRef = useRef<string | null>(null);

  const inferredDirection = useMemo(
    () => directionOverride ?? inferDirectionFromCities(fromAddr?.city, toAddr?.city) ?? "mow_kgd",
    [directionOverride, fromAddr?.city, toAddr?.city],
  );

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

  const suggestCityFrom = inferredDirection === "kgd_mow" ? "kaliningrad" : "moscow";
  const suggestCityTo = inferredDirection === "kgd_mow" ? "moscow" : "kaliningrad";

  useEffect(() => {
    if (!auth) return;
    let cancelled = false;
    fetchHaulzCalculatorOptions(auth, inferredDirection, chargeableHint.ch)
      .then((o) => {
        if (!cancelled) setOptions(o);
      })
      .catch(() => {
        if (!cancelled) setOptions(null);
      });
    return () => {
      cancelled = true;
    };
  }, [auth, inferredDirection, chargeableHint.ch]);

  const buildFormState = useCallback((): HaulzCalculatorFormState => {
    return {
      fromQuery,
      toQuery,
      from: fromAddr,
      to: toAddr,
      fromMode,
      toMode,
      fromPhone,
      toPhone,
      fromInn,
      toInn,
      fromCompanyName,
      toCompanyName,
      fromName,
      toName,
      places,
      activePresetIdx,
      declaredValue,
      mainlineMode,
      directionOverride,
      extraCodes,
      dataZabora,
    };
  }, [
    fromQuery,
    toQuery,
    fromAddr,
    toAddr,
    fromMode,
    toMode,
    fromPhone,
    toPhone,
    fromInn,
    toInn,
    fromCompanyName,
    toCompanyName,
    fromName,
    toName,
    places,
    activePresetIdx,
    declaredValue,
    mainlineMode,
    directionOverride,
    extraCodes,
    dataZabora,
  ]);

  const applyFormState = useCallback((f: HaulzCalculatorFormState) => {
    setFromQuery(f.fromQuery ?? "");
    setToQuery(f.toQuery ?? "");
    setFromAddr(f.from ?? null);
    setToAddr(f.to ?? null);
    setFromMode(f.fromMode === "point" ? "point" : "courier");
    setToMode(f.toMode === "point" ? "point" : "courier");
    setFromPhone(f.fromPhone ?? "");
    setToPhone(f.toPhone ?? "");
    setFromInn(f.fromInn ?? "");
    setToInn(f.toInn ?? "");
    setFromCompanyName(f.fromCompanyName ?? "");
    setToCompanyName(f.toCompanyName ?? "");
    setFromName(f.fromName ?? "");
    setToName(f.toName ?? "");
    setPlaces(f.places?.length ? f.places : [{ weightKg: 100, volumeM3: 0.5 }]);
    setActivePresetIdx(f.activePresetIdx ?? { 0: "XL" });
    setDeclaredValue(f.declaredValue ?? "");
    setMainlineMode(f.mainlineMode === "auto" ? "auto" : "ferry");
    setDirectionOverride(f.directionOverride ?? null);
    setExtraCodes(Array.isArray(f.extraCodes) ? f.extraCodes : []);
    if (f.dataZabora) setDataZabora(f.dataZabora);
  }, []);

  useEffect(() => {
    if (!auth || !restoreDraftId) return;
    let cancelled = false;
    setDraftLoading(true);
    setError(null);
    fetchHaulzCalcDraft(auth, restoreDraftId)
      .then((d) => {
        if (cancelled) return;
        setDraftId(d.id);
        applyFormState(d.formState);
        if (d.quoteResult) setQuote(d.quoteResult);
        if (d.nomerZayavki?.trim()) {
          setRegisteredNomerZayavki(d.nomerZayavki.trim());
          setOrderMessage(`Заявка ${d.nomerZayavki.trim()} оформлена`);
        }
        onDraftConsumed?.();
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error)?.message || "Не удалось открыть черновик");
      })
      .finally(() => {
        if (!cancelled) setDraftLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [auth, restoreDraftId, applyFormState, onDraftConsumed]);

  const saveDraft = useCallback(async () => {
    if (!auth) return;
    setDraftSaving(true);
    setDraftMessage(null);
    setError(null);
    try {
      const saved = await saveHaulzCalcDraft(auth, {
        id: draftId ?? undefined,
        formState: buildFormState(),
        quote: quote ?? null,
        status: "draft",
      });
      setDraftId(saved.id);
      setDraftMessage("Черновик сохранён");
    } catch (e) {
      setError((e as Error)?.message || "Не удалось сохранить черновик");
    } finally {
      setDraftSaving(false);
    }
  }, [auth, draftId, buildFormState, quote]);

  const applyQuickCity = useCallback((side: "from" | "to", city: CityCode) => {
    const label = city === "moscow" ? "Москва" : "Калининград";
    if (side === "from") {
      setDirectionOverride(city === "moscow" ? "mow_kgd" : "kgd_mow");
      setFromQuery(`${label}, `);
      setFromAddr(null);
    } else {
      setDirectionOverride(city === "moscow" ? "kgd_mow" : "mow_kgd");
      setToQuery(`${label}, `);
      setToAddr(null);
    }
  }, []);

  const canQuote = Boolean(auth && fromAddr?.point && toAddr?.point && chargeableHint.ch > 0);

  const canSubmitOrder = Boolean(canQuote && quote && !loading && !orderLoading);
  const canSendQuoteEmail = Boolean(quote && registeredNomerZayavki);

  const quoteDepsKey = useMemo(
    () =>
      JSON.stringify({
        from: fromAddr?.point,
        to: toAddr?.point,
        fromMode,
        toMode,
        places,
        mainlineMode,
        direction: inferredDirection,
        declaredValue,
        extraCodes,
      }),
    [
      fromAddr?.point,
      toAddr?.point,
      fromMode,
      toMode,
      places,
      mainlineMode,
      inferredDirection,
      declaredValue,
      extraCodes,
    ],
  );
  const debouncedQuoteDeps = useDebounced(quoteDepsKey, 700);

  useEffect(() => {
    if (prevQuoteDepsRef.current !== null && prevQuoteDepsRef.current !== quoteDepsKey) {
      setRegisteredNomerZayavki(null);
      setOrderMessage(null);
    }
    prevQuoteDepsRef.current = quoteDepsKey;
  }, [quoteDepsKey]);

  useEffect(() => {
    if (!autoQuoteEnabled || !canQuote) {
      if (!canQuote) setQuote(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchHaulzQuote(auth!, {
          from: fromAddr!,
          to: toAddr!,
          places,
          mainlineMode,
          direction: inferredDirection,
          declaredValueRub: Number(declaredValue) || 0,
          extraCodes,
          fromParty: {
            mode: fromMode,
            inn: fromInn,
            phone: fromPhone,
            companyName: fromCompanyName,
            fullName: fromName,
          },
          toParty: {
            mode: toMode,
            inn: toInn,
            phone: toPhone,
            companyName: toCompanyName,
            fullName: toName,
          },
        });
        if (!cancelled) {
          setQuote(result);
          if (result.mainlineOptions?.length) {
            const hasMode = result.mainlineOptions.some((m) => m.mode === mainlineMode);
            if (!hasMode) setMainlineMode(result.mainlineOptions[0].mode);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setQuote(null);
          setError((e as Error)?.message || "Ошибка расчёта");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    debouncedQuoteDeps,
    autoQuoteEnabled,
    canQuote,
    auth,
    fromAddr,
    toAddr,
    places,
    mainlineMode,
    inferredDirection,
    declaredValue,
    extraCodes,
    fromMode,
    toMode,
    fromInn,
    fromPhone,
    fromCompanyName,
    fromName,
    toInn,
    toPhone,
    toCompanyName,
    toName,
  ]);

  const submitOrder = useCallback(async () => {
    if (!auth || !fromAddr?.point || !toAddr?.point) return;
    setOrderLoading(true);
    setOrderMessage(null);
    setError(null);
    try {
      const { nomerZayavki, quote: q } = await submitHaulzCalculatorOrder(auth, {
        from: fromAddr,
        to: toAddr,
        places,
        mainlineMode,
        direction: inferredDirection,
        declaredValueRub: Number(declaredValue) || 0,
        extraCodes,
        dataZabora,
        fromParty: {
          mode: fromMode,
          inn: fromInn,
          phone: fromPhone,
          companyName: fromCompanyName,
          fullName: fromName,
        },
        toParty: {
          mode: toMode,
          inn: toInn,
          phone: toPhone,
          companyName: toCompanyName,
          fullName: toName,
        },
      });
      setQuote(q);
      setRegisteredNomerZayavki(nomerZayavki);
      setOrderMessage(`Заявка ${nomerZayavki} зарегистрирована`);
      try {
        const saved = await saveHaulzCalcDraft(auth, {
          id: draftId ?? undefined,
          formState: buildFormState(),
          quote: q,
          status: "submitted",
          nomerZayavki,
        });
        setDraftId(saved.id);
      } catch {
        /* черновик в списке — опционально */
      }
    } catch (e) {
      setError((e as Error)?.message || "Ошибка оформления");
    } finally {
      setOrderLoading(false);
    }
  }, [
    auth,
    fromAddr,
    toAddr,
    places,
    mainlineMode,
    inferredDirection,
    declaredValue,
    extraCodes,
    dataZabora,
    fromMode,
    fromInn,
    fromPhone,
    fromCompanyName,
    fromName,
    toMode,
    toInn,
    toPhone,
    toCompanyName,
    toName,
    draftId,
    buildFormState,
  ]);

  const toggleExtra = (code: string) => {
    setExtraCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const copySummary = () => {
    if (!quote) return;
    const text = [
      `Направление: ${quote.direction}`,
      ...quote.lines.map((l) => `${l.label}: ${l.amountRub} ₽`),
      `Итого: ${quote.totalRub} ₽`,
      formatQuoteVatLine(quote.totalRub),
      quote.deliveryDays ? `Срок: ~${quote.deliveryDays} дн.` : "",
    ]
      .filter(Boolean)
      .join("\n");
    void navigator.clipboard?.writeText(text);
  };

  const openEmailModal = () => {
    if (!quote) return;
    if (!registeredNomerZayavki) {
      setError("Сначала оформите заявку (кнопка «Оформить»), затем отправьте КП на почту.");
      return;
    }
    setEmailError(null);
    setEmailSuccess(null);
    setEmailTo("");
    setEmailModalOpen(true);
  };

  const sendQuoteEmail = useCallback(async () => {
    if (!auth || !quote || !fromAddr?.point || !toAddr?.point || !registeredNomerZayavki) return;
    const email = emailTo.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Укажите корректный адрес электронной почты");
      return;
    }
    setEmailSending(true);
    setEmailError(null);
    setEmailSuccess(null);
    try {
      const sent = await sendHaulzQuoteEmail(auth, {
        email,
        nomerZayavki: registeredNomerZayavki,
        formState: buildFormState(),
        draftId: draftId ?? undefined,
        from: fromAddr,
        to: toAddr,
        places,
        mainlineMode,
        direction: inferredDirection,
        declaredValueRub: Number(declaredValue) || 0,
        extraCodes,
        dataZabora,
        fromParty: {
          mode: fromMode,
          inn: fromInn,
          phone: fromPhone,
          companyName: fromCompanyName,
          fullName: fromName,
        },
        toParty: {
          mode: toMode,
          inn: toInn,
          phone: toPhone,
          companyName: toCompanyName,
          fullName: toName,
        },
      });
      if (sent.draftId) setDraftId(sent.draftId);
      setEmailSuccess(`КП отправлено на ${email}`);
      setTimeout(() => setEmailModalOpen(false), 1800);
    } catch (e) {
      setEmailError((e as Error)?.message || "Не удалось отправить");
    } finally {
      setEmailSending(false);
    }
  }, [
    auth,
    quote,
    fromAddr,
    toAddr,
    emailTo,
    places,
    mainlineMode,
    inferredDirection,
    declaredValue,
    extraCodes,
    dataZabora,
    fromMode,
    fromInn,
    fromPhone,
    fromCompanyName,
    fromName,
    toMode,
    toInn,
    toPhone,
    toCompanyName,
    toName,
    buildFormState,
    draftId,
    registeredNomerZayavki,
  ]);

  if (!auth) {
    return (
      <div className="haulz-calc-page--cdek">
        <p>Нет авторизации</p>
      </div>
    );
  }

  const mainlineCards = quote?.mainlineOptions?.length ? quote.mainlineOptions : options?.mainlineOptions ?? [];

  const mobileFlowProps = {
    auth,
    route: mobileRoute,
    setRoute: setMobileRoute,
    onBackFromCalc: onBack,
    draftSaving,
    draftLoading,
    saveDraft: () => void saveDraft(),
    draftMessage,
    error,
    fromQuery,
    setFromQuery,
    fromAddr,
    setFromAddr,
    toQuery,
    setToQuery,
    toAddr,
    setToAddr,
    fromMode,
    setFromMode,
    toMode,
    setToMode,
    fromPhone,
    setFromPhone,
    toPhone,
    setToPhone,
    fromInn,
    setFromInn,
    toInn,
    setToInn,
    fromCompanyName,
    setFromCompanyName,
    toCompanyName,
    setToCompanyName,
    fromName,
    setFromName,
    toName,
    setToName,
    places,
    setPlaces,
    activePresetIdx,
    setActivePresetIdx,
    declaredValue,
    setDeclaredValue,
    mainlineMode,
    setMainlineMode,
    extraCodes,
    toggleExtra,
    options,
    quote,
    loading,
    chargeableHint,
    suggestCityFrom,
    suggestCityTo,
    applyQuickCity,
    mainlineCards,
    canSubmitOrder,
    orderLoading,
    orderMessage,
    submitOrder: () => void submitOrder(),
    dataZabora,
    setDataZabora,
    copySummary,
    openEmailModal,
    canSendQuoteEmail,
    registeredNomerZayavki,
  };

  return (
    <div className={`haulz-calc-page--cdek${isMobileLayout ? " haulz-calc-page--mobile-flow" : ""}`}>
      <div className="haulz-calc-shell-bg">
        {isMobileLayout ? (
          <HaulzCalcMobileFlow {...mobileFlowProps} />
        ) : (
          <>
        <header className="haulz-calc-header">
          <button type="button" className="haulz-calc-header__back" onClick={onBack} aria-label="Назад">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="haulz-calc-header__title">Расчёт доставки</h1>
          <button
            type="button"
            className="haulz-calc-btn-secondary haulz-calc-header__save-draft"
            disabled={draftSaving || draftLoading || !auth}
            onClick={() => void saveDraft()}
          >
            {draftSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Сохранить черновик
          </button>
        </header>

        {draftLoading && (
          <p className="haulz-calc-hint" style={{ marginBottom: "0.75rem" }}>
            <Loader2 className="w-3 h-3 animate-spin" style={{ display: "inline", marginRight: "0.25rem" }} />
            Загружаем черновик…
          </p>
        )}
        {draftMessage && <div className="haulz-calc-alert haulz-calc-alert--success">{draftMessage}</div>}
        {error && <div className="haulz-calc-alert haulz-calc-alert--error">{error}</div>}

        <div className="haulz-calc-grid">
          <div className="haulz-calc-main">
            <HaulzCalcAddressField
              title="Отправить"
              side="from"
              city={suggestCityFrom}
              auth={auth}
              query={fromQuery}
              setQuery={setFromQuery}
              addr={fromAddr}
              setAddr={setFromAddr}
              mode={fromMode}
              setMode={setFromMode}
              phone={fromPhone}
              setPhone={setFromPhone}
              inn={fromInn}
              setInn={setFromInn}
              companyName={fromCompanyName}
              setCompanyName={setFromCompanyName}
              contactName={fromName}
              setContactName={setFromName}
              onQuickCity={(c) => applyQuickCity("from", c)}
            />

            <HaulzCalcAddressField
              title="Вручить"
              side="to"
              city={suggestCityTo}
              auth={auth}
              query={toQuery}
              setQuery={setToQuery}
              addr={toAddr}
              setAddr={setToAddr}
              mode={toMode}
              setMode={setToMode}
              phone={toPhone}
              setPhone={setToPhone}
              inn={toInn}
              setInn={setToInn}
              companyName={toCompanyName}
              setCompanyName={setToCompanyName}
              contactName={toName}
              setContactName={setToName}
              onQuickCity={(c) => applyQuickCity("to", c)}
            />

            <div className="haulz-calc-card">
              <h2 className="haulz-calc-card__title">Груз</h2>

              {places.map((p, idx) => (
                <div key={idx} className="haulz-calc-place">
                  <div className="haulz-calc-place__head">
                    <span>Место {idx + 1}</span>
                    {places.length > 1 && (
                      <button
                        type="button"
                        className="haulz-calc-text-btn"
                        onClick={() => setPlaces((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                  <div className="haulz-calc-size-row">
                    {BOX_PRESETS.map((b) => (
                      <button
                        key={b.label}
                        type="button"
                        className={`haulz-calc-size-chip${activePresetIdx[idx] === b.label ? " haulz-calc-size-chip--active" : ""}`}
                        onClick={() => {
                          setActivePresetIdx((prev) => ({ ...prev, [idx]: b.label }));
                          setPlaces((prev) => {
                            const next = [...prev];
                            next[idx] = { weightKg: b.weightKg, volumeM3: b.volumeM3 };
                            return next;
                          });
                        }}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                  <div className="haulz-calc-place-fields">
                    <label className="haulz-calc-field">
                      <span className="haulz-calc-label">Вес, кг</span>
                      <input
                        type="number"
                        className="haulz-calc-input"
                        value={String(p.weightKg)}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 0;
                          setPlaces((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], weightKg: v };
                            return next;
                          });
                        }}
                      />
                    </label>
                    <label className="haulz-calc-field">
                      <span className="haulz-calc-label">Объём, м³</span>
                      <input
                        type="number"
                        step="0.01"
                        className="haulz-calc-input"
                        value={String(p.volumeM3)}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 0;
                          setPlaces((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], volumeM3: v };
                            return next;
                          });
                        }}
                      />
                    </label>
                  </div>
                </div>
              ))}

              <button
                type="button"
                className="haulz-calc-link-btn"
                onClick={() => {
                  const nextIdx = places.length;
                  setPlaces((prev) => [...prev, { weightKg: 10, volumeM3: 0.1 }]);
                  setActivePresetIdx((prev) => ({ ...prev, [nextIdx]: "M" }));
                }}
              >
                <Plus className="w-4 h-4" />
                Добавить место
              </button>

              <p className="haulz-calc-place-note">
                Вес {chargeableHint.w.toFixed(0)} кг · объём {chargeableHint.v.toFixed(2)} м³ · объёмный вес{" "}
                {chargeableHint.volW.toFixed(0)} кг · <strong>платный вес {chargeableHint.ch.toFixed(0)} кг</strong>
              </p>

              <label className="haulz-calc-field" style={{ marginTop: "1rem" }}>
                <span className="haulz-calc-label">Объявленная стоимость, ₽</span>
                <input
                  type="number"
                  className="haulz-calc-input"
                  placeholder="Необязательно"
                  value={declaredValue}
                  onChange={(e) => setDeclaredValue(e.target.value)}
                />
              </label>
            </div>

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
                      <div className="haulz-calc-tariff-card__sub">{m.pricePerKg} ₽/кг</div>
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
                      <input type="checkbox" checked={extraCodes.includes(ex.code)} onChange={() => toggleExtra(ex.code)} />
                      <span className="haulz-calc-switch__track" />
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="haulz-calc-summary-wrap" aria-label="Ваш расчёт">
            <div className="haulz-calc-summary">
            <h2 className="haulz-calc-summary__title">Ваш расчёт</h2>

            {loading && (
              <p className="haulz-calc-summary__empty" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <Loader2 className="w-4 h-4 animate-spin" />
                Пересчёт…
              </p>
            )}

            {!quote && !loading && (
              <p
                className={`haulz-calc-summary__empty${error && canQuote ? " haulz-calc-summary__empty--error" : ""}`}
              >
                {error && canQuote
                  ? error
                  : !fromAddr?.point || !toAddr?.point
                    ? "Заполните адреса — расчёт обновится автоматически"
                    : chargeableHint.ch <= 0
                      ? "Укажите вес или объём груза"
                      : "Заполните адреса — расчёт обновится автоматически"}
              </p>
            )}

            {quote && (
              <>
                {quote.warnings.map((w) => (
                  <div key={w} className="haulz-calc-alert haulz-calc-alert--warn" style={{ marginBottom: "0.5rem" }}>
                    {w}
                  </div>
                ))}

                {quote.lines.map((line) => {
                  const info = line.meta?.informational === true;
                  return (
                    <div
                      key={line.key}
                      className={`haulz-calc-summary__line${info ? " haulz-calc-summary__line--muted" : ""}`}
                    >
                      <span>{line.label}</span>
                      <span>{info ? "—" : `${line.amountRub.toLocaleString("ru-RU")} ₽`}</span>
                    </div>
                  );
                })}

                <div className="haulz-calc-summary__divider" />

                <div className="haulz-calc-summary__total">
                  <span>Итого</span>
                  <span className="haulz-calc-summary__total-value">{quote.totalRub.toLocaleString("ru-RU")} ₽</span>
                </div>
                <p className="haulz-calc-summary__vat">{formatQuoteVatLine(quote.totalRub)}</p>

                {quote.deliveryDays > 0 && (
                  <p className="haulz-calc-summary__days">Срок доставки: ~{quote.deliveryDays} дн.</p>
                )}

                <p className="haulz-calc-summary__disclaimer">
                  Цена может измениться при оформлении. км МКАД: {quote.km.moscow.toFixed(1)} · км КАД:{" "}
                  {quote.km.kaliningrad.toFixed(1)}
                  {quote.quoteId ? ` · расчёт №${quote.quoteId}` : ""}
                </p>

                <label className="haulz-calc-field">
                  <span className="haulz-calc-label">Дата забора</span>
                  <input
                    type="date"
                    className="haulz-calc-input"
                    value={dataZabora}
                    onChange={(e) => setDataZabora(e.target.value)}
                  />
                </label>

                {orderMessage && <div className="haulz-calc-alert haulz-calc-alert--success">{orderMessage}</div>}

                <div className="haulz-calc-summary__actions" style={{ marginTop: "1rem" }}>
                  <button type="button" className="haulz-calc-btn-primary" disabled={!canSubmitOrder} onClick={() => void submitOrder()}>
                    {orderLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Оформить
                  </button>
                  <button type="button" className="haulz-calc-btn-secondary" disabled={!quote} onClick={copySummary}>
                    <Copy className="w-4 h-4" />
                    Копировать расчёт
                  </button>
                  <button
                    type="button"
                    className="haulz-calc-btn-secondary"
                    disabled={!canSendQuoteEmail}
                    title={
                      canSendQuoteEmail
                        ? undefined
                        : "Сначала оформите заявку — кнопка «Оформить»"
                    }
                    onClick={openEmailModal}
                  >
                    <Mail className="w-4 h-4" />
                    Отправить на почту
                  </button>
                  {!canSendQuoteEmail && quote && (
                    <p className="haulz-calc-field-hint" style={{ margin: 0 }}>
                      КП на почту доступно после оформления заявки.
                    </p>
                  )}
                </div>
              </>
            )}
            </div>
          </aside>
        </div>
          </>
        )}
      </div>

      {emailModalOpen && (
        <div
          className="haulz-calc-map-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="haulz-calc-email-title"
          onClick={() => !emailSending && setEmailModalOpen(false)}
        >
          <div className="haulz-calc-map-modal haulz-calc-map-modal--email" onClick={(e) => e.stopPropagation()}>
            <div className="haulz-calc-map-modal__head">
              <div id="haulz-calc-email-title" className="haulz-calc-map-modal__title">
                <Mail className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
                Отправить КП на почту
              </div>
              <button
                type="button"
                className="haulz-calc-map-modal__close"
                aria-label="Закрыть"
                disabled={emailSending}
                onClick={() => setEmailModalOpen(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="haulz-calc-map-modal__hint">
              На указанный адрес уйдёт коммерческое предложение с расчётом, маршрутом и контактами HAULZ.
              {registeredNomerZayavki ? (
                <>
                  {" "}
                  Заявка №{registeredNomerZayavki}.
                </>
              ) : null}
            </p>
            <label className="haulz-calc-field haulz-calc-email-modal__field" htmlFor="haulz-calc-email-input">
              <span className="haulz-calc-label">Электронная почта</span>
              <input
                id="haulz-calc-email-input"
                type="email"
                className="haulz-calc-input"
                autoComplete="email"
                placeholder="partner@company.ru"
                value={emailTo}
                disabled={emailSending}
                onChange={(e) => setEmailTo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendQuoteEmail();
                }}
              />
            </label>
            {emailError && <p className="haulz-calc-map-modal__error">{emailError}</p>}
            {emailSuccess && <div className="haulz-calc-alert haulz-calc-alert--success" style={{ margin: "0 1rem 0.5rem" }}>{emailSuccess}</div>}
            <div className="haulz-calc-map-modal__actions">
              <button type="button" className="haulz-calc-btn-secondary" disabled={emailSending} onClick={() => setEmailModalOpen(false)}>
                Отмена
              </button>
              <button
                type="button"
                className="haulz-calc-btn-primary"
                disabled={emailSending || !canSendQuoteEmail}
                onClick={() => void sendQuoteEmail()}
              >
                {emailSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Отправить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
