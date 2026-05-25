import type { Pool } from "pg";
import { getPaymentKey } from "./notificationPoll.js";

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

function cityToCode(city: unknown): string {
  const s = String(city ?? "").trim().toUpperCase();
  if (s.includes("МОСК") || s === "MSK" || s.includes("MOSCOW")) return "MSK";
  if (s.includes("КАЛИН") || s === "KGD" || s.includes("KALININGRAD")) return "KGD";
  return s.slice(0, 3);
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
  acceptedInPeriod: number;
  deliveredInPeriod: number;
  readyNow: number;
  inTransitNow: number;
  deliveringNow: number;
  lastMile: { selfPickup: number; delivery: number };
  pickupLogistics: { pickup: number; terminalTo: number };
  unpaidInvoices: { count: number; totalDebt: number; top: Array<{ number: string; date: string; sum: number }> };
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

  const perevozki = perevozkiRaw.filter((row) => {
    const item = row as Record<string, unknown>;
    const itemInnVal = perevozkiItemInn(item).replace(/\D/g, "").trim() || perevozkiItemInn(item).trim();
    return itemInnVal === innCanon || perevozkiItemInn(item).trim() === innCanon;
  }) as Record<string, unknown>[];

  let acceptedInPeriod = 0;
  let deliveredInPeriod = 0;
  let readyNow = 0;
  let inTransitNow = 0;
  let deliveringNow = 0;
  const lastMile = { selfPickup: 0, delivery: 0 };
  const pickupLogistics = { pickup: 0, terminalTo: 0 };

  for (const item of perevozki) {
    const status = getCargoStatusKey(item.State);
    const datePrih = normalizeDateOnly(item.DatePrih);
    const dateVr = normalizeDateOnly(item.DateVr);

    if (datePrih && datePrih >= dateFrom && datePrih <= dateTo) acceptedInPeriod += 1;
    if (status === "delivered" && dateVr && dateVr >= dateFrom && dateVr <= dateTo) deliveredInPeriod += 1;

    if (status === "ready") readyNow += 1;
    if (status === "in_transit") inTransitNow += 1;
    if (status === "delivering") deliveringNow += 1;

    if (cargoLastMileIsSelfPickup(item)) lastMile.selfPickup += 1;
    else lastMile.delivery += 1;
    if (cargoPickupLogisticsIsTerminalTo(item)) pickupLogistics.terminalTo += 1;
    else pickupLogistics.pickup += 1;
  }

  const unpaid: Array<{ number: string; date: string; sum: number }> = [];
  let totalDebt = 0;
  for (const row of invoicesRaw) {
    const inv = row as Record<string, unknown>;
    const invInn = invoiceInn(inv);
    if (invInn !== innCanon && invInn.replace(/\D/g, "") !== innCanon) continue;
    const payKey = getPaymentKey(String(inv.StateBill ?? inv.Status ?? inv.state ?? ""));
    if (payKey !== "unpaid") continue;
    const sum = invoiceSum(inv);
    totalDebt += sum;
    unpaid.push({ number: invoiceNumber(inv), date: invoiceDate(inv), sum });
  }
  unpaid.sort((a, b) => b.sum - a.sum);

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
    unpaidInvoices: {
      count: unpaid.length,
      totalDebt,
      top: unpaid.slice(0, 8),
    },
  };
}

function formatRuDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(n));
}

function kpiCard(label: string, value: number | string, color: string): string {
  return `
    <td style="padding:8px;vertical-align:top;width:25%;">
      <div style="background:${color};border-radius:12px;padding:16px 12px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#fff;line-height:1.1;">${value}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.9);margin-top:6px;">${label}</div>
      </div>
    </td>`;
}

export function renderWeeklySummaryHtml(data: WeeklySummaryData): string {
  const appUrl = "https://haulz.ru";
  const debtBlock =
    data.unpaidInvoices.count > 0
      ? `<p style="margin:12px 0 0;color:#b91c1c;font-weight:600;">Неоплаченных счетов: ${data.unpaidInvoices.count}, на сумму ${formatMoney(data.unpaidInvoices.totalDebt)} ₽</p>
         <ul style="margin:8px 0 0;padding-left:20px;font-size:13px;color:#444;">
           ${data.unpaidInvoices.top
             .map((i) => `<li>${i.number || "—"} · ${i.date ? formatRuDate(i.date) : "—"} · ${formatMoney(i.sum)} ₽</li>`)
             .join("")}
         </ul>`
      : `<p style="margin:12px 0 0;color:#059669;">Неоплаченных счетов нет.</p>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#fff;">
    <tr><td style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:24px 20px;color:#fff;">
      <div style="font-size:22px;font-weight:700;">HAULZ</div>
      <div style="font-size:14px;opacity:0.9;margin-top:4px;">Сводка за неделю</div>
    </td></tr>
    <tr><td style="padding:20px;">
      <p style="margin:0 0 8px;font-size:15px;">Здравствуйте!</p>
      <p style="margin:0 0 16px;font-size:14px;color:#4b5563;">
        <strong>${data.companyName || "Компания"}</strong> (ИНН ${data.inn})<br/>
        Период: <strong>${data.periodLabel}</strong>
      </p>
      <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:0.04em;">За период</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr>
          ${kpiCard("Принято", data.acceptedInPeriod, "#2563eb")}
          ${kpiCard("Доставлено", data.deliveredInPeriod, "#059669")}
        </tr>
      </table>
      <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:0.04em;">Сейчас в работе</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr>
          ${kpiCard("Готов к выдаче", data.readyNow, "#0d9488")}
          ${kpiCard("В пути", data.inTransitNow, "#ca8a04")}
          ${kpiCard("На доставке", data.deliveringNow, "#7c3aed")}
        </tr>
      </table>
      <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#374151;">Последняя миля</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr>
          ${kpiCard("Самовывоз", data.lastMile.selfPickup, "#1d4ed8")}
          ${kpiCard("Доставка", data.lastMile.delivery, "#4f46e5")}
        </tr>
      </table>
      <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#374151;">Заборная логистика</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr>
          ${kpiCard("PickUP", data.pickupLogistics.pickup, "#0369a1")}
          ${kpiCard("terminal-to", data.pickupLogistics.terminalTo, "#0f766e")}
        </tr>
      </table>
      <div style="background:#f9fafb;border-radius:10px;padding:14px 16px;border:1px solid #e5e7eb;">
        <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;">Финансы</div>
        ${debtBlock}
      </div>
      <p style="margin:20px 0 0;font-size:14px;">
        <a href="${appUrl}" style="color:#2563eb;font-weight:600;">Открыть личный кабинет HAULZ</a>
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">Письмо сформировано в песочнице HAULZ. Команда HAULZ</p>
    </td></tr>
  </table>
</body></html>`;
}

export async function sendWeeklySummaryEmail(
  pool: Pool,
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  const nodemailer = await import("nodemailer");
  const { getEmailSettings } = await import("./sendRegistrationEmail.js");
  const settings = await getEmailSettings(pool);
  if (!settings.smtp_host || !settings.from_email) {
    return { ok: false, error: "Настройки почты не заданы (SMTP)" };
  }
  const transporter = nodemailer.default.createTransport({
    host: settings.smtp_host,
    port: settings.smtp_port || 587,
    secure: settings.smtp_port === 465,
    auth:
      settings.smtp_user && settings.smtp_password
        ? { user: settings.smtp_user, pass: settings.smtp_password }
        : undefined,
  });
  try {
    await transporter.sendMail({
      from: settings.from_name ? `"${settings.from_name}" <${settings.from_email}>` : settings.from_email,
      to,
      subject,
      html,
    });
    return { ok: true };
  } catch (e: unknown) {
    const err = e as Error;
    return { ok: false, error: err?.message || "Ошибка отправки" };
  }
}
