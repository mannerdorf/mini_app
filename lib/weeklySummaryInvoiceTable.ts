/** Таблица счетов в письме «Отчёт» — стиль как в разделе «Документы → Счета». */

import { cargoPlannedDeliveryDateFromItem, normalizeCargoDateOnly } from "./cargoDateFilter.js";
import { formatCargoRoute } from "./cityToCode.js";
import { formatInvoiceMoney, invoiceBalance, invoiceSumPaid } from "./invoiceAmounts.js";
import { emailTableBodyCellStyle, emailTableHeadCellStyle } from "./emailTypography.js";

export type UnpaidInvoiceRow = {
  number: string;
  numberDisplay: string;
  date: string;
  dateDisplay: string;
  plannedDeliveryDate: string;
  plannedDeliveryDateDisplay: string;
  deliveryDate: string;
  deliveryDateDisplay: string;
  sum: number;
  sumPaid: number;
  balance: number;
  paymentStatus: string;
  deliveryStatus: string;
  route: string;
};

const DOW_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"] as const;

export function formatInvoiceNumberDisplay(s: string): string {
  const str = String(s ?? "").trim();
  if (!str) return "—";
  const withoutPrefix = str.replace(/^0000-/, "");
  return withoutPrefix.replace(/^0+/, "") || "0";
}

export function normalizeInvoiceStatusLabel(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.includes("оплачен") && !lower.includes("не") && !lower.includes("частично")) return "Оплачен";
  if (lower.includes("частично")) return "Оплачен частично";
  if (lower.includes("не") || lower.includes("неоплачен")) return "Не оплачен";
  return s;
}

function coerceCargoStatusDisplay(state: unknown): string {
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

function normalizeCargoStatusLabel(status: string): string {
  const s = status.trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.includes("поставлена на доставку")) return "На доставке";
  return s;
}

/** Как в разделе «Грузы»: дата доставки и статус счёта — только для доставленных перевозок. */
export function cargoIsDelivered(state: unknown): boolean {
  const label = normalizeCargoStatusLabel(coerceCargoStatusDisplay(state));
  const lower = label.toLowerCase();
  return lower.includes("доставлен") || lower.includes("заверш");
}

export function normCargoKey(num: string | null | undefined): string {
  if (num == null) return "";
  const s = String(num).replace(/^0000-/, "").trim().replace(/^0+/, "") || "0";
  return s;
}

function parseCargoNumbersFromText(text: string): Array<{ type: "text" | "cargo"; value: string }> {
  if (!text) return [];
  const parts: Array<{ type: "text" | "cargo"; value: string }> = [];
  const re = /(0000-\d{4,8}|\d{5,9})/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push({ type: "text", value: text.slice(lastIndex, m.index) });
    parts.push({ type: "cargo", value: m[1].replace(/^0000-/, "") });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) parts.push({ type: "text", value: text.slice(lastIndex) });
  return parts;
}

export function getFirstCargoNumberFromInvoice(inv: Record<string, unknown>): string | null {
  const list = Array.isArray(inv.List) ? (inv.List as Array<Record<string, unknown>>) : [];
  for (const row of list) {
    const text = String(row?.Operation ?? row?.Name ?? "").trim();
    if (!text) continue;
    const cargo = parseCargoNumbersFromText(text).find((p) => p.type === "cargo");
    if (cargo?.value) return cargo.value;
  }
  return null;
}

/** Все номера перевозок, связанные со счётом (List + первая строка). */
export function collectInvoiceLinkedCargoNumbers(inv: Record<string, unknown>): string[] {
  const cargoNums = new Set<string>();
  const first = getFirstCargoNumberFromInvoice(inv);
  if (first) cargoNums.add(first);
  const list = Array.isArray(inv.List) ? (inv.List as Array<Record<string, unknown>>) : [];
  for (const row of list) {
    const text = String(row?.Operation ?? row?.Name ?? "").trim();
    if (!text) continue;
    for (const part of parseCargoNumbersFromText(text)) {
      if (part.type === "cargo" && part.value) cargoNums.add(part.value);
    }
  }
  return [...cargoNums];
}

export function buildCargoStateByNumber(perevozkiItems: Record<string, unknown>[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of perevozkiItems) {
    const raw = String(c.Number ?? c.number ?? "")
      .replace(/^0000-/, "")
      .trim();
    if (!raw || c.State == null) continue;
    const display = normalizeCargoStatusLabel(coerceCargoStatusDisplay(c.State));
    if (!display) continue;
    const key = raw.replace(/^0+/, "") || raw;
    m.set(key, display);
    if (key !== raw) m.set(raw, display);
  }
  return m;
}

export function buildCargoRouteByNumber(perevozkiItems: Record<string, unknown>[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of perevozkiItems) {
    const raw = String(c.Number ?? c.number ?? "")
      .replace(/^0000-/, "")
      .trim();
    if (!raw) continue;
    const key = raw.replace(/^0+/, "") || raw;
    const route = formatCargoRoute(c.CitySender ?? c.citySender, c.CityReceiver ?? c.cityReceiver);
    if (!route) continue;
    m.set(key, route);
    if (key !== raw) m.set(raw, route);
  }
  return m;
}

/** Плановая дата прибытия на терминал по номеру груза. */
export function buildCargoPlannedDeliveryDateByNumber(
  perevozkiItems: Record<string, unknown>[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of perevozkiItems) {
    const raw = String(c.Number ?? c.number ?? "")
      .replace(/^0000-/, "")
      .trim();
    if (!raw) continue;
    const planDate = cargoPlannedDeliveryDateFromItem(c);
    if (!planDate) continue;
    const key = raw.replace(/^0+/, "") || raw;
    m.set(key, planDate);
    if (key !== raw) m.set(raw, planDate);
  }
  return m;
}

/** DateVr перевозки по номеру груза (дата доставки). */
export function buildCargoDeliveryDateByNumber(perevozkiItems: Record<string, unknown>[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of perevozkiItems) {
    const raw = String(c.Number ?? c.number ?? "")
      .replace(/^0000-/, "")
      .trim();
    if (!raw || !cargoIsDelivered(c.State)) continue;
    const dateVr = normalizeCargoDateOnly(c.DateVr);
    if (!dateVr || dateVr < "1990-01-01") continue;
    const key = raw.replace(/^0+/, "") || raw;
    m.set(key, dateVr);
    if (key !== raw) m.set(raw, dateVr);
  }
  return m;
}

export function formatShortInvoiceDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return iso;
  return `${DOW_SHORT[d.getDay()]}, ${m[3]}.${m[2]}`;
}

function paymentBadgeStyle(st: string): { bg: string; color: string } {
  if (st === "Оплачен") return { bg: "rgba(34, 197, 94, 0.2)", color: "#22c55e" };
  if (st === "Оплачен частично") return { bg: "rgba(234, 179, 8, 0.2)", color: "#ca8a04" };
  if (st === "Не оплачен") return { bg: "rgba(239, 68, 68, 0.2)", color: "#ef4444" };
  return { bg: "#f3f4f6", color: "#6b7280" };
}

function deliveryBadgeStyle(status: string): { bg: string; color: string } {
  const lower = status.toLowerCase();
  if (lower.includes("доставлен") || lower.includes("заверш")) return { bg: "rgba(34, 197, 94, 0.2)", color: "#22c55e" };
  if (lower.includes("доставке")) return { bg: "rgba(139, 92, 246, 0.2)", color: "#7c3aed" };
  if (lower.includes("готов")) return { bg: "rgba(16, 185, 129, 0.2)", color: "#059669" };
  if (lower.includes("пути") || lower.includes("отправлен")) return { bg: "rgba(234, 179, 8, 0.2)", color: "#ca8a04" };
  if (lower.includes("отменен") || lower.includes("аннулирован")) return { bg: "rgba(239, 68, 68, 0.2)", color: "#ef4444" };
  return { bg: "#f3f4f6", color: "#6b7280" };
}

function badgeHtml(label: string, style: { bg: string; color: string }, bordered = false): string {
  if (!label) return "—";
  const border = bordered ? "border:1px solid #2563eb;" : "border:none;";
  return `<span style="display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600;line-height:1.2;background:${style.bg};color:${style.color};${border}white-space:nowrap;">${label}</span>`;
}

export function buildUnpaidInvoiceRow(
  inv: Record<string, unknown>,
  cargoStateByNumber: Map<string, string>,
  cargoRouteByNumber: Map<string, string>,
  cargoPlannedDeliveryDateByNumber: Map<string, string>,
  cargoDeliveryDateByNumber: Map<string, string>,
  cargoSumPaidByNumber: Map<string, number>,
  invoiceDateIso: string,
  invoiceSum: number,
): UnpaidInvoiceRow {
  const number = String(inv.Number ?? inv.number ?? inv.Номер ?? "").trim();
  const cargoNum = getFirstCargoNumberFromInvoice(inv);
  const key = cargoNum ? normCargoKey(cargoNum) : "";
  const deliveryStatus = key ? cargoStateByNumber.get(key) || "" : "";
  const isDelivered = key ? cargoIsDelivered(deliveryStatus) : false;
  const paymentStatus =
    normalizeInvoiceStatusLabel(
      inv.StateBill ??
        inv.Status ??
        inv.State ??
        inv.state ??
        inv.Статус ??
        inv.status ??
        inv.PaymentStatus,
    ) || "";
  const route = key ? cargoRouteByNumber.get(key) || "" : "";
  const plannedDeliveryDate = key ? cargoPlannedDeliveryDateByNumber.get(key) || "" : "";
  const deliveryDate = isDelivered && key ? cargoDeliveryDateByNumber.get(key) || "" : "";

  return {
    number,
    numberDisplay: formatInvoiceNumberDisplay(number),
    date: invoiceDateIso,
    dateDisplay: formatShortInvoiceDate(invoiceDateIso),
    plannedDeliveryDate,
    plannedDeliveryDateDisplay: plannedDeliveryDate ? formatShortInvoiceDate(plannedDeliveryDate) : "",
    deliveryDate,
    deliveryDateDisplay: deliveryDate ? formatShortInvoiceDate(deliveryDate) : "",
    sum: invoiceSum,
    sumPaid: invoiceSumPaid(inv, cargoSumPaidByNumber, getFirstCargoNumberFromInvoice),
    balance: invoiceBalance(inv, cargoSumPaidByNumber, getFirstCargoNumberFromInvoice),
    paymentStatus,
    deliveryStatus,
    route,
  };
}

export function renderUnpaidInvoicesTableHtml(rows: UnpaidInvoiceRow[], totalCount: number): string {
  if (rows.length === 0) return "";

  const headCell = emailTableHeadCellStyle();
  const bodyCell = emailTableBodyCellStyle();

  const bodyRows = rows
    .map((r) => {
      const payStyle = paymentBadgeStyle(r.paymentStatus);
      const delStyle = deliveryBadgeStyle(r.deliveryStatus);
      const sum = formatInvoiceMoney(r.sum);
      const paid = formatInvoiceMoney(r.sumPaid);
      const balance = formatInvoiceMoney(r.balance);
      return `<tr>
        <td style="${bodyCell}font-weight:600;">${r.numberDisplay}</td>
        <td style="${bodyCell}color:#4b5563;white-space:nowrap;">${r.dateDisplay}</td>
        <td style="${bodyCell}color:#4b5563;white-space:nowrap;">${r.plannedDeliveryDateDisplay || ""}</td>
        <td style="${bodyCell}color:#4b5563;white-space:nowrap;">${r.deliveryDateDisplay || ""}</td>
        <td style="${bodyCell}">${r.paymentStatus ? badgeHtml(r.paymentStatus, payStyle) : ""}</td>
        <td style="${bodyCell}">${badgeHtml(r.deliveryStatus, delStyle)}</td>
        <td style="${bodyCell}">${r.route ? badgeHtml(r.route, { bg: "rgba(37,99,235,0.08)", color: "#2563eb" }, true) : "—"}</td>
        <td style="${bodyCell}text-align:right;font-weight:600;white-space:nowrap;">${sum} ₽</td>
        <td style="${bodyCell}text-align:right;white-space:nowrap;">${paid} ₽</td>
        <td style="${bodyCell}text-align:right;font-weight:600;white-space:nowrap;">${balance} ₽</td>
      </tr>`;
    })
    .join("");

  const more =
    totalCount > rows.length
      ? `<p style="margin:8px 0 0;font-size:12px;color:#6b7280;">Показано ${rows.length} из ${totalCount} счетов. Полный список — в личном кабинете.</p>`
      : "";

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="${headCell}">Номер</th>
          <th style="${headCell}">Дата счёта</th>
          <th style="${headCell}">Плановая дата прибытия на терминал</th>
          <th style="${headCell}">Дата доставки</th>
          <th style="${headCell}">Статус</th>
          <th style="${headCell}">Статус перевозки</th>
          <th style="${headCell}">Маршрут</th>
          <th style="${headCell}text-align:right;">Сумма</th>
          <th style="${headCell}text-align:right;">Оплачено</th>
          <th style="${headCell}text-align:right;">Остаток</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
    ${more}`;
}
