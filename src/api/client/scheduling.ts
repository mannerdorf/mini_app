/** Графики работы и календарь оплат заказчиков. */

import { fetchJson, loginPasswordHeaders, type LoginPasswordAuth } from "./_base";

export type WorkScheduleRow = {
  inn: string;
  days_of_week: number[];
  work_start: string;
  work_end: string;
};

export type PaymentCalendarRow = {
  inn: string;
  days_to_pay: number;
  payment_weekdays?: number[];
};

export async function fetchCustomerWorkSchedules(
  auth: LoginPasswordAuth,
  inns: string[],
): Promise<{ items: WorkScheduleRow[] }> {
  const { ok, data } = await fetchJson<{ items?: WorkScheduleRow[]; error?: string }>("/api/customer-work-schedules", {
    method: "POST",
    headers: loginPasswordHeaders(auth),
    body: JSON.stringify({ login: auth.login, password: auth.password, inns }),
  });
  if (!ok) throw new Error(data.error || "Ошибка загрузки графиков");
  return { items: data.items ?? [] };
}

export async function fetchMyPaymentCalendar(auth: LoginPasswordAuth): Promise<{
  items: PaymentCalendarRow[];
  work_schedules: WorkScheduleRow[];
}> {
  const { ok, data } = await fetchJson<{
    items?: PaymentCalendarRow[];
    work_schedules?: WorkScheduleRow[];
    error?: string;
  }>("/api/my-payment-calendar", {
    method: "POST",
    headers: loginPasswordHeaders(auth),
    body: JSON.stringify({ login: auth.login, password: auth.password }),
  });
  if (!ok) throw new Error(data.error || "Ошибка загрузки календаря оплат");
  return { items: data.items ?? [], work_schedules: data.work_schedules ?? [] };
}
