export function normalizeSearchableText(v: string): string {
  return String(v || "")
    .toLowerCase()
    .replace(/[.,;:()"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/** ИНН: подстрока в исходном виде или совпадение по цифрам (при ≥3 цифрах в запросе). */
export function innMatchesSearchQuery(innRaw: string | undefined, queryRaw: string): boolean {
  const inn = String(innRaw ?? "").trim();
  const q = queryRaw.trim();
  if (!q) return true;
  if (!inn) return false;
  const ql = q.toLowerCase();
  if (inn.toLowerCase().includes(ql)) return true;
  const qDigits = digitsOnly(q);
  if (qDigits.length >= 3 && digitsOnly(inn).includes(qDigits)) return true;
  return false;
}

/** Наименование юрлица: подстрока и по-словам (префиксы слов). */
export function legalEntityNameMatchesQuery(name: string, queryRaw: string): boolean {
  const q = queryRaw.trim().toLowerCase();
  const qNorm = normalizeSearchableText(q);
  if (!qNorm) return true;
  const qTokens = qNorm.split(" ").filter(Boolean);
  const n = normalizeSearchableText(name);
  if (!n) return false;
  if (n.includes(qNorm)) return true;
  if (n === qNorm || n.startsWith(qNorm)) return true;
  const words = n.split(" ").filter(Boolean);
  return qTokens.every((t) => words.some((w) => w.startsWith(t)));
}
