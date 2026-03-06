import webpush from "web-push";
import { deleteRedisValue, getRedisValue, setRedisValue } from "../redis.js";

const REDIS_SUBS_TTL = 60 * 60 * 24 * 365; // 1 year

type WebPushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

function getStatusCode(err: unknown): number | null {
  const code = Number((err as any)?.statusCode);
  return Number.isFinite(code) ? code : null;
}

function readSubscriptions(raw: string | null): any[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function sendWebPushToLogin(
  loginRaw: string,
  payload: WebPushPayload
): Promise<{ ok: boolean; sent: number; failed: number; removed: number; error?: string }> {
  const login = String(loginRaw || "").trim().toLowerCase();
  if (!login) return { ok: false, sent: 0, failed: 0, removed: 0, error: "login is required" };

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return { ok: false, sent: 0, failed: 0, removed: 0, error: "Web Push not configured (VAPID keys)" };
  }

  const key = `webpush:subs:${login}`;
  const list = readSubscriptions(await getRedisValue(key));
  if (list.length === 0) return { ok: false, sent: 0, failed: 0, removed: 0, error: "no subscriptions" };

  webpush.setVapidDetails("mailto:support@haulz.ru", publicKey, privateKey);
  const serializedPayload = JSON.stringify({
    title: payload.title || "HAULZ",
    body: payload.body || "",
    url: payload.url || "/",
    tag: payload.tag || "haulz-notification",
  });

  let sent = 0;
  let failed = 0;
  let removed = 0;
  const alive: any[] = [];
  for (const sub of list) {
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) continue;
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          expirationTime: sub.expirationTime ?? undefined,
        },
        serializedPayload,
        { TTL: 60 * 60 * 24 }
      );
      sent += 1;
      alive.push(sub);
    } catch (err) {
      failed += 1;
      const statusCode = getStatusCode(err);
      // Subscription is no longer valid on provider side.
      if (statusCode === 404 || statusCode === 410) {
        removed += 1;
        continue;
      }
      alive.push(sub);
    }
  }

  if (removed > 0) {
    if (alive.length > 0) {
      await setRedisValue(key, JSON.stringify(alive), REDIS_SUBS_TTL).catch(() => false);
    } else {
      await deleteRedisValue(key).catch(() => false);
    }
  }

  return { ok: sent > 0, sent, failed, removed };
}

export async function acquireWebPushDedupeKey(key: string, ttlSeconds = 300): Promise<boolean> {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) return true;
  const exists = await getRedisValue(normalizedKey);
  if (exists) return false;
  const saved = await setRedisValue(normalizedKey, "1", ttlSeconds);
  return !!saved;
}
