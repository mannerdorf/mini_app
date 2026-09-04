/**
 * Типографика HTML-писем HAULZ: Inter (SIL OFL — бесплатно для коммерции).
 * Fallback только system-ui / sans-serif — без Arial/Helvetica/Segoe.
 */

export const HAULZ_EMAIL_FONT_URL =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap";

export const HAULZ_EMAIL_FONT_FAMILY = "'Inter',system-ui,sans-serif";

export const HAULZ_EMAIL_HEAD_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${HAULZ_EMAIL_FONT_URL}" rel="stylesheet">`;

export function emailBodyStyle(extra = ""): string {
  return `margin:0;padding:0;background:#f3f4f6;font-family:${HAULZ_EMAIL_FONT_FAMILY};color:#1f2937;${extra}`;
}

/** Заголовки блоков письма — обычный регистр, без text-transform. */
export function emailSectionTitleStyle(): string {
  return "margin:0 0 7px;font-size:13px;font-weight:600;color:#374151;line-height:1.35;";
}

export function emailTableHeadCellStyle(): string {
  return "padding:8px 10px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;line-height:1.35;";
}

export function emailTableBodyCellStyle(): string {
  return "padding:10px;border-bottom:1px solid #f3f4f6;vertical-align:middle;font-size:13px;color:#111827;line-height:1.4;";
}

export function emailTileMetricStyle(): string {
  return "font-size:26px;font-weight:700;color:#fff;line-height:1.15;";
}

export function emailTileMetricSmStyle(): string {
  return "font-size:19px;font-weight:700;color:#fff;line-height:1.15;";
}

export function emailTileLabelStyle(): string {
  return "font-size:10px;color:rgba(255,255,255,0.95);margin-top:5px;line-height:1.35;font-weight:600;";
}

/** Сумма, вес, места, объём под подписью плитки. */
export function emailTileSublineStyle(): string {
  return "font-size:11px;color:rgba(255,255,255,0.9);margin-top:7px;line-height:1.45;font-weight:500;";
}

export function emailFinanceValueStyle(): string {
  return "font-size:22px;font-weight:700;color:#fff;line-height:1.15;";
}

/** Ключи ЭДО в данных — как в edoStatusServer; подпись в письме — единый стиль. */
export const EDO_DOC_DISPLAY_LABEL: Record<string, string> = {
  ЭР: "ЭР",
  АПП: "АПП",
  УПД: "УПД",
  СЧЕТ: "Счёт",
};

export function edoDocDisplayLabel(key: string): string {
  return EDO_DOC_DISPLAY_LABEL[key] ?? key;
}
