import type { Pool } from "pg";
import { normalizeNotificationInn } from "./notificationInnScope.js";
import {
  loadNotificationPreferencesState,
  mergePushPreferences,
  savePushSelectedInn,
} from "./notificationEmailPrefs.js";
import { syncPushActivationForLogin, writePushControlJournal } from "./pushControl.js";

export type SyncPushSelectedInnResult = {
  pushSelectedInn: string | null;
  pushInns: string[];
  skipped: boolean;
  reason?: string;
};

/** Сохранить выбранный ИНН и пересинхронизировать push_activation (если inn валиден или null для сброса). */
export async function syncPushSelectedInnForLogin(
  pool: Pool,
  loginRaw: string,
  innRaw: string | null | undefined,
  opts?: { source?: string; deviceTokenSuffix?: string | null; platform?: string | null },
): Promise<SyncPushSelectedInnResult> {
  const login = String(loginRaw || "").trim().toLowerCase();
  const requestedInn = normalizeNotificationInn(innRaw);
  if (!login) {
    return { pushSelectedInn: null, pushInns: [], skipped: true, reason: "no_login" };
  }

  const { pushSelectedInn } = await savePushSelectedInn(pool, login, requestedInn || null);

  const state = await loadNotificationPreferencesState(pool, login);
  const pushPrefs = mergePushPreferences(state.push);
  const synced = await syncPushActivationForLogin(pool, login, pushPrefs, {
    source: opts?.source || "push_selected_inn",
    deviceTokenSuffix: opts?.deviceTokenSuffix,
    platform: opts?.platform,
  });

  await writePushControlJournal(pool, {
    login,
    inn: synced.inns[0] || pushSelectedInn || "",
    action: "activation_sync",
    meta: {
      source: opts?.source || "push_selected_inn",
      push_selected_inn: pushSelectedInn,
      push_inns: synced.inns,
    },
    deviceTokenSuffix: opts?.deviceTokenSuffix,
    platform: opts?.platform,
  });

  return {
    pushSelectedInn,
    pushInns: synced.inns,
    skipped: false,
  };
}
