import React, { useCallback, useMemo, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import {
  buildRulerTicks,
  chunkRulerTicks,
  DEFAULT_WEIGHT_RULER_CONFIG,
  formatWeightKg,
  loadWeightRulerConfig,
  parseWeightRulerNumber,
  PRINT_CM_PER_ROW,
  saveWeightRulerConfig,
  stripLengthCm,
  validateWeightRulerConfig,
  weightFromPositionCm,
  type HaulzWeightRulerConfig,
  type RulerTick,
} from "../../lib/haulzWeightRuler";

import { ean13Modules, parseRulerScan, rulerEan13 } from "../../lib/rulerEan13";

type Props = {
  onBack: () => void;
};

const PREVIEW_CM_PER_ROW = 20;
const PREVIEW_MAX_CM = 80;

/** HAULZ → Линейка веса: калибровка начало/конец/шаг + печать EAN-13. */
export function ProfileHaulzRulerSection({ onBack }: Props) {
  const [startStr, setStartStr] = useState(() => String(loadWeightRulerConfig().start));
  const [endStr, setEndStr] = useState(() => String(loadWeightRulerConfig().end));
  const [stepStr, setStepStr] = useState(() => String(loadWeightRulerConfig().step));
  const [scanCm, setScanCm] = useState("");
  const [savedHint, setSavedHint] = useState<string | null>(null);

  const config: HaulzWeightRulerConfig = useMemo(() => {
    return {
      start: parseWeightRulerNumber(startStr) ?? DEFAULT_WEIGHT_RULER_CONFIG.start,
      end: parseWeightRulerNumber(endStr) ?? DEFAULT_WEIGHT_RULER_CONFIG.end,
      step: parseWeightRulerNumber(stepStr) ?? DEFAULT_WEIGHT_RULER_CONFIG.step,
    };
  }, [startStr, endStr, stepStr]);

  const validationError = validateWeightRulerConfig(config);
  const lengthCm = validationError ? 0 : stripLengthCm(config);
  const ticks = useMemo(
    () => (validationError ? [] : buildRulerTicks(config)),
    [config, validationError],
  );

  const printRows = useMemo(
    () => chunkRulerTicks(ticks, PRINT_CM_PER_ROW),
    [ticks],
  );

  const previewTicks = useMemo(
    () => ticks.filter((t) => t.cm <= Math.min(PREVIEW_MAX_CM, Math.ceil(lengthCm))),
    [ticks, lengthCm],
  );
  const previewRows = useMemo(
    () => chunkRulerTicks(previewTicks, PREVIEW_CM_PER_ROW),
    [previewTicks],
  );

  const scannedWeight = useMemo(() => {
    const cm = parseRulerScan(scanCm);
    if (cm == null || validationError || cm > lengthCm) return null;
    return weightFromPositionCm(config, cm);
  }, [scanCm, config, validationError, lengthCm]);

  const handleSave = useCallback(() => {
    if (validationError) {
      setSavedHint(validationError);
      return;
    }
    saveWeightRulerConfig(config);
    setSavedHint("Сохранено");
  }, [config, validationError]);

  const handlePrint = useCallback(() => {
    if (validationError) {
      setSavedHint(validationError);
      return;
    }
    saveWeightRulerConfig(config);
    // Дать браузеру отрисовать print-root до диалога печати
    requestAnimationFrame(() => {
      window.print();
    });
  }, [config, validationError]);

  return (
    <div className="w-full haulz-weight-ruler">
      <Flex align="center" className="haulz-weight-ruler__toolbar no-print" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
        <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }} type="button">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Typography.Headline className="text-page-title">Линейка веса</Typography.Headline>
      </Flex>

      <div className="haulz-weight-ruler__panel no-print" style={{ padding: "1rem", marginBottom: "1rem" }}>
        <Typography.Body style={{ marginBottom: "0.75rem", color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>
          Линейка с кодами EAN-13: сканер читает код позиции, приложение переводит её в кг.
          Шаг — сколько кг на 1 см ленты. Коды расположены в трёх рядах. Печать — строки по {PRINT_CM_PER_ROW} см, масштаб 100% без подгонки к странице.
          {" "}Линия сканера должна пересекать полосы кода.
        </Typography.Body>

        <Flex gap="0.75rem" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
          <label className="haulz-weight-ruler__field">
            <span>Начало, кг</span>
            <input className="haulz-weight-ruler__input" value={startStr} onChange={(e) => setStartStr(e.target.value)} inputMode="decimal" />
          </label>
          <label className="haulz-weight-ruler__field">
            <span>Конец, кг</span>
            <input className="haulz-weight-ruler__input" value={endStr} onChange={(e) => setEndStr(e.target.value)} inputMode="decimal" />
          </label>
          <label className="haulz-weight-ruler__field">
            <span>Шаг, кг/см</span>
            <input className="haulz-weight-ruler__input" value={stepStr} onChange={(e) => setStepStr(e.target.value)} inputMode="decimal" />
          </label>
        </Flex>

        {!validationError ? (
          <Typography.Body style={{ marginBottom: "0.75rem", fontSize: "0.9rem" }}>
            Длина ленты: <strong>{formatWeightKg(lengthCm)} см</strong>
            {" · "}
            точек: <strong>{ticks.length}</strong>
            {" · "}
            строк печати: <strong>{printRows.length}</strong>
            {" · "}
            пример: 10 см → <strong>{formatWeightKg(weightFromPositionCm(config, 10))} кг</strong>
          </Typography.Body>
        ) : (
          <Typography.Body style={{ marginBottom: "0.75rem", color: "var(--color-error)", fontSize: "0.9rem" }}>
            {validationError}
          </Typography.Body>
        )}

        <Flex gap="0.5rem" wrap="wrap" style={{ marginBottom: "1rem" }}>
          <Button type="button" className="button-primary" onClick={handleSave} disabled={Boolean(validationError)}>
            Сохранить
          </Button>
          <Button
            type="button"
            className="button-primary"
            onClick={handlePrint}
            disabled={Boolean(validationError)}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
          >
            <Printer className="w-4 h-4" aria-hidden />
            Печать
          </Button>
        </Flex>
        {savedHint ? (
          <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
            {savedHint}
          </Typography.Body>
        ) : null}

        <Typography.Label style={{ display: "block", marginBottom: "0.35rem" }}>
          Проверка скана (EAN-13 или см)
        </Typography.Label>
        <Flex gap="0.5rem" align="center" wrap="wrap">
          <input
            className="haulz-weight-ruler__input"
            aria-label="Проверка скана (EAN-13 или см)"
            value={scanCm}
            onChange={(e) => setScanCm(e.target.value)}
            placeholder="сканируйте код"
            inputMode="numeric"
            style={{ maxWidth: "14rem" }}
          />
          <Typography.Body style={{ fontSize: "0.95rem" }}>
            → вес: <strong>{scannedWeight == null ? "—" : `${formatWeightKg(scannedWeight)} кг`}</strong>
          </Typography.Body>
        </Flex>
        {scanCm.trim() && scannedWeight == null && !validationError ? (
          <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
            Код не принадлежит этой линейке, повреждён или выходит за её диапазон.
          </Typography.Body>
        ) : null}
      </div>

      {!validationError && previewRows.length > 0 ? (
        <div className="haulz-weight-ruler__preview no-print" aria-label="Превью линейки">
          <Typography.Label style={{ marginBottom: "0.35rem", display: "block" }}>
            Превью (до {previewTicks[previewTicks.length - 1]?.cm ?? 0} см, перенос по {PREVIEW_CM_PER_ROW} см)
          </Typography.Label>
          <div className="haulz-weight-ruler-frame haulz-weight-ruler-frame--preview">
            <RulerWrappedStrip rows={previewRows} cellPx={38} />
          </div>
        </div>
      ) : null}

      {!validationError && printRows.length > 0 ? (
        <div className="haulz-weight-ruler__print-root" aria-hidden>
          <div className="haulz-weight-ruler__print-header">
            HAULZ линейка веса EAN-13 · {formatWeightKg(config.start)}–{formatWeightKg(config.end)} кг · шаг{" "}
            {formatWeightKg(config.step)} кг/см · печать 100% · длина {formatWeightKg(lengthCm)} см · {printRows.length} стр. строк по{" "}
            {PRINT_CM_PER_ROW} см
          </div>
          <div className="haulz-weight-ruler-frame haulz-weight-ruler-frame--print">
            <RulerWrappedStrip rows={printRows} cellCm={1} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RulerWrappedStrip({ rows, cellPx, cellCm }: { rows: RulerTick[][]; cellPx?: number; cellCm?: number }) {
  return (
    <div className="haulz-weight-ruler-rows">
      {rows.map((row, rowIdx) => {
        const widthMm = (row.length - 1) * 10 + 30;
        const heightMm = 142;
        return (
          <div key={`row-${rowIdx}`} className="haulz-weight-ruler-row">
            <div className="haulz-weight-ruler-row__meta">
              строка {rowIdx + 1}: {row[0]?.cm}–{row[row.length - 1]?.cm} см
            </div>
            <svg className="haulz-weight-ruler-row__svg" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${widthMm} ${heightMm}`}
              aria-label="Линейка EAN-13" role="img"
              style={{ display: "block", width: cellCm ? `${widthMm}mm` : widthMm * (cellPx ?? 10) / 10,
                height: cellCm ? `${heightMm}mm` : heightMm * (cellPx ?? 10) / 10 }}>
              <rect width={widthMm} height={heightMm} fill="white" />
              {row.map((tick, i) => {
                const x = 15 + i * 10;
                const y = 3 + (i % 3) * 43;
                const code = rulerEan13(tick.cm);
                const modules = ean13Modules(code);
                return (
                  <g key={tick.cm}>
                    <g transform={`translate(${x - 12.965} ${y + 37.29}) rotate(-90)`}>
                      <rect width="37.29" height="25.93" fill="white" />
                      {[...modules].map((bit, index) => bit === '1' ?
                        <rect key={index} x={index * 0.33} y="0" width="0.33"
                          height={(index >= 11 && index < 14) || (index >= 56 && index < 61) || (index >= 103 && index < 106) ? 24.5 : 22.85}
                          fill="black" /> : null)}
                      <text x="18.645" y="25.6" textAnchor="middle" fontFamily="monospace" fontSize="2.6" fill="black">{code}</text>
                    </g>
                    <text x={x} y={y + 40.5} textAnchor="middle" fontSize="2.5" fill="black">{tick.cm} см</text>
                    <line x1={x} x2={x} y1="133" y2={tick.major ? 136 : 135} stroke="black" strokeWidth="0.2" />
                    <text x={x} y="140" textAnchor="middle" fontSize="2.5" fill="black">{tick.label}</text>
                  </g>
                );
              })}
              <line x1="15" x2={widthMm - 15} y1="133" y2="133" stroke="black" strokeWidth="0.2" />
            </svg>
          </div>
        );
      })}
    </div>
  );
}
