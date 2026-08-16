import { HAULZ_EMAIL_BRAND_BAR_ATTRS } from "../emailSummaryFooter.js";
import {
  emailBodyStyle,
  emailFinanceValueStyle,
  emailSectionTitleStyle,
  emailTableBodyCellStyle,
  emailTableHeadCellStyle,
  emailTileLabelStyle,
  HAULZ_EMAIL_HEAD_LINKS,
} from "../emailTypography.js";
import { HAULZ_LEGAL } from "../haulzLegal.js";
import { getAppUrl } from "../sendRegistrationEmail.js";
import { PVZ_CREATION_REQUIRED_NOTE } from "./orderAddressKind.js";
import { formatQuoteVatLine } from "./quoteVat.js";
import { HAULZ_WAREHOUSES } from "./warehouses.js";
import type {
  AddressSelection,
  DeliveryParty,
  Direction,
  MainlineMode,
  ParcelPlace,
  QuoteResult,
} from "./types.js";

export type QuoteProposalEmailInput = {
  quote: QuoteResult;
  from: AddressSelection;
  to: AddressSelection;
  places: ParcelPlace[];
  mainlineMode: MainlineMode;
  direction: Direction;
  dataZabora?: string;
  fromParty?: DeliveryParty;
  toParty?: DeliveryParty;
  /** Адрес не из справочника ПВЗ — нужно создать ПВЗ в 1С. */
  fromRequiresPvzCreation?: boolean;
  toRequiresPvzCreation?: boolean;
  recipientName?: string;
  /** Ссылка «согласовать перевозку» в письме КП (если черновик уже сохранён). */
  agreeUrl?: string;
};

const TILE_CELL_PAD = "6px";
const TILE_RADIUS = "8px";
const TILE_INNER_PAD = "14px 10px";

const DIRECTION_LABELS: Record<Direction, string> = {
  mow_kgd: "Москва — Калининград",
  kgd_mow: "Калининград — Москва",
};

const MAINLINE_LABELS: Record<MainlineMode, string> = {
  ferry: "Паром",
  auto: "Автоперевозка",
};

function formatMoney(n: number): string {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatRuDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function sectionTitle(text: string): string {
  return `<p style="${emailSectionTitleStyle()}">${escapeHtml(text)}</p>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function totalTile(value: string, label: string, sub?: string): string {
  return `
    <td style="padding:${TILE_CELL_PAD};vertical-align:top;width:100%;">
      <div style="background:#2563eb;border-radius:${TILE_RADIUS};padding:${TILE_INNER_PAD};text-align:center;">
        <div style="${emailFinanceValueStyle()}">${escapeHtml(value)}</div>
        <div style="${emailTileLabelStyle()}">${escapeHtml(label)}</div>
        ${sub ? `<div style="font-size:11px;color:rgba(255,255,255,0.9);margin-top:7px;line-height:1.45;">${escapeHtml(sub)}</div>` : ""}
      </div>
    </td>`;
}

function partyLegLabel(mode: "courier" | "point", leg: "from" | "to"): string {
  if (leg === "from") return mode === "point" ? "Отправка со склада HAULZ" : "Забор с адреса отправителя";
  return mode === "point" ? "Приём на склад HAULZ" : "Доставка до адреса получателя";
}

function renderPartyBlock(
  title: string,
  party: DeliveryParty | undefined,
  addr: AddressSelection,
  leg: "from" | "to",
  requiresPvzCreation?: boolean,
): string {
  const mode = party?.mode ?? "courier";
  const addressText = escapeHtml(addr.fullAddress || addr.label);
  const addressLine = requiresPvzCreation
    ? `<span style="color:#dc2626;font-weight:600;">${addressText}</span><br/><span style="color:#dc2626;font-size:12px;font-weight:600;">${escapeHtml(PVZ_CREATION_REQUIRED_NOTE)}</span>`
    : addressText;
  const lines: string[] = [`<strong>${escapeHtml(partyLegLabel(mode, leg))}</strong>`, addressLine];
  if (party?.companyName) lines.push(`Организация: ${escapeHtml(party.companyName)}`);
  if (party?.inn) lines.push(`ИНН: ${escapeHtml(party.inn)}`);
  if (party?.fullName) lines.push(`ФИО контактного лица: ${escapeHtml(party.fullName)}`);
  if (party?.phone) lines.push(`Тел.: ${escapeHtml(party.phone)}`);
  const boxStyle = requiresPvzCreation
    ? "margin-bottom:12px;padding:12px 14px;background:#fef2f2;border-radius:8px;border:1px solid #fecaca;"
    : "margin-bottom:12px;padding:12px 14px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;";
  return `
    <div style="${boxStyle}">
      <div style="font-size:12px;font-weight:600;color:#6b7280;margin-bottom:6px;">${escapeHtml(title)}</div>
      <div style="font-size:13px;color:#111827;line-height:1.5;">${lines.join("<br/>")}</div>
    </div>`;
}

function renderPlacesTable(places: ParcelPlace[]): string {
  const rows = places
    .map(
      (p, i) => `
    <tr>
      <td style="${emailTableBodyCellStyle()}">${i + 1}</td>
      <td style="${emailTableBodyCellStyle()}">${formatMoney(p.weightKg)} кг</td>
      <td style="${emailTableBodyCellStyle()}">${formatMoney(p.volumeM3)} м³</td>
    </tr>`,
    )
    .join("");
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <th style="${emailTableHeadCellStyle()}">Место</th>
        <th style="${emailTableHeadCellStyle()}">Вес</th>
        <th style="${emailTableHeadCellStyle()}">Объём</th>
      </tr>
      ${rows}
    </table>`;
}

function renderQuoteLinesTable(quote: QuoteResult): string {
  const rows = quote.lines
    .map(
      (l) => `
    <tr>
      <td style="${emailTableBodyCellStyle()}">${escapeHtml(l.label)}</td>
      <td style="${emailTableBodyCellStyle()};text-align:right;font-weight:600;">${formatMoney(l.amountRub)} ₽</td>
    </tr>`,
    )
    .join("");
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <th style="${emailTableHeadCellStyle()}">Услуга</th>
        <th style="${emailTableHeadCellStyle()};text-align:right;">Сумма</th>
      </tr>
      ${rows}
      <tr>
        <td style="${emailTableBodyCellStyle()};font-weight:700;">Итого</td>
        <td style="${emailTableBodyCellStyle()};text-align:right;font-weight:700;font-size:15px;">${formatMoney(quote.totalRub)} ₽</td>
      </tr>
      <tr>
        <td colspan="2" style="${emailTableBodyCellStyle()};font-size:12px;color:#6b7280;border-bottom:none;padding-top:4px;">
          ${escapeHtml(formatQuoteVatLine(quote.totalRub))}
        </td>
      </tr>
    </table>`;
}

function renderWarehousesBlock(): string {
  const blocks = (["moscow", "kaliningrad"] as const).map((city) => {
    const wh = HAULZ_WAREHOUSES[city];
    return `
      <div style="margin-bottom:10px;padding:12px 14px;background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;">
        <div style="font-size:13px;font-weight:600;color:#1e40af;">${escapeHtml(wh.label)}</div>
        <div style="margin-top:6px;font-size:12px;color:#1f2937;line-height:1.5;">
          ${escapeHtml(wh.fullAddress)}<br/>
          Режим работы: ${escapeHtml(wh.hours)}<br/>
          <a href="tel:${wh.phone.replace(/\s/g, "")}" style="color:#2563eb;">${escapeHtml(wh.phone)}</a>
          · <a href="mailto:${wh.email}" style="color:#2563eb;">${escapeHtml(wh.email)}</a>
        </div>
      </div>`;
  });
  return blocks.join("");
}

function renderQuoteProposalFooterHtml(): string {
  const appUrl = getAppUrl().replace(/\/$/, "");
  const phones = HAULZ_LEGAL.offices.map((o) => `${o.city}: ${o.phone}`).join(" · ");

  return `
    <tr><td ${HAULZ_EMAIL_BRAND_BAR_ATTRS}>
      <div style="font-size:22px;font-weight:700;line-height:1.2;">HAULZ</div>
      <div style="font-size:14px;opacity:0.9;margin-top:4px;">Логистика Москва ↔ Калининград</div>
      <div style="margin-top:14px;font-size:12px;line-height:1.55;opacity:0.92;">
        ${HAULZ_LEGAL.name} · ИНН ${HAULZ_LEGAL.inn} · ОГРН ${HAULZ_LEGAL.ogrn}<br/>
        ${HAULZ_LEGAL.address}
      </div>
      <div style="margin-top:8px;font-size:12px;line-height:1.55;opacity:0.92;">
        <a href="mailto:${HAULZ_LEGAL.email}" style="color:#fff;text-decoration:underline;">${HAULZ_LEGAL.email}</a>
        · <a href="https://${HAULZ_LEGAL.site}" style="color:#fff;text-decoration:underline;">${HAULZ_LEGAL.site}</a>
      </div>
      <div style="margin-top:6px;font-size:12px;line-height:1.55;opacity:0.88;">${phones}</div>
      <div style="margin-top:14px;font-size:13px;line-height:1.5;opacity:0.95;">
        Готовы уточнить детали, согласовать дату забора и закрепить тариф.<br/>
        <strong>Ответьте на это письмо или оформите заявку в личном кабинете.</strong>
      </div>
      <div style="margin-top:12px;font-size:13px;line-height:1.5;">
        <a href="${appUrl}" style="color:#fff;font-weight:600;text-decoration:underline;">Открыть личный кабинет HAULZ</a>
      </div>
      <div style="margin-top:12px;font-size:11px;line-height:1.45;opacity:0.8;">
        Предварительный расчёт не является публичной офертой. Итоговая стоимость уточняется при подтверждении параметров груза.
      </div>
    </td></tr>`;
}

export function renderHaulzQuoteProposalHtml(input: QuoteProposalEmailInput): string {
  const {
    quote,
    from,
    to,
    places,
    mainlineMode,
    direction,
    dataZabora,
    fromParty,
    toParty,
    fromRequiresPvzCreation,
    toRequiresPvzCreation,
  } = input;
  const ch = quote.chargeable;
  const dirLabel = DIRECTION_LABELS[direction] ?? direction;
  const mainlineLabel = MAINLINE_LABELS[mainlineMode] ?? mainlineMode;
  const deliveryHint = quote.deliveryDays ? `ориентировочно ${quote.deliveryDays} раб. дн.` : "";
  const dateLabel = dataZabora ? formatRuDate(dataZabora) : "по согласованию";

  const chargeSub = `${formatMoney(ch.chargeableWeightKg)} кг к расчёту · ${places.length} мест · ${formatMoney(ch.volumeM3)} м³`;
  const vatLine = formatQuoteVatLine(quote.totalRub);
  const totalTileSub = [deliveryHint || chargeSub, vatLine].filter(Boolean).join(" · ");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${HAULZ_EMAIL_HEAD_LINKS}</head>
<body style="${emailBodyStyle()}">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#fff;">
    <tr><td ${HAULZ_EMAIL_BRAND_BAR_ATTRS}>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:top;">
            <div style="font-size:22px;font-weight:700;">HAULZ</div>
            <div style="font-size:14px;opacity:0.9;margin-top:4px;">Коммерческое предложение</div>
          </td>
          <td style="vertical-align:top;text-align:right;font-size:13px;line-height:1.45;opacity:0.95;">
            <div style="font-weight:600;">${escapeHtml(dirLabel)}</div>
            <div style="margin-top:4px;">${escapeHtml(mainlineLabel)}</div>
          </td>
        </tr>
      </table>
    </td></tr>
    <tr><td style="padding:20px;">
      <p style="margin:0 0 8px;font-size:17px;font-weight:600;color:#111827;">Уважаемые партнёры!</p>
      <p style="margin:0 0 14px;font-size:14px;color:#4b5563;line-height:1.55;">
        Направляем предварительный расчёт по вашему запросу на перевозку груза по маршруту
        <strong>${escapeHtml(dirLabel)}</strong>. Ниже — условия, адреса и разбивка стоимости.
        Расчёт подготовлен с учётом фактического и объёмного веса (коэффициент ${ch.volumetricFactor} кг/м³).
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#4b5563;line-height:1.55;">
        HAULZ — специализированная логистика между Москвой и Калининградом: склады в обоих регионах,
        паромная и автомобильная магистраль, забор и доставка «до двери» или через терминалы.
        Поможем согласовать дату забора, упаковку и дополнительные услуги.
      </p>

      ${sectionTitle("Итого по расчёту")}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
        <tr>${totalTile(`${formatMoney(quote.totalRub)} ₽`, "Предварительная стоимость", totalTileSub)}</tr>
      </table>

      ${sectionTitle("Параметры перевозки")}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;font-size:13px;color:#374151;line-height:1.5;">
        <tr><td style="padding:4px 0;"><strong>Магистраль:</strong> ${escapeHtml(mainlineLabel)}</td></tr>
        <tr><td style="padding:4px 0;"><strong>Желаемая дата забора:</strong> ${escapeHtml(dateLabel)}</td></tr>
        <tr><td style="padding:4px 0;"><strong>Вес к расчёту:</strong> ${formatMoney(ch.chargeableWeightKg)} кг (факт ${formatMoney(ch.actualWeightKg)} кг, объёмный ${formatMoney(ch.volumeWeightKg)} кг)</td></tr>
      </table>

      ${sectionTitle("Груз")}
      ${renderPlacesTable(places)}

      ${sectionTitle("Маршрут")}
      ${renderPartyBlock("Откуда", fromParty, from, "from", fromRequiresPvzCreation)}
      ${renderPartyBlock("Куда", toParty, to, "to", toRequiresPvzCreation)}

      ${sectionTitle("Состав стоимости")}
      ${renderQuoteLinesTable(quote)}

      ${quote.warnings.length ? `<p style="margin:0 0 14px;font-size:12px;color:#b45309;line-height:1.45;">${quote.warnings.map((w) => escapeHtml(w)).join("<br/>")}</p>` : ""}

      ${sectionTitle("Наши склады и контакты")}
      ${renderWarehousesBlock()}

      <p style="margin:8px 0 0;font-size:14px;color:#4b5563;line-height:1.5;">
        С уважением к вашему бизнесу,<br/><strong>команда HAULZ</strong>
      </p>
    </td></tr>
    ${renderQuoteProposalFooterHtml()}
  </table>
</body></html>`;
}

export function quoteProposalEmailSubject(direction: Direction): string {
  const dir = DIRECTION_LABELS[direction] ?? "доставка";
  return `HAULZ — предварительный расчёт: ${dir}`;
}
