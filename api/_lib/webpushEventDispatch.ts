import type { Pool } from "pg";
import {
  CARGO_STAGE_EVENT_IDS,
  formatTelegramMessage,
  getCargoStageEventsOnStateChange,
  getPaymentKey,
  hasBillSignal,
  isCargoStageNotificationEnabled,
  isRecentNotificationItem,
  notificationItemInn,
  type CargoStageEventId,
} from "../../lib/notificationPoll.js";
import { invertScopesByInn, loadPushLoginScopes, normalizeNotificationInn } from "../../lib/notificationInnScope.js";
import { acquireWebPushDedupeKey, sendWebPushToLogin } from "./webpushDelivery.js";
import { sendFcmToLogin } from "./fcmDelivery.js";
import { wasSuccessfulNotificationDelivery } from "./notificationDeliveryDedupe.js";
import {
  isPushEventAllowedForInn,
  listLoginsWithFcmTokens,
  loadPushActivationByLogins,
} from "../../lib/pushControl.js";

type CargoSnapshotItem = {
  inn?: unknown;
  INN?: unknown;
  Inn?: unknown;
  cargoNumber?: unknown;
  Number?: unknown;
  number?: unknown;
  state?: unknown;
  State?: unknown;
  stateBill?: unknown;
  StateBill?: unknown;
  [key: string]: unknown;
};

const NOTIFICATION_EVENTS = [...CARGO_STAGE_EVENT_IDS, "bill_created", "bill_paid"] as const;
type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

function isOptInNotificationEventEnabled(prefs: Record<string, boolean>, event: NotificationEvent): boolean {
  if (event === "bill_created" || event === "bill_paid") return prefs[event] === true;
  return isCargoStageNotificationEnabled(prefs, event as CargoStageEventId);
}

function normalizeInn(item: CargoSnapshotItem): string {
  return notificationItemInn(item);
}

function normalizeCargoNumber(item: CargoSnapshotItem): string {
  return String(item.cargoNumber ?? item.Number ?? item.number ?? "").trim();
}

function eventUrl(event: NotificationEvent, cargoNumber: string): string {
  const number = encodeURIComponent(String(cargoNumber || "").trim());
  if (event === "bill_created" || event === "bill_paid") return `/documents?section=Счета&cargo=${number}`;
  return `/documents?section=Отправки&cargo=${number}`;
}

function billEventsOnChange(
  isFirstSeen: boolean,
  prevStateBill: string | null | undefined,
  item: CargoSnapshotItem,
  notifyFirstSeen: boolean,
): NotificationEvent[] {
  if (!hasBillSignal(item)) return [];
  if (isFirstSeen && !notifyFirstSeen) return [];
  const payKey = getPaymentKey(String(item.StateBill ?? item.stateBill ?? "").trim() || undefined);
  const prevPayKey = isFirstSeen ? "unknown" : getPaymentKey(prevStateBill ?? undefined);
  const events: NotificationEvent[] = [];
  if (prevPayKey === "unknown") events.push("bill_created");
  if (payKey === "paid" && prevPayKey !== "paid") events.push("bill_paid");
  return events;
}

async function ensureNotificationTables(pool: Pool) {
  await pool.query(
    `create table if not exists cargo_last_state (
      inn text not null,
      cargo_number text not null,
      state text,
      state_bill text,
      updated_at timestamptz not null default now(),
      primary key (inn, cargo_number)
    )`
  );
  await pool.query(
    `create table if not exists notification_deliveries (
      id uuid primary key default gen_random_uuid(),
      poll_run_id uuid references notification_poll_runs(id) on delete set null,
      login text not null,
      inn text not null,
      cargo_number text not null,
      event text not null,
      channel text not null default 'web',
      sent_at timestamptz not null default now(),
      telegram_chat_id text,
      success boolean not null default true,
      error_message text
    )`
  );
}

export async function dispatchWebPushCargoEvents(params: {
  pool: Pool;
  items: CargoSnapshotItem[];
  source?: string;
  dedupeTtlSeconds?: number;
}): Promise<{
  ok: boolean;
  source: string;
  scanned: number;
  changed: number;
  attempted: number;
  delivered: number;
  failed: number;
  deduped: number;
  cleanedSubscriptions: number;
}> {
  const { pool, source = "event_dispatch", dedupeTtlSeconds = 300 } = params;
  const input = Array.isArray(params.items) ? params.items : [];
  const prepared = input
    .map((item) => ({
      inn: normalizeInn(item),
      cargoNumber: normalizeCargoNumber(item),
      state: String(item.state ?? item.State ?? "").trim() || null,
      stateBill: String(item.stateBill ?? item.StateBill ?? "").trim() || null,
      raw: item,
    }))
    .filter((x) => x.inn && x.cargoNumber);
  if (prepared.length === 0) {
    return { ok: true, source, scanned: 0, changed: 0, attempted: 0, delivered: 0, failed: 0, deduped: 0, cleanedSubscriptions: 0 };
  }

  try {
    await ensureNotificationTables(pool);
  } catch {
    // Continue even if DDL was rejected by permissions.
  }

  const inns = Array.from(new Set(prepared.map((x) => x.inn)));
  const cargoNumbers = Array.from(new Set(prepared.map((x) => x.cargoNumber)));
  const subscriberByInn = new Map<string, Map<string, Record<string, boolean>>>();
  const pushSubscriberByInn = new Map<string, Map<string, Record<string, boolean>>>();
  const scopes = await loadPushLoginScopes(pool);
  const loginsByInn = invertScopesByInn(scopes);
  const scopedPairs: Array<{ login: string; inn: string }> = [];
  for (const inn of inns) {
    for (const login of loginsByInn.get(inn) || []) {
      scopedPairs.push({ login, inn });
    }
  }
  const logins = [...new Set(scopedPairs.map((r) => r.login))];
  const prefsByLogin = new Map<string, Record<string, boolean>>();
  const pushPrefsByLogin = new Map<string, Record<string, boolean>>();
  const loadedFromState = new Set<string>();
  const loginsWithToken = await listLoginsWithFcmTokens(pool, logins);
  const activationByLogin = await loadPushActivationByLogins(pool, logins);
  if (logins.length > 0) {
    try {
      const stateRows = await pool.query<{ login: string; preferences: any }>(
        `select login, preferences
         from notification_preferences_state
         where login = any($1::text[])`,
        [logins]
      );
      for (const row of stateRows.rows) {
        const login = String(row.login || "").trim().toLowerCase();
        if (!login) continue;
        const raw = row.preferences || {};
        const webpush = raw?.webpush && typeof raw.webpush === "object" ? raw.webpush : {};
        const push = raw?.push && typeof raw.push === "object" ? raw.push : {};
        prefsByLogin.set(login, { ...webpush });
        pushPrefsByLogin.set(login, { ...push });
        loadedFromState.add(login);
      }
    } catch {
      // Fallback to legacy rows below.
    }
  }
  const missingLogins = logins.filter((login) => !loadedFromState.has(login));
  if (missingLogins.length > 0) {
    const prefsRows = await pool.query<{ login: string; event_id: string; channel: string }>(
      `select distinct lower(trim(login)) as login, event_id, channel
       from notification_preferences
       where channel in ('web', 'push')
         and enabled = true
         and event_id = any($2::text[])
         and lower(trim(login)) = any($1::text[])`,
      [missingLogins, Array.from(NOTIFICATION_EVENTS) as string[]]
    );
    for (const row of prefsRows.rows) {
      const login = String(row.login || "").trim().toLowerCase();
      if (!login) continue;
      const eventId = String(row.event_id || "").trim();
      if (row.channel === "push") {
        const current = pushPrefsByLogin.get(login) || {};
        current[eventId] = true;
        pushPrefsByLogin.set(login, current);
      } else {
        const current = prefsByLogin.get(login) || {};
        current[eventId] = true;
        prefsByLogin.set(login, current);
      }
    }
  }
  for (const row of scopedPairs) {
    const inn = normalizeNotificationInn(row.inn);
    const login = String(row.login || "").trim().toLowerCase();
    const enabledEvents = prefsByLogin.get(login) || {};
    const enabledPushEvents = pushPrefsByLogin.get(login) || {};
    if (!inn || !login) continue;
    let byLogin = subscriberByInn.get(inn);
    if (!byLogin) {
      byLogin = new Map<string, Record<string, boolean>>();
      subscriberByInn.set(inn, byLogin);
    }
    byLogin.set(login, enabledEvents);
    if (!loginsWithToken.has(login)) continue;
    let pushByLogin = pushSubscriberByInn.get(inn);
    if (!pushByLogin) {
      pushByLogin = new Map<string, Record<string, boolean>>();
      pushSubscriberByInn.set(inn, pushByLogin);
    }
    // Маркер: наличие prefs; реальная проверка — через activation в цикле отправки.
    pushByLogin.set(login, enabledPushEvents);
  }
  if (subscriberByInn.size === 0 && pushSubscriberByInn.size === 0) {
    return {
      ok: true,
      source,
      scanned: prepared.length,
      changed: 0,
      attempted: 0,
      delivered: 0,
      failed: 0,
      deduped: 0,
      cleanedSubscriptions: 0,
    };
  }

  const lastStateRows = await pool.query<{ inn: string; cargo_number: string; state: string | null; state_bill: string | null }>(
    `select inn, cargo_number, state, state_bill
     from cargo_last_state
     where cargo_number = any($2::text[])
       and (
         inn = any($1::text[])
         or regexp_replace(coalesce(inn, ''), '\\D', '', 'g') = any($1::text[])
       )`,
    [inns, cargoNumbers]
  );
  const lastState = new Map<string, { state: string | null; stateBill: string | null }>();
  for (const row of lastStateRows.rows) {
    const innKey = normalizeNotificationInn(row.inn) || String(row.inn || "").trim();
    lastState.set(`${innKey}::${row.cargo_number}`, { state: row.state, stateBill: row.state_bill });
  }

  let changed = 0;
  let attempted = 0;
  let delivered = 0;
  let failed = 0;
  let deduped = 0;
  let cleanedSubscriptions = 0;
  const nowBucket = Math.floor(Date.now() / (1000 * dedupeTtlSeconds));
  for (const item of prepared) {
    const key = `${item.inn}::${item.cargoNumber}`;
    const prev = lastState.get(key);
    const isFirstSeen = !prev;
    const notifyFirstSeen = isRecentNotificationItem(item.raw as Record<string, unknown>);
    const eventsToSend: NotificationEvent[] = [
      ...getCargoStageEventsOnStateChange(prev?.state, item.state, isFirstSeen, { notifyFirstSeen }),
      ...billEventsOnChange(isFirstSeen, prev?.stateBill, item.raw, notifyFirstSeen),
    ];
    if (eventsToSend.length > 0) changed += 1;

    const subscribers = subscriberByInn.get(item.inn) || new Map<string, Record<string, boolean>>();
    const pushSubscribers = pushSubscriberByInn.get(item.inn) || new Map<string, Record<string, boolean>>();

    for (const event of eventsToSend) {
      for (const [login, eventsEnabled] of subscribers.entries()) {
        if (!isOptInNotificationEventEnabled(eventsEnabled, event)) continue;
        if (
          await wasSuccessfulNotificationDelivery(pool, {
            login,
            inn: item.inn,
            cargoNumber: item.cargoNumber,
            event,
            channel: "web",
          })
        ) {
          deduped += 1;
          continue;
        }
        const dedupeKey = [
          "webpush",
          "dedupe",
          source,
          login,
          item.inn,
          item.cargoNumber,
          event,
          String(item.state || ""),
          String(item.stateBill || ""),
          String(nowBucket),
        ].join(":");
        const shouldSend = await acquireWebPushDedupeKey(dedupeKey, dedupeTtlSeconds);
        if (!shouldSend) {
          deduped += 1;
          continue;
        }
        attempted += 1;
        const body = formatTelegramMessage(event, item.cargoNumber, item.raw as any);
        const sendResult = await sendWebPushToLogin(login, {
          title: "HAULZ",
          body,
          url: eventUrl(event, item.cargoNumber),
          tag: `${event}:${item.cargoNumber}`,
        });
        if (sendResult.sent > 0) delivered += 1;
        if (!sendResult.ok) failed += 1;
        cleanedSubscriptions += sendResult.removed || 0;
        try {
          await pool.query(
            `insert into notification_deliveries (
              poll_run_id, login, inn, cargo_number, event, channel, telegram_chat_id, success, error_message
            ) values ($1,$2,$3,$4,$5,'web',null,$6,$7)`,
            [null, login, item.inn, item.cargoNumber, event, sendResult.ok, sendResult.error || null]
          );
        } catch {
          // Delivery log is best-effort.
        }
      }
      for (const [login, eventsEnabled] of pushSubscribers.entries()) {
        const activation = activationByLogin.get(login)?.get(item.inn) || null;
        if (
          !isPushEventAllowedForInn({
            activation,
            prefs: eventsEnabled,
            eventId: event,
          })
        ) {
          continue;
        }
        if (
          await wasSuccessfulNotificationDelivery(pool, {
            login,
            inn: item.inn,
            cargoNumber: item.cargoNumber,
            event,
            channel: "push",
          })
        ) {
          deduped += 1;
          continue;
        }
        const dedupeKey = [
          "fcm",
          "dedupe",
          source,
          login,
          item.inn,
          item.cargoNumber,
          event,
          String(item.state || ""),
          String(item.stateBill || ""),
          String(nowBucket),
        ].join(":");
        const shouldSend = await acquireWebPushDedupeKey(dedupeKey, dedupeTtlSeconds);
        if (!shouldSend) {
          deduped += 1;
          continue;
        }
        attempted += 1;
        const body = formatTelegramMessage(event, item.cargoNumber, item.raw as any);
        const sendResult = await sendFcmToLogin(login, {
          title: "HAULZ",
          body,
          url: eventUrl(event, item.cargoNumber),
          delivery: {
            event,
            inn: String(item.inn || "").trim(),
            cargoNumber: item.cargoNumber,
            title: "HAULZ",
            body,
          },
        });
        if (sendResult.sent > 0) delivered += 1;
        if (!sendResult.ok) failed += 1;
        cleanedSubscriptions += sendResult.removed || 0;
      }
    }

    try {
      await pool.query(
        `insert into cargo_last_state (inn, cargo_number, state, state_bill, updated_at)
         values ($1,$2,$3,$4,now())
         on conflict (inn, cargo_number)
         do update set state = excluded.state, state_bill = excluded.state_bill, updated_at = now()`,
        [item.inn, item.cargoNumber, item.state, item.stateBill]
      );
    } catch {
      // State persistence is best-effort when DB schema differs.
    }
  }

  return {
    ok: true,
    source,
    scanned: prepared.length,
    changed,
    attempted,
    delivered,
    failed,
    deduped,
    cleanedSubscriptions,
  };
}
