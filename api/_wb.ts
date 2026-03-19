import type { VercelRequest } from "@vercel/node";
import type { Pool } from "pg";
import { verifyPassword } from "../lib/passwordUtils.js";
import { getAdminTokenFromRequest, verifyAdminToken } from "../lib/adminAuth.js";

type AccessMode = "read" | "write";

export type WbAccess = {
  login: string;
  isAdmin: boolean;
  permissions: Record<string, boolean>;
};

function asText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLogin(value: unknown) {
  return asText(value).toLowerCase();
}

export function parseBooleanFlag(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return fallback;
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

export function parseNum(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseDateOnly(value: unknown): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // dd.mm.yyyy
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) {
    const dd = m[1]!.padStart(2, "0");
    const mm = m[2]!.padStart(2, "0");
    const yyyy = m[3]!;
    return `${yyyy}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Проверка наличия таблицы в public (частично применённые миграции WB). */
export async function pgTableExists(pool: Pool, tableName: string): Promise<boolean> {
  const { rows } = await pool.query<{ e: boolean }>(
    `select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = $1
    ) as e`,
    [tableName],
  );
  return rows[0]?.e === true;
}

export async function resolveWbAccess(
  req: VercelRequest,
  pool: Pool,
  mode: AccessMode,
): Promise<WbAccess | null> {
  const adminToken = getAdminTokenFromRequest(req);
  if (verifyAdminToken(adminToken)) {
    return { login: "admin", isAdmin: true, permissions: { wb: true, wb_admin: true, cms_access: true } };
  }

  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  const login = normalizeLogin(body.login ?? req.headers["x-login"] ?? req.query.login);
  const password = asText(body.password ?? req.headers["x-password"] ?? req.query.password);
  if (!login || !password) return null;

  const { rows } = await pool.query<{
    login: string;
    password_hash: string;
    permissions: Record<string, boolean> | null;
    active: boolean;
  }>(
    "SELECT login, password_hash, permissions, active FROM registered_users WHERE lower(trim(login)) = $1 LIMIT 1",
    [login],
  );
  const user = rows[0];
  if (!user || !user.active) return null;
  if (!verifyPassword(password, user.password_hash)) return null;

  const permissions =
    user.permissions && typeof user.permissions === "object"
      ? user.permissions
      : {};
  const isAdmin = permissions.cms_access === true;
  const canRead = isAdmin || permissions.wb === true || permissions.wb_admin === true;
  const canWrite = isAdmin || permissions.wb_admin === true;
  if ((mode === "read" && !canRead) || (mode === "write" && !canWrite)) return null;

  return { login: user.login, isAdmin, permissions };
}

export async function rebuildWbSummary(pool: Pool): Promise<{ rows: number; skipped?: boolean }> {
  if (!(await pgTableExists(pool, "wb_summary"))) {
    return { rows: 0, skipped: true };
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    let activeRevisionId: number | null = null;
    if (await pgTableExists(pool, "wb_claims_revisions")) {
      const { rows: revRows } = await client.query<{ id: number }>(
        "SELECT id FROM wb_claims_revisions WHERE is_active = true ORDER BY uploaded_at DESC LIMIT 1",
      );
      activeRevisionId = revRows[0]?.id ?? null;
    }

    type InboundRow = {
      id: number;
      box_number: string;
      row_number: number | null;
      description: string | null;
      nomenclature: string | null;
      price_rub: string | number | null;
      inventory_created_at: string | null;
    };
    let inboundRows: InboundRow[] = [];
    if (await pgTableExists(pool, "wb_inbound_items")) {
      const ir = await client.query<InboundRow>(
        `SELECT id, box_number, row_number, description, nomenclature, price_rub, inventory_created_at
         FROM wb_inbound_items`,
      );
      inboundRows = ir.rows;
    }
    const inboundByBox = new Map<string, InboundRow>();
    for (const row of inboundRows) {
      const key = String(row.box_number || "").trim();
      if (!key) continue;
      if (!inboundByBox.has(key)) inboundByBox.set(key, row);
    }

    type ReturnedRow = {
      id: number;
      box_id: string;
      description: string | null;
      amount_rub: string | number | null;
      document_number: string | null;
      document_date: string | null;
      created_at: string;
    };
    let returnedRows: ReturnedRow[] = [];
    if (await pgTableExists(pool, "wb_returned_items")) {
      const rr = await client.query<ReturnedRow>(
        `SELECT id, box_id, description, amount_rub, document_number, document_date, created_at
         FROM wb_returned_items
         ORDER BY created_at DESC`,
      );
      returnedRows = rr.rows;
    }
    const returnedByBox = new Map<string, ReturnedRow>();
    for (const row of returnedRows) {
      const key = String(row.box_id || "").trim();
      if (!key) continue;
      if (!returnedByBox.has(key)) returnedByBox.set(key, row);
    }

    type ClaimRow = {
      id: number;
      box_id: string | null;
      claim_number: string | null;
      doc_number: string | null;
      doc_date: string | null;
      row_number: number | null;
      description: string | null;
      amount_rub: string | number | null;
    };
    let claimRows: ClaimRow[] = [];
    if (activeRevisionId && (await pgTableExists(pool, "wb_claims_items"))) {
      const claims = await client.query<ClaimRow>(
        `SELECT id, box_id, claim_number, doc_number, doc_date, row_number, description, amount_rub
         FROM wb_claims_items
         WHERE revision_id = $1`,
        [activeRevisionId],
      );
      claimRows = claims.rows;
    }
    const claimsByBox = new Map<string, ClaimRow>();
    for (const row of claimRows) {
      const key = String(row.box_id || "").trim();
      if (!key) continue;
      if (!claimsByBox.has(key)) claimsByBox.set(key, row);
    }

    const boxes = new Set<string>([
      ...inboundByBox.keys(),
      ...returnedByBox.keys(),
      ...claimsByBox.keys(),
    ]);

    if (boxes.size === 0) {
      await client.query("TRUNCATE TABLE wb_summary");
      await client.query("commit");
      return { rows: 0 };
    }

    for (const boxId of boxes) {
      const inbound = inboundByBox.get(boxId);
      const returned = returnedByBox.get(boxId);
      const claim = claimsByBox.get(boxId);
      const description =
        claim?.description ||
        returned?.description ||
        inbound?.description ||
        inbound?.nomenclature ||
        null;
      const cost = parseNum(claim?.amount_rub ?? returned?.amount_rub ?? inbound?.price_rub ?? 0);
      const docNumber = claim?.doc_number || returned?.document_number || null;
      const docDate = claim?.doc_date || returned?.document_date || inbound?.inventory_created_at || null;
      const sourceRow = claim?.row_number ?? inbound?.row_number ?? null;

      await client.query(
        `INSERT INTO wb_summary (
            box_id, claim_number, declared, source_document_number, source_document_date, source_row_number,
            description, cost_rub, inbound_item_id, returned_item_id, claim_item_id, updated_at
         ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11, now()
         )
         ON CONFLICT (box_id) DO UPDATE SET
            claim_number = EXCLUDED.claim_number,
            declared = EXCLUDED.declared,
            source_document_number = EXCLUDED.source_document_number,
            source_document_date = EXCLUDED.source_document_date,
            source_row_number = EXCLUDED.source_row_number,
            description = EXCLUDED.description,
            cost_rub = EXCLUDED.cost_rub,
            inbound_item_id = EXCLUDED.inbound_item_id,
            returned_item_id = EXCLUDED.returned_item_id,
            claim_item_id = EXCLUDED.claim_item_id,
            updated_at = now()`,
        [
          boxId,
          claim?.claim_number || null,
          !!claim,
          docNumber,
          docDate,
          sourceRow,
          description,
          cost,
          inbound?.id ?? null,
          returned?.id ?? null,
          claim?.id ?? null,
        ],
      );
    }

    await client.query("DELETE FROM wb_summary WHERE box_id <> ALL($1::text[])", [[...boxes]]);
    await client.query("commit");
    return { rows: boxes.size };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

