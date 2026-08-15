import fs from "node:fs";
import { getPool } from "../_db.js";

type FcmPayload = {
  title: string;
  body: string;
  url?: string;
};

type FirebaseMessaging = {
  sendEachForMulticast(message: {
    tokens: string[];
    notification?: { title?: string; body?: string };
    data?: Record<string, string>;
    android?: { priority?: "normal" | "high" };
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
      const adminModule = await import("firebase-admin");
      const admin = adminModule.default ?? adminModule;
      const existingApps = typeof admin.getApps === "function" ? admin.getApps() : admin.apps ?? [];
      if (existingApps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(resolved.account),
        });
      }
      return admin.messaging() as FirebaseMessaging;
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

  const messaging = await getMessaging();
  if (!messaging) {
    return {
      ok: false,
      sent: 0,
      failed: 0,
      removed: 0,
      error: messagingInitError || "FCM not configured",
    };
  }

  const tokens = await loadTokensForLogin(login);
  if (tokens.length === 0) {
    return { ok: false, sent: 0, failed: 0, removed: 0, error: "no FCM tokens" };
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
      android: { priority: "high" },
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
    return {
      ok: response.successCount > 0,
      sent: response.successCount,
      failed: response.failureCount,
      removed,
      error: response.successCount > 0 ? undefined : "FCM send failed",
    };
  } catch (e: unknown) {
    return {
      ok: false,
      sent: 0,
      failed: tokens.length,
      removed: 0,
      error: (e as Error)?.message || "FCM send failed",
    };
  }
}
