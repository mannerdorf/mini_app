import { randomBytes } from "node:crypto";
import type { Pool } from "pg";

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SENDING_ID_LEN = 16;
const CUSTOMER_PREFIX_LEN = 4;

export function normalizeCustomerInnForSendingId(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").trim();
}

/** Префикс 4 символа из ИНН заказчика (последние цифры). */
export function customerSendingIdPrefix(customerInn: string): string {
  const digits = normalizeCustomerInnForSendingId(customerInn);
  return digits.slice(-CUSTOMER_PREFIX_LEN).padStart(CUSTOMER_PREFIX_LEN, "0");
}

function randomSendingIdSuffix(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  }
  return out;
}

export function buildSendingIdCandidate(customerInn: string): string {
  const prefix = customerSendingIdPrefix(customerInn);
  const suffixLen = SENDING_ID_LEN - prefix.length;
  return `${prefix}${randomSendingIdSuffix(suffixLen)}`;
}

export async function ensureZayavkaSendingIdsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS zayavka_sending_ids (
      id bigserial PRIMARY KEY,
      customer_inn text NOT NULL,
      sending_id char(16) NOT NULL,
      nomer_zayavki text,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT zayavka_sending_ids_sending_id_key UNIQUE (sending_id)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS zayavka_sending_ids_customer_inn_idx
      ON zayavka_sending_ids (customer_inn)
  `);
}

/** Выдаёт уникальные 16-символьные ИДОтправления для заказчика (с записью в кэш). */
export async function allocateZayavkaSendingIds(
  pool: Pool,
  customerInnRaw: string,
  count: number,
  opts?: { nomerZayavki?: string | null },
): Promise<string[]> {
  const customerInn = normalizeCustomerInnForSendingId(customerInnRaw);
  const n = Math.max(0, Math.min(500, Math.floor(Number(count) || 0)));
  if (!customerInn || n === 0) return [];

  await ensureZayavkaSendingIdsTable(pool);
  const nomerZayavki = String(opts?.nomerZayavki ?? "").trim() || null;
  const out: string[] = [];

  for (let i = 0; i < n; i++) {
    let inserted = false;
    for (let attempt = 0; attempt < 24 && !inserted; attempt++) {
      const candidate = buildSendingIdCandidate(customerInn);
      try {
        await pool.query(
          `INSERT INTO zayavka_sending_ids (customer_inn, sending_id, nomer_zayavki)
           VALUES ($1, $2, $3)`,
          [customerInn, candidate, nomerZayavki],
        );
        out.push(candidate);
        inserted = true;
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code === "23505") continue;
        throw e;
      }
    }
    if (!inserted) {
      throw new Error("Не удалось сгенерировать уникальный ИДОтправления");
    }
  }

  return out;
}
