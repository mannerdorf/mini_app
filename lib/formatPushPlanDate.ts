/** Формат плановой даты для push: ДД.ММ.ГГГГ. */

export function formatPushPlanDateDisplay(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "—";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const ru = s.match(/^(\d{2})[./-](\d{2})[./-](\d{4})/);
  if (ru) return `${ru[1]}.${ru[2]}.${ru[3]}`;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime()) || parsed.getFullYear() <= 1901) return "—";
  const dd = String(parsed.getDate()).padStart(2, "0");
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const yyyy = String(parsed.getFullYear());
  return `${dd}.${mm}.${yyyy}`;
}
