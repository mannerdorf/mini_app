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

/**
 * 1) Полное совпадение shk (без учёта регистра, trim).
 * 2) Иначе: средняя часть номера короба содержится в shk из БД (мин. длина средней части 2).
 * 3) Иначе: status1c = «не найден», appCargoNumber пустой.
 */
export function resolveWb1cForBoxShk(
  boxShk: string | null | undefined,
  rows: Wb1cShkLookupRow[],
): { status1c: string; appCargoNumber: string } {
  const raw = String(boxShk ?? "").trim();
  if (!raw) {
    return { status1c: "", appCargoNumber: "" };
  }

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

  return { status1c: "не найден", appCargoNumber: "" };
}
