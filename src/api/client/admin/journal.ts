/**
 * Admin API: журнал аудита, лог ошибок запросов, здоровье интеграций.
 */

import { adminAuthHeaders } from "./auth";

export type AdminAuditEntry = {
  id: number;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

export type AdminErrorLogEntry = {
  id: number;
  path: string;
  method: string;
  status_code: number;
  error_message: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

export type AdminIntegrationHealth = {
  telegram: {
    linked_total: number;
    active: number;
    pending: number;
    disabled: number;
    avg_lifetime_hours_active: number | null;
    avg_pending_hours: number | null;
    pin_email_sent: number;
    pin_email_failed: number;
    webhook_errors: number;
  };
  email_delivery: {
    registration: { sent: number; failed: number };
    password_reset: { sent: number; failed: number };
    telegram_pin: { sent: number; failed: number };
    api_errors: { register: number; reset: number; tg_webhook: number };
    sendlk: { sent: number; failed: number; skipped: number; bulk_runs: number };
    daily: Array<{
      day: string;
      registration_sent: number;
      registration_failed: number;
      password_reset_sent: number;
      password_reset_failed: number;
      telegram_pin_sent: number;
      telegram_pin_failed: number;
      total_sent: number;
      total_failed: number;
    }>;
  };
  voice_assistant: {
    linked_logins: number;
    linked_chats_unique: number;
    link_errors: number;
    max_link_errors: number;
    max_webhook_errors: number;
  };
};

export type AdminAuditLogQuery = {
  q?: string;
  action?: string;
  target_type?: string;
  from?: string;
  to?: string;
  limit?: number;
};

export type AdminErrorLogQuery = {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  limit?: number;
};

function buildQuery(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    sp.set(key, String(value));
  }
  const q = sp.toString();
  return q ? `?${q}` : "";
}

export function normalizeAdminIntegrationHealth(data: unknown): AdminIntegrationHealth | null {
  if (!data || typeof data !== "object" || (data as { error?: string }).error) return null;
  const d = data as Record<string, unknown>;
  const telegram = d.telegram as Record<string, unknown> | undefined;
  const emailDelivery = d.email_delivery as Record<string, unknown> | undefined;
  const voiceAssistant = d.voice_assistant as Record<string, unknown> | undefined;
  const registration = emailDelivery?.registration as Record<string, number> | undefined;
  const passwordReset = emailDelivery?.password_reset as Record<string, number> | undefined;
  const telegramPin = emailDelivery?.telegram_pin as Record<string, number> | undefined;
  const apiErrors = emailDelivery?.api_errors as Record<string, number> | undefined;
  const sendlk = emailDelivery?.sendlk as Record<string, number> | undefined;

  return {
    telegram: {
      linked_total: Number(telegram?.linked_total || 0),
      active: Number(telegram?.active || 0),
      pending: Number(telegram?.pending || 0),
      disabled: Number(telegram?.disabled || 0),
      avg_lifetime_hours_active:
        telegram?.avg_lifetime_hours_active == null ? null : Number(telegram.avg_lifetime_hours_active),
      avg_pending_hours: telegram?.avg_pending_hours == null ? null : Number(telegram.avg_pending_hours),
      pin_email_sent: Number(telegram?.pin_email_sent || 0),
      pin_email_failed: Number(telegram?.pin_email_failed || 0),
      webhook_errors: Number(telegram?.webhook_errors || 0),
    },
    email_delivery: {
      registration: {
        sent: Number(registration?.sent || 0),
        failed: Number(registration?.failed || 0),
      },
      password_reset: {
        sent: Number(passwordReset?.sent || 0),
        failed: Number(passwordReset?.failed || 0),
      },
      telegram_pin: {
        sent: Number(telegramPin?.sent || 0),
        failed: Number(telegramPin?.failed || 0),
      },
      api_errors: {
        register: Number(apiErrors?.register || 0),
        reset: Number(apiErrors?.reset || 0),
        tg_webhook: Number(apiErrors?.tg_webhook || 0),
      },
      sendlk: {
        sent: Number(sendlk?.sent || 0),
        failed: Number(sendlk?.failed || 0),
        skipped: Number(sendlk?.skipped || 0),
        bulk_runs: Number(sendlk?.bulk_runs || 0),
      },
      daily: Array.isArray(emailDelivery?.daily)
        ? (emailDelivery!.daily as Array<Record<string, unknown>>).map((row) => ({
            day: String(row?.day || ""),
            registration_sent: Number(row?.registration_sent || 0),
            registration_failed: Number(row?.registration_failed || 0),
            password_reset_sent: Number(row?.password_reset_sent || 0),
            password_reset_failed: Number(row?.password_reset_failed || 0),
            telegram_pin_sent: Number(row?.telegram_pin_sent || 0),
            telegram_pin_failed: Number(row?.telegram_pin_failed || 0),
            total_sent: Number(row?.total_sent || 0),
            total_failed: Number(row?.total_failed || 0),
          }))
        : [],
    },
    voice_assistant: {
      linked_logins: Number(voiceAssistant?.linked_logins || 0),
      linked_chats_unique: Number(voiceAssistant?.linked_chats_unique || 0),
      link_errors: Number(voiceAssistant?.link_errors || 0),
      max_link_errors: Number(voiceAssistant?.max_link_errors || 0),
      max_webhook_errors: Number(voiceAssistant?.max_webhook_errors || 0),
    },
  };
}

export async function fetchAdminAuditLog(
  adminToken: string,
  query: AdminAuditLogQuery = {}
): Promise<AdminAuditEntry[]> {
  const suffix = buildQuery({
    limit: query.limit ?? 200,
    q: query.q?.trim(),
    action: query.action,
    target_type: query.target_type,
    from: query.from,
    to: query.to,
  });
  const res = await fetch(`/api/admin-audit-log${suffix}`, {
    headers: adminAuthHeaders(adminToken),
  });
  const data = (await res.json().catch(() => ({}))) as { entries?: AdminAuditEntry[] };
  return data.entries || [];
}

export async function fetchAdminRequestErrorLog(
  adminToken: string,
  query: AdminErrorLogQuery = {}
): Promise<AdminErrorLogEntry[]> {
  const suffix = buildQuery({
    limit: query.limit ?? 200,
    q: query.q?.trim(),
    status: query.status,
    from: query.from,
    to: query.to,
  });
  const res = await fetch(`/api/admin-request-error-log${suffix}`, {
    headers: adminAuthHeaders(adminToken),
  });
  const data = (await res.json().catch(() => ({}))) as { entries?: AdminErrorLogEntry[] };
  return data.entries || [];
}

export async function fetchAdminIntegrationHealth(
  adminToken: string,
  days: number
): Promise<AdminIntegrationHealth | null> {
  const res = await fetch(`/api/admin-integration-health?days=${days}`, {
    headers: adminAuthHeaders(adminToken),
  });
  const data = await res.json().catch(() => ({}));
  return normalizeAdminIntegrationHealth(data);
}
