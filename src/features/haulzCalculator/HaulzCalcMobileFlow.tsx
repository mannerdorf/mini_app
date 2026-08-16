import React, { useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Eye,
  Loader2,
  Mail,
  MapPin,
  Package,
  Plus,
  Warehouse,
} from "lucide-react";
import type { AuthData } from "../../types";
import type {
  AddressSelection,
  CalculatorOptions,
  CityCode,
  MainlineMode,
  ParcelPlace,
  QuoteResult,
} from "../../../lib/haulzCalculator/types";
import { formatQuoteVatLine } from "../../../lib/haulzCalculator/quoteVat";
import { HaulzCalcAddressField } from "./HaulzCalcAddressField";
import { HaulzCalcCustomerBlock } from "./HaulzCalcCustomerBlock";
import { HaulzCalcTariffBasisFootnote } from "./HaulzCalcTariffBasisFootnote";
import {
  addressModeLabel,
  addressRowSubtitle,
  addressRowTitle,
  isPlaceRoute,
  placePresetLabel,
  placeRowSubtitle,
  type HaulzCalcMobileRoute,
} from "./haulzCalcMobileLabels";

const BOX_PRESETS: { label: string; weightKg: number; volumeM3: number }[] = [
  { label: "XS", weightKg: 1, volumeM3: 0.005 },
  { label: "S", weightKg: 3, volumeM3: 0.02 },
  { label: "M", weightKg: 10, volumeM3: 0.08 },
  { label: "L", weightKg: 25, volumeM3: 0.2 },
  { label: "XL", weightKg: 50, volumeM3: 0.5 },
];

type ChargeableHint = {
  w: number;
  v: number;
  volW: number;
  ch: number;
  factor: number;
};

export type HaulzCalcMobileFlowProps = {
  auth: AuthData;
  route: HaulzCalcMobileRoute;
  setRoute: (route: HaulzCalcMobileRoute) => void;
  onBackFromCalc: () => void;
  draftSaving: boolean;
  draftLoading: boolean;
  saveDraft: () => void;
  draftMessage: string | null;
  error: string | null;
  fromQuery: string;
  setFromQuery: (v: string) => void;
  fromAddr: AddressSelection | null;
  setFromAddr: (a: AddressSelection | null) => void;
  toQuery: string;
  setToQuery: (v: string) => void;
  toAddr: AddressSelection | null;
  setToAddr: (a: AddressSelection | null) => void;
  fromMode: "courier" | "point";
  setFromMode: (m: "courier" | "point") => void;
  toMode: "courier" | "point";
  setToMode: (m: "courier" | "point") => void;
  fromPhone: string;
  setFromPhone: (v: string) => void;
  toPhone: string;
  setToPhone: (v: string) => void;
  customerInn: string;
  setCustomerInn: (v: string) => void;
  customerCompanyName: string;
  setCustomerCompanyName: (v: string) => void;
  showCustomerBlock: boolean;
  fromName: string;
  setFromName: (v: string) => void;
  toName: string;
  setToName: (v: string) => void;
  places: ParcelPlace[];
  setPlaces: React.Dispatch<React.SetStateAction<ParcelPlace[]>>;
  activePresetIdx: Record<number, string>;
  setActivePresetIdx: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  declaredValue: string;
  setDeclaredValue: (v: string) => void;
  mainlineMode: MainlineMode;
  setMainlineMode: (m: MainlineMode) => void;
  extraCodes: string[];
  toggleExtra: (code: string) => void;
  options: CalculatorOptions | null;
  quote: QuoteResult | null;
  loading: boolean;
  chargeableHint: ChargeableHint;
  suggestCityFrom: CityCode;
  suggestCityTo: CityCode;
  applyQuickCity: (side: "from" | "to", city: CityCode) => void;
  mainlineCards: {
    mode: MainlineMode;
    label: string;
    deliveryDays: number;
    estimatedRub: number;
    pricePerKg: number;
    billableWeightKg: number;
  }[];
  canSubmitOrder: boolean;
  orderLoading: boolean;
  orderMessage: string | null;
  submitOrder: () => void;
  dataZabora: string;
  setDataZabora: (v: string) => void;
  copySummary: () => void;
  openEmailModal: () => void;
  openQuotePreview: () => void;
  canSendQuoteEmail: boolean;
  registeredNomerZayavki: string | null;
  guestOrderCompleted?: boolean;
  hideQuotePreview?: boolean;
};

function MobileSubScreen({
  title,
  onBack,
  children,
  footer,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="haulz-calc-mobile-screen">
      <header className="haulz-calc-mobile-screen__header">
        <button type="button" className="haulz-calc-header__back" onClick={onBack} aria-label="Назад">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="haulz-calc-mobile-screen__title">{title}</h2>
      </header>
      <div className="haulz-calc-mobile-screen__body">{children}</div>
      {footer ? <footer className="haulz-calc-mobile-screen__footer">{footer}</footer> : null}
    </div>
  );
}

function HubRow({
  icon,
  title,
  subtitle,
  meta,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  meta?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="haulz-calc-mobile-row" onClick={onClick}>
      <span className="haulz-calc-mobile-row__icon">{icon}</span>
      <span className="haulz-calc-mobile-row__text">
        <span className="haulz-calc-mobile-row__title">
          {title}
          {meta ? <span className="haulz-calc-mobile-row__meta">{meta}</span> : null}
        </span>
        <span className={`haulz-calc-mobile-row__subtitle${subtitle.includes("Укажите") || subtitle.includes("Выберите") ? " haulz-calc-mobile-row__subtitle--muted" : ""}`}>
          {subtitle}
        </span>
      </span>
      <ChevronRight className="haulz-calc-mobile-row__chevron w-5 h-5" aria-hidden />
    </button>
  );
}

export function HaulzCalcMobileFlow(props: HaulzCalcMobileFlowProps) {
  const {
    auth,
    route,
    setRoute,
    onBackFromCalc,
    draftSaving,
    draftLoading,
    saveDraft,
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
    customerInn,
    setCustomerInn,
    customerCompanyName,
    setCustomerCompanyName,
    showCustomerBlock,
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
    submitOrder,
    dataZabora,
    setDataZabora,
    copySummary,
    openEmailModal,
    openQuotePreview,
    canSendQuoteEmail,
    guestOrderCompleted = false,
    hideQuotePreview = false,
  } = props;

  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const goHub = () => setRoute("hub");

  if (route === "from") {
    return (
      <MobileSubScreen
        title="Откуда отправить"
        onBack={goHub}
        footer={
          <button type="button" className="haulz-calc-btn-primary" onClick={goHub}>
            Готово
          </button>
        }
      >
        <HaulzCalcAddressField
          embedded
          openMapOnMount={fromMode === "courier" && !fromAddr?.point}
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
          inn=""
          setInn={() => {}}
          companyName=""
          setCompanyName={() => {}}
          contactName={fromName}
          setContactName={setFromName}
          showIdentityFields={false}
          onQuickCity={(c) => applyQuickCity("from", c)}
        />
      </MobileSubScreen>
    );
  }

  if (route === "to") {
    return (
      <MobileSubScreen
        title="Куда вручить"
        onBack={goHub}
        footer={
          <button type="button" className="haulz-calc-btn-primary" onClick={goHub}>
            Готово
          </button>
        }
      >
        <HaulzCalcAddressField
          embedded
          openMapOnMount={toMode === "courier" && !toAddr?.point}
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
          inn=""
          setInn={() => {}}
          companyName=""
          setCompanyName={() => {}}
          contactName={toName}
          setContactName={setToName}
          showIdentityFields={false}
          onQuickCity={(c) => applyQuickCity("to", c)}
        />
      </MobileSubScreen>
    );
  }

  if (isPlaceRoute(route)) {
    const idx = route.place;
    const place = places[idx] ?? { weightKg: 10, volumeM3: 0.1 };

    return (
      <MobileSubScreen
        title={`Место ${idx + 1}`}
        onBack={goHub}
        footer={
          <>
            <button type="button" className="haulz-calc-btn-primary" onClick={goHub}>
              Продолжить
            </button>
            <button
              type="button"
              className="haulz-calc-link-btn haulz-calc-mobile-screen__add-place"
              onClick={() => {
                const nextIdx = places.length;
                setPlaces((prev) => [...prev, { weightKg: 10, volumeM3: 0.1 }]);
                setActivePresetIdx((prev) => ({ ...prev, [nextIdx]: "M" }));
                setRoute({ place: nextIdx });
              }}
            >
              <Plus className="w-4 h-4" />
              Добавить место
            </button>
          </>
        }
      >
        <p className="haulz-calc-mobile-screen__hint">
          Рассчитаем цену на главном экране после выбора тарифа.
        </p>
        <div className="haulz-calc-place haulz-calc-place--embedded">
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
                value={String(place.weightKg)}
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
                value={String(place.volumeM3)}
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
        <p className="haulz-calc-place-note">
          Платный вес {chargeableHint.ch.toFixed(0)} кг (факт {chargeableHint.w.toFixed(0)} кг, объёмный{" "}
          {chargeableHint.volW.toFixed(0)} кг)
        </p>
        {places.length > 1 && (
          <button
            type="button"
            className="haulz-calc-text-btn haulz-calc-mobile-screen__remove-place"
            onClick={() => {
              setPlaces((prev) => prev.filter((_, i) => i !== idx));
              setActivePresetIdx((prev) => {
                const next: Record<number, string> = {};
                let j = 0;
                for (let i = 0; i < places.length; i++) {
                  if (i === idx) continue;
                  next[j] = prev[i] ?? "M";
                  j++;
                }
                return next;
              });
              goHub();
            }}
          >
            Удалить место
          </button>
        )}
      </MobileSubScreen>
    );
  }

  return (
    <div className="haulz-calc-mobile-hub">
      <header className="haulz-calc-header haulz-calc-mobile-hub__header">
        <button type="button" className="haulz-calc-header__back" onClick={onBackFromCalc} aria-label="Назад">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="haulz-calc-header__title">Расчёт доставки</h1>
        <button
          type="button"
          className="haulz-calc-btn-secondary haulz-calc-header__save-draft"
          disabled={draftSaving || draftLoading}
          onClick={() => void saveDraft()}
        >
          {draftSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Черновик
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

      <div className="haulz-calc-mobile-hub__scroll">
        {showCustomerBlock && (
          <section className="haulz-calc-card haulz-calc-mobile-section">
            <HaulzCalcCustomerBlock
              embedded
              auth={auth}
              inn={customerInn}
              setInn={setCustomerInn}
              companyName={customerCompanyName}
              setCompanyName={setCustomerCompanyName}
            />
          </section>
        )}

        <section className="haulz-calc-card haulz-calc-mobile-section">
          <h2 className="haulz-calc-card__title">Направление</h2>
          <HubRow
            icon={fromMode === "point" ? <Warehouse className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
            title={addressRowTitle("from")}
            meta={addressModeLabel(fromMode, "from")}
            subtitle={addressRowSubtitle(fromAddr, fromMode)}
            onClick={() => setRoute("from")}
          />
          <HubRow
            icon={toMode === "point" ? <Warehouse className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
            title={addressRowTitle("to")}
            meta={addressModeLabel(toMode, "to")}
            subtitle={addressRowSubtitle(toAddr, toMode)}
            onClick={() => setRoute("to")}
          />
        </section>

        <section className="haulz-calc-card haulz-calc-mobile-section">
          <div className="haulz-calc-mobile-section__head">
            <div>
              <h2 className="haulz-calc-card__title haulz-calc-mobile-section__title">Груз</h2>
              <p className="haulz-calc-mobile-section__subtitle">Цена зависит от веса и объёма</p>
            </div>
            <button
              type="button"
              className="haulz-calc-mobile-section__add"
              aria-label="Добавить место"
              onClick={() => {
                const nextIdx = places.length;
                setPlaces((prev) => [...prev, { weightKg: 10, volumeM3: 0.1 }]);
                setActivePresetIdx((prev) => ({ ...prev, [nextIdx]: "M" }));
                setRoute({ place: nextIdx });
              }}
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
          {places.map((p, idx) => (
            <HubRow
              key={idx}
              icon={<Package className="w-5 h-5" />}
              title={`Место ${idx + 1}`}
              subtitle={placeRowSubtitle(p, placePresetLabel(activePresetIdx, idx), chargeableHint.ch)}
              onClick={() => setRoute({ place: idx })}
            />
          ))}
        </section>

        {mainlineCards.length > 0 && (
          <section className="haulz-calc-card haulz-calc-mobile-section">
            <h2 className="haulz-calc-card__title">Тарифы</h2>
            <div className="haulz-calc-tariff-carousel" role="list">
              {mainlineCards.map((m) => (
                <button
                  key={m.mode}
                  type="button"
                  role="listitem"
                  className={`haulz-calc-tariff-card haulz-calc-tariff-card--carousel${mainlineMode === m.mode ? " haulz-calc-tariff-card--selected" : ""}`}
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
          </section>
        )}

        <section className="haulz-calc-card haulz-calc-mobile-section">
          <p className="haulz-calc-mobile-section__kicker">Может пригодиться</p>
          <label className="haulz-calc-field">
            <span className="haulz-calc-label">Объявленная стоимость, ₽</span>
            <input
              type="number"
              className="haulz-calc-input"
              placeholder="Необязательно"
              value={declaredValue}
              onChange={(e) => setDeclaredValue(e.target.value)}
            />
          </label>
          {(options?.extras?.length ?? 0) > 0 &&
            options!.extras.map((ex) => (
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
        </section>

        <label className="haulz-calc-field haulz-calc-mobile-section haulz-calc-card">
          <span className="haulz-calc-label">Дата забора</span>
          <input
            type="date"
            className="haulz-calc-input"
            value={dataZabora}
            onChange={(e) => setDataZabora(e.target.value)}
          />
        </label>

        {orderMessage && <div className="haulz-calc-alert haulz-calc-alert--success">{orderMessage}</div>}
      </div>

      <div className="haulz-calc-mobile-dock">
        {summaryExpanded && quote && (
          <div className="haulz-calc-mobile-dock__details">
            {quote.warnings.map((w) => (
              <div key={w} className="haulz-calc-alert haulz-calc-alert--warn" style={{ marginBottom: "0.35rem" }}>
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
            <p className="haulz-calc-summary__vat">{formatQuoteVatLine(quote.totalRub)}</p>
            <HaulzCalcTariffBasisFootnote footnote={quote.tariffBasisFootnote} />
            <div className="haulz-calc-mobile-dock__actions">
              <button type="button" className="haulz-calc-btn-secondary" disabled={!quote} onClick={copySummary}>
                <Copy className="w-4 h-4" />
                Копировать
              </button>
              {!hideQuotePreview && (
                <button type="button" className="haulz-calc-btn-secondary" disabled={!quote} onClick={openQuotePreview}>
                  <Eye className="w-4 h-4" />
                  Предпросмотр
                </button>
              )}
            </div>
          </div>
        )}

        <button
          type="button"
          className="haulz-calc-mobile-dock__toggle"
          onClick={() => setSummaryExpanded((v) => !v)}
          aria-expanded={summaryExpanded}
        >
          <span className="haulz-calc-mobile-dock__total-label">Итого</span>
          <span className="haulz-calc-mobile-dock__total-value">
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : quote ? (
              `${quote.totalRub.toLocaleString("ru-RU")} ₽`
            ) : (
              "—"
            )}
          </span>
          {summaryExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
        </button>

        {canSendQuoteEmail ? (
          <button
            type="button"
            className="haulz-calc-btn-primary haulz-calc-mobile-dock__submit"
            onClick={openEmailModal}
          >
            <Mail className="w-4 h-4" />
            Отправить КП на почту
          </button>
        ) : guestOrderCompleted ? (
          <button type="button" className="haulz-calc-btn-primary haulz-calc-mobile-dock__submit" disabled>
            Заявка оформлена
          </button>
        ) : (
          <button
            type="button"
            className="haulz-calc-btn-primary haulz-calc-mobile-dock__submit"
            disabled={!canSubmitOrder}
            onClick={() => void submitOrder()}
          >
            {orderLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Оформить
          </button>
        )}
      </div>
    </div>
  );
}
