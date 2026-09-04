import type { Pool } from "pg";
import { cargoPlannedDeliveryDateFromItem } from "./cargoDateFilter.js";
import { extractCargoLastMileMeta, hasLastMileForPush } from "./cargoLastMileMeta.js";
import { fetchPerevozkaRecordForPush } from "./fetchPerevozkaLastMile.js";
import { formatPushPlanDateDisplay } from "./formatPushPlanDate.js";
import {
  enrichBillItemForPushTemplate,
  enrichCargoItemForPushTemplate,
  fetchInvoiceForCargoFrom1c,
  invoiceFieldsForPushMerge,
  mergeCargoItemForPushTemplate,
} from "./notificationCargoPayloadEnrich.js";
import { notificationCargoNumber } from "./notificationCargoOwnerInn.js";
import { normalizeNotificationInn } from "./notificationInnScope.js";
import { hasRealBillNumber, pickBillNumber, pickBillSumRaw } from "./notificationPoll.js";
import { formatInvoiceNumberDisplay } from "./weeklySummaryInvoiceTable.js";

export type CargoPushSnapshotRow = {
  customer_inn: string;
  cargo_number: string;
  state: string | null;
  state_bill: string | null;
  mest: string | null;
  w: string | null;
  pw: string | null;
  volume: string | null;
  sender: string | null;
  receiver: string | null;
  bill_number: string | null;
  bill_sum: string | null;
  auto_reg: string | null;
  auto_type: string | null;
  driver: string | null;
  driver_tel: string | null;
  plan_date: string | null;
  plan_date_raw: string | null;
  payload: Record<string, unknown>;
  last_mile_fetched_at: string | null;
  updated_at: string;
};

type Queryable = {
  query: <T extends Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: T[] }>;
};

export function cargoPushSnapshotKey(customerInn: string, cargoNumber: string): string {
  return `${normalizeNotificationInn(customerInn)}::${String(cargoNumber || "").trim()}`;
}

function pickFirst(item: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function formatBillSumDisplay(raw: unknown): string | null {
  const billSumNum =
    typeof raw === "number" ? raw : parseFloat(String(raw ?? "").replace(",", "."));
  if (!Number.isFinite(billSumNum)) return null;
  return new Intl.NumberFormat("ru-RU").format(Math.round(billSumNum));
}

/** Поля snapshot из объединённой записи 1С (до рендера stage_label). */
export function extractCargoPushSnapshotFields(
  customerInn: string,
  cargoNumber: string,
  merged: Record<string, unknown>,
  options?: { lastMileFetchedAt?: Date | null },
): Omit<CargoPushSnapshotRow, "updated_at"> {
  const lastMile = extractCargoLastMileMeta(merged);
  const billNumberRaw = pickBillNumber(merged);
  const billSumRaw = pickBillSumRaw(merged);
  const planRaw = cargoPlannedDeliveryDateFromItem(merged);
  const planDisplay = formatPushPlanDateDisplay(planRaw);

  return {
    customer_inn: normalizeNotificationInn(customerInn),
    cargo_number: String(cargoNumber || "").trim(),
    state: String(merged.State ?? merged.state ?? "").trim() || null,
    state_bill: String(merged.StateBill ?? merged.stateBill ?? "").trim() || null,
    mest: pickFirst(merged, ["Mest", "mest"]) != null ? String(pickFirst(merged, ["Mest", "mest"])) : null,
    w: pickFirst(merged, ["W", "w"]) != null ? String(pickFirst(merged, ["W", "w"])) : null,
    pw: pickFirst(merged, ["PW", "pw"]) != null ? String(pickFirst(merged, ["PW", "pw"])) : null,
    volume: pickFirst(merged, ["Value", "value"]) != null ? String(pickFirst(merged, ["Value", "value"])) : null,
    sender: String(merged.Sender ?? "").trim() || null,
    receiver: String(merged.Receiver ?? merged.Poluchatel ?? "").trim() || null,
    bill_number: billNumberRaw ? formatInvoiceNumberDisplay(billNumberRaw) : null,
    bill_sum: formatBillSumDisplay(billSumRaw),
    auto_reg: lastMile.autoReg || null,
    auto_type: lastMile.autoType || null,
    driver: lastMile.driver || null,
    driver_tel: lastMile.driverTel || null,
    plan_date: planDisplay !== "—" ? planDisplay : null,
    plan_date_raw: planRaw != null ? String(planRaw).trim() || null : null,
    payload: merged,
    last_mile_fetched_at: options?.lastMileFetchedAt?.toISOString() ?? null,
  };
}

/** Snapshot row → item для buildPushTemplateContext. */
export function cargoPushSnapshotToTemplateItem(row: CargoPushSnapshotRow): Record<string, unknown> {
  const base =
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? { ...(row.payload as Record<string, unknown>) }
      : {};
  return mergeCargoItemForPushTemplate(base, {
    Number: row.cargo_number,
    State: row.state ?? base.State,
    StateBill: row.state_bill ?? base.StateBill,
    Mest: row.mest ?? base.Mest,
    W: row.w ?? base.W,
    PW: row.pw ?? base.PW,
    Value: row.volume ?? base.Value,
    Sender: row.sender ?? base.Sender,
    Receiver: row.receiver ?? base.Receiver,
    BillNum: row.bill_number ?? base.BillNum,
    NumberBill: row.bill_number ?? base.NumberBill,
    SumDoc: row.bill_sum ?? base.SumDoc,
    LMAutoReg: row.auto_reg ?? base.LMAutoReg,
    LMAutoType: row.auto_type ?? base.LMAutoType,
    LMDriver: row.driver ?? base.LMDriver,
    LMDriverTel: row.driver_tel ?? base.LMDriverTel,
    DateArrivalPlan: row.plan_date_raw ?? base.DateArrivalPlan,
  });
}

export async function ensureCargoPushSnapshotTable(pool: Queryable): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cargo_push_snapshot (
      customer_inn text NOT NULL,
      cargo_number text NOT NULL,
      state text,
      state_bill text,
      mest text,
      w text,
      pw text,
      volume text,
      sender text,
      receiver text,
      bill_number text,
      bill_sum text,
      auto_reg text,
      auto_type text,
      driver text,
      driver_tel text,
      plan_date text,
      plan_date_raw text,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      last_mile_fetched_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (customer_inn, cargo_number)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cargo_push_snapshot_cargo_number
      ON cargo_push_snapshot (cargo_number)
  `);
}

export async function upsertCargoPushSnapshot(
  pool: Queryable,
  fields: Omit<CargoPushSnapshotRow, "updated_at">,
): Promise<void> {
  await ensureCargoPushSnapshotTable(pool);
  await pool.query(
    `INSERT INTO cargo_push_snapshot (
       customer_inn, cargo_number, state, state_bill, mest, w, pw, volume,
       sender, receiver, bill_number, bill_sum, auto_reg, auto_type, driver, driver_tel,
       plan_date, plan_date_raw, payload, last_mile_fetched_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20, now()
     )
     ON CONFLICT (customer_inn, cargo_number) DO UPDATE SET
       state = EXCLUDED.state,
       state_bill = EXCLUDED.state_bill,
       mest = EXCLUDED.mest,
       w = EXCLUDED.w,
       pw = EXCLUDED.pw,
       volume = EXCLUDED.volume,
       sender = EXCLUDED.sender,
       receiver = EXCLUDED.receiver,
       bill_number = COALESCE(EXCLUDED.bill_number, cargo_push_snapshot.bill_number),
       bill_sum = COALESCE(EXCLUDED.bill_sum, cargo_push_snapshot.bill_sum),
       auto_reg = COALESCE(EXCLUDED.auto_reg, cargo_push_snapshot.auto_reg),
       auto_type = COALESCE(EXCLUDED.auto_type, cargo_push_snapshot.auto_type),
       driver = COALESCE(EXCLUDED.driver, cargo_push_snapshot.driver),
       driver_tel = COALESCE(EXCLUDED.driver_tel, cargo_push_snapshot.driver_tel),
       plan_date = COALESCE(EXCLUDED.plan_date, cargo_push_snapshot.plan_date),
       plan_date_raw = COALESCE(EXCLUDED.plan_date_raw, cargo_push_snapshot.plan_date_raw),
       payload = EXCLUDED.payload,
       last_mile_fetched_at = COALESCE(EXCLUDED.last_mile_fetched_at, cargo_push_snapshot.last_mile_fetched_at),
       updated_at = now()`,
    [
      fields.customer_inn,
      fields.cargo_number,
      fields.state,
      fields.state_bill,
      fields.mest,
      fields.w,
      fields.pw,
      fields.volume,
      fields.sender,
      fields.receiver,
      fields.bill_number,
      fields.bill_sum,
      fields.auto_reg,
      fields.auto_type,
      fields.driver,
      fields.driver_tel,
      fields.plan_date,
      fields.plan_date_raw,
      JSON.stringify(fields.payload),
      fields.last_mile_fetched_at,
    ],
  );
}

/** Полное обогащение записи перевозки для snapshot (cache + счёт + GetPerevozka). */
export async function enrichCargoItemForPushSnapshot(params: {
  item: Record<string, unknown>;
  customerInn: string;
  payloadByNumber: ReadonlyMap<string, Record<string, unknown>>;
  invoiceByCargoNumber?: ReadonlyMap<string, Record<string, unknown>>;
  serviceLogin?: string;
  servicePassword?: string;
  perevozkaCache?: Map<string, Record<string, unknown> | null>;
  invoiceLiveCache?: Map<string, Record<string, unknown> | null>;
}): Promise<{ merged: Record<string, unknown>; lastMileFetchedAt: Date | null }> {
  let merged = enrichCargoItemForPushTemplate(params.item, params.payloadByNumber);
  if (params.invoiceByCargoNumber && params.invoiceByCargoNumber.size > 0) {
    merged = enrichBillItemForPushTemplate(merged, params.invoiceByCargoNumber);
  }

  const cargoNumber = notificationCargoNumber(merged);
  const customerInn = normalizeNotificationInn(params.customerInn);
  const login = String(params.serviceLogin || "").trim();
  const password = String(params.servicePassword || "").trim();

  if (!hasRealBillNumber(merged) && cargoNumber && customerInn && login && password) {
    const liveKey = `inv::${cargoNumber}::${customerInn}`;
    const liveCache = params.invoiceLiveCache;
    let liveInvoice: Record<string, unknown> | null = null;
    if (liveCache?.has(liveKey)) {
      liveInvoice = liveCache.get(liveKey) ?? null;
    } else {
      liveInvoice = await fetchInvoiceForCargoFrom1c({
        cargoNumber,
        customerInn,
        serviceLogin: login,
        servicePassword: password,
        invoiceLiveCache: liveCache,
      });
      liveCache?.set(liveKey, liveInvoice);
    }
    if (liveInvoice) {
      merged = mergeCargoItemForPushTemplate(merged, invoiceFieldsForPushMerge(liveInvoice));
    }
  }

  let lastMileFetchedAt: Date | null = null;
  if (!hasLastMileForPush(merged) && cargoNumber && login && password) {
    const cacheKey = cargoPushSnapshotKey(customerInn, cargoNumber);
    const cache = params.perevozkaCache;
    let detail: Record<string, unknown> | null = null;
    if (cache?.has(cacheKey)) {
      detail = cache.get(cacheKey) ?? null;
    } else {
      detail = await fetchPerevozkaRecordForPush({
        cargoNumber,
        customerInn,
        serviceLogin: login,
        servicePassword: password,
      });
      cache?.set(cacheKey, detail);
      if (detail) lastMileFetchedAt = new Date();
    }
    if (detail) {
      merged = mergeCargoItemForPushTemplate(merged, detail);
    }
  }

  return { merged, lastMileFetchedAt };
}

export type CargoPushSnapshotSyncEntry = {
  item: Record<string, unknown>;
  customerInn: string;
};

/**
 * Собрать snapshot в БД и вернуть map для рендера push-шаблонов.
 * Ключ: customerInn::cargoNumber → merged item.
 */
export async function syncCargoPushSnapshots(
  pool: Pool,
  params: {
    entries: CargoPushSnapshotSyncEntry[];
    payloadByNumber: ReadonlyMap<string, Record<string, unknown>>;
    invoiceByCargoNumber?: ReadonlyMap<string, Record<string, unknown>>;
    invoiceByInnAndCargo?: ReadonlyMap<string, ReadonlyMap<string, Record<string, unknown>>>;
    serviceLogin?: string;
    servicePassword?: string;
  },
): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  const perevozkaCache = new Map<string, Record<string, unknown> | null>();
  const invoiceLiveCache = new Map<string, Record<string, unknown> | null>();

  for (const entry of params.entries) {
    const cargoNumber = notificationCargoNumber(entry.item);
    const customerInn = normalizeNotificationInn(entry.customerInn);
    if (!cargoNumber || !customerInn) continue;

    const invoiceByCargoNumber =
      params.invoiceByCargoNumber ?? params.invoiceByInnAndCargo?.get(customerInn);

    const { merged, lastMileFetchedAt } = await enrichCargoItemForPushSnapshot({
      item: entry.item,
      customerInn,
      payloadByNumber: params.payloadByNumber,
      invoiceByCargoNumber,
      serviceLogin: params.serviceLogin,
      servicePassword: params.servicePassword,
      perevozkaCache,
      invoiceLiveCache,
    });

    const fields = extractCargoPushSnapshotFields(customerInn, cargoNumber, merged, { lastMileFetchedAt });
    try {
      await upsertCargoPushSnapshot(pool, fields);
    } catch {
      // snapshot persistence is best-effort when schema not migrated yet
    }

    out.set(cargoPushSnapshotKey(customerInn, cargoNumber), merged);
  }

  return out;
}
