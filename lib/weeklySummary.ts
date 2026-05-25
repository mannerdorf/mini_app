import type { Pool } from "pg";
import {
  aggregateInvoiceEdoDocStats,
  INVOICE_EDO_DOC_LABELS,
  type InvoiceEdoDocLabel,
} from "./edoStatusServer.js";
import {
  buildCargoSumPaidByNumber,
  invoiceBalance,
  invoiceDocSum,
  isOutstandingFinanceInvoice,
} from "./invoiceAmounts.js";
import { getInvoicePaymentFilterKey } from "./invoicePaymentFilter.js";
import { cityToCode } from "./cityToCode.js";
import { HAULZ_EMAIL_BRAND_BAR_ATTRS, renderWeeklySummaryFooterHtml } from "./emailSummaryFooter.js";
import {
  emailBodyStyle,
  emailFinanceValueStyle,
  emailSectionTitleStyle,
  emailTileLabelStyle,
  emailTileMetricSmStyle,
  emailTileMetricStyle,
  emailTileSublineStyle,
  edoDocDisplayLabel,
  HAULZ_EMAIL_HEAD_LINKS,
} from "./emailTypography.js";
import {
  buildCargoPlannedDeliveryDateByNumber,
  buildCargoDeliveryDateByNumber,
  buildCargoRouteByNumber,
  buildCargoStateByNumber,
  buildUnpaidInvoiceRow,
  getFirstCargoNumberFromInvoice,
  renderUnpaidInvoicesTableHtml,
  type UnpaidInvoiceRow,
} from "./weeklySummaryInvoiceTable.js";

function perevozkiItemInn(item: Record<string, unknown>): string {
  const v =
    item.INN ??
    item.Inn ??
    item.inn ??
    item.CustomerINN ??
    item.CustomerInn ??
    item.customerInn ??
    item.INNCustomer ??
    item.InnCustomer ??
    item.ЗаказчикИНН ??
    "";
  return String(v).trim();
}

const MSK_KGD_SELF_PICKUP_RECEIVER_ID = "d5d52d44-c5d9-11f0-9e9d-0cc47a39bad5";
const KGD_MSK_SELF_PICKUP_RECEIVER_ID = "419df7bb-4874-11f1-9e9f-0cc47a39bad5";

function normalizeDateOnly(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const ruMatch = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ruMatch) return `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}`;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().split("T")[0];
}

function formatIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Прошлая календарная неделя (пн–вс). */
export function getPreviousCalendarWeekRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const daysToMonday = (now.getDay() + 6) % 7;
  const thisMonday = new Date(now);
  thisMonday.setHours(0, 0, 0, 0);
  thisMonday.setDate(now.getDate() - daysToMonday);
  const prevMonday = new Date(thisMonday);
  prevMonday.setDate(thisMonday.getDate() - 7);
  const prevSunday = new Date(prevMonday);
  prevSunday.setDate(prevMonday.getDate() + 6);
  return { dateFrom: formatIsoDate(prevMonday), dateTo: formatIsoDate(prevSunday) };
}

function normalizeStatus(state: unknown): string {
  if (state == null) return "";
  if (typeof state === "string") return state.trim();
  if (typeof state === "object") {
    const o = state as Record<string, unknown>;
    for (const k of ["Name", "name", "Value", "value", "State", "state", "Статус"]) {
      const v = o[k];
      if (v != null && typeof v !== "object") return String(v).trim();
    }
  }
  return String(state).trim();
}

type CargoStatusKey = "delivered" | "in_transit" | "ready" | "delivering" | "other";

function getCargoStatusKey(state: unknown): CargoStatusKey {
  const s = normalizeStatus(state).toLowerCase();
  if (!s) return "other";
  if (s.includes("доставлен") || s.includes("заверш")) return "delivered";
  if (s.includes("пути") || s.includes("отправлен")) return "in_transit";
  if (s.includes("готов")) return "ready";
  if (s.includes("доставке")) return "delivering";
  return "other";
}

function normalizePzvText(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function cargoLastMileIsSelfPickup(item: Record<string, unknown>): boolean {
  const receiverId = String(item.PZV_Receiver_Id ?? "").trim().toLowerCase();
  const pzvReceiver = normalizePzvText(item.PZV_Receiver);
  const from = cityToCode(item.CitySender);
  const to = cityToCode(item.CityReceiver);
  if (from === "MSK" && to === "KGD") {
    return receiverId === MSK_KGD_SELF_PICKUP_RECEIVER_ID || pzvReceiver.includes("железнодорожная");
  }
  if (from === "KGD" && to === "MSK") {
    return receiverId === KGD_MSK_SELF_PICKUP_RECEIVER_ID || pzvReceiver.includes("андреевское");
  }
  return false;
}

function cargoPickupLogisticsIsTerminalTo(item: Record<string, unknown>): boolean {
  const pzvSender = normalizePzvText(item.PZV_Sender);
  const from = cityToCode(item.CitySender);
  const to = cityToCode(item.CityReceiver);
  if (from === "MSK" && to === "KGD") return pzvSender.includes("андреевское");
  if (from === "KGD" && to === "MSK") return pzvSender.includes("железнодорожная");
  return false;
}

function invoiceInn(item: Record<string, unknown>): string {
  const v = item.INN ?? item.Inn ?? item.inn ?? "";
  return String(v).replace(/\D/g, "").trim() || String(v).trim();
}

function invoiceMatchesInn(item: Record<string, unknown>, innCanon: string): boolean {
  const invInn = invoiceInn(item);
  return invInn === innCanon || invInn.replace(/\D/g, "") === innCanon;
}

function invoiceSum(item: Record<string, unknown>): number {
  const v = item.SumDoc ?? item.Sum ?? item.sum ?? item.Amount ?? 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function invoiceNumber(item: Record<string, unknown>): string {
  return String(item.Number ?? item.number ?? item.Номер ?? "").trim();
}

function invoiceDate(item: Record<string, unknown>): string {
  return normalizeDateOnly(item.DateDoc ?? item.Date ?? item.date);
}

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export type GroupMetrics = {
  count: number;
  mest: number;
  pw: number;
  w: number;
  vol: number;
  sum: number;
};

function emptyMetrics(): GroupMetrics {
  return { count: 0, mest: 0, pw: 0, w: 0, vol: 0, sum: 0 };
}

function addCargoMetrics(m: GroupMetrics, item: Record<string, unknown>): void {
  m.count += 1;
  m.mest += toNum(item.Mest);
  m.pw += toNum(item.PW);
  m.w += toNum(item.W);
  m.vol += toNum(item.Value ?? item.Volume ?? item.V);
  m.sum += toNum(item.Sum);
}

async function loadCacheJson(pool: Pool, table: string): Promise<unknown[]> {
  try {
    const { rows } = await pool.query<{ data: unknown }>(`SELECT data FROM ${table} WHERE id = 1`);
    const data = rows[0]?.data;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export type WeeklySummaryData = {
  companyName: string;
  inn: string;
  targetLogin: string;
  dateFrom: string;
  dateTo: string;
  periodLabel: string;
  acceptedInPeriod: GroupMetrics;
  deliveredInPeriod: GroupMetrics;
  readyNow: GroupMetrics;
  inTransitNow: GroupMetrics;
  deliveringNow: GroupMetrics;
  lastMile: { selfPickup: GroupMetrics; delivery: GroupMetrics };
  pickupLogistics: { pickup: GroupMetrics; terminalTo: GroupMetrics };
  edoByDoc: Record<InvoiceEdoDocLabel, { signed: number; total: number }>;
  unpaidInvoices: { count: number; totalDebt: number; rows: UnpaidInvoiceRow[] };
};

export async function buildWeeklySummaryData(
  pool: Pool,
  params: { inn: string; companyName: string; targetLogin: string; dateFrom: string; dateTo: string },
): Promise<WeeklySummaryData> {
  const innCanon = String(params.inn ?? "").replace(/\D/g, "").trim() || String(params.inn ?? "").trim();
  const dateFrom = params.dateFrom;
  const dateTo = params.dateTo;

  const perevozkiRaw = await loadCacheJson(pool, "cache_perevozki");
  const invoicesRaw = await loadCacheJson(pool, "cache_invoices");

  const perevozkiAllInn = perevozkiRaw.filter((row) => {
    const item = row as Record<string, unknown>;
    const itemInnVal = perevozkiItemInn(item).replace(/\D/g, "").trim() || perevozkiItemInn(item).trim();
    return itemInnVal === innCanon || perevozkiItemInn(item).trim() === innCanon;
  }) as Record<string, unknown>[];

  const cargoStateByNumber = buildCargoStateByNumber(perevozkiAllInn);
  const cargoRouteByNumber = buildCargoRouteByNumber(perevozkiAllInn);
  const cargoPlannedDeliveryDateByNumber = buildCargoPlannedDeliveryDateByNumber(perevozkiAllInn);
  const cargoDeliveryDateByNumber = buildCargoDeliveryDateByNumber(perevozkiAllInn);
  const cargoSumPaidByNumber = buildCargoSumPaidByNumber(perevozkiAllInn);

  const acceptedInPeriod = emptyMetrics();
  const deliveredInPeriod = emptyMetrics();
  const readyNow = emptyMetrics();
  const inTransitNow = emptyMetrics();
  const deliveringNow = emptyMetrics();
  const lastMile = { selfPickup: emptyMetrics(), delivery: emptyMetrics() };
  const pickupLogistics = { pickup: emptyMetrics(), terminalTo: emptyMetrics() };

  for (const item of perevozkiAllInn) {
    const status = getCargoStatusKey(item.State);
    const datePrih = normalizeDateOnly(item.DatePrih);
    const dateVr = normalizeDateOnly(item.DateVr);

    if (datePrih && datePrih >= dateFrom && datePrih <= dateTo) {
      addCargoMetrics(acceptedInPeriod, item);
      if (cargoPickupLogisticsIsTerminalTo(item)) addCargoMetrics(pickupLogistics.terminalTo, item);
      else addCargoMetrics(pickupLogistics.pickup, item);
    }
    if (status === "delivered" && dateVr && dateVr >= dateFrom && dateVr <= dateTo) {
      addCargoMetrics(deliveredInPeriod, item);
      if (cargoLastMileIsSelfPickup(item)) addCargoMetrics(lastMile.selfPickup, item);
      else addCargoMetrics(lastMile.delivery, item);
    }
  }

  // Срез «в работе» — текущий статус на день формирования письма (не по периоду отчёта).
  for (const item of perevozkiAllInn) {
    const status = getCargoStatusKey(item.State);
    if (status === "ready") addCargoMetrics(readyNow, item);
    if (status === "in_transit") addCargoMetrics(inTransitNow, item);
    if (status === "delivering") addCargoMetrics(deliveringNow, item);
  }

  const invoicesInPeriod: Record<string, unknown>[] = [];
  const unpaidRows: UnpaidInvoiceRow[] = [];
  let totalDebt = 0;

  for (const row of invoicesRaw) {
    const inv = row as Record<string, unknown>;
    if (!invoiceMatchesInn(inv, innCanon)) continue;
    const d = invoiceDate(inv);
    if (!d || d < dateFrom || d > dateTo) continue;
    invoicesInPeriod.push(inv);
    if (!isOutstandingFinanceInvoice(inv, cargoSumPaidByNumber, getFirstCargoNumberFromInvoice)) continue;
    const sum = invoiceDocSum(inv);
    totalDebt += invoiceBalance(inv, cargoSumPaidByNumber, getFirstCargoNumberFromInvoice);
    unpaidRows.push(
      buildUnpaidInvoiceRow(
        inv,
        cargoStateByNumber,
        cargoRouteByNumber,
        cargoPlannedDeliveryDateByNumber,
        cargoDeliveryDateByNumber,
        cargoSumPaidByNumber,
        d,
        sum,
      ),
    );
  }
  unpaidRows.sort((a, b) => b.balance - a.balance);

  const edoByDoc = aggregateInvoiceEdoDocStats(invoicesInPeriod);

  const fromLabel = formatRuDate(dateFrom);
  const toLabel = formatRuDate(dateTo);

  return {
    companyName: params.companyName,
    inn: innCanon,
    targetLogin: params.targetLogin,
    dateFrom,
    dateTo,
    periodLabel: `${fromLabel} — ${toLabel}`,
    acceptedInPeriod,
    deliveredInPeriod,
    readyNow,
    inTransitNow,
    deliveringNow,
    lastMile,
    pickupLogistics,
    edoByDoc,
    unpaidInvoices: {
      count: unpaidRows.length,
      totalDebt,
      rows: unpaidRows.slice(0, 15),
    },
  };
}

function formatRuDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatVol(n: number): string {
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function metricsSubline(m: GroupMetrics): string {
  return `${formatMoney(m.sum)} ₽ · ${Math.round(m.pw)} кг · ${Math.round(m.mest)} мест<br/>${Math.round(m.w)} кг · ${formatVol(m.vol)} м³`;
}

const TILE_CELL_PAD = "6px";
const TILE_RADIUS = "8px";
const TILE_INNER_PAD = "14px 10px";

function sectionTitle(text: string): string {
  return `<p style="${emailSectionTitleStyle()}">${text}</p>`;
}

function kpiCard(label: string, m: GroupMetrics, color: string, width = "25%"): string {
  return `
    <td style="padding:${TILE_CELL_PAD};vertical-align:top;width:${width};">
      <div style="background:${color};border-radius:${TILE_RADIUS};padding:${TILE_INNER_PAD};text-align:center;">
        <div style="${emailTileMetricStyle()}">${m.count}</div>
        <div style="${emailTileLabelStyle()}">${label}</div>
        <div style="${emailTileSublineStyle()}">${metricsSubline(m)}</div>
      </div>
    </td>`;
}

function financeCard(label: string, value: string, color: string): string {
  return `
    <td style="padding:${TILE_CELL_PAD};vertical-align:top;width:50%;">
      <div style="background:${color};border-radius:${TILE_RADIUS};padding:${TILE_INNER_PAD};text-align:center;">
        <div style="${emailFinanceValueStyle()}">${value}</div>
        <div style="${emailTileLabelStyle()}">${label}</div>
      </div>
    </td>`;
}

function edoCard(label: string, agg: { signed: number; total: number }, color: string): string {
  const main = agg.total > 0 ? `${agg.signed} / ${agg.total}` : "0";
  const pct = agg.total > 0 ? Math.round((agg.signed / agg.total) * 100) : 0;
  const subLabel = label === "СЧЕТ" ? "Получено" : "Подписано";
  const sub = agg.total > 0 ? `${subLabel} ${pct}%` : "Нет статусов";
  const title = edoDocDisplayLabel(label);
  return `
    <td style="padding:${TILE_CELL_PAD};vertical-align:top;width:25%;">
      <div style="background:${color};border-radius:${TILE_RADIUS};padding:10px 7px;text-align:center;">
        <div style="${emailTileMetricSmStyle()}">${main}</div>
        <div style="${emailTileLabelStyle()}">${title}</div>
        <div style="${emailTileSublineStyle()}">${sub}</div>
      </div>
    </td>`;
}

const EDO_COLORS: Record<InvoiceEdoDocLabel, string> = {
  ЭР: "#0f766e",
  АПП: "#0369a1",
  УПД: "#4f46e5",
  СЧЕТ: "#7c3aed",
};

export function renderWeeklySummaryHtml(data: WeeklySummaryData): string {
  const companyHeader = data.companyName
    ? `${data.companyName}${data.inn ? ` (ИНН ${data.inn})` : ""}`
    : data.inn
      ? `ИНН ${data.inn}`
      : "Компания";

  const hasUnpaidDebt = data.unpaidInvoices.count > 0 || data.unpaidInvoices.totalDebt > 0;
  const financeTileCountColor = hasUnpaidDebt ? "#b91c1c" : "#059669";
  const financeTileSumColor = hasUnpaidDebt ? "#dc2626" : "#16a34a";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${HAULZ_EMAIL_HEAD_LINKS}</head>
<body style="${emailBodyStyle()}">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#fff;">
    <tr><td ${HAULZ_EMAIL_BRAND_BAR_ATTRS}>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:top;">
            <div style="font-size:22px;font-weight:700;">HAULZ</div>
            <div style="font-size:14px;opacity:0.9;margin-top:4px;">Сводка за неделю</div>
          </td>
          <td style="vertical-align:top;text-align:right;font-size:13px;line-height:1.45;opacity:0.95;">
            <div style="font-weight:600;">${companyHeader}</div>
            <div style="margin-top:4px;">Период: ${data.periodLabel}</div>
          </td>
        </tr>
      </table>
    </td></tr>
    <tr><td style="padding:20px;">
      <p style="margin:0 0 8px;font-size:17px;font-weight:600;color:#111827;">Добрый день, партнёры!</p>
      <p style="margin:0 0 16px;font-size:14px;color:#4b5563;line-height:1.5;">
        Краткая сводка по вашим перевозкам и документам за прошедшую неделю.
      </p>

      ${sectionTitle("За период")}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:11px;">
        <tr>
          ${kpiCard("Принято", data.acceptedInPeriod, "#2563eb", "50%")}
          ${kpiCard("Доставлено", data.deliveredInPeriod, "#059669", "50%")}
        </tr>
      </table>

      ${sectionTitle("Последняя миля")}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:11px;">
        <tr>
          ${kpiCard("Самовывоз", data.lastMile.selfPickup, "#1d4ed8", "50%")}
          ${kpiCard("Доставка", data.lastMile.delivery, "#4f46e5", "50%")}
        </tr>
      </table>

      ${sectionTitle("Заборная логистика")}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:11px;">
        <tr>
          ${kpiCard("Pickup", data.pickupLogistics.pickup, "#0369a1", "50%")}
          ${kpiCard("Terminal-to", data.pickupLogistics.terminalTo, "#0f766e", "50%")}
        </tr>
      </table>

      ${sectionTitle("Сейчас в работе")}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:11px;">
        <tr>
          ${kpiCard("Готов к выдаче", data.readyNow, "#0d9488", "33%")}
          ${kpiCard("В пути", data.inTransitNow, "#ca8a04", "33%")}
          ${kpiCard("На доставке", data.deliveringNow, "#7c3aed", "34%")}
        </tr>
      </table>

      ${sectionTitle("ЭДО за период")}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:11px;">
        <tr>
          ${INVOICE_EDO_DOC_LABELS.map((label) => edoCard(label, data.edoByDoc[label], EDO_COLORS[label])).join("")}
        </tr>
      </table>

      ${sectionTitle("Финансы")}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
        <tr>
          ${financeCard("Счетов", String(data.unpaidInvoices.count), financeTileCountColor)}
          ${financeCard("Остаток", `${formatMoney(data.unpaidInvoices.totalDebt)} ₽`, financeTileSumColor)}
        </tr>
      </table>
      ${renderUnpaidInvoicesTableHtml(data.unpaidInvoices.rows, data.unpaidInvoices.count)}

    </td></tr>
    ${renderWeeklySummaryFooterHtml(data.targetLogin)}
  </table>
</body></html>`;
}

export async function sendWeeklySummaryEmail(
  pool: Pool,
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  const { isSummaryEmailUnsubscribed } = await import("./haulzSummaryUnsubscribe.js");
  if (await isSummaryEmailUnsubscribed(pool, to)) {
    return { ok: false, error: "Получатель отписан от рассылки" };
  }
  const { sendHaulzEmail } = await import("./sendRegistrationEmail.js");
  return sendHaulzEmail(pool, { to, subject, html });
}
