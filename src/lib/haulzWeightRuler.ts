/** The fourth barcode scale: each division carries an explicit weight, in grams. */
export type HaulzWeightRulerConfig = { start: number; end: number; step: number };
export const HAULZ_WEIGHT_RULER_STORAGE_KEY = "haulz.weightRuler.config.v2";
export const DEFAULT_WEIGHT_RULER_CONFIG: HaulzWeightRulerConfig = { start: 0, end: 100, step: 1 };
export const MAX_WEIGHT_GRAMS = 99_999_999;
export const MAX_RULER_INTERVALS = 5000;
export const RULER_PITCH_MM = 5;
export const PRINT_STRIP_MM = 250;
export const PRINT_INTERVALS_PER_STRIP = PRINT_STRIP_MM / RULER_PITCH_MM;
export const PRINT_STRIPS_PER_PAGE = 3;

export function parseWeightRulerNumber(raw: string): number | null {
  const value = raw.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,3})?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function weightGrams(weightKg: number): number | null {
  if (typeof weightKg !== "number") return null;
  const grams = weightKg * 1000;
  return Number.isFinite(grams) && grams >= 0 && grams <= MAX_WEIGHT_GRAMS &&
    Math.abs(grams - Math.round(grams)) < 1e-6 ? Math.round(grams) : null;
}

export function validateWeightRulerConfig(config: HaulzWeightRulerConfig): string | null {
  const start = weightGrams(config.start);
  const end = weightGrams(config.end);
  const step = weightGrams(config.step);
  if (start == null || end == null || step == null) return "Укажите вес от 0 до 99 999,999 кг с точностью до 1 г.";
  if (step <= 0) return "Шаг должен быть больше 0.";
  if (end <= start) return "Конец должен быть больше начала.";
  if ((end - start) % step !== 0) return "Диапазон должен делиться на шаг без остатка.";
  if ((end - start) / step > MAX_RULER_INTERVALS) return "Больше 5000 делений. Увеличьте шаг или уменьшите диапазон.";
  return null;
}

export function formatWeightKg(value: number): string {
  return Number.isFinite(value) ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value) : "—";
}

export function loadWeightRulerConfig(): HaulzWeightRulerConfig {
  try {
    const raw = localStorage.getItem(HAULZ_WEIGHT_RULER_STORAGE_KEY);
    if (raw) {
      const config = JSON.parse(raw) as HaulzWeightRulerConfig;
      if (config && !validateWeightRulerConfig(config)) return config;
    }
  } catch { /* Use defaults if storage is unavailable or damaged. */ }
  // The old kg/cm calibration has different semantics and is not a weight interval.
  return { ...DEFAULT_WEIGHT_RULER_CONFIG };
}

export function saveWeightRulerConfig(config: HaulzWeightRulerConfig): void {
  const error = validateWeightRulerConfig(config);
  if (error) throw new Error(error);
  localStorage.setItem(HAULZ_WEIGHT_RULER_STORAGE_KEY, JSON.stringify(config));
}

export type RulerTick = { index: number; weightKg: number; label: string; major: boolean };

export function buildRulerTicks(config: HaulzWeightRulerConfig): RulerTick[] {
  if (validateWeightRulerConfig(config)) return [];
  const start = weightGrams(config.start)!;
  const end = weightGrams(config.end)!;
  const step = weightGrams(config.step)!;
  const ticks: RulerTick[] = [];
  for (let grams = start, index = 0; grams <= end; grams += step, index++) {
    ticks.push({ index, weightKg: grams / 1000, label: formatWeightKg(grams / 1000), major: index % 5 === 0 });
  }
  return ticks;
}

/** A shared endpoint lets printed strips be joined without shifting the scale. */
export function chunkRulerTicks(ticks: RulerTick[]): RulerTick[][] {
  const strips: RulerTick[][] = [];
  for (let i = 0; i < ticks.length - 1; i += PRINT_INTERVALS_PER_STRIP) {
    strips.push(ticks.slice(i, i + PRINT_INTERVALS_PER_STRIP + 1));
  }
  return strips;
}

export function rulerPrintPages(strips: RulerTick[][]): RulerTick[][][] {
  const pages: RulerTick[][][] = [];
  for (let i = 0; i < strips.length; i += PRINT_STRIPS_PER_PAGE) pages.push(strips.slice(i, i + PRINT_STRIPS_PER_PAGE));
  return pages;
}

export function isWeightOnRuler(config: HaulzWeightRulerConfig, weightKg: number): boolean {
  if (validateWeightRulerConfig(config)) return false;
  const grams = weightGrams(weightKg);
  const start = weightGrams(config.start)!;
  const end = weightGrams(config.end)!;
  const step = weightGrams(config.step)!;
  return grams != null && grams >= start && grams <= end && (grams - start) % step === 0;
}
