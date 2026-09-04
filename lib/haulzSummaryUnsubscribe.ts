import crypto from "crypto";
import type { Pool } from "pg";
import { getAppUrl } from "./sendRegistrationEmail.js";

function unsubscribeSecret(): string {
  return (
    process.env.HAULZ_SUMMARY_UNSUBSCRIBE_SECRET?.trim()
    || process.env.ADMIN_TOKEN_SECRET?.trim()
    || "haulz-admin"
  );
}

export function normalizeSummaryEmail(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}

function signEmail(email: string): string {
  return crypto.createHmac("sha256", unsubscribeSecret()).update(email).digest("base64url").slice(0, 22);
}

export function buildSummaryUnsubscribeToken(email: string): string {
  const norm = normalizeSummaryEmail(email);
  const payload = Buffer.from(norm, "utf8").toString("base64url");
  return `${payload}.${signEmail(norm)}`;
}

export function verifySummaryUnsubscribeToken(token: string): string | null {
  const raw = String(token ?? "").trim();
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  let email = "";
  try {
    email = Buffer.from(payload, "base64url").toString("utf8").trim().toLowerCase();
  } catch {
    return null;
  }
  if (!email.includes("@") || email.length > 254) return null;
  if (sig !== signEmail(email)) return null;
  return email;
}

export function buildSummaryUnsubscribeUrl(email: string): string {
  const base = getAppUrl().replace(/\/$/, "");
  const token = buildSummaryUnsubscribeToken(email);
  return `${base}/api/haulz-summary-unsubscribe?token=${encodeURIComponent(token)}`;
}

export async function loadUnsubscribedSummaryEmails(pool: Pool): Promise<Set<string>> {
  try {
    const { rows } = await pool.query<{ email: string }>(
      `SELECT lower(trim(email)) AS email FROM haulz_summary_unsubscribe`,
    );
    return new Set(rows.map((r) => r.email).filter(Boolean));
  } catch {
    return new Set();
  }
}

export async function isSummaryEmailUnsubscribed(pool: Pool, email: string): Promise<boolean> {
  const norm = normalizeSummaryEmail(email);
  if (!norm) return false;
  try {
    const { rows } = await pool.query<{ n: number }>(
      `SELECT 1 AS n FROM haulz_summary_unsubscribe WHERE lower(trim(email)) = $1 LIMIT 1`,
      [norm],
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function unsubscribeSummaryEmail(pool: Pool, email: string): Promise<void> {
  const norm = normalizeSummaryEmail(email);
  if (!norm) throw new Error("Некорректный email");
  await pool.query(
    `INSERT INTO haulz_summary_unsubscribe (email, unsubscribed_at)
     VALUES ($1, now())
     ON CONFLICT (email) DO UPDATE SET unsubscribed_at = now()`,
    [norm],
  );
}

export function renderUnsubscribeResultHtml(ok: boolean, message: string): string {
  const title = ok ? "Вы отписаны" : "Ошибка";
  const color = ok ? "#059669" : "#b91c1c";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title></head>
<body style="margin:0;padding:24px;font-family:system-ui,sans-serif;background:#f3f4f6;color:#1f2937;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
    <h1 style="margin:0 0 12px;font-size:20px;color:${color};">${title}</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">${message}</p>
    <a href="${getAppUrl()}" style="color:#2563eb;font-weight:600;text-decoration:none;">Перейти на haulz.space</a>
  </div>
</body></html>`;
}
