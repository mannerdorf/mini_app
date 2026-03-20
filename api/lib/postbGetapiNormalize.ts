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

export function parseGetPosilkaResponse(data: unknown): PosilkaParsed {
  const empty: PosilkaParsed = { lastStatus: "", perevozka: "", posilkaSteps: [] };
  if (!isPlainObject(data)) return empty;
  const o = data as Record<string, unknown>;
  const sverki = o.Сверки;
  if (!Array.isArray(sverki) || sverki.length === 0) return empty;

  const first = sverki[0];
  if (!isPlainObject(first)) return empty;
  const row = first as Record<string, unknown>;
  const perevozka = asStr(row.Перевозка ?? row.перевозка);

  const statusy = row.Статусы;
  const posilkaSteps: Array<{ title: string; date: string }> = [];
  if (Array.isArray(statusy)) {
    for (const s of statusy) {
      if (!isPlainObject(s)) continue;
      const ss = s as Record<string, unknown>;
      const title = asStr(ss.Состояние ?? ss.состояние);
      const date = asStr(ss.Период ?? ss.период);
      if (title || date) posilkaSteps.push({ title: title || "—", date });
    }
  }

  const lastStatus = posilkaSteps.length ? posilkaSteps[posilkaSteps.length - 1]!.title : "";
  return { lastStatus, perevozka, posilkaSteps };
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
