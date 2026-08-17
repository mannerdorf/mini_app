import type { MainlineMode } from "./types.js";

export const MAINLINE_MODES: readonly MainlineMode[] = ["ferry", "auto", "air"] as const;

/** Порядок карточек тарифов в UI. */
export const MAINLINE_MODE_ORDER: readonly MainlineMode[] = ["auto", "ferry", "air"] as const;

const MODE_LABELS_RU: Record<MainlineMode, string> = {
  ferry: "Паром",
  auto: "Авто",
  air: "Авиа",
};

const MODE_LABELS_EMAIL: Record<MainlineMode, string> = {
  ferry: "Паром",
  auto: "Автоперевозка",
  air: "Авиаперевозка",
};

const MODE_LABELS_QUOTE_LINE: Record<MainlineMode, string> = {
  ferry: "паром",
  auto: "авто",
  air: "авиа",
};

export function isMainlineMode(value: unknown): value is MainlineMode {
  return value === "ferry" || value === "auto" || value === "air";
}

/** Разбор режима магистрали из API / черновика. */
export function parseMainlineMode(raw: unknown, fallback: MainlineMode = "ferry"): MainlineMode {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "auto" || v === "авто" || v === "автоперевозка") return "auto";
  if (v === "air" || v === "авиа" || v === "авиаперевозка") return "air";
  if (v === "ferry" || v === "паром") return "ferry";
  return fallback;
}

export function mainlineModeLabelRu(mode: MainlineMode | string | null | undefined): string {
  if (isMainlineMode(mode)) return MODE_LABELS_RU[mode];
  return String(mode || "").trim() || "—";
}

export function mainlineModeLabelEmail(mode: MainlineMode): string {
  return MODE_LABELS_EMAIL[mode] ?? mode;
}

export function mainlineModeLabelQuoteLine(mode: MainlineMode): string {
  return MODE_LABELS_QUOTE_LINE[mode] ?? mode;
}

export function compareMainlineModeOrder(a: MainlineMode, b: MainlineMode): number {
  const ia = MAINLINE_MODE_ORDER.indexOf(a);
  const ib = MAINLINE_MODE_ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
}
