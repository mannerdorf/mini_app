/** Нормализация ответов GETAPI PostB (GetPosilka / Getperevozka) — структура 1С может отличаться. */

function asStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "bigint") return v.toString();
  return String(v).trim();
}

function normKey(k: string): string {
  return k.toLowerCase().replace(/\s+/g, "");
}

/** Из произвольного объекта строки таблицы статусов. */
export function rowFromLooseObject(obj: Record<string, unknown>): { title: string; date: string } | null {
  let title = "";
  let date = "";
  for (const [k, v] of Object.entries(obj)) {
    const nk = normKey(k);
    const sv = asStr(v);
    if (!sv) continue;
    if (nk.includes("дата") || nk === "date" || nk.includes("период") || nk.includes("время")) {
      date = sv;
    } else if (
      nk.includes("статус") ||
      nk.includes("состояние") ||
      nk.includes("название") ||
      nk.includes("наименование") ||
      nk.includes("этап") ||
      nk.includes("описание") ||
      nk.includes("событие")
    ) {
      title = sv;
    }
  }
  if (title || date) return { title: title || "—", date };
  return null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/** Ищем массивы объектов с похожими на статус полями. */
function findStatusArrays(node: unknown, depth: number, out: Record<string, unknown>[][]): void {
  if (depth <= 0 || node === null || node === undefined) return;
  if (Array.isArray(node)) {
    if (
      node.length > 0 &&
      node.every((x) => isPlainObject(x)) &&
      node.some((x) => rowFromLooseObject(x as Record<string, unknown>))
    ) {
      out.push(node as Record<string, unknown>[]);
    }
    for (const el of node) findStatusArrays(el, depth - 1, out);
    return;
  }
  if (isPlainObject(node)) {
    for (const v of Object.values(node)) findStatusArrays(v, depth - 1, out);
  }
}

export function parseJsonLoose(text: string): unknown {
  const t = text.trim();
  if (!t) return null;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return { _raw: t };
  }
}

/** Шаги перевозки для таймлайна. */
export function normalizePerevozkaSteps(data: unknown): Array<{ title: string; date: string }> {
  if (!data) return [];
  const buckets: Record<string, unknown>[][] = [];
  findStatusArrays(data, 8, buckets);
  let best: Record<string, unknown>[] = [];
  for (const b of buckets) {
    if (b.length > best.length) best = b;
  }
  const steps: Array<{ title: string; date: string }> = [];
  for (const row of best) {
    const r = rowFromLooseObject(row);
    if (r) steps.push(r);
  }
  if (steps.length) return steps;

  if (isPlainObject(data)) {
    const o = data as Record<string, unknown>;
    const direct = rowFromLooseObject(o);
    if (direct) return [direct];
    const st = asStr(o.Статус ?? o.статус ?? o.Status ?? o.status);
    if (st) return [{ title: st, date: asStr(o.Дата ?? o.дата ?? o.Date ?? o.date) }];
  }
  return [];
}

/** Ответ GetPosilka: { Success, Сверки: [{ Перевозка, Статусы: [{ Период, Состояние }] }] } */
export type PosilkaParsed = {
  lastStatus: string;
  perevozka: string;
  posilkaSteps: Array<{ title: string; date: string }>;
};

/** Не показывать как статус адреса/наименования из 1С (РВБ, пункты и т.д.). */
export function sanitizePosilkaStatusLabel(raw: string): string {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  if (t.includes("РВБ") || t.includes("Рвб")) return "";
  if (/\bООО\s*\(/i.test(t) && (t.includes("улиц") || t.includes("Москва") || t.includes("Калининград"))) return "";
  if (t.length > 100) return "";
  return t;
}

export function parseGetPosilkaResponse(data: unknown): PosilkaParsed {
  const empty: PosilkaParsed = { lastStatus: "", perevozka: "", posilkaSteps: [] };
  if (!isPlainObject(data)) return empty;
  const o = data as Record<string, unknown>;
  if (o.Success === false) return empty;
  const getRowStatuses = (row: Record<string, unknown>): Array<{ title: string; date: string }> => {
    const statusy = row.Статусы ?? row.статусы ?? row.Statuses ?? row.statuses;
    const out: Array<{ title: string; date: string }> = [];
    if (!Array.isArray(statusy)) return out;
    for (const s of statusy) {
      if (!isPlainObject(s)) continue;
      const ss = s as Record<string, unknown>;
      const title = asStr(ss.Состояние ?? ss.состояние ?? ss.Status ?? ss.status);
      const date = asStr(ss.Период ?? ss.период ?? ss.Date ?? ss.date);
      if (title || date) out.push({ title: title || "—", date });
    }
    return out;
  };

  // Формат 1: { Сверки: [ ... ] }
  const sverki = o.Сверки;
  if (Array.isArray(sverki) && sverki.length > 0) {
    const first = sverki[0];
    if (isPlainObject(first)) {
      const row = first as Record<string, unknown>;
      const perevozka = asStr(row.Перевозка ?? row.перевозка ?? row.Number ?? row.number);
      const posilkaSteps = getRowStatuses(row);
      let lastStatus = posilkaSteps.length ? posilkaSteps[posilkaSteps.length - 1]!.title : "";
      if (!lastStatus) lastStatus = asStr(row.Состояние ?? row.состояние ?? row.Status ?? row.status);
      lastStatus = sanitizePosilkaStatusLabel(lastStatus);
      return { lastStatus, perevozka, posilkaSteps };
    }
  }

  // Формат 2: { Посылка: [ { Перевозка, Статусы: [...] } ] }
  const posilka = o.Посылка;
  if (Array.isArray(posilka) && posilka.length > 0) {
    const first = posilka[0];
    if (isPlainObject(first)) {
      const row = first as Record<string, unknown>;
      const perevozka = asStr(row.Перевозка ?? row.перевозка ?? row.Number ?? row.number);
      const posilkaSteps = getRowStatuses(row);
      let lastStatus = posilkaSteps.length ? posilkaSteps[posilkaSteps.length - 1]!.title : "";
      if (!lastStatus) lastStatus = asStr(row.Состояние ?? row.состояние ?? row.Status ?? row.status);
      lastStatus = sanitizePosilkaStatusLabel(lastStatus);
      return { lastStatus, perevozka, posilkaSteps };
    }
  }

  return empty;
}

/** Последний статус посылки (для бейджа): сначала формат Сверки, иначе эвристика. */
export function normalizePosilkaLastStatus(data: unknown): string {
  const fromSverki = parseGetPosilkaResponse(data);
  if (fromSverki.lastStatus) return fromSverki.lastStatus;

  const steps = normalizePerevozkaSteps(data);
  if (steps.length) return steps[steps.length - 1]!.title || "";
  if (isPlainObject(data)) {
    const o = data as Record<string, unknown>;
    const st = asStr(o.Статус ?? o.статус ?? o.Status ?? o.status ?? o.Result ?? o.Результат);
    if (st) return st;
  }
  if (typeof data === "string") return data.trim();
  return "";
}
