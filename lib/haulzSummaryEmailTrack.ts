import crypto from "crypto";
import type { Pool } from "pg";
import { getAppUrl } from "./sendRegistrationEmail.js";
import { buildSummaryUnsubscribeUrl } from "./haulzSummaryUnsubscribe.js";
import { getPublicApiOrigin } from "./publicApiOrigin.js";

const TRANSPARENT_GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export type SummaryEmailSendMeta = {
  targetLogin?: string;
  inn?: string;
  dispatchLogId?: number;
};

export function createSummaryMessageId(): string {
  return `hs-${crypto.randomUUID()}`;
}

export function getSummaryTrackBaseUrl(): string {
  return getPublicApiOrigin() || getAppUrl().replace(/\/$/, "");
}

export function buildOpenTrackUrl(messageId: string): string {
  return `${getSummaryTrackBaseUrl()}/api/haulz-summary-email-open?id=${encodeURIComponent(messageId)}`;
}

export function buildClickTrackUrl(messageId: string, destinationUrl: string): string {
  const u = Buffer.from(destinationUrl, "utf8").toString("base64url");
  return `${getSummaryTrackBaseUrl()}/api/haulz-summary-email-click?id=${encodeURIComponent(messageId)}&u=${encodeURIComponent(u)}`;
}

function shouldSkipTrackLink(href: string, targetLogin?: string): boolean {
  const h = href.trim().toLowerCase();
  if (!h || h === "#") return true;
  if (h.startsWith("mailto:") || h.startsWith("tel:") || h.startsWith("javascript:")) return true;
  if (h.includes("haulz-summary-unsubscribe") || h.includes("haulz-summary-email-click")) return true;
  if (targetLogin) {
    try {
      const unsub = buildSummaryUnsubscribeUrl(targetLogin).toLowerCase();
      if (h === unsub || h.startsWith(unsub.split("?")[0])) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

/** Пиксель открытия и обёртка ссылок для кликов. */
export function injectSummaryEmailTracking(html: string, messageId: string, targetLogin?: string): string {
  const pixel = `<img src="${buildOpenTrackUrl(messageId)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;margin:0;padding:0;" />`;
  let out = html.includes("</body>") ? html.replace(/<\/body>/i, `${pixel}</body>`) : `${html}${pixel}`;

  out = out.replace(/\bhref\s*=\s*("([^"]*)"|'([^']*)')/gi, (match, _q, hrefDouble, hrefSingle) => {
    const href = (hrefDouble ?? hrefSingle ?? "").trim();
    if (shouldSkipTrackLink(href, targetLogin)) return match;
    const quote = hrefDouble !== undefined ? '"' : "'";
    return `href=${quote}${buildClickTrackUrl(messageId, href)}${quote}`;
  });

  return out;
}

export function getTrackingGifBuffer(): Buffer {
  return TRANSPARENT_GIF;
}

export async function recordSummaryEmailSend(
  pool: Pool,
  params: {
    messageId: string;
    toEmail: string;
    subject: string;
    targetLogin?: string;
    inn?: string;
    dispatchLogId?: number;
  },
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO haulz_summary_email_send (
         message_id, dispatch_log_id, to_email, target_login, inn, subject
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (message_id) DO NOTHING`,
      [
        params.messageId,
        params.dispatchLogId && params.dispatchLogId > 0 ? params.dispatchLogId : null,
        params.toEmail.trim().toLowerCase(),
        params.targetLogin?.trim().toLowerCase() || null,
        params.inn?.trim() || null,
        params.subject,
      ],
    );
  } catch {
    /* таблица может отсутствовать до миграции */
  }
}

function clientIp(req: { headers?: Record<string, string | string[] | undefined> }): string {
  const xf = req.headers?.["x-forwarded-for"];
  if (typeof xf === "string") return xf.split(",")[0]?.trim() || "";
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).split(",")[0]?.trim() || "";
  return "";
}

export async function recordSummaryEmailOpen(
  pool: Pool,
  messageId: string,
  req?: { headers?: Record<string, string | string[] | undefined> },
): Promise<boolean> {
  const id = String(messageId ?? "").trim();
  if (!id.startsWith("hs-")) return false;
  const ua = String(req?.headers?.["user-agent"] ?? "").slice(0, 500);
  const ip = clientIp(req ?? {});
  try {
    const upd = await pool.query(
      `UPDATE haulz_summary_email_send SET
         open_count = open_count + 1,
         first_open_at = coalesce(first_open_at, now())
       WHERE message_id = $1
       RETURNING message_id`,
      [id],
    );
    if (!upd.rowCount) return false;
    await pool.query(
      `INSERT INTO haulz_summary_email_event (message_id, event_type, user_agent, ip)
       VALUES ($1, 'open', $2, $3)`,
      [id, ua || null, ip || null],
    );
    return true;
  } catch {
    return false;
  }
}

export async function recordSummaryEmailClick(
  pool: Pool,
  messageId: string,
  destinationUrl: string,
  req?: { headers?: Record<string, string | string[] | undefined> },
): Promise<boolean> {
  const id = String(messageId ?? "").trim();
  if (!id.startsWith("hs-")) return false;
  const dest = destinationUrl.trim();
  if (!dest.startsWith("http://") && !dest.startsWith("https://")) return false;
  const ua = String(req?.headers?.["user-agent"] ?? "").slice(0, 500);
  const ip = clientIp(req ?? {});
  try {
    const upd = await pool.query(
      `UPDATE haulz_summary_email_send SET
         click_count = click_count + 1,
         first_click_at = coalesce(first_click_at, now())
       WHERE message_id = $1
       RETURNING message_id`,
      [id],
    );
    if (!upd.rowCount) return false;
    await pool.query(
      `INSERT INTO haulz_summary_email_event (message_id, event_type, link_url, user_agent, ip)
       VALUES ($1, 'click', $2, $3, $4)`,
      [id, dest.slice(0, 2000), ua || null, ip || null],
    );
    return true;
  } catch {
    return false;
  }
}

export type DispatchLogTrackingAgg = {
  trackingOpens: number;
  trackingClicks: number;
  trackingOpenedEmails: number;
  trackingClickedEmails: number;
};

export async function aggregateTrackingByDispatchLogIds(
  pool: Pool,
  logIds: number[],
): Promise<Map<number, DispatchLogTrackingAgg>> {
  const map = new Map<number, DispatchLogTrackingAgg>();
  if (!logIds.length) return map;
  try {
    const { rows } = await pool.query<{
      dispatch_log_id: string;
      tracking_opens: string;
      tracking_clicks: string;
      tracking_opened_emails: string;
      tracking_clicked_emails: string;
    }>(
      `SELECT dispatch_log_id,
              coalesce(sum(open_count), 0)::text AS tracking_opens,
              coalesce(sum(click_count), 0)::text AS tracking_clicks,
              count(*) FILTER (WHERE open_count > 0)::text AS tracking_opened_emails,
              count(*) FILTER (WHERE click_count > 0)::text AS tracking_clicked_emails
       FROM haulz_summary_email_send
       WHERE dispatch_log_id = ANY($1::bigint[])
       GROUP BY dispatch_log_id`,
      [logIds],
    );
    for (const row of rows) {
      const id = Number(row.dispatch_log_id);
      map.set(id, {
        trackingOpens: Number(row.tracking_opens) || 0,
        trackingClicks: Number(row.tracking_clicks) || 0,
        trackingOpenedEmails: Number(row.tracking_opened_emails) || 0,
        trackingClickedEmails: Number(row.tracking_clicked_emails) || 0,
      });
    }
  } catch {
    /* ignore */
  }
  return map;
}
