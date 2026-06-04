import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Copy, Loader2 } from "lucide-react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
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
  fetchHaulzAddressSuggest,
  fetchHaulzCalculatorOptions,
  fetchHaulzQuote,
  fetchHaulzRingDistance,
  submitHaulzCalculatorOrder,
  type HaulzSuggestItem,
} from "../api/client/haulzCalculator";

type Props = {
  auth: AuthData | null;
  onBack: () => void;
  /** Ручной override км за кольцом (service_mode). */
  serviceMode?: boolean;
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

type AddressBlockProps = {
  title: string;
  city: CityCode;
  query: string;
  setQuery: (v: string) => void;
  addr: AddressSelection | null;
  setAddr: (a: AddressSelection | null) => void;
  suggestions: HaulzSuggestItem[];
  auth: AuthData;
  mode: "courier" | "point";
  setMode: (m: "courier" | "point") => void;
  phone: string;
  setPhone: (v: string) => void;
  fullName: string;
  setFullName: (v: string) => void;
  ringKm: number | null;
  onRingKm: (km: number | null) => void;
};

function AddressBlock({
  title,
  city,
  query,
  setQuery,
  addr,
  setAddr,
  suggestions,
  auth,
  mode,
  setMode,
  phone,
  setPhone,
  fullName,
  setFullName,
  ringKm,
  onRingKm,
}: AddressBlockProps) {
  useEffect(() => {
    if (!addr?.point) {
      onRingKm(null);
      return;
    }
    let cancelled = false;
    fetchHaulzRingDistance(auth, city, addr.point)
      .then((km) => {
        if (!cancelled) onRingKm(km);
      })
      .catch(() => {
        if (!cancelled) onRingKm(null);
      });
    return () => {
      cancelled = true;
    };
  }, [addr?.point?.lat, addr?.point?.lon, auth, city, onRingKm]);

  const ringLabel = city === "moscow" ? "МКАД" : "КАД";

  return (
    <section className="hr-calc-card" style={{ padding: "1rem", borderRadius: 12, border: "1px solid var(--color-border, #e5e7eb)" }}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>{title}</Typography.Body>
      <div className="hr-calc-mode-row">
        <Button type="button" className={mode === "courier" ? "button-primary" : "filter-button"} onClick={() => setMode("courier")}>
          Курьер
        </Button>
        <Button type="button" className={mode === "point" ? "button-primary" : "filter-button"} onClick={() => setMode("point")}>
          Из пункта
        </Button>
      </div>
      <input
        className="w-full"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setAddr(null);
        }}
        placeholder={city === "moscow" ? "Адрес в Москве" : "Адрес в Калининграде"}
      />
      {suggestions.length > 0 && !addr && (
        <ul className="hr-calc-suggest" style={{ listStyle: "none", margin: "0.25rem 0 0", padding: 0 }}>
          {suggestions.map((s, i) => (
            <li key={s.id || i}>
              <button
                type="button"
                className="w-full text-left"
                style={{ padding: "0.35rem 0", border: "none", background: "transparent", cursor: "pointer" }}
                onClick={() => {
                  if (!s.point) return;
                  setAddr({
                    label: s.label,
                    fullAddress: s.fullAddress,
                    point: s.point,
                    city,
                    sourceId: s.id,
                  });
                  setQuery(s.fullAddress);
                }}
              >
                {s.fullAddress}
              </button>
            </li>
          ))}
        </ul>
      )}
      {addr && ringKm != null && (
        <Typography.Body style={{ marginTop: "0.35rem", fontSize: "0.85rem", opacity: 0.85 }}>
          км за {ringLabel}: {ringKm.toFixed(1)}
        </Typography.Body>
      )}
      <Flex gap="0.5rem" wrap="wrap" style={{ marginTop: "0.5rem" }}>
        <input className="w-full" style={{ flex: 1, minWidth: 120 }} placeholder="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className="w-full" style={{ flex: 2, minWidth: 160 }} placeholder="ФИО" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </Flex>
    </section>
  );
}

export function HaulzCalculatorPage({ auth, onBack, serviceMode }: Props) {
  const [kmOverrideMoscow, setKmOverrideMoscow] = useState("");
  const [kmOverrideKaliningrad, setKmOverrideKaliningrad] = useState("");
  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [fromAddr, setFromAddr] = useState<AddressSelection | null>(null);
  const [toAddr, setToAddr] = useState<AddressSelection | null>(null);
  const [fromSuggestions, setFromSuggestions] = useState<HaulzSuggestItem[]>([]);
  const [toSuggestions, setToSuggestions] = useState<HaulzSuggestItem[]>([]);
  const [fromMode, setFromMode] = useState<"courier" | "point">("courier");
  const [toMode, setToMode] = useState<"courier" | "point">("courier");
  const [fromPhone, setFromPhone] = useState("");
  const [toPhone, setToPhone] = useState("");
  const [fromName, setFromName] = useState("");
  const [toName, setToName] = useState("");
  const [fromRingKm, setFromRingKm] = useState<number | null>(null);
  const [toRingKm, setToRingKm] = useState<number | null>(null);
  const [places, setPlaces] = useState<ParcelPlace[]>([{ weightKg: 100, volumeM3: 0.5 }]);
  const [declaredValue, setDeclaredValue] = useState("");
  const [mainlineMode, setMainlineMode] = useState<MainlineMode>("ferry");
  const [directionOverride, setDirectionOverride] = useState<Direction | null>(null);
  const [extraCodes, setExtraCodes] = useState<string[]>([]);
  const [options, setOptions] = useState<CalculatorOptions | null>(null);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addressWarning, setAddressWarning] = useState<string | null>(null);
  const [autoQuoteEnabled, setAutoQuoteEnabled] = useState(true);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderMessage, setOrderMessage] = useState<string | null>(null);
  const [dataZabora, setDataZabora] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });

  const debouncedFrom = useDebounced(fromQuery, 350);
  const debouncedTo = useDebounced(toQuery, 350);

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
    if (!auth || debouncedFrom.length < 2 || fromAddr) {
      setFromSuggestions([]);
      return;
    }
    let cancelled = false;
    fetchHaulzAddressSuggest(auth, debouncedFrom, suggestCityFrom)
      .then((items) => {
        if (!cancelled) setFromSuggestions(items);
      })
      .catch(() => {
        if (!cancelled) setFromSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [auth, debouncedFrom, fromAddr, suggestCityFrom]);

  useEffect(() => {
    if (!auth || debouncedTo.length < 2 || toAddr) {
      setToSuggestions([]);
      return;
    }
    let cancelled = false;
    fetchHaulzAddressSuggest(auth, debouncedTo, suggestCityTo)
      .then((items) => {
        if (!cancelled) setToSuggestions(items);
      })
      .catch(() => {
        if (!cancelled) setToSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [auth, debouncedTo, toAddr, suggestCityTo]);

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

  useEffect(() => {
    if (!fromAddr?.sourceId || !toAddr?.sourceId) {
      setAddressWarning("Выберите адрес из списка для точного расчёта");
    } else {
      setAddressWarning(null);
    }
  }, [fromAddr?.sourceId, toAddr?.sourceId]);

  const canQuote = Boolean(
    auth && fromAddr?.point && toAddr?.point && chargeableHint.ch > 0 && !directionAmbiguous,
  );

  const canSubmitOrder = Boolean(
    canQuote && fromAddr?.sourceId && toAddr?.sourceId && quote && !loading && !orderLoading,
  );

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
        kmMoscow: serviceMode ? kmOverrideMoscow : "",
        kmKaliningrad: serviceMode ? kmOverrideKaliningrad : "",
      }),
    [
      fromAddr?.point,
      toAddr?.point,
      places,
      mainlineMode,
      inferredDirection,
      declaredValue,
      extraCodes,
      serviceMode,
      kmOverrideMoscow,
      kmOverrideKaliningrad,
    ],
  );
  const debouncedQuoteDeps = useDebounced(quoteDepsKey, 700);

  const runQuote = useCallback(
    async (saveQuote = false) => {
      if (!auth || !fromAddr?.point || !toAddr?.point) return;
      setLoading(true);
      setError(null);
      try {
        const result = await fetchHaulzQuote(auth, {
          from: fromAddr,
          to: toAddr,
          places,
          mainlineMode,
          direction: inferredDirection,
          declaredValueRub: Number(declaredValue) || 0,
          extraCodes,
          saveQuote,
          fromParty: { mode: fromMode, phone: fromPhone, fullName: fromName },
          toParty: { mode: toMode, phone: toPhone, fullName: toName },
          kmOverride: serviceMode
            ? {
                moscow: kmOverrideMoscow !== "" ? Number(kmOverrideMoscow) : undefined,
                kaliningrad: kmOverrideKaliningrad !== "" ? Number(kmOverrideKaliningrad) : undefined,
              }
            : undefined,
        });
        setQuote(result);
        if (result.mainlineOptions?.length) {
          const hasMode = result.mainlineOptions.some((m) => m.mode === mainlineMode);
          if (!hasMode) setMainlineMode(result.mainlineOptions[0].mode);
        }
      } catch (e) {
        setQuote(null);
        setError((e as Error)?.message || "Ошибка расчёта");
      } finally {
        setLoading(false);
      }
    },
    [
      auth,
      fromAddr,
      toAddr,
      places,
      mainlineMode,
      inferredDirection,
      declaredValue,
      extraCodes,
      fromMode,
      fromPhone,
      fromName,
      toMode,
      toPhone,
      toName,
      serviceMode,
      kmOverrideMoscow,
      kmOverrideKaliningrad,
    ],
  );

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
          kmOverride: serviceMode
            ? {
                moscow: kmOverrideMoscow !== "" ? Number(kmOverrideMoscow) : undefined,
                kaliningrad: kmOverrideKaliningrad !== "" ? Number(kmOverrideKaliningrad) : undefined,
              }
            : undefined,
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
        kmOverride: serviceMode
          ? {
              moscow: kmOverrideMoscow !== "" ? Number(kmOverrideMoscow) : undefined,
              kaliningrad: kmOverrideKaliningrad !== "" ? Number(kmOverrideKaliningrad) : undefined,
            }
          : undefined,
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
    serviceMode,
    kmOverrideMoscow,
    kmOverrideKaliningrad,
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
      <div className="w-full p-4">
        <Typography.Body>Нет авторизации</Typography.Body>
      </div>
    );
  }

  const mainlineCards = quote?.mainlineOptions?.length ? quote.mainlineOptions : options?.mainlineOptions ?? [];

  return (
    <div className="w-full hr-calc-page">
      <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
        <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Typography.Headline className="text-page-title">Калькулятор доставки</Typography.Headline>
      </Flex>

      {directionAmbiguous && (
        <Typography.Body style={{ marginBottom: "0.75rem", color: "var(--color-warning, #b45309)" }}>
          Укажите направление:
          <Button type="button" className="filter-button" style={{ marginLeft: "0.5rem" }} onClick={() => setDirectionOverride("mow_kgd")}>
            Москва → Калининград
          </Button>
          <Button type="button" className="filter-button" style={{ marginLeft: "0.35rem" }} onClick={() => setDirectionOverride("kgd_mow")}>
            Калининград → Москва
          </Button>
        </Typography.Body>
      )}

      <div
        className="hr-calc-grid"
        style={{ display: "grid", gap: "1rem", gridTemplateColumns: "minmax(0,1fr) minmax(280px,340px)" }}
      >
        <div className="hr-calc-main" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {auth && (
            <AddressBlock
              title="Отправить"
              city={suggestCityFrom}
              query={fromQuery}
              setQuery={setFromQuery}
              addr={fromAddr}
              setAddr={setFromAddr}
              suggestions={fromSuggestions}
              auth={auth}
              mode={fromMode}
              setMode={setFromMode}
              phone={fromPhone}
              setPhone={setFromPhone}
              fullName={fromName}
              setFullName={setFromName}
              ringKm={fromRingKm}
              onRingKm={setFromRingKm}
            />
          )}
          {auth && (
            <AddressBlock
              title="Вручить"
              city={suggestCityTo}
              query={toQuery}
              setQuery={setToQuery}
              addr={toAddr}
              setAddr={setToAddr}
              suggestions={toSuggestions}
              auth={auth}
              mode={toMode}
              setMode={setToMode}
              phone={toPhone}
              setPhone={setToPhone}
              fullName={toName}
              setFullName={setToName}
              ringKm={toRingKm}
              onRingKm={setToRingKm}
            />
          )}

          <section className="hr-calc-card" style={{ padding: "1rem", borderRadius: 12, border: "1px solid var(--color-border, #e5e7eb)" }}>
            <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Посылка</Typography.Body>
            {options?.pickupNote && (
              <Typography.Body style={{ fontSize: "0.8rem", opacity: 0.75, marginBottom: "0.5rem" }}>{options.pickupNote}</Typography.Body>
            )}
            {places.map((p, idx) => (
              <div key={idx} className="hr-calc-place-row">
                <Typography.Body style={{ gridColumn: "1 / -1", fontWeight: 500 }}>Место {idx + 1}</Typography.Body>
                <div style={{ gridColumn: "1 / -1" }}>
                  {BOX_PRESETS.map((b) => (
                    <button
                      key={b.label}
                      type="button"
                      className="filter-button hr-calc-preset-btn"
                      onClick={() => {
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
                <label>
                  Вес, кг
                  <input
                    value={String(p.weightKg)}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 0;
                      setPlaces((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], weightKg: v };
                        return next;
                      });
                    }}
                    style={{ display: "block", width: "100%" }}
                  />
                </label>
                <label>
                  Объём, м³
                  <input
                    value={String(p.volumeM3)}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 0;
                      setPlaces((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], volumeM3: v };
                        return next;
                      });
                    }}
                    style={{ display: "block", width: "100%" }}
                  />
                </label>
                {places.length > 1 && (
                  <Button
                    type="button"
                    className="filter-button"
                    onClick={() => setPlaces((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    Удалить
                  </Button>
                )}
              </div>
            ))}
            <Button type="button" className="filter-button" onClick={() => setPlaces((prev) => [...prev, { weightKg: 10, volumeM3: 0.1 }])}>
              + Место
            </Button>
            <Typography.Body style={{ marginTop: "0.5rem", fontSize: "0.85rem", opacity: 0.85 }}>
              Факт {chargeableHint.w.toFixed(0)} кг · объём {chargeableHint.v.toFixed(2)} м³ · объёмный {chargeableHint.volW.toFixed(0)} кг ·{" "}
              <strong>платный {chargeableHint.ch.toFixed(0)} кг</strong> (×{chargeableHint.factor})
            </Typography.Body>
            <label style={{ display: "block", marginTop: "0.5rem" }}>
              Объявленная стоимость, ₽
              <input value={declaredValue} onChange={(e) => setDeclaredValue(e.target.value)} style={{ display: "block", width: "100%" }} />
            </label>
          </section>

          <section className="hr-calc-card" style={{ padding: "1rem", borderRadius: 12, border: "1px solid var(--color-border, #e5e7eb)" }}>
            <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Тарифы</Typography.Body>
            <Flex gap="0.5rem" wrap="wrap">
              {mainlineCards.map((m) => (
                <button
                  key={m.mode}
                  type="button"
                  className={`hr-calc-mainline-card${mainlineMode === m.mode ? " selected" : ""}`}
                  onClick={() => setMainlineMode(m.mode)}
                >
                  <div style={{ fontWeight: 600 }}>{m.label}</div>
                  <div style={{ fontSize: "0.8rem", opacity: 0.85 }}>~{m.deliveryDays} дн.</div>
                  <div style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
                    {m.estimatedRub.toLocaleString("ru-RU")} ₽
                  </div>
                  <div style={{ fontSize: "0.75rem", opacity: 0.7 }}>{m.pricePerKg} ₽/кг</div>
                </button>
              ))}
            </Flex>
          </section>

          {(options?.extras?.length ?? 0) > 0 && (
            <section className="hr-calc-card" style={{ padding: "1rem", borderRadius: 12, border: "1px solid var(--color-border, #e5e7eb)" }}>
              <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Может пригодиться</Typography.Body>
              {options!.extras.map((ex) => (
                <label key={ex.code} className="hr-calc-extra-row">
                  <input type="checkbox" checked={extraCodes.includes(ex.code)} onChange={() => toggleExtra(ex.code)} />
                  <span>
                    <strong>{ex.label}</strong>
                    {ex.description && (
                      <span style={{ display: "block", fontSize: "0.8rem", opacity: 0.75 }}>{ex.description}</span>
                    )}
                  </span>
                </label>
              ))}
            </section>
          )}

          {serviceMode && (
            <section className="hr-calc-card" style={{ padding: "1rem", borderRadius: 12, border: "1px dashed var(--color-border, #e5e7eb)" }}>
              <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Override км (оператор)</Typography.Body>
              <Flex gap="0.5rem" wrap="wrap">
                <label>
                  МКАД
                  <input value={kmOverrideMoscow} onChange={(e) => setKmOverrideMoscow(e.target.value)} style={{ display: "block", width: 80 }} />
                </label>
                <label>
                  КАД
                  <input value={kmOverrideKaliningrad} onChange={(e) => setKmOverrideKaliningrad(e.target.value)} style={{ display: "block", width: 80 }} />
                </label>
              </Flex>
            </section>
          )}

          {addressWarning && (
            <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-warning, #b45309)" }}>{addressWarning}</Typography.Body>
          )}

          <Flex gap="0.5rem" wrap="wrap">
            <Button type="button" className="button-primary" disabled={!canQuote || loading} onClick={() => void runQuote(true)}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Рассчитать и сохранить
            </Button>
            <Button type="button" className="filter-button" disabled={!canQuote || loading} onClick={() => void runQuote(false)}>
              Только расчёт
            </Button>
          </Flex>
          {error && <Typography.Body style={{ color: "var(--color-danger, #c00)" }}>{error}</Typography.Body>}
        </div>

        <aside
          className="hr-calc-summary"
          style={{
            position: "sticky",
            top: "0.5rem",
            alignSelf: "start",
            padding: "1rem",
            borderRadius: 12,
            border: "1px solid var(--color-border, #e5e7eb)",
            background: "var(--color-bg-secondary, #f9fafb)",
          }}
        >
          <Typography.Headline style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Ваш расчёт</Typography.Headline>
          {loading && <Typography.Body style={{ fontSize: "0.85rem", opacity: 0.8 }}>Пересчёт…</Typography.Body>}
          {!quote && !loading && (
            <Typography.Body>Заполните адреса — расчёт обновится автоматически</Typography.Body>
          )}
          {quote && (
            <>
              {quote.warnings.map((w) => (
                <Typography.Body key={w} style={{ fontSize: "0.8rem", color: "var(--color-warning, #b45309)", marginBottom: "0.35rem" }}>
                  {w}
                </Typography.Body>
              ))}
              {quote.lines.map((line) => {
                const info = line.meta?.informational === true;
                return (
                  <Flex
                    key={line.key}
                    justify="space-between"
                    style={{
                      marginBottom: "0.35rem",
                      fontSize: "0.9rem",
                      opacity: info ? 0.85 : 1,
                      fontStyle: info ? "italic" : "normal",
                    }}
                  >
                    <span>{line.label}</span>
                    <span>{info ? "—" : `${line.amountRub.toLocaleString("ru-RU")} ₽`}</span>
                  </Flex>
                );
              })}
              <Flex justify="space-between" style={{ marginTop: "0.75rem", fontWeight: 600 }}>
                <span>Итого</span>
                <span>{quote.totalRub.toLocaleString("ru-RU")} ₽</span>
              </Flex>
              {quote.deliveryDays > 0 && (
                <Typography.Body style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
                  Срок: ~{quote.deliveryDays} дн.
                </Typography.Body>
              )}
              <Typography.Body style={{ marginTop: "0.5rem", fontSize: "0.75rem", opacity: 0.7 }}>
                км МКАД: {quote.km.moscow.toFixed(1)} · км КАД: {quote.km.kaliningrad.toFixed(1)}
              </Typography.Body>
              {quote.quoteId && (
                <Typography.Body style={{ marginTop: "0.35rem", fontSize: "0.75rem", opacity: 0.7 }}>
                  Расчёт №{quote.quoteId}
                </Typography.Body>
              )}
              <Typography.Body style={{ marginTop: "0.75rem", fontSize: "0.75rem", opacity: 0.65 }}>
                Цена может измениться при оформлении.
              </Typography.Body>
              <label style={{ display: "block", marginTop: "0.75rem", fontSize: "0.85rem" }}>
                Дата забора
                <input
                  type="date"
                  value={dataZabora}
                  onChange={(e) => setDataZabora(e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: "0.25rem" }}
                />
              </label>
              {orderMessage && (
                <Typography.Body style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--color-success, #059669)" }}>
                  {orderMessage}
                </Typography.Body>
              )}
              <Flex gap="0.5rem" style={{ marginTop: "0.75rem" }} wrap="wrap">
                <Button type="button" className="filter-button" onClick={copySummary}>
                  <Copy className="w-4 h-4" style={{ marginRight: "0.25rem" }} />
                  Копировать
                </Button>
                <Button
                  type="button"
                  className="button-primary"
                  disabled={!canSubmitOrder}
                  onClick={() => void submitOrder()}
                >
                  {orderLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Оформить
                </Button>
              </Flex>
              <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginTop: "0.5rem", fontSize: "0.8rem" }}>
                <input
                  type="checkbox"
                  checked={autoQuoteEnabled}
                  onChange={(e) => setAutoQuoteEnabled(e.target.checked)}
                />
                Автопересчёт при изменении
              </label>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
