import type { Pool } from "pg";
import { isPushNotificationEnabled } from "./notificationEmailPrefs.js";
import { formatPushNotificationMessage, loadPushNotificationTemplates } from "./pushNotificationTemplates.js";
import { listLoginsWithFcmTokens } from "./pushControl.js";
import { sendFcmToLogin } from "../api/_lib/fcmDelivery.js";

export type AppUpdatePlatform = "android" | "ios";

export type DispatchAppUpdatePushResult = {
  ok: boolean;
  skipped: boolean;
  reason?: string;
  recipientsTotal: number;
  sent: number;
  failed: number;
  devicesSent: number;
};

async function ensureAppReleasePushStateTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_release_push_state (
      platform text NOT NULL,
      version_code integer NOT NULL,
      version_name text NOT NULL DEFAULT '',
      notified_at timestamptz NOT NULL DEFAULT now(),
      devices_sent integer NOT NULL DEFAULT 0,
      PRIMARY KEY (platform, version_code)
    )
  `);
}

async function wasAppUpdateAlreadyNotified(
  pool: Pool,
  platform: AppUpdatePlatform,
  versionCode: number,
): Promise<boolean> {
  try {
    const { rows } = await pool.query<{ version_code: number }>(
      `SELECT version_code FROM app_release_push_state
       WHERE platform = $1 AND version_code = $2 LIMIT 1`,
      [platform, versionCode],
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function loadAllFcmLogins(pool: Pool): Promise<string[]> {
  try {
    const { rows } = await pool.query<{ login: string }>(
      `SELECT DISTINCT lower(trim(login)) AS login
       FROM fcm_device_tokens
       WHERE coalesce(trim(login), '') <> ''`,
    );
    return rows.map((r) => String(r.login || "").trim().toLowerCase()).filter(Boolean);
  } catch {
    return [];
  }
}

async function filterLoginsByAppUpdatePref(pool: Pool, logins: string[]): Promise<string[]> {
  if (logins.length === 0) return [];
  const prefsByLogin = new Map<string, Record<string, boolean>>();
  try {
    const { rows } = await pool.query<{ login: string; preferences: unknown }>(
      `SELECT login, preferences FROM notification_preferences_state WHERE login = ANY($1::text[])`,
      [logins],
    );
    for (const row of rows) {
      const login = String(row.login || "").trim().toLowerCase();
      const raw =
        row.preferences && typeof row.preferences === "object"
          ? (row.preferences as Record<string, unknown>)
          : {};
      const push =
        raw.push && typeof raw.push === "object" ? (raw.push as Record<string, boolean>) : {};
      prefsByLogin.set(login, push);
    }
  } catch {
    // defaults on
  }
  return logins.filter((login) => isPushNotificationEnabled(prefsByLogin.get(login) || {}, "app_update"));
}

/**
 * Рассылка app_update после публикации новой версии (Android APK / iOS build).
 * Повтор для того же versionCode не шлётся (app_release_push_state).
 */
export async function dispatchAppUpdatePush(params: {
  pool: Pool;
  platform: AppUpdatePlatform;
  versionCode: number;
  versionName?: string;
  dryRun?: boolean;
}): Promise<DispatchAppUpdatePushResult> {
  const platform = params.platform === "ios" ? "ios" : "android";
  const versionCode = Math.floor(Number(params.versionCode));
  const versionName = String(params.versionName || "").trim();
  if (!Number.isFinite(versionCode) || versionCode <= 0) {
    return {
      ok: false,
      skipped: true,
      reason: "invalid_version_code",
      recipientsTotal: 0,
      sent: 0,
      failed: 0,
      devicesSent: 0,
    };
  }

  await ensureAppReleasePushStateTable(params.pool);

  if (await wasAppUpdateAlreadyNotified(params.pool, platform, versionCode)) {
    return {
      ok: true,
      skipped: true,
      reason: "already_notified",
      recipientsTotal: 0,
      sent: 0,
      failed: 0,
      devicesSent: 0,
    };
  }

  const allLogins = await loadAllFcmLogins(params.pool);
  const targets = await filterLoginsByAppUpdatePref(params.pool, allLogins);

  if (params.dryRun) {
    return {
      ok: true,
      skipped: false,
      recipientsTotal: targets.length,
      sent: 0,
      failed: 0,
      devicesSent: 0,
    };
  }

  const templates = await loadPushNotificationTemplates(params.pool);
  const rendered = formatPushNotificationMessage(
    "app_update",
    "",
    { version_name: versionName || String(versionCode) },
    templates,
  );
  const title = rendered.title || "HAULZ";
  const body = rendered.body || "Вышла новая версия — обновите приложение";
  const url = platform === "android" ? "/profile" : "/profile";

  let sent = 0;
  let failed = 0;
  let devicesSent = 0;

  for (const login of targets) {
    const result = await sendFcmToLogin(login, {
      title,
      body,
      url,
      delivery: {
        event: "app_update",
        title,
        body,
      },
    });
    if (result.ok && result.sent > 0) {
      sent += 1;
      devicesSent += result.sent;
    } else {
      failed += 1;
    }
  }

  await params.pool.query(
    `INSERT INTO app_release_push_state (platform, version_code, version_name, notified_at, devices_sent)
     VALUES ($1, $2, $3, now(), $4)
     ON CONFLICT (platform, version_code)
     DO UPDATE SET version_name = excluded.version_name, notified_at = excluded.notified_at, devices_sent = excluded.devices_sent`,
    [platform, versionCode, versionName, devicesSent],
  );

  return {
    ok: sent > 0 || targets.length === 0,
    skipped: false,
    recipientsTotal: targets.length,
    sent,
    failed,
    devicesSent,
  };
}
