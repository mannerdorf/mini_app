/**
 * Admin API: email-шаблоны регистрации и сброса пароля.
 */

import { adminAuthHeaders } from "./auth";

export type AdminEmailTemplates = {
  email_template_registration: string;
  email_template_password_reset: string;
};

export async function fetchAdminEmailTemplates(adminToken: string): Promise<AdminEmailTemplates> {
  const res = await fetch("/api/admin-email-templates", { headers: adminAuthHeaders(adminToken) });
  const data = (await res.json().catch(() => ({}))) as Partial<AdminEmailTemplates> & { error?: string };
  if (res.status === 401) {
    const err = new Error("unauthorized") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  if (!res.ok) throw new Error(data.error || "Ошибка загрузки шаблонов");
  return {
    email_template_registration: data.email_template_registration ?? "",
    email_template_password_reset: data.email_template_password_reset ?? "",
  };
}

export async function saveAdminEmailTemplates(
  adminToken: string,
  templates: AdminEmailTemplates
): Promise<void> {
  const res = await fetch("/api/admin-email-templates", {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      email_template_registration: templates.email_template_registration.trim(),
      email_template_password_reset: templates.email_template_password_reset.trim(),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Ошибка сохранения");
}
