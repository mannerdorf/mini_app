import type { Pool } from "pg";
import { invertScopesByInn, loadEffectivePushLoginScopes, normalizeNotificationInn } from "./notificationInnScope.js";
import {
  cargoNumberLookupKeys,
  loadCargoCustomerInnByNumbers,
  shouldDeliverNotificationToSubscriber,
} from "./notificationCargoOwnerInn.js";
import {
  isPushEventAllowedForInn,
  listLoginsWithFcmTokens,
  loadPushActivationByLogins,
} from "./pushControl.js";
import { formatPushNotificationMessage, loadPushNotificationTemplates } from "./pushNotificationTemplates.js";
import { sendFcmToLogin } from "../api/_lib/fcmDelivery.js";
import { wasSuccessfulNotificationDelivery } from "../api/_lib/notificationDeliveryDedupe.js";

const EVENT_ID = "planned_delivery_date" as const;

export type PlannedDeliveryDatePushResult = {
  ok: boolean;
  attempted: number;
  delivered: number;
  failed: number;
  skipped: number;
};

function resolveOwnerInn(
  cargoNumber: string,
  ownerInnByCargo: ReadonlyMap<string, string>,
): string {
  for (const key of cargoNumberLookupKeys(cargoNumber)) {
    const hit = normalizeNotificationInn(ownerInnByCargo.get(key));
    if (hit) return hit;
  }
  return "";
}

/**
 * Push после записи плановой даты в 1С (sendings-plan-date).
 * Текст: «Перевозка № … плановая дата доставки …» из шаблона.
 */
export async function dispatchPlannedDeliveryDatePush(params: {
  pool: Pool;
  date: string;
  cargoNumbers: string[];
}): Promise<PlannedDeliveryDatePushResult> {
  const date = String(params.date || "").trim();
  const cargoNumbers = [
    ...new Set(
      (params.cargoNumbers || []).map((n) => String(n || "").trim()).filter(Boolean),
    ),
  ];
  if (!date || cargoNumbers.length === 0) {
    return { ok: true, attempted: 0, delivered: 0, failed: 0, skipped: 0 };
  }

  const { byNumber: ownerInnByCargo, loaded } = await loadCargoCustomerInnByNumbers(
    params.pool,
    cargoNumbers,
  );
  if (!loaded) {
    return { ok: true, attempted: 0, delivered: 0, failed: 0, skipped: cargoNumbers.length };
  }

  const scopes = await loadEffectivePushLoginScopes(params.pool);
  const loginsByInn = invertScopesByInn(scopes);
  const templates = await loadPushNotificationTemplates(params.pool);

  const pairs: Array<{ cargoNumber: string; inn: string }> = [];
  for (const cargoNumber of cargoNumbers) {
    const inn = resolveOwnerInn(cargoNumber, ownerInnByCargo);
    if (inn) pairs.push({ cargoNumber, inn });
  }

  if (pairs.length === 0) {
    return { ok: true, attempted: 0, delivered: 0, failed: 0, skipped: cargoNumbers.length };
  }

  const logins = [...new Set(pairs.flatMap((p) => loginsByInn.get(p.inn) || []))];
  const loginsWithToken = await listLoginsWithFcmTokens(params.pool, logins);
  const activationByLogin = await loadPushActivationByLogins(params.pool, logins);
  const pushPrefsByLogin = new Map<string, Record<string, boolean>>();

  if (logins.length > 0) {
    try {
      const { rows } = await params.pool.query<{ login: string; preferences: unknown }>(
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
        pushPrefsByLogin.set(login, push);
      }
    } catch {
      // prefs optional
    }
  }

  let attempted = 0;
  let delivered = 0;
  let failed = 0;
  let skipped = 0;

  for (const { cargoNumber, inn } of pairs) {
    const message = formatPushNotificationMessage(
      EVENT_ID,
      cargoNumber,
      { Number: cargoNumber, DateArrivalPlan: date, DateDeliveryPlan: date, PlanDate: date },
      templates,
    );
    if (!message.body.trim()) {
      skipped += 1;
      continue;
    }

    const candidateLogins = (loginsByInn.get(inn) || []).filter((login) => loginsWithToken.has(login));
    for (const login of candidateLogins) {
      if (
        !shouldDeliverNotificationToSubscriber({
          subscriberInn: inn,
          cargoInn: inn,
          loginScope: scopes.get(login),
        })
      ) {
        skipped += 1;
        continue;
      }

      const prefs = pushPrefsByLogin.get(login) || {};
      const activation = activationByLogin.get(login)?.get(inn) || null;
      if (!isPushEventAllowedForInn({ activation, prefs, eventId: EVENT_ID })) {
        skipped += 1;
        continue;
      }

      if (
        await wasSuccessfulNotificationDelivery(params.pool, {
          login,
          inn,
          cargoNumber,
          event: EVENT_ID,
          channel: "push",
        })
      ) {
        skipped += 1;
        continue;
      }

      attempted += 1;
      const sendResult = await sendFcmToLogin(login, {
        title: message.title,
        body: message.body,
        url: `/documents?section=Отправки&cargo=${encodeURIComponent(cargoNumber)}`,
        delivery: {
          event: EVENT_ID,
          inn,
          cargoInn: inn,
          cargoNumber,
          title: message.title,
          body: message.body,
        },
      });
      if (sendResult.ok && sendResult.sent > 0) delivered += 1;
      else failed += 1;
    }
  }

  return { ok: true, attempted, delivered, failed, skipped };
}
