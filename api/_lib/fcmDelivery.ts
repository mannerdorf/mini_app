import fs from "node:fs";
import { getPool } from "../_db.js";

export type FcmDeliveryLog = {
  event: string;
  /** ИНН подписчика (скоуп login). */
  inn?: string;
  /** ИНН заказчика перевозки из cache. */
  cargoInn?: string;
  cargoNumber?: string;
  title?: string;
  body?: string;
};

type FcmPayload = {
  title: string;
  body: string;
  url?: string;
  /** When set, write a row to notification_deliveries for profile push history. */
  delivery?: FcmDeliveryLog;
};

export async function logPushDelivery(params: {
  login: string;
  delivery: FcmDeliveryLog;
  success: boolean;
  error?: string | null;
  title?: string;
  body?: string;
}): Promise<void> {
  const login = String(params.login || "").trim().toLowerCase();
  if (!login) return;
  const pushTitle = String(params.title ?? params.delivery.title ?? "").trim();
  const pushBody = String(params.body ?? params.delivery.body ?? "").trim();
  const event = String(params.delivery.event || "push").trim() || "push";
  const subscriberInn = String(params.delivery.inn || "").trim();
  const cargoInn = String(params.delivery.cargoInn || params.delivery.inn || "").trim();
  const explicitCargo = String(params.delivery.cargoNumber || "").trim();
  // cargo_number — fallback для старых APK/схемы: для broadcast кладём текст сообщения.
  const cargoNumber =
    explicitCargo ||
    (event === "broadcast" ? pushBody.slice(0, 500) || pushTitle.slice(0, 120) : pushBody.slice(0, 120));

  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO notification_deliveries (
         poll_run_id, login, inn, cargo_inn, cargo_number, event, channel, telegram_chat_id, success, error_message, push_title, push_body
       ) VALUES (NULL, $1, $2, $3, $4, $5, 'push', NULL, $6, $7, $8, $9)`,
      [
        login,
        subscriberInn,
        cargoInn || null,
        cargoNumber,
        event,
        params.success,
        params.success ? null : params.error || "send failed",
        pushTitle || null,
        pushBody || null,
      ],
    );
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code !== "42703") throw e;
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO notification_deliveries (
           poll_run_id, login, inn, cargo_number, event, channel, telegram_chat_id, success, error_message
         ) VALUES (NULL, $1, $2, $3, $4, 'push', NULL, $5, $6)`,
        [
          login,
          subscriberInn,
          cargoNumber,
          event,
          params.success,
          params.success ? null : params.error || "send failed",
        ],
      );
    } catch {
      // History log is best-effort.
    }
  }
}

type FirebaseMessaging = {
  sendEachForMulticast(message: {
    tokens: string[];
    notification?: { title?: string; body?: string };
    data?: Record<string, string>;
    android?: {
      priority?: "normal" | "high";
      notification?: {
        icon?: string;
        color?: string;
        channelId?: string;
      };
    };
    apns?: {
      headers?: Record<string, string>;
      payload?: {
        aps?: {
          sound?: string;
          badge?: number;
        };
      };
    };
  }): Promise<{
    successCount: number;
    failureCount: number;
    responses: Array<{ success: boolean; error?: { code?: string; message?: string } }>;
  }>;
};

let messagingPromise: Promise<FirebaseMessaging | null> | null = null;
let messagingInitError: string | null = null;

function readServiceAccountFromFile(pathRaw: string): Record<string, unknown> | null {
  const path = String(pathRaw || "").trim();
  if (!path || !fs.existsSync(path)) return null;
  try {
    return JSON.parse(fs.readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readServiceAccountFromEnv(): Record<string, unknown> | null {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!rawJson) return null;
  try {
    return JSON.parse(rawJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function resolveServiceAccount(): { account: Record<string, unknown>; source: string } | null {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const fromFile = credPath ? readServiceAccountFromFile(credPath) : null;
  if (fromFile) return { account: fromFile, source: credPath! };

  const fromEnv = readServiceAccountFromEnv();
  if (fromEnv) return { account: fromEnv, source: "FIREBASE_SERVICE_ACCOUNT_JSON" };

  return null;
}

async function getMessaging(): Promise<FirebaseMessaging | null> {
  if (messagingPromise) return messagingPromise;
  messagingPromise = (async () => {
    messagingInitError = null;
    const resolved = resolveServiceAccount();
    if (!resolved) {
      messagingInitError =
        "FCM not configured: set GOOGLE_APPLICATION_CREDENTIALS to a valid JSON file or FIREBASE_SERVICE_ACCOUNT_JSON";
      return null;
    }
    try {
      const [adminModule, messagingModule] = await Promise.all([
        import("firebase-admin"),
        import("firebase-admin/messaging"),
      ]);
      const admin = adminModule.default ?? adminModule;
      const cert = admin.cert;
      const initializeApp = admin.initializeApp;
      const getApps = admin.getApps;
      const getMessaging = messagingModule.getMessaging;

      if (typeof cert !== "function" || typeof getMessaging !== "function") {
        messagingInitError = "FCM SDK incompatible: firebase-admin cert/getMessaging missing";
        return null;
      }

      if (getApps().length === 0) {
        initializeApp({
          credential: cert(resolved.account),
        });
      }
      return getMessaging() as FirebaseMessaging;
    } catch (e: unknown) {
      messagingInitError = (e as Error)?.message || "FCM init failed";
      return null;
    }
  })();
  return messagingPromise;
}

async function loadTokensForLogin(loginRaw: string): Promise<string[]> {
  const login = String(loginRaw || "").trim().toLowerCase();
  if (!login) return [];
  try {
    const pool = getPool();
    const { rows } = await pool.query<{ token: string }>(
      "select token from fcm_device_tokens where login = $1",
      [login],
    );
    return rows.map((r) => String(r.token || "").trim()).filter(Boolean);
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "42P01") return [];
    throw e;
  }
}

async function removeInvalidTokens(tokens: string[]): Promise<number> {
  if (tokens.length === 0) return 0;
  try {
    const pool = getPool();
    const result = await pool.query("delete from fcm_device_tokens where token = any($1::text[])", [tokens]);
    return result.rowCount ?? 0;
  } catch {
    return 0;
  }
}

export async function sendFcmToLogin(
  loginRaw: string,
  payload: FcmPayload,
): Promise<{ ok: boolean; sent: number; failed: number; removed: number; error?: string }> {
  const login = String(loginRaw || "").trim().toLowerCase();
  if (!login) return { ok: false, sent: 0, failed: 0, removed: 0, error: "login is required" };

  if (payload.delivery) {
    const subscriberInn = String(payload.delivery.inn || "").replace(/\D/g, "").trim();
    const cargoInn = String(payload.delivery.cargoInn || payload.delivery.inn || "").replace(/\D/g, "").trim();
    if (subscriberInn && cargoInn && subscriberInn !== cargoInn) {
      const error = "cargo INN mismatch";
      await logPushDelivery({ login, delivery: payload.delivery, success: false, error, title: payload.title, body: payload.body });
      return { ok: false, sent: 0, failed: 0, removed: 0, error };
    }
  }

  const messaging = await getMessaging();
  if (!messaging) {
    const error = messagingInitError || "FCM not configured";
    if (payload.delivery) {
      await logPushDelivery({ login, delivery: payload.delivery, success: false, error, title: payload.title, body: payload.body });
    }
    return {
      ok: false,
      sent: 0,
      failed: 0,
      removed: 0,
      error,
    };
  }

  const tokens = await loadTokensForLogin(login);
  if (tokens.length === 0) {
    const error = "no FCM tokens";
    if (payload.delivery) {
      await logPushDelivery({ login, delivery: payload.delivery, success: false, error, title: payload.title, body: payload.body });
    }
    return { ok: false, sent: 0, failed: 0, removed: 0, error };
  }

  try {
    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: payload.title || "HAULZ",
        body: payload.body || "",
      },
      data: {
        url: payload.url || "/",
        title: payload.title || "HAULZ",
        body: payload.body || "",
      },
      android: {
        priority: "high",
        notification: {
          icon: "ic_stat_haulz",
          color: "#3655FF",
        },
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
    });

    const invalidTokens: string[] = [];
    const responses = Array.isArray(response.responses) ? response.responses : [];
    responses.forEach((item, index) => {
      if (item.success) return;
      const code = item.error?.code || "";
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        invalidTokens.push(tokens[index]);
      }
    });

    const removed = await removeInvalidTokens(invalidTokens);
    const ok = response.successCount > 0;
    const error = ok ? undefined : "FCM send failed";
    if (payload.delivery) {
      await logPushDelivery({
        login,
        delivery: payload.delivery,
        success: ok,
        error,
        title: payload.title,
        body: payload.body,
      });
    }
    return {
      ok,
      sent: response.successCount,
      failed: response.failureCount,
      removed,
      error,
    };
  } catch (e: unknown) {
    const error = (e as Error)?.message || "FCM send failed";
    if (payload.delivery) {
      await logPushDelivery({
        login,
        delivery: payload.delivery,
        success: false,
        error,
        title: payload.title,
        body: payload.body,
      });
    }
    return {
      ok: false,
      sent: 0,
      failed: tokens.length,
      removed: 0,
      error,
    };
  }
}
