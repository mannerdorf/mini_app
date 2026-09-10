/** Калибровка линейки веса: позиция на ленте (см) → кг. */

export type HaulzWeightRulerConfig = {
  /** Вес при 0 см, кг */
  start: number;
  /** Максимальный вес, кг */
  end: number;
  /** Шаг веса на 1 см ленты, кг/см */
  step: number;
};

export const HAULZ_WEIGHT_RULER_STORAGE_KEY = "haulz.weightRuler.config";

export const DEFAULT_WEIGHT_RULER_CONFIG: HaulzWeightRulerConfig = {
  start: 0,
  end: 100,
  step: 1,
};

export function parseWeightRulerNumber(raw: string): number | null {
  const s = String(raw ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function validateWeightRulerConfig(cfg: HaulzWeightRulerConfig): string | null {
  if (!Number.isFinite(cfg.start) || !Number.isFinite(cfg.end) || !Number.isFinite(cfg.step)) {
    return "Заполните начало, конец и шаг числами";
  }
  if (cfg.step <= 0) return "Шаг должен быть больше 0";
  if (cfg.end <= cfg.start) return "Конец должен быть больше начала";
  const lengthCm = stripLengthCm(cfg);
  if (lengthCm > 5000) return "Слишком длинная лента (больше 50 м). Увеличьте шаг или уменьшите диапазон.";
  if (lengthCm < 1) return "Длина ленты меньше 1 см — проверьте шаг";
  return null;
}

/** Длина печатной ленты в см: (end − start) / step */
export function stripLengthCm(cfg: HaulzWeightRulerConfig): number {
  return (cfg.end - cfg.start) / cfg.step;
}

/** Вес по позиции сканера (см от нуля ленты). */
export function weightFromPositionCm(cfg: HaulzWeightRulerConfig, positionCm: number): number {
  return cfg.start + positionCm * cfg.step;
}

/** Позиция см для заданного веса. */
export function positionCmFromWeight(cfg: HaulzWeightRulerConfig, weightKg: number): number {
  return (weightKg - cfg.start) / cfg.step;
}

export function formatWeightKg(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 1000) / 1000;
  return String(rounded);
}

export function loadWeightRulerConfig(): HaulzWeightRulerConfig {
  try {
    const raw = localStorage.getItem(HAULZ_WEIGHT_RULER_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_WEIGHT_RULER_CONFIG };
    const parsed = JSON.parse(raw) as Partial<HaulzWeightRulerConfig>;
    return {
      start: Number(parsed.start) || 0,
      end: Number(parsed.end) || DEFAULT_WEIGHT_RULER_CONFIG.end,
      step: Number(parsed.step) || DEFAULT_WEIGHT_RULER_CONFIG.step,
    };
  } catch {
    return { ...DEFAULT_WEIGHT_RULER_CONFIG };
  }
}

export function saveWeightRulerConfig(cfg: HaulzWeightRulerConfig): void {
  localStorage.setItem(HAULZ_WEIGHT_RULER_STORAGE_KEY, JSON.stringify(cfg));
}

function toGray(n: number): number {
  return n ^ (n >> 1);
}

/** Число бит absolute-дорожек для покрытия lengthCm позиций (по 1 см). */
export function absoluteTrackCount(lengthCm: number): number {
  const positions = Math.max(1, Math.ceil(lengthCm) + 1);
  return Math.max(5, Math.ceil(Math.log2(positions)));
}

/** Бинарные подшкалы с периодом 1, 2, 4, 8… см (как на заводской ДШВ-ленте). */
export const FINE_SUBDIVISION_TRACKS = 8;

export type RulerStripLayerKind = "absolute" | "fine" | "decimeter" | "row-sync";

export type RulerStripLayer = {
  kind: RulerStripLayerKind;
  /** Индекс внутри kind (номер бита / периода). */
  index: number;
  /** Относительная высота полосы (1 = базовая). */
  weight: number;
};

/**
 * Absolute-паттерн (Gray) для позиции cmIndex (0…N).
 * Возвращает массив бит сверху вниз: true = чёрный.
 */
export function absoluteBitsAtCm(cmIndex: number, trackCount: number): boolean[] {
  const gray = toGray(Math.max(0, Math.floor(cmIndex)));
  const bits: boolean[] = [];
  for (let t = trackCount - 1; t >= 0; t--) {
    bits.push(((gray >> t) & 1) === 1);
  }
  return bits;
}

/** Бит бинарной подшкалы: период 2^trackIndex см, локально в строке. */
export function fineSubdivisionBitAtCm(localCmIndex: number, trackIndex: number): boolean {
  const cm = Math.max(0, Math.floor(localCmIndex));
  const period = 1 << Math.max(0, trackIndex);
  return Math.floor(cm / period) % 2 === 0;
}

/** Все дорожки ленты сверху вниз (absolute + синхро + fine). */
export function buildRulerStripLayers(totalLengthCm: number): RulerStripLayer[] {
  const absolute = absoluteTrackCount(totalLengthCm);
  const layers: RulerStripLayer[] = [];
  for (let i = 0; i < absolute; i++) {
    layers.push({ kind: "absolute", index: i, weight: 1.1 });
  }
  layers.push({ kind: "decimeter", index: 0, weight: 1.4 });
  layers.push({ kind: "row-sync", index: 0, weight: 1.2 });
  for (let i = 0; i < FINE_SUBDIVISION_TRACKS; i++) {
    layers.push({ kind: "fine", index: i, weight: i < 4 ? 0.85 : 0.7 });
  }
  return layers;
}

export function rulerStripLayerCount(totalLengthCm: number): number {
  return buildRulerStripLayers(totalLengthCm).length;
}

/** Чёрная ячейка на дорожке layer для позиции cm. */
export function rulerStripCellBlack(
  layer: RulerStripLayer,
  cmGlobal: number,
  cmLocal: number,
  absoluteTracks: number,
): boolean {
  if (layer.kind === "absolute") {
    return absoluteBitsAtCm(cmGlobal, absoluteTracks)[layer.index] === true;
  }
  if (layer.kind === "fine") {
    return fineSubdivisionBitAtCm(cmLocal, layer.index);
  }
  if (layer.kind === "decimeter") {
    return cmGlobal % 10 === 0;
  }
  return cmLocal === 0;
}

export type RulerTick = {
  cm: number;
  weightKg: number;
  label: string;
  major: boolean;
};

/** Метки для превью/печати: каждый см, major каждые 5/10 см. */
export function buildRulerTicks(cfg: HaulzWeightRulerConfig): RulerTick[] {
  const len = stripLengthCm(cfg);
  const maxCm = Math.ceil(len);
  const ticks: RulerTick[] = [];
  for (let cm = 0; cm <= maxCm; cm++) {
    const weightKg = weightFromPositionCm(cfg, cm);
    if (weightKg > cfg.end + cfg.step * 0.001) break;
    ticks.push({
      cm,
      weightKg,
      label: formatWeightKg(Math.min(weightKg, cfg.end)),
      major: cm % 5 === 0,
    });
  }
  return ticks;
}

/** Разбить ленту на строки по ширине листа (см в строке). */
export function chunkRulerTicks<T>(ticks: T[], cmPerRow: number): T[][] {
  const size = Math.max(1, Math.floor(cmPerRow));
  const rows: T[][] = [];
  for (let i = 0; i < ticks.length; i += size) {
    rows.push(ticks.slice(i, i + size));
  }
  return rows;
}

/** Сколько см помещается в строку печати (A4 landscape ≈ 27 см полезных). */
export const PRINT_CM_PER_ROW = 25;
