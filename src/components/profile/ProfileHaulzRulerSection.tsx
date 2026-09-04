import React, { useCallback, useMemo, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { Button, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import {
  absoluteBitsAtCm,
  absoluteTrackCount,
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

type Props = {
  onBack: () => void;
};

const PREVIEW_CM_PER_ROW = 20;
const PREVIEW_MAX_CM = 80;

/** HAULZ → Линейка веса: калибровка начало/конец/шаг + печать absolute-шкалы. */
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
    const cm = parseWeightRulerNumber(scanCm);
    if (cm == null || validationError) return null;
    return weightFromPositionCm(config, cm);
  }, [scanCm, config, validationError]);

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

  const trackCount = absoluteTrackCount(Math.max(1, lengthCm));

  return (
    <div className="w-full haulz-weight-ruler">
      <Flex align="center" className="haulz-weight-ruler__toolbar no-print" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
        <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }} type="button">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Typography.Headline className="text-page-title">Линейка веса</Typography.Headline>
      </Flex>

      <Panel className="haulz-weight-ruler__panel no-print" style={{ padding: "1rem", marginBottom: "1rem" }}>
        <Typography.Body style={{ marginBottom: "0.75rem", color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>
          Absolute-линейка как для ДШВ: сканер читает позицию в см, приложение переводит в кг.
          Шаг — сколько кг на 1 см ленты. Печать — строки по {PRINT_CM_PER_ROW} см (ширина листа), продолжение ниже до конца диапазона.
        </Typography.Body>

        <Flex gap="0.75rem" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
          <label className="haulz-weight-ruler__field">
            <span>Начало, кг</span>
            <Input value={startStr} onChange={(e) => setStartStr(e.target.value)} inputMode="decimal" />
          </label>
          <label className="haulz-weight-ruler__field">
            <span>Конец, кг</span>
            <Input value={endStr} onChange={(e) => setEndStr(e.target.value)} inputMode="decimal" />
          </label>
          <label className="haulz-weight-ruler__field">
            <span>Шаг, кг/см</span>
            <Input value={stepStr} onChange={(e) => setStepStr(e.target.value)} inputMode="decimal" />
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
            дорожек: <strong>{trackCount}</strong>
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
          Проверка скана (см с линейки)
        </Typography.Label>
        <Flex gap="0.5rem" align="center" wrap="wrap">
          <Input
            value={scanCm}
            onChange={(e) => setScanCm(e.target.value)}
            placeholder="например 37"
            inputMode="decimal"
            style={{ maxWidth: "10rem" }}
          />
          <Typography.Body style={{ fontSize: "0.95rem" }}>
            → вес: <strong>{scannedWeight == null ? "—" : `${formatWeightKg(scannedWeight)} кг`}</strong>
          </Typography.Body>
        </Flex>
      </Panel>

      {!validationError && previewRows.length > 0 ? (
        <div className="haulz-weight-ruler__preview no-print" aria-label="Превью линейки">
          <Typography.Label style={{ marginBottom: "0.35rem", display: "block" }}>
            Превью (до {previewTicks[previewTicks.length - 1]?.cm ?? 0} см, перенос по {PREVIEW_CM_PER_ROW} см)
          </Typography.Label>
          <div className="haulz-weight-ruler-frame haulz-weight-ruler-frame--preview">
            <RulerWrappedStrip rows={previewRows} trackCount={trackCount} cellPx={10} />
          </div>
        </div>
      ) : null}

      {!validationError && printRows.length > 0 ? (
        <div className="haulz-weight-ruler__print-root" aria-hidden>
          <div className="haulz-weight-ruler__print-header">
            HAULZ линейка веса · {formatWeightKg(config.start)}–{formatWeightKg(config.end)} кг · шаг{" "}
            {formatWeightKg(config.step)} кг/см · длина {formatWeightKg(lengthCm)} см · {printRows.length} стр. строк по{" "}
            {PRINT_CM_PER_ROW} см
          </div>
          <div className="haulz-weight-ruler-frame haulz-weight-ruler-frame--print">
            <RulerWrappedStrip rows={printRows} trackCount={trackCount} cellCm={1} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RulerWrappedStrip({
  rows,
  trackCount,
  cellPx,
  cellCm,
}: {
  rows: RulerTick[][];
  trackCount: number;
  cellPx?: number;
  cellCm?: number;
}) {
  return (
    <div className="haulz-weight-ruler-rows">
      {rows.map((row, rowIdx) => {
        const from = row[0];
        const to = row[row.length - 1];
        return (
          <div key={`row-${rowIdx}-${from?.cm}`} className="haulz-weight-ruler-row">
            <div className="haulz-weight-ruler-row__meta">
              строка {rowIdx + 1}: {from?.cm}–{to?.cm} см · {from?.label}–{to?.label} кг
            </div>
            <RulerAbsoluteRow ticks={row} trackCount={trackCount} cellPx={cellPx} cellCm={cellCm} />
          </div>
        );
      })}
    </div>
  );
}

/** Одна строка absolute-шкалы: SVG (печатается без «Background graphics»). */
function RulerAbsoluteRow({
  ticks,
  trackCount,
  cellPx = 10,
  cellCm,
}: {
  ticks: RulerTick[];
  trackCount: number;
  cellPx?: number;
  cellCm?: number;
}) {
  if (ticks.length === 0) return null;

  const useCm = cellCm != null && cellCm > 0;
  const cellW = useCm ? cellCm! : cellPx;
  const trackH = useCm ? 0.22 : 5;
  const gap = useCm ? 0.04 : 1;
  const tracksH = trackCount * trackH + (trackCount - 1) * gap;
  const svgW = ticks.length * cellW;
  const labelH = useCm ? 1.6 : 36;
  const unit = useCm ? "cm" : undefined;

  const rects: React.ReactNode[] = [];
  for (let t = 0; t < trackCount; t++) {
    const y = t * (trackH + gap);
    let runStart = -1;
    for (let i = 0; i <= ticks.length; i++) {
      const black = i < ticks.length ? absoluteBitsAtCm(ticks[i]!.cm, trackCount)[t] === true : false;
      if (black && runStart < 0) runStart = i;
      if ((!black || i === ticks.length) && runStart >= 0) {
        const w = (i - runStart) * cellW;
        rects.push(
          <rect
            key={`t${t}-${runStart}`}
            x={runStart * cellW}
            y={y}
            width={w}
            height={trackH}
            fill="#000"
          />,
        );
        runStart = -1;
      }
    }
  }

  return (
    <div className="haulz-weight-ruler-row__strip">
      <svg
        className="haulz-weight-ruler-row__svg"
        width={useCm ? undefined : svgW}
        height={useCm ? undefined : tracksH + 2}
        viewBox={`0 0 ${svgW} ${tracksH}`}
        style={
          useCm
            ? { width: `${svgW}${unit}`, height: `${tracksH}${unit}`, display: "block" }
            : { display: "block" }
        }
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x={0} y={0} width={svgW} height={tracksH} fill="#fff" stroke="#000" strokeWidth={useCm ? 0.03 : 1} />
        {rects}
      </svg>
      <div
        className="haulz-weight-ruler-row__labels"
        style={{
          width: useCm ? `${svgW}${unit}` : svgW,
          minHeight: useCm ? `${labelH}${unit}` : labelH,
        }}
      >
        {ticks.map((tick) => (
          <div
            key={`lbl-${tick.cm}`}
            className={`haulz-weight-ruler-row__label${tick.major ? " is-major" : ""}`}
            style={{
              width: useCm ? `${cellW}${unit}` : cellW,
              flexBasis: useCm ? `${cellW}${unit}` : cellW,
            }}
          >
            {tick.major ? (
              <>
                <span className="haulz-weight-ruler-row__kg">{tick.label}</span>
                <span className="haulz-weight-ruler-row__cm">{tick.cm}</span>
              </>
            ) : (
              <span className="haulz-weight-ruler-row__tick" aria-hidden />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
