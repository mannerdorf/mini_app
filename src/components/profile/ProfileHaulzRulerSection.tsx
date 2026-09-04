import React, { useCallback, useMemo, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { Button, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import {
  absoluteBitsAtCm,
  absoluteTrackCount,
  buildRulerTicks,
  DEFAULT_WEIGHT_RULER_CONFIG,
  formatWeightKg,
  loadWeightRulerConfig,
  parseWeightRulerNumber,
  saveWeightRulerConfig,
  stripLengthCm,
  validateWeightRulerConfig,
  weightFromPositionCm,
  type HaulzWeightRulerConfig,
} from "../../lib/haulzWeightRuler";

type Props = {
  onBack: () => void;
};

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
    window.print();
  }, [config, validationError]);

  const trackCount = absoluteTrackCount(Math.max(1, lengthCm));
  const previewTicks = ticks.filter((t) => t.cm <= Math.min(40, Math.ceil(lengthCm)));

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
          Шаг — сколько кг на 1 см ленты. Печать — шкала с дорожками Gray и подписями веса.
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

      {!validationError && previewTicks.length > 0 ? (
        <div className="haulz-weight-ruler__preview no-print" aria-label="Превью линейки">
          <Typography.Label style={{ marginBottom: "0.35rem", display: "block" }}>
            Превью (первые {previewTicks.length - 1} см)
          </Typography.Label>
          <div className="haulz-weight-ruler-strip haulz-weight-ruler-strip--preview">
            <RulerAbsoluteStrip ticks={previewTicks} trackCount={trackCount} />
          </div>
        </div>
      ) : null}

      {/* Печатная область */}
      {!validationError && ticks.length > 0 ? (
        <div className="haulz-weight-ruler__print-root print-only" aria-hidden>
          <div className="haulz-weight-ruler__print-header">
            HAULZ линейка веса · {formatWeightKg(config.start)}–{formatWeightKg(config.end)} кг · шаг{" "}
            {formatWeightKg(config.step)} кг/см · длина {formatWeightKg(lengthCm)} см
          </div>
          <div className="haulz-weight-ruler-strip haulz-weight-ruler-strip--print">
            <RulerAbsoluteStrip ticks={ticks} trackCount={trackCount} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RulerAbsoluteStrip({
  ticks,
  trackCount,
}: {
  ticks: ReturnType<typeof buildRulerTicks>;
  trackCount: number;
}) {
  if (ticks.length === 0) return null;
  return (
    <div className="haulz-weight-ruler-strip__inner">
      <div className="haulz-weight-ruler-strip__tracks" style={{ gridTemplateRows: `repeat(${trackCount}, 1fr)` }}>
        {Array.from({ length: trackCount }, (_, trackIdx) => (
          <div key={trackIdx} className="haulz-weight-ruler-strip__track">
            {ticks.map((tick) => {
              const bits = absoluteBitsAtCm(tick.cm, trackCount);
              const black = bits[trackIdx];
              return (
                <span
                  key={`${trackIdx}-${tick.cm}`}
                  className={`haulz-weight-ruler-strip__cell${black ? " is-black" : ""}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="haulz-weight-ruler-strip__labels">
        {ticks.map((tick) => (
          <div
            key={`lbl-${tick.cm}`}
            className={`haulz-weight-ruler-strip__label${tick.major ? " is-major" : ""}`}
          >
            {tick.major ? (
              <>
                <span className="haulz-weight-ruler-strip__kg">{tick.label}</span>
                <span className="haulz-weight-ruler-strip__cm">{tick.cm}</span>
              </>
            ) : (
              <span className="haulz-weight-ruler-strip__tick" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
