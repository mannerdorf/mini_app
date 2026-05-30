/**
 * Admin API: платёжный календарь и график работы заказчиков.
 */

import { adminAuthHeaders } from "./auth";

export type AdminPaymentCalendarItem = {
  inn: string;
  customer_name: string | null;
  days_to_pay: number;
  payment_weekdays: number[];
};

export type AdminWorkScheduleItem = {
  inn: string;
  customer_name: string | null;
  days_of_week: number[];
  work_start: string;
  work_end: string;
};

export type AdminPaymentCalendarSavePayload =
  | { inn: string; days_to_pay: number }
  | { inn: string; payment_weekdays: number[] }
  | { inns: string[]; days_to_pay: number }
  | { inns: string[]; payment_weekdays: number[] };

export type AdminWorkScheduleSavePayload =
  | { inn: string; days_of_week: number[] }
  | { inn: string; work_start: string }
  | { inn: string; work_end: string }
  | { inns: string[]; days_of_week?: number[]; work_start?: string; work_end?: string };

async function adminPostOk(adminToken: string, path: string, body: unknown): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Ошибка сохранения");
}

export async function fetchAdminPaymentCalendar(adminToken: string): Promise<AdminPaymentCalendarItem[]> {
  const res = await fetch("/api/admin-payment-calendar", { headers: adminAuthHeaders(adminToken) });
  const data = (await res.json().catch(() => ({}))) as {
    items?: Array<{
      inn: string;
      customer_name: string | null;
      days_to_pay: number;
      payment_weekdays?: number[];
    }>;
  };
  return (data.items || []).map((r) => ({
    inn: r.inn,
    customer_name: r.customer_name,
    days_to_pay: r.days_to_pay,
    payment_weekdays: Array.isArray(r.payment_weekdays) ? r.payment_weekdays.filter((d) => d >= 1 && d <= 5) : [],
  }));
}

export async function saveAdminPaymentCalendar(
  adminToken: string,
  payload: AdminPaymentCalendarSavePayload
): Promise<void> {
  await adminPostOk(adminToken, "/api/admin-payment-calendar", payload);
}

export async function fetchAdminWorkSchedule(adminToken: string): Promise<AdminWorkScheduleItem[]> {
  const res = await fetch("/api/admin-work-schedule", { headers: adminAuthHeaders(adminToken) });
  const data = (await res.json().catch(() => ({}))) as {
    items?: Array<{
      inn: string;
      customer_name: string | null;
      days_of_week?: number[];
      work_start?: string;
      work_end?: string;
    }>;
  };
  return (data.items || []).map((r) => ({
    inn: r.inn,
    customer_name: r.customer_name,
    days_of_week: Array.isArray(r.days_of_week) ? r.days_of_week.filter((d) => d >= 1 && d <= 7) : [1, 2, 3, 4, 5],
    work_start: String(r.work_start || "09:00").slice(0, 5),
    work_end: String(r.work_end || "18:00").slice(0, 5),
  }));
}

export async function saveAdminWorkSchedule(
  adminToken: string,
  payload: AdminWorkScheduleSavePayload
): Promise<void> {
  await adminPostOk(adminToken, "/api/admin-work-schedule", payload);
}
