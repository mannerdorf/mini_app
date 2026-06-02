import { formatRuDate } from "./defaults.js";

const RU_DATE_RE = /(\d{2}\.\d{2}\.\d{4})/;

export type DraftDateParts = { before: string; date: string | null; after: string };

export const TD_DRAFT_DATE_FIELD_KEYS = new Set(["exportPermit", "fts"]);

export function isTdDraftDateField(fieldKey: string): boolean {
  return TD_DRAFT_DATE_FIELD_KEYS.has(fieldKey);
}

export function ruDateToIso(ru: string): string {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(ru.trim());
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function isoDateToRu(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return "";
  return `${m[3]}.${m[2]}.${m[1]}`;
}

export function splitDraftDateField(fieldKey: string, value: string): DraftDateParts {
  switch (fieldKey) {
    case "exportPermit": {
      const m = /^(.*?)(\d{2}\.\d{2}\.\d{4})\s*$/.exec(value);
      if (!m) return { before: value, date: null, after: "" };
      return { before: m[1] ?? "", date: m[2] ?? null, after: "" };
    }
    case "fts": {
      const m = /^(02\s*ФТС\s*№\s+)(?:от\s+)?(\d{2}\.\d{2}\.\d{4})?\s*([\s\S]*)$/i.exec(value.trim());
      if (m) {
        return { before: `${m[1] ?? ""}от `, date: m[2] ?? null, after: m[3] ?? "" };
      }
      const legacy = /^(.*?)(?:\s+ОТ\s+)(\d{2}\.\d{2}\.\d{4})?\s*([\s\S]*)$/i.exec(value.trim());
      if (legacy) return { before: `${legacy[1] ?? ""}от `, date: legacy[2] ?? null, after: legacy[3] ?? "" };
      return { before: "02 ФТС № от ", date: null, after: "" };
    }
    case "title": {
      const m = /^(.*?\sот\s+)(\d{2}\.\d{2}\.\d{4})([\s\S]*)$/i.exec(value);
      if (!m) return { before: value, date: null, after: "" };
      return { before: m[1] ?? "", date: m[2] ?? null, after: m[3] ?? "" };
    }
    default:
      return { before: value, date: null, after: "" };
  }
}

export function joinDraftDateField(fieldKey: string, parts: DraftDateParts): string {
  const date = parts.date && RU_DATE_RE.test(parts.date) ? parts.date : formatRuDate();
  if (fieldKey === "exportPermit") {
    const before = parts.before.trimEnd();
    return before ? `${before}      ${date}${parts.after}` : date;
  }
  if (fieldKey === "fts") {
    return `02 ФТС № от ${date}${parts.after}`.trimEnd();
  }
  if (fieldKey === "title") {
    if (parts.date === null && !/\sот\s/i.test(parts.before)) {
      return `${parts.before} от ${date}${parts.after}`;
    }
    return `${parts.before}${date}${parts.after}`;
  }
  return parts.before;
}

export function extractDraftRuDate(fieldKey: string, value: string): string | null {
  return splitDraftDateField(fieldKey, value).date;
}

export function replaceDraftRuDate(fieldKey: string, value: string, newRuDate: string): string {
  const parts = splitDraftDateField(fieldKey, value);
  return joinDraftDateField(fieldKey, { ...parts, date: newRuDate });
}

export function syncTitleDateFromFts(title: string, fts: string): string {
  const ftsDate = extractDraftRuDate("fts", fts) ?? formatRuDate();
  let t = title.trim();
  if (/к\s*CMR/i.test(t) && !/б\/н\s*от/i.test(t)) {
    t = `${t.replace(/\s+$/, "")} б/н от ${ftsDate}`;
  }
  if (/\d{2}\.\d{2}\.\d{4}/.test(t)) {
    return t.replace(/\d{2}\.\d{2}\.\d{4}/g, ftsDate);
  }
  if (/\sот\s/i.test(t)) {
    return t.replace(/(\sот\s+)/gi, `$1${ftsDate}`);
  }
  return t;
}

function specificationTitleFromFts(title: string, ftsDate: string, ftsNorm: string): string {
  const base = title.trim() || `Спецификация №1 от ${ftsDate} к CMR б/н от ${ftsDate}`;
  return syncTitleDateFromFts(base, ftsNorm);
}

export function normalizeSpecificationDraft<T extends Record<string, string>>(draft: T): T {
  const fts = draft.fts ?? `02 ФТС № от ${formatRuDate()}`;
  const ftsDate = extractDraftRuDate("fts", fts) ?? formatRuDate();
  const ftsNorm = joinDraftDateField("fts", { before: "02 ФТС № от ", date: ftsDate, after: "" });
  const exportPermit = replaceDraftRuDate(
    "exportPermit",
    draft.exportPermit ?? `ВЫВОЗ РАЗРЕШЕН      ${ftsDate}`,
    ftsDate,
  );
  const title = specificationTitleFromFts(draft.title ?? "", ftsDate, ftsNorm);
  return { ...draft, fts: ftsNorm, exportPermit, title };
}

export function normalizeProformaDraft<T extends Record<string, string>>(draft: T): T {
  const fts = draft.fts ?? `02 ФТС № от ${formatRuDate()}`;
  const ftsDate = extractDraftRuDate("fts", fts) ?? formatRuDate();
  const ftsNorm = joinDraftDateField("fts", { before: "02 ФТС № от ", date: ftsDate, after: "" });
  const exportPermit = replaceDraftRuDate(
    "exportPermit",
    draft.exportPermit ?? `ВЫВОЗ РАЗРЕШЕН      ${ftsDate}`,
    ftsDate,
  );
  const title = syncTitleDateFromFts(draft.title ?? `Счет-проформа №1 от ${ftsDate}`, ftsNorm);
  return { ...draft, fts: ftsNorm, exportPermit, title };
}

export type ProformaTotals = {
  places: number;
  qty: number;
  weight: number;
  cost: number;
};

export function computeProformaTotals(rows: import("./collectTdRows.js").FixTdRow[]): ProformaTotals {
  let qty = 0;
  let weight = 0;
  let cost = 0;
  const ulSet = new Set<string>();
  for (const r of rows) {
    qty += parseNum(r.qty);
    weight += parseNum(r.weight);
    cost += parseNum(r.cost);
    const ul = String(r.ul ?? "").trim();
    if (ul) ulSet.add(ul);
  }
  return {
    places: ulSet.size || rows.length,
    qty: round2(qty),
    weight: round2(weight),
    cost: round2(cost),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
