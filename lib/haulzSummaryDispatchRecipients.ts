import type { Pool } from "pg";
import type { SummaryCronRecipient } from "./haulzSummaryCron.js";

export type DispatchRecipientStatus =
  | "pending"
  | "sent"
  | "failed"
  | "skipped_unsubscribed"
  | "skipped_daily_limit"
  | "skipped_prefs"
  | "cancelled";

export type DispatchRecipientRow = {
  id: number;
  targetLogin: string;
  inn: string;
  companyName: string;
  reasons: string[];
  status: DispatchRecipientStatus;
  error: string | null;
  messageId: string | null;
  sentAt: string | null;
  openCount: number;
  clickCount: number;
};

function mapRow(row: Record<string, unknown>): DispatchRecipientRow {
  const reasonsRaw = row.reasons;
  const reasons = Array.isArray(reasonsRaw)
    ? reasonsRaw.map((x) => String(x))
    : [];
  return {
    id: Number(row.id),
    targetLogin: String(row.target_login ?? ""),
    inn: String(row.inn ?? ""),
    companyName: String(row.company_name ?? ""),
    reasons,
    status: String(row.status ?? "pending") as DispatchRecipientStatus,
    error: row.error != null && String(row.error).trim() ? String(row.error) : null,
    messageId: row.message_id != null ? String(row.message_id) : null,
    sentAt: row.sent_at ? new Date(String(row.sent_at)).toISOString() : null,
    openCount: Number(row.open_count) || 0,
    clickCount: Number(row.click_count) || 0,
  };
}

export async function insertDispatchRecipients(
  pool: Pool,
  logId: number,
  recipients: SummaryCronRecipient[],
): Promise<void> {
  if (!logId || recipients.length === 0) return;
  try {
    for (let i = 0; i < recipients.length; i += 1) {
      const r = recipients[i];
      await pool.query(
        `INSERT INTO haulz_summary_dispatch_recipient (
           dispatch_log_id, target_login, inn, company_name, reasons, status, sort_order
         ) VALUES ($1, $2, $3, $4, $5::jsonb, 'pending', $6)
         ON CONFLICT (dispatch_log_id, target_login, inn) DO NOTHING`,
        [
          logId,
          String(r.targetLogin || "").trim().toLowerCase(),
          String(r.inn || "").trim(),
          String(r.companyName || "").trim(),
          JSON.stringify(r.reasons || []),
          i,
        ],
      );
    }
  } catch {
    /* таблица может отсутствовать до миграции */
  }
}

export async function updateDispatchRecipientStatus(
  pool: Pool,
  logId: number,
  recipient: Pick<SummaryCronRecipient, "targetLogin" | "inn">,
  status: DispatchRecipientStatus,
  opts: { error?: string; messageId?: string } = {},
): Promise<void> {
  if (!logId) return;
  try {
    await pool.query(
      `UPDATE haulz_summary_dispatch_recipient SET
         status = $4,
         error = $5,
         message_id = coalesce($6, message_id),
         sent_at = CASE WHEN $4 = 'sent' THEN coalesce(sent_at, now()) ELSE sent_at END,
         updated_at = now()
       WHERE dispatch_log_id = $1
         AND target_login = $2
         AND inn = $3`,
      [
        logId,
        String(recipient.targetLogin || "").trim().toLowerCase(),
        String(recipient.inn || "").trim(),
        status,
        opts.error?.trim() || null,
        opts.messageId?.trim() || null,
      ],
    );
  } catch {
    /* ignore */
  }
}

export async function cancelPendingDispatchRecipients(pool: Pool, logId: number): Promise<void> {
  if (!logId) return;
  try {
    await pool.query(
      `UPDATE haulz_summary_dispatch_recipient SET
         status = 'cancelled',
         updated_at = now()
       WHERE dispatch_log_id = $1 AND status = 'pending'`,
      [logId],
    );
  } catch {
    /* ignore */
  }
}

export async function listDispatchRecipients(pool: Pool, logId: number): Promise<DispatchRecipientRow[]> {
  if (!logId) return [];
  try {
    const { rows } = await pool.query(
      `SELECT r.*,
              coalesce(s.open_count, 0) AS open_count,
              coalesce(s.click_count, 0) AS click_count
       FROM haulz_summary_dispatch_recipient r
       LEFT JOIN haulz_summary_email_send s ON s.message_id = r.message_id
       WHERE r.dispatch_log_id = $1
       ORDER BY r.sort_order ASC, r.id ASC`,
      [logId],
    );
    return rows.map((r) => mapRow(r as Record<string, unknown>));
  } catch {
    return [];
  }
}

/** Список получателей для возобновления send_job из журнала рассылки. */
export async function listDispatchRecipientsAsCronRecipients(
  pool: Pool,
  logId: number,
): Promise<SummaryCronRecipient[]> {
  const rows = await listDispatchRecipients(pool, logId);
  return rows.map((r) => ({
    targetLogin: r.targetLogin,
    inn: r.inn,
    companyName: r.companyName,
    reasons: r.reasons,
  }));
}

export function dispatchRecipientStatusLabel(status: DispatchRecipientStatus | string): string {
  if (status === "sent") return "Отправлено";
  if (status === "failed") return "Ошибка";
  if (status === "skipped_unsubscribed") return "Отписка";
  if (status === "cancelled") return "Не отправлено";
  if (status === "pending") return "В очереди";
  return String(status || "—");
}
