/**
 * Типографика HTML-писем HAULZ: один шрифт (Inter, SIL OFL), без uppercase в CSS.
 */

export const HAULZ_EMAIL_FONT_URL =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap";

export const HAULZ_EMAIL_FONT_FAMILY =
  "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

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
  return "font-size:20px;font-weight:700;color:#fff;line-height:1.1;";
}

export function emailTileMetricSmStyle(): string {
  return "font-size:15px;font-weight:700;color:#fff;line-height:1.1;";
}

export function emailTileLabelStyle(): string {
  return "font-size:8px;color:rgba(255,255,255,0.95);margin-top:4px;line-height:1.35;font-weight:600;";
}

export function emailTileSublineStyle(): string {
  return "font-size:7px;color:rgba(255,255,255,0.85);margin-top:6px;line-height:1.35;font-weight:400;";
}

export function emailFinanceValueStyle(): string {
  return "font-size:18px;font-weight:700;color:#fff;line-height:1.1;";
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
