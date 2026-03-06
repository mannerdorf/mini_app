import type { Pool } from "pg";
import { formatTelegramMessage, getCargoStatusKey, getPaymentKey } from "../../lib/notificationPoll.js";
import { acquireWebPushDedupeKey, sendWebPushToLogin } from "./webpushDelivery.js";

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

const NOTIFICATION_EVENTS = ["accepted", "in_transit", "delivered", "bill_created", "bill_paid"] as const;
type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

function normalizeInn(item: CargoSnapshotItem): string {
  return String(item.inn ?? item.INN ?? item.Inn ?? "").trim();
}

function normalizeCargoNumber(item: CargoSnapshotItem): string {
  return String(item.cargoNumber ?? item.Number ?? item.number ?? "").trim();
}

function hasBillData(item: CargoSnapshotItem): boolean {
  const number = String(
    item?.NumberBill ?? item?.BillNumber ?? item?.Invoice ?? item?.InvoiceNumber ?? item?.["Счет"] ?? item?.["Счёт"] ?? ""
  ).trim();
  if (number) return true;
  const stateBill = String(item?.StateBill ?? item?.stateBill ?? "").trim();
  return !!stateBill;
}

function eventUrl(event: NotificationEvent, cargoNumber: string): string {
  const number = encodeURIComponent(String(cargoNumber || "").trim());
  if (event === "bill_created" || event === "bill_paid") return `/documents?section=Счета&cargo=${number}`;
  return `/documents?section=Отправки&cargo=${number}`;
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
  const prefsRows = await pool.query<{ login: string; inn: string; event_id: string }>(
    `select distinct lower(trim(np.login)) as login, ac.inn, np.event_id
     from notification_preferences np
     join account_companies ac on lower(trim(ac.login)) = lower(trim(np.login))
     where np.channel = 'web'
       and np.enabled = true
       and np.event_id = any($2::text[])
       and ac.inn = any($1::text[])`,
    [inns, Array.from(NOTIFICATION_EVENTS)]
  );
  const subscriberByInn = new Map<string, Map<string, Set<string>>>();
  for (const row of prefsRows.rows) {
    if (!row?.inn || !row?.login || !row?.event_id) continue;
    let byLogin = subscriberByInn.get(row.inn);
    if (!byLogin) {
      byLogin = new Map<string, Set<string>>();
      subscriberByInn.set(row.inn, byLogin);
    }
    const set = byLogin.get(row.login) || new Set<string>();
    set.add(String(row.event_id).trim());
    byLogin.set(row.login, set);
  }
  if (subscriberByInn.size === 0) {
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
     where inn = any($1::text[]) and cargo_number = any($2::text[])`,
    [inns, cargoNumbers]
  );
  const lastState = new Map<string, { state: string | null; stateBill: string | null }>();
  for (const row of lastStateRows.rows) {
    lastState.set(`${row.inn}::${row.cargo_number}`, { state: row.state, stateBill: row.state_bill });
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
    const stateKey = getCargoStatusKey(item.state ?? undefined);
    const payKey = getPaymentKey(item.stateBill ?? undefined);
    const eventsToSend: NotificationEvent[] = [];
    if (!prev) {
      if (stateKey === "accepted") eventsToSend.push("accepted");
      if (hasBillData(item.raw)) eventsToSend.push("bill_created");
      if (payKey === "paid") eventsToSend.push("bill_paid");
    } else {
      const prevStateKey = getCargoStatusKey(prev.state ?? undefined);
      const prevPayKey = getPaymentKey(prev.stateBill ?? undefined);
      if (stateKey && stateKey !== prevStateKey) {
        if (stateKey === "accepted") eventsToSend.push("accepted");
        if (stateKey === "in_transit") eventsToSend.push("in_transit");
        if (stateKey === "delivered") eventsToSend.push("delivered");
      }
      if (prevPayKey === "unknown" && hasBillData(item.raw)) eventsToSend.push("bill_created");
      if (payKey === "paid" && prevPayKey !== "paid") eventsToSend.push("bill_paid");
    }
    if (eventsToSend.length > 0) changed += 1;

    const subscribers = subscriberByInn.get(item.inn) || new Map<string, Set<string>>();
    for (const event of eventsToSend) {
      for (const [login, eventsEnabled] of subscribers.entries()) {
        if (!eventsEnabled.has(event)) continue;
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
