/** Таблица счетов в письме «Самери» — стиль как в разделе «Документы → Счета». */

import { normalizeCargoDateOnly } from "./cargoDateFilter.js";

export type UnpaidInvoiceRow = {
  number: string;
  numberDisplay: string;
  date: string;
  dateDisplay: string;
  deliveryDate: string;
  deliveryDateDisplay: string;
  sum: number;
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

function cityToCode(city: unknown): string {
  const s = String(city ?? "").trim().toLowerCase();
  if (/калининград|кгд/.test(s)) return "KGD";
  if (/москва|мск|moscow/.test(s)) return "MSK";
  return String(city ?? "").trim().toUpperCase().slice(0, 3);
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
    const from = cityToCode(c.CitySender ?? c.citySender);
    const to = cityToCode(c.CityReceiver ?? c.cityReceiver);
    const route = [from, to].filter(Boolean).join(" – ");
    if (!route) continue;
    m.set(key, route);
    if (key !== raw) m.set(raw, route);
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
    if (!raw) continue;
    const dateVr = normalizeCargoDateOnly(c.DateVr);
    if (!dateVr) continue;
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
  cargoDeliveryDateByNumber: Map<string, string>,
  invoiceDateIso: string,
  invoiceSum: number,
): UnpaidInvoiceRow {
  const number = String(inv.Number ?? inv.number ?? inv.Номер ?? "").trim();
  const paymentStatus =
    normalizeInvoiceStatusLabel(
      inv.StateBill ?? inv.Status ?? inv.State ?? inv.state ?? inv.Статус ?? inv.PaymentStatus,
    ) || "Не оплачен";
  const cargoNum = getFirstCargoNumberFromInvoice(inv);
  const key = cargoNum ? normCargoKey(cargoNum) : "";
  const deliveryStatus = key ? cargoStateByNumber.get(key) || "" : "";
  const route = key ? cargoRouteByNumber.get(key) || "" : "";
  const deliveryDate = key ? cargoDeliveryDateByNumber.get(key) || "" : "";

  return {
    number,
    numberDisplay: formatInvoiceNumberDisplay(number),
    date: invoiceDateIso,
    dateDisplay: formatShortInvoiceDate(invoiceDateIso),
    deliveryDate,
    deliveryDateDisplay: deliveryDate ? formatShortInvoiceDate(deliveryDate) : "—",
    sum: invoiceSum,
    paymentStatus,
    deliveryStatus,
    route,
  };
}

export function renderUnpaidInvoicesTableHtml(rows: UnpaidInvoiceRow[], totalCount: number): string {
  if (rows.length === 0) return "";

  const headCell =
    "padding:8px 10px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.03em;border-bottom:1px solid #e5e7eb;";
  const bodyCell = "padding:10px;border-bottom:1px solid #f3f4f6;vertical-align:middle;font-size:13px;color:#111827;";

  const bodyRows = rows
    .map((r) => {
      const payStyle = paymentBadgeStyle(r.paymentStatus);
      const delStyle = deliveryBadgeStyle(r.deliveryStatus);
      const sum = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(r.sum));
      return `<tr>
        <td style="${bodyCell}font-weight:600;">${r.numberDisplay}</td>
        <td style="${bodyCell}color:#4b5563;white-space:nowrap;">${r.dateDisplay}</td>
        <td style="${bodyCell}color:#4b5563;white-space:nowrap;">${r.deliveryDateDisplay}</td>
        <td style="${bodyCell}">${badgeHtml(r.paymentStatus, payStyle)}</td>
        <td style="${bodyCell}">${badgeHtml(r.deliveryStatus, delStyle)}</td>
        <td style="${bodyCell}">${r.route ? badgeHtml(r.route, { bg: "rgba(37,99,235,0.08)", color: "#2563eb" }, true) : "—"}</td>
        <td style="${bodyCell}text-align:right;font-weight:600;white-space:nowrap;">${sum} ₽</td>
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
          <th style="${headCell}">Дата</th>
          <th style="${headCell}">Дата доставки</th>
          <th style="${headCell}">Статус</th>
          <th style="${headCell}">Статус перевозки</th>
          <th style="${headCell}">Маршрут</th>
          <th style="${headCell}text-align:right;">Сумма</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
    ${more}`;
}
