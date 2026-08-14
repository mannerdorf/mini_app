import type { Pool, PoolClient } from "pg";
import type { CargoDateField } from "./cargoDateFilter.js";
import { cargoItemDateForField } from "./cargoDateFilter.js";
import {
  itemDate,
  itemKey,
  readCacheRow,
  type DatedDocumentCacheKind,
} from "./documentCacheRefreshCore.js";

export type NormalizedDocumentKind = "perevozki" | "invoices" | "acts" | "sendings";

export const NORMALIZED_DOCUMENT_KINDS: NormalizedDocumentKind[] = [
  "perevozki",
  "sendings",
  "invoices",
  "acts",
];

const BLOB_TABLE: Record<NormalizedDocumentKind, string> = {
  perevozki: "cache_perevozki",
  sendings: "cache_sendings",
  invoices: "cache_invoices",
  acts: "cache_acts",
};

const ROWS_TABLE: Record<NormalizedDocumentKind, string> = {
  perevozki: "cache_perevozki_rows",
  sendings: "cache_sendings_rows",
  invoices: "cache_invoices_rows",
  acts: "cache_acts_rows",
};

export type InnFilterColumn = "customer" | "sender" | "receiver";

export type NormalizedReadOptions = {
  dateField?: CargoDateField;
  inns?: Set<string> | null;
  innColumn?: InnFilterColumn;
};

const UPSERT_BATCH = 200;

function firstInn(item: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const raw = item[key];
    const value = String(raw ?? "").replace(/\D/g, "").trim();
    if (value) return value;
  }
  return "";
}

function customerInn(item: Record<string, unknown>): string {
  const v =
    item.INN ??
    item.Inn ??
    item.inn ??
    item.CustomerINN ??
    item.CustomerInn ??
    item.customerInn ??
    item.INNCustomer ??
    item.InnCustomer ??
    item.ЗаказчикИНН ??
    "";
  return String(v).replace(/\D/g, "").trim() || String(v).trim();
}

function sendingsPrimaryInn(item: Record<string, unknown>): string {
  const candidates = [
    item.CustomerINN,
    item.customerINN,
    item.CustomerInn,
    item.customerInn,
    item.SenderINN,
    item.senderINN,
    item.InnSender,
    item.INNSender,
    item.SenderInn,
    item.senderInn,
    item.ИННОтправителя,
    item.ИННОтправитель,
    item.INN_SENDER,
    item.INN,
    item.Inn,
    item.inn,
  ];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value) return value;
  }
  return "";
}

function primaryInn(kind: NormalizedDocumentKind, item: Record<string, unknown>): string {
  if (kind === "sendings") return sendingsPrimaryInn(item);
  return customerInn(item);
}

function senderInn(item: Record<string, unknown>): string {
  return firstInn(item, [
    "SenderINN",
    "senderINN",
    "SenderInn",
    "senderInn",
    "INNSender",
    "InnSender",
    "ОтправительИНН",
    "ИННОтправителя",
    "ИННОтправитель",
    "INN_SENDER",
  ]);
}

function receiverInn(item: Record<string, unknown>): string {
  return firstInn(item, [
    "ReceiverINN",
    "receiverINN",
    "ReceiverInn",
    "receiverInn",
    "INNReceiver",
    "InnReceiver",
    "ПолучательИНН",
    "ИННПолучателя",
    "ИННПолучатель",
    "INN_RECEIVER",
  ]);
}

function docNumber(item: Record<string, unknown>): string {
  return String(item.Number ?? item.number ?? item.Номер ?? item.N ?? item.НомерЗаявки ?? item.НомерОтправки ?? item.SendingNumber ?? item.sendingNumber ?? "").trim();
}

export function normalizeCargoNumberForLookup(value: unknown): string {
  return String(value ?? "").replace(/^0000-/, "").trim().replace(/^0+/, "") || "";
}

function perevozkiDocNumber(item: Record<string, unknown>): string {
  return normalizeCargoNumberForLookup(item.Number ?? item.number ?? item.НомерПеревозки ?? "");
}

function isNormalizedKind(kind: DatedDocumentCacheKind): kind is NormalizedDocumentKind {
  return (NORMALIZED_DOCUMENT_KINDS as string[]).includes(kind);
}

export async function ensureNormalizedCacheTables(pool: Pool): Promise<void> {
  await pool.query(`
    create table if not exists cache_perevozki_rows (
      item_key text primary key,
      doc_date date,
      doc_date_vr date,
      doc_number text,
      customer_inn text,
      sender_inn text,
      receiver_inn text,
      payload jsonb not null,
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(`create index if not exists idx_cache_perevozki_rows_doc_date on cache_perevozki_rows (doc_date)`);
  await pool.query(
    `create index if not exists idx_cache_perevozki_rows_doc_date_vr on cache_perevozki_rows (doc_date_vr) where doc_date_vr is not null`,
  );
  await pool.query(
    `create index if not exists idx_cache_perevozki_rows_customer_inn_date on cache_perevozki_rows (customer_inn, doc_date)`,
  );
  await pool.query(
    `create index if not exists idx_cache_perevozki_rows_doc_number on cache_perevozki_rows (doc_number) where doc_number is not null and doc_number <> ''`,
  );

  for (const kind of ["invoices", "acts", "sendings"] as const) {
    const table = ROWS_TABLE[kind];
    await pool.query(`
      create table if not exists ${table} (
        item_key text primary key,
        doc_date date,
        doc_number text,
        customer_inn text,
        payload jsonb not null,
        updated_at timestamptz not null default now()
      )
    `);
    await pool.query(`create index if not exists idx_${table}_doc_date on ${table} (doc_date)`);
    await pool.query(`create index if not exists idx_${table}_customer_inn_date on ${table} (customer_inn, doc_date)`);
  }

  await pool.query(`
    create table if not exists document_cache_normalized_state (
      kind text primary key,
      row_count bigint not null default 0,
      migrated_at timestamptz,
      updated_at timestamptz not null default now()
    )
  `);
  for (const kind of NORMALIZED_DOCUMENT_KINDS) {
    await pool.query(
      `insert into document_cache_normalized_state (kind, row_count) values ($1, 0) on conflict (kind) do nothing`,
      [kind],
    );
  }
}

async function refreshNormalizedState(db: Pool | PoolClient, kind: NormalizedDocumentKind): Promise<void> {
  const table = ROWS_TABLE[kind];
  const { rows } = await db.query<{ count: string }>(`select count(*)::text as count from ${table}`);
  const count = Number(rows[0]?.count ?? 0);
  await db.query(
    `insert into document_cache_normalized_state (kind, row_count, updated_at)
     values ($1, $2, now())
     on conflict (kind) do update set row_count = excluded.row_count, updated_at = now()`,
    [kind, count],
  );
}

export async function isNormalizedCacheReady(pool: Pool, kind: NormalizedDocumentKind): Promise<boolean> {
  try {
    const { rows } = await pool.query<{ row_count: string }>(
      `select row_count::text from document_cache_normalized_state where kind = $1`,
      [kind],
    );
    return Number(rows[0]?.row_count ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function readNormalizedState(pool: Pool): Promise<
  Record<NormalizedDocumentKind, { rowCount: number; migratedAt: string | null; updatedAt: string | null }>
> {
  const out = {} as Record<
    NormalizedDocumentKind,
    { rowCount: number; migratedAt: string | null; updatedAt: string | null }
  >;
  for (const kind of NORMALIZED_DOCUMENT_KINDS) {
    out[kind] = { rowCount: 0, migratedAt: null, updatedAt: null };
  }
  try {
    const { rows } = await pool.query<{
      kind: NormalizedDocumentKind;
      row_count: string;
      migrated_at: Date | null;
      updated_at: Date | null;
    }>(`select kind, row_count::text, migrated_at, updated_at from document_cache_normalized_state`);
    for (const row of rows) {
      if (!NORMALIZED_DOCUMENT_KINDS.includes(row.kind)) continue;
      out[row.kind] = {
        rowCount: Number(row.row_count ?? 0),
        migratedAt: row.migrated_at ? new Date(row.migrated_at).toISOString() : null,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      };
    }
  } catch {
    // tables may not exist yet
  }
  return out;
}

function buildPerevozkiParams(item: unknown): (string | null)[] {
  const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
  const docDate = itemDate("perevozki", row) || null;
  const docDateVr = cargoItemDateForField(row, "vr") || null;
  return [
    itemKey("perevozki", row),
    docDate,
    docDateVr,
    perevozkiDocNumber(row) || null,
    customerInn(row) || null,
    senderInn(row) || null,
    receiverInn(row) || null,
    JSON.stringify(row),
  ];
}

function buildSimpleParams(kind: Exclude<NormalizedDocumentKind, "perevozki">, item: unknown): (string | null)[] {
  const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
  const docDate = itemDate(kind, row) || null;
  return [itemKey(kind, row), docDate, docNumber(row) || null, primaryInn(kind, row) || null, JSON.stringify(row)];
}

/** Postgres rejects ON CONFLICT when the same item_key appears twice in one INSERT. */
function dedupeItemsByKey(kind: NormalizedDocumentKind, items: unknown[]): unknown[] {
  if (items.length <= 1) return items;
  const byKey = new Map<string, unknown>();
  for (const item of items) {
    const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    byKey.set(itemKey(kind, row), item);
  }
  return Array.from(byKey.values());
}

async function upsertPerevozkiBatch(db: Pool | PoolClient, items: unknown[]): Promise<number> {
  if (items.length === 0) return 0;
  let upserted = 0;
  for (let i = 0; i < items.length; i += UPSERT_BATCH) {
    const batch = items.slice(i, i + UPSERT_BATCH);
    const values: (string | null)[] = [];
    const placeholders: string[] = [];
    batch.forEach((item, idx) => {
      const params = buildPerevozkiParams(item);
      const base = idx * 8;
      placeholders.push(
        `($${base + 1}, $${base + 2}::date, $${base + 3}::date, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}::jsonb, now())`,
      );
      values.push(...params);
    });
    await db.query(
      `insert into cache_perevozki_rows (item_key, doc_date, doc_date_vr, doc_number, customer_inn, sender_inn, receiver_inn, payload, updated_at)
       values ${placeholders.join(", ")}
       on conflict (item_key) do update set
         doc_date = excluded.doc_date,
         doc_date_vr = excluded.doc_date_vr,
         doc_number = excluded.doc_number,
         customer_inn = excluded.customer_inn,
         sender_inn = excluded.sender_inn,
         receiver_inn = excluded.receiver_inn,
         payload = excluded.payload,
         updated_at = now()`,
      values,
    );
    upserted += batch.length;
  }
  return upserted;
}

async function upsertSimpleBatch(
  db: Pool | PoolClient,
  kind: Exclude<NormalizedDocumentKind, "perevozki">,
  items: unknown[],
): Promise<number> {
  if (items.length === 0) return 0;
  const table = ROWS_TABLE[kind];
  let upserted = 0;
  for (let i = 0; i < items.length; i += UPSERT_BATCH) {
    const batch = items.slice(i, i + UPSERT_BATCH);
    const values: (string | null)[] = [];
    const placeholders: string[] = [];
    batch.forEach((item, idx) => {
      const params = buildSimpleParams(kind, item);
      const base = idx * 5;
      placeholders.push(`($${base + 1}, $${base + 2}::date, $${base + 3}, $${base + 4}, $${base + 5}::jsonb, now())`);
      values.push(...params);
    });
    await db.query(
      `insert into ${table} (item_key, doc_date, doc_number, customer_inn, payload, updated_at)
       values ${placeholders.join(", ")}
       on conflict (item_key) do update set
         doc_date = excluded.doc_date,
         doc_number = excluded.doc_number,
         customer_inn = excluded.customer_inn,
         payload = excluded.payload,
         updated_at = now()`,
      values,
    );
    upserted += batch.length;
  }
  return upserted;
}

async function upsertItems(db: Pool | PoolClient, kind: NormalizedDocumentKind, items: unknown[]): Promise<number> {
  const deduped = dedupeItemsByKey(kind, items);
  if (kind === "perevozki") return upsertPerevozkiBatch(db, deduped);
  return upsertSimpleBatch(db, kind, deduped);
}

/** Синхронизация окна backfill/cron: удалить строки в диапазоне дат, вставить chunk из 1С. */
export async function syncNormalizedWindow(
  pool: Pool,
  kind: DatedDocumentCacheKind,
  incoming: unknown[],
  dateFrom: string,
  dateTo: string,
): Promise<number> {
  if (!isNormalizedKind(kind)) return 0;
  await ensureNormalizedCacheTables(pool);
  const table = ROWS_TABLE[kind];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`delete from ${table} where doc_date >= $1::date and doc_date <= $2::date`, [dateFrom, dateTo]);
    const count = await upsertItems(client, kind, incoming);
    await refreshNormalizedState(client, kind);
    await client.query("COMMIT");
    return count;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

function innColumnName(column: InnFilterColumn): string {
  if (column === "sender") return "sender_inn";
  if (column === "receiver") return "receiver_inn";
  return "customer_inn";
}

function perevozkiDateSql(dateField: CargoDateField): { column: string; nullFallback: boolean } {
  if (dateField === "vr") return { column: "doc_date_vr", nullFallback: true };
  if (dateField === "prih") return { column: "doc_date", nullFallback: false };
  return { column: "doc_date", nullFallback: false };
}

export async function readNormalizedByDateRange(
  pool: Pool,
  kind: NormalizedDocumentKind,
  dateFrom: string,
  dateTo: string,
  options: NormalizedReadOptions = {},
): Promise<any[]> {
  const table = ROWS_TABLE[kind];
  const params: unknown[] = [dateFrom, dateTo];
  let where = "";

  if (kind === "perevozki") {
    const { column, nullFallback } = perevozkiDateSql(options.dateField ?? "default");
    if (nullFallback) {
      where = `((${column} is not null and ${column} >= $1::date and ${column} <= $2::date)
        or (${column} is null and doc_date >= $1::date and doc_date <= $2::date))`;
    } else {
      where = `${column} >= $1::date and ${column} <= $2::date`;
    }
  } else {
    where = `(doc_date is null or (doc_date >= $1::date and doc_date <= $2::date))`;
  }

  if (options.inns && options.inns.size > 0) {
    const col = kind === "perevozki" ? innColumnName(options.innColumn ?? "customer") : "customer_inn";
    params.push(Array.from(options.inns));
    where += ` and ${col} = any($${params.length}::text[])`;
  }

  const { rows } = await pool.query<{ payload: unknown }>(
    `select payload from ${table} where ${where} order by doc_date desc nulls last`,
    params,
  );
  return rows.map((r) => r.payload);
}

export async function readNormalizedByDocNumbers(
  pool: Pool,
  kind: "perevozki",
  numbers: string[],
): Promise<any[]> {
  const wanted = [...new Set(numbers.map((n) => normalizeCargoNumberForLookup(n)).filter(Boolean))];
  if (wanted.length === 0) return [];

  const { rows } = await pool.query<{ payload: unknown }>(
    `select payload from cache_perevozki_rows where doc_number = any($1::text[])`,
    [wanted],
  );
  return rows.map((r) => r.payload);
}

export type MigrateBlobBatchResult = {
  kind: NormalizedDocumentKind;
  offset: number;
  batchSize: number;
  processed: number;
  total: number;
  done: boolean;
};

/** Пакетная миграция legacy blob → normalized rows (для админки). */
export async function migrateBlobToNormalizedBatch(
  pool: Pool,
  kind: NormalizedDocumentKind,
  offset = 0,
  batchSize = 500,
): Promise<MigrateBlobBatchResult> {
  await ensureNormalizedCacheTables(pool);
  const blob = await readCacheRow(pool, BLOB_TABLE[kind]);
  const total = blob.length;
  const slice = blob.slice(offset, offset + batchSize);
  const processed = await upsertItems(pool, kind, slice);
  const nextOffset = offset + slice.length;
  const done = nextOffset >= total;

  if (done) {
    await pool.query(
      `update document_cache_normalized_state set migrated_at = now(), updated_at = now() where kind = $1`,
      [kind],
    );
  }
  await refreshNormalizedState(pool, kind);

  return { kind, offset, batchSize, processed, total, done };
}

/** Полная пересборка normalized из blob (после полного refresh-cache). */
export async function rebuildNormalizedFromBlob(
  pool: Pool,
  kind: NormalizedDocumentKind,
): Promise<number> {
  await ensureNormalizedCacheTables(pool);
  const blob = await readCacheRow(pool, BLOB_TABLE[kind]);
  const table = ROWS_TABLE[kind];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`truncate ${table}`);
    const count = await upsertItems(client, kind, blob);
    await client.query(
      `update document_cache_normalized_state set migrated_at = now(), updated_at = now() where kind = $1`,
      [kind],
    );
    await refreshNormalizedState(client, kind);
    await client.query("COMMIT");
    return count;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function summarizeNormalizedKindByMonth(
  pool: Pool,
  kind: NormalizedDocumentKind,
): Promise<Map<string, number>> {
  const table = ROWS_TABLE[kind];
  const byMonth = new Map<string, number>();
  try {
    const { rows } = await pool.query<{ month: string; count: string }>(
      `select to_char(doc_date, 'YYYY-MM') as month, count(*)::text as count
       from ${table}
       where doc_date is not null
       group by 1
       order by 1`,
    );
    for (const row of rows) {
      if (row.month) byMonth.set(row.month, Number(row.count ?? 0));
    }
  } catch {
    // ignore
  }
  return byMonth;
}
