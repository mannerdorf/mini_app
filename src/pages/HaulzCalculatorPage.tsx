import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Copy, Loader2, Plus } from "lucide-react";
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
  fetchHaulzCalculatorOptions,
  fetchHaulzQuote,
  submitHaulzCalculatorOrder,
} from "../api/client/haulzCalculator";
import { HaulzCalcAddressField } from "../features/haulzCalculator/HaulzCalcAddressField";

type Props = {
  auth: AuthData | null;
  onBack: () => void;
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

export function HaulzCalculatorPage({ auth, onBack }: Props) {
  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [fromAddr, setFromAddr] = useState<AddressSelection | null>(null);
  const [toAddr, setToAddr] = useState<AddressSelection | null>(null);
  const [fromMode, setFromMode] = useState<"courier" | "point">("courier");
  const [toMode, setToMode] = useState<"courier" | "point">("courier");
  const [fromPhone, setFromPhone] = useState("");
  const [toPhone, setToPhone] = useState("");
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
  const [dataZabora, setDataZabora] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });

  const inferredDirection = useMemo(
    () => directionOverride ?? inferDirectionFromCities(fromAddr?.city, toAddr?.city) ?? "mow_kgd",
    [directionOverride, fromAddr?.city, toAddr?.city],
  );

  const directionAmbiguous = useMemo(() => {
    if (directionOverride) return false;
    const f = fromAddr?.city;
    const t = toAddr?.city;
    return !f && !t;
  }, [directionOverride, fromAddr?.city, toAddr?.city]);

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

  const canQuote = Boolean(
    auth && fromAddr?.point && toAddr?.point && chargeableHint.ch > 0 && !directionAmbiguous,
  );

  const canSubmitOrder = Boolean(canQuote && quote && !loading && !orderLoading);

  const quoteDepsKey = useMemo(
    () =>
      JSON.stringify({
        from: fromAddr?.point,
        to: toAddr?.point,
        places,
        mainlineMode,
        direction: inferredDirection,
        declaredValue,
        extraCodes,
      }),
    [fromAddr?.point, toAddr?.point, places, mainlineMode, inferredDirection, declaredValue, extraCodes],
  );
  const debouncedQuoteDeps = useDebounced(quoteDepsKey, 700);

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
          fromParty: { mode: fromMode, phone: fromPhone, fullName: fromName },
          toParty: { mode: toMode, phone: toPhone, fullName: toName },
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
  }, [debouncedQuoteDeps, autoQuoteEnabled, canQuote]);

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
        fromParty: { mode: fromMode, phone: fromPhone, fullName: fromName },
        toParty: { mode: toMode, phone: toPhone, fullName: toName },
      });
      setQuote(q);
      setOrderMessage(`Заявка ${nomerZayavki} зарегистрирована`);
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
    fromPhone,
    fromName,
    toMode,
    toPhone,
    toName,
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
      quote.deliveryDays ? `Срок: ~${quote.deliveryDays} дн.` : "",
    ]
      .filter(Boolean)
      .join("\n");
    void navigator.clipboard?.writeText(text);
  };

  if (!auth) {
    return (
      <div className="haulz-calc-page--cdek">
        <p>Нет авторизации</p>
      </div>
    );
  }

  const mainlineCards = quote?.mainlineOptions?.length ? quote.mainlineOptions : options?.mainlineOptions ?? [];

  return (
    <div className="haulz-calc-page--cdek">
      <div className="haulz-calc-shell-bg">
        <header className="haulz-calc-header">
          <button type="button" className="haulz-calc-header__back" onClick={onBack} aria-label="Назад">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="haulz-calc-header__title">Расчёт доставки</h1>
        </header>

        {directionAmbiguous && (
          <div className="haulz-calc-alert haulz-calc-alert--warn">
            Укажите направление:
            <div className="haulz-calc-direction-pills" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
              <button type="button" className="haulz-calc-direction-pill" onClick={() => setDirectionOverride("mow_kgd")}>
                Москва → Калининград
              </button>
              <button type="button" className="haulz-calc-direction-pill" onClick={() => setDirectionOverride("kgd_mow")}>
                Калининград → Москва
              </button>
            </div>
          </div>
        )}

        {error && <div className="haulz-calc-alert haulz-calc-alert--error">{error}</div>}

        <div className="haulz-calc-grid">
          <div className="haulz-calc-main">
            <HaulzCalcAddressField
              title="Отправить"
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
              fullName={fromName}
              setFullName={setFromName}
            />

            <HaulzCalcAddressField
              title="Вручить"
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
              fullName={toName}
              setFullName={setToName}
            />

            <div className="haulz-calc-card">
              <h2 className="haulz-calc-card__title">Посылка</h2>
              {options?.pickupNote && <p className="haulz-calc-place-note">{options.pickupNote}</p>}

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
                Факт {chargeableHint.w.toFixed(0)} кг · объём {chargeableHint.v.toFixed(2)} м³ · объёмный{" "}
                {chargeableHint.volW.toFixed(0)} кг · <strong>платный {chargeableHint.ch.toFixed(0)} кг</strong> (×
                {chargeableHint.factor})
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

          <aside className="haulz-calc-summary">
            <h2 className="haulz-calc-summary__title">Ваш расчёт</h2>

            {loading && (
              <p className="haulz-calc-summary__empty" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <Loader2 className="w-4 h-4 animate-spin" />
                Пересчёт…
              </p>
            )}

            {!quote && !loading && (
              <p className="haulz-calc-summary__empty">Заполните адреса — расчёт обновится автоматически</p>
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
                </div>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
