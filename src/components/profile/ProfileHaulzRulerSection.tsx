import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import {
  buildRulerTicks, chunkRulerTicks, formatWeightKg, isWeightOnRuler,
  loadWeightRulerConfig, parseWeightRulerNumber, rulerPrintPages,
  RULER_PITCH_MM, saveWeightRulerConfig, validateWeightRulerConfig,
  type HaulzWeightRulerConfig, type RulerTick,
} from "../../lib/haulzWeightRuler";
import { ean13Modules, parseRulerScan, rulerEan13 } from "../../lib/rulerEan13";

type Props = { onBack: () => void };

/** A barcode weight scale, using the same scan-a-division principle as dimension rulers. */
export function ProfileHaulzRulerSection({ onBack }: Props) {
  const [initialConfig] = useState(loadWeightRulerConfig);
  const [startStr, setStartStr] = useState(String(initialConfig.start));
  const [endStr, setEndStr] = useState(String(initialConfig.end));
  const [stepStr, setStepStr] = useState(String(initialConfig.step));
  const [scan, setScan] = useState("");
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const config: HaulzWeightRulerConfig = useMemo(() => ({
    start: parseWeightRulerNumber(startStr) ?? NaN,
    end: parseWeightRulerNumber(endStr) ?? NaN,
    step: parseWeightRulerNumber(stepStr) ?? NaN,
  }), [startStr, endStr, stepStr]);
  const validationError = validateWeightRulerConfig(config);
  const ticks = useMemo(() => buildRulerTicks(config), [config]);
  const strips = useMemo(() => chunkRulerTicks(ticks), [ticks]);
  const pages = useMemo(() => rulerPrintPages(strips), [strips]);
  const scannedWeight = useMemo(() => {
    const weight = parseRulerScan(scan);
    return weight != null && isWeightOnRuler(config, weight) ? weight : null;
  }, [scan, config]);

  useEffect(() => { setSavedHint(null); }, [startStr, endStr, stepStr]);
  useEffect(() => {
    const beforePrint = () => {
      if (!validationError) {
        document.body.classList.add("haulz-ruler-printing");
        document.documentElement.classList.add("haulz-ruler-printing");
      }
    };
    const afterPrint = () => {
      document.body.classList.remove("haulz-ruler-printing");
      document.documentElement.classList.remove("haulz-ruler-printing");
    };
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
      afterPrint();
    };
  }, [validationError]);

  const handleSave = useCallback(() => {
    try {
      saveWeightRulerConfig(config);
      setSavedHint("Настройки сохранены");
    } catch {
      setSavedHint(validationError ?? "Не удалось сохранить настройки в этом браузере.");
    }
  }, [config, validationError]);

  const handlePrint = useCallback(() => {
    if (validationError) return;
    document.body.classList.add("haulz-ruler-printing");
    document.documentElement.classList.add("haulz-ruler-printing");
    requestAnimationFrame(() => {
      try { window.print(); }
      catch {
        document.body.classList.remove("haulz-ruler-printing");
        document.documentElement.classList.remove("haulz-ruler-printing");
      }
    });
  }, [validationError]);

  return (
    <div className="w-full haulz-weight-ruler">
      <Flex align="center" className="haulz-weight-ruler__toolbar" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
        <Button className="filter-button" onClick={onBack} aria-label="Назад" type="button" style={{ padding: "0.5rem" }}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Typography.Headline className="text-page-title">Штрихкодовая линейка веса</Typography.Headline>
      </Flex>

      <div className="haulz-weight-ruler__panel">
        <Typography.Body className="haulz-weight-ruler__description">
          Каждое деление обозначает вес и имеет свой штрихкод. Найдите нужное значение на шкале
          и отсканируйте его — приложение получит вес, указанный на делении.
        </Typography.Body>
        <div className="haulz-weight-ruler__fields">
          {[
            { label: "Начало, кг", value: startStr, set: setStartStr },
            { label: "Конец, кг", value: endStr, set: setEndStr },
            { label: "Шаг, кг", value: stepStr, set: setStepStr },
          ].map(field => (
            <label className="haulz-weight-ruler__field" key={field.label}>
              <span>{field.label}</span>
              <input className="haulz-weight-ruler__input" value={field.value} onChange={event => field.set(event.target.value)} inputMode="decimal" />
            </label>
          ))}
        </div>
        <Typography.Body className="haulz-weight-ruler__description">
          Шаг задаёт интервал между значениями веса. Расстояние между делениями на бумаге — 5 мм.
        </Typography.Body>

        {validationError ? <p className="haulz-weight-ruler__error" role="alert">{validationError}</p> : (
          <p className="haulz-weight-ruler__summary">
            <strong>{formatWeightKg(config.start)}–{formatWeightKg(config.end)} кг</strong>
            {" · "}значений: {ticks.length}{" · "}полос: {strips.length}{" · "}листов A4: {pages.length}
          </p>
        )}
        <Flex gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
          <Button type="button" className="button-primary" onClick={handleSave} disabled={Boolean(validationError)}>Сохранить</Button>
          <Button type="button" className="button-primary" onClick={handlePrint} disabled={Boolean(validationError)} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
            <Printer className="w-4 h-4" aria-hidden />Печать
          </Button>
        </Flex>
        {savedHint && <p className="haulz-weight-ruler__description" role="status">{savedHint}</p>}
        <p className="haulz-weight-ruler__description">
          Печать: A4, альбомная ориентация, масштаб 100%. Полосы соединяйте по одинаковым крайним
          значениям. Перед использованием проверьте контрольный отрезок 10 см.
        </p>
      </div>

      <div className="haulz-weight-ruler__panel">
        <label className="haulz-weight-ruler__field">
          <span>Проверка сканирования</span>
          <input className="haulz-weight-ruler__input" aria-label="Проверка сканирования" value={scan}
            onChange={event => setScan(event.target.value)} onFocus={event => event.currentTarget.select()}
            onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.select(); } }}
            placeholder="Сканируйте штрихкод деления" inputMode="numeric" />
        </label>
        <p className="haulz-weight-ruler__scan-result" aria-live="polite">
          Вес: <strong>{scannedWeight == null ? "—" : `${formatWeightKg(scannedWeight)} кг`}</strong>
        </p>
        {scan.trim() && scannedWeight == null && !validationError && (
          <p className="haulz-weight-ruler__error" role="alert">Код повреждён или не относится к значениям этой шкалы.</p>
        )}
      </div>

      {strips.length > 0 && (
        <section className="haulz-weight-ruler__panel" aria-label="Превью линейки веса">
          <Typography.Headline className="haulz-weight-ruler__preview-title">Первая полоса</Typography.Headline>
          <p className="haulz-weight-ruler__description">Коды идут одним рядом. Наводите линию сканера поперёк полос штрихкода выбранного деления.</p>
          <div className="haulz-weight-ruler__preview-scroll"><WeightRulerStrip ticks={strips[0]} preview /></div>
        </section>
      )}

      {typeof document !== "undefined" && pages.length > 0 && createPortal(
        <div className="haulz-weight-ruler__print-root" aria-hidden="true">
          {pages.map((page, pageIndex) => (
            <section className="haulz-weight-ruler__print-page" key={pageIndex}>
              <div className="haulz-weight-ruler__print-header">
                HAULZ · Шкала 4 — вес · {formatWeightKg(config.start)}–{formatWeightKg(config.end)} кг · шаг {formatWeightKg(config.step)} кг · лист {pageIndex + 1}/{pages.length}
              </div>
              <div className="haulz-weight-ruler__print-instructions">A4 · альбомная · 100% · соединяйте одинаковые крайние значения</div>
              {page.map((strip, index) => <WeightRulerStrip key={strip[0].index} ticks={strip} number={pageIndex * 3 + index + 1} />)}
              <svg className="haulz-weight-ruler__control" width="120mm" height="9mm" viewBox="0 0 120 9" aria-label="Контрольный отрезок 10 см">
                <path d="M 10 3 V 7 M 10 5 H 110 M 110 3 V 7" fill="none" stroke="black" strokeWidth="0.25" />
                <text x="60" y="2.5" textAnchor="middle" fontSize="2.5">Контроль: 10 см</text>
              </svg>
            </section>
          ))}
        </div>, document.body,
      )}
    </div>
  );
}

export function WeightRulerStrip({ ticks, preview = false, number }: { ticks: RulerTick[]; preview?: boolean; number?: number }) {
  const widthMm = (ticks.length - 1) * RULER_PITCH_MM + 20;
  const heightMm = 51;
  return (
    <div className="haulz-weight-ruler__strip">
      <div className="haulz-weight-ruler__strip-label">
        {number != null ? `Полоса ${number} · ` : ""}Вес · {ticks[0].label}–{ticks[ticks.length - 1].label} кг
      </div>
      <svg className="haulz-weight-ruler__strip-svg" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${widthMm} ${heightMm}`}
        width={preview ? widthMm * 2.5 : `${widthMm}mm`} height={preview ? heightMm * 2.5 : `${heightMm}mm`}
        aria-label={`Шкала веса ${ticks[0].label}–${ticks[ticks.length - 1].label} кг`} role="img">
        <rect width={widthMm} height={heightMm} fill="white" />
        {ticks.map((tick, index) => {
          const x = 10 + index * RULER_PITCH_MM;
          const code = rulerEan13(tick.weightKg);
          const modules = ean13Modules(code);
          return (
            <g key={tick.index} data-weight-kg={tick.weightKg} data-code={code}>
              <g transform={`translate(${x - 2} 38.79) rotate(-90)`}>
                <rect width="37.29" height="4" fill="white" />
                {[...modules].map((bit, moduleIndex) => bit === "1" ? (
                  <rect key={moduleIndex} x={moduleIndex * 0.33} y="0" width="0.33" height="4" fill="black" />
                ) : null)}
              </g>
              <line x1={x} x2={x} y1="40" y2={tick.major ? 43 : 41.5} stroke="black" strokeWidth="0.2" />
              <text x={x + 0.75} y="49" transform={`rotate(-90 ${x + 0.75} 49)`} fontFamily="Arial, sans-serif" fontSize={tick.label.length > 7 ? "1.65" : "2.3"} fontWeight={tick.major ? "700" : "400"} fill="black">{tick.label}</text>
            </g>
          );
        })}
        <line x1="10" x2={widthMm - 10} y1="40" y2="40" stroke="black" strokeWidth="0.2" />
        {[10, widthMm - 10].map(x => <path key={x} d={`M ${x} 0 V 1 M ${x} 50 V 51`} stroke="black" strokeWidth="0.2" />)}
      </svg>
    </div>
  );
}
