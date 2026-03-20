/** Строка из wb_1c_shk_status (после маппинга из SQL). */
export type Wb1cShkLookupRow = {
  shk: string;
  status1c: string;
  cargoNumber: string;
};

/**
 * Средняя часть ШК: без первого и последнего символа (как в ТЗ: если полного совпадения нет).
 */
export function wbBoxShkMiddlePart(boxShk: string): string {
  const t = String(boxShk ?? "").trim();
  if (t.length <= 2) return "";
  return t.slice(1, -1).trim();
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Последний сегмент после «:» (короткий код короба), если строка многоуровневая. */
function tailSegmentAfterColons(raw: string): string {
  const parts = raw.split(":").map((p) => p.trim()).filter((p) => p.length > 0);
  return parts.length ? parts[parts.length - 1]! : "";
}

function resolveAgainstKey(
  keyRaw: string,
  rows: Wb1cShkLookupRow[],
): { status1c: string; appCargoNumber: string } | null {
  const raw = String(keyRaw ?? "").trim();
  if (!raw) return null;

  const exact = rows.find((r) => norm(r.shk) === norm(raw));
  if (exact) {
    return {
      status1c: String(exact.status1c ?? "").trim(),
      appCargoNumber: String(exact.cargoNumber ?? "").trim(),
    };
  }

  const mid = wbBoxShkMiddlePart(raw);
  if (mid.length >= 2) {
    const m = norm(mid);
    const matches = rows.filter((r) => norm(r.shk).includes(m));
    if (matches.length) {
      matches.sort((a, b) => norm(a.shk).length - norm(b.shk).length);
      const c = matches[0];
      return {
        status1c: String(c.status1c ?? "").trim(),
        appCargoNumber: String(c.cargoNumber ?? "").trim(),
      };
    }
  }
  return null;
}

/**
 * 1) Полное совпадение shk (без учёта регистра, trim).
 * 2) Средняя часть полной строки в shk из БД.
 * 3) То же по последнему сегменту после «:» (если в справочнике короткий код).
 * 4) Иначе: status1c = «не найден», appCargoNumber пустой.
 */
export function resolveWb1cForBoxShk(
  boxShk: string | null | undefined,
  rows: Wb1cShkLookupRow[],
): { status1c: string; appCargoNumber: string } {
  const raw = String(boxShk ?? "").trim();
  if (!raw) {
    return { status1c: "", appCargoNumber: "" };
  }

  const full = resolveAgainstKey(raw, rows);
  if (full) return full;

  const tail = tailSegmentAfterColons(raw);
  if (tail && norm(tail) !== norm(raw)) {
    const byTail = resolveAgainstKey(tail, rows);
    if (byTail) return byTail;
  }

  return { status1c: "не найден", appCargoNumber: "" };
}
