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
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    const t = value.getTime();
    if (Number.isNaN(t)) return null;
    return value.toISOString().slice(0, 10);
  }
  let s = String(value).trim();
  if (!s) return null;
  // NBSP, узкие пробелы, «умные» точки (Google Sheets / Excel)
  s = s.replace(/\u00a0/g, " ").replace(/\u2007|\u202f/g, " ").trim();
  s = s.replace(/[．。‧·‧∙⋅]/g, ".");
  s = s.replace(/\s+/g, "");
  if (!s) return null;
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // dd.mm.yyyy или dd/mm/yyyy
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

/**
 * Шаблон для `... ilike $n escape '\\'` — поиск подстроки (номер коробки и т.д.).
 * Экранирует % и _ во вводе пользователя.
 */
export function pgIlikeContainsPattern(term: string): string {
  return `%${term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
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
      shk: string | null;
      row_number: number | null;
      description: string | null;
      nomenclature: string | null;
      price_rub: string | number | null;
      inventory_created_at: string | null;
    };
    let inboundRows: InboundRow[] = [];
    if (await pgTableExists(pool, "wb_inbound_items")) {
      const ir = await client.query<InboundRow>(
        `SELECT id, box_number, shk, row_number, description, nomenclature, price_rub, inventory_created_at
         FROM wb_inbound_items`,
      );
      inboundRows = ir.rows;
    }
    /** Одна строка описи на номер коробки: приоритет — более новая дата описи, затем больший id. */
    const inboundByBox = new Map<string, InboundRow>();
    /** Сопоставление с претензией по ШК (wb_inbound_items.shk). */
    const inboundByShk = new Map<string, InboundRow>();
    const invTs = (r: InboundRow) => {
      const d = r.inventory_created_at;
      if (d == null || d === "") return 0;
      const t = new Date(d as string).getTime();
      return Number.isFinite(t) ? t : 0;
    };
    const upsertInboundByKey = (map: Map<string, InboundRow>, key: string, row: InboundRow) => {
      if (!key) return;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, row);
        return;
      }
      const pt = invTs(prev);
      const ct = invTs(row);
      if (ct > pt || (ct === pt && row.id > prev.id)) map.set(key, row);
    };
    for (const row of inboundRows) {
      upsertInboundByKey(inboundByBox, String(row.box_number || "").trim(), row);
      upsertInboundByKey(inboundByShk, String(row.shk || "").trim(), row);
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
    /** Возврат: box_id в файле часто совпадает с ШК — тот же ключ, что и inboundByShk. */
    const returnedByShk = new Map<string, ReturnedRow>();
    for (const row of returnedRows) {
      const key = String(row.box_id || "").trim();
      if (!key) continue;
      if (!returnedByBox.has(key)) returnedByBox.set(key, row);
      if (!returnedByShk.has(key)) returnedByShk.set(key, row);
    }

    type ClaimRow = {
      id: number;
      box_id: string | null;
      shk: string | null;
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
        `SELECT id, box_id, shk, claim_number, doc_number, doc_date, row_number, description, amount_rub
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

    await client.query("TRUNCATE TABLE wb_summary");

    type SummaryInsertRow = {
      boxId: string | null;
      claimNumber: string | null;
      declared: boolean;
      docNumber: string | null;
      docDate: string | null;
      sourceRow: number | null;
      description: string | null;
      cost: number;
      inboundId: number | null;
      returnedId: number | null;
      claimId: number | null;
      shk: string | null;
      isReturned: boolean;
    };

    const insertSummaryBulk = async (slices: SummaryInsertRow[]) => {
      const CHUNK = 200;
      for (let c = 0; c < slices.length; c += CHUNK) {
        const slice = slices.slice(c, c + CHUNK);
        const rowTuples: string[] = [];
        const params: unknown[] = [];
        let p = 1;
        for (const row of slice) {
          rowTuples.push(
            `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}::date, $${p++}, $${p++}, $${p++}::numeric, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, now())`,
          );
          params.push(
            row.boxId,
            row.claimNumber,
            row.declared,
            row.docNumber,
            row.docDate,
            row.sourceRow,
            row.description,
            row.cost,
            row.inboundId,
            row.returnedId,
            row.claimId,
            row.shk,
            row.isReturned,
          );
        }
        await client.query(
          `INSERT INTO wb_summary (
            box_id, claim_number, declared, source_document_number, source_document_date, source_row_number,
            description, cost_rub, inbound_item_id, returned_item_id, claim_item_id, shk, is_returned, updated_at
         ) VALUES ${rowTuples.join(", ")}`,
          params,
        );
      }
    };

    /** Активная ревизия претензий: одна строка сводной на каждую строку претензии; опись и возврат — по ШК, затем по номеру коробки. */
    if (activeRevisionId && claimRows.length > 0) {
      const rowsOut: SummaryInsertRow[] = [];
      for (const claim of claimRows) {
        const claimShkTrim = String(claim.shk ?? "").trim();
        const claimBoxTrim = String(claim.box_id ?? "").trim();
        const keyShk = claimShkTrim || claimBoxTrim;
        if (!keyShk && !claim.claim_number && !claim.description) continue;

        const inboundByShkFirst =
          (keyShk ? inboundByShk.get(keyShk) : null) ||
          (claimBoxTrim ? inboundByBox.get(claimBoxTrim) : null) ||
          null;
        const returned =
          (keyShk ? returnedByShk.get(keyShk) : null) ||
          (claimBoxTrim ? returnedByBox.get(claimBoxTrim) : null) ||
          null;

        const description =
          claim.description ||
          returned?.description ||
          inboundByShkFirst?.description ||
          inboundByShkFirst?.nomenclature ||
          null;
        const cost = parseNum(claim.amount_rub ?? returned?.amount_rub ?? inboundByShkFirst?.price_rub ?? 0);
        const docNumber = claim.doc_number || returned?.document_number || null;
        const rawDocDate = claim.doc_date || returned?.document_date || inboundByShkFirst?.inventory_created_at || null;
        const docDate = rawDocDate == null || rawDocDate === "" ? null : parseDateOnly(rawDocDate);

        const displayBox =
          (inboundByShkFirst?.box_number && String(inboundByShkFirst.box_number).trim()) || claimBoxTrim || null;
        const displayShk =
          claimShkTrim ||
          (inboundByShkFirst?.shk && String(inboundByShkFirst.shk).trim()) ||
          (claimBoxTrim && !claimShkTrim ? claimBoxTrim : null) ||
          null;

        rowsOut.push({
          boxId: displayBox,
          claimNumber: claim.claim_number,
          declared: true,
          docNumber,
          docDate,
          sourceRow: claim.row_number,
          description,
          cost,
          inboundId: inboundByShkFirst?.id ?? null,
          returnedId: returned?.id ?? null,
          claimId: claim.id,
          shk: displayShk,
          isReturned: returned != null,
        });
      }
      await insertSummaryBulk(rowsOut);
      await client.query("commit");
      return { rows: rowsOut.length };
    }

    const boxes = new Set<string>([
      ...inboundByBox.keys(),
      ...returnedByBox.keys(),
      ...claimsByBox.keys(),
      ...inboundByShk.keys(),
    ]);

    if (boxes.size === 0) {
      await client.query("commit");
      return { rows: 0 };
    }

    const boxList = [...boxes];
    const legacyRows: SummaryInsertRow[] = [];
    for (const boxId of boxList) {
      const inbound = inboundByBox.get(boxId) ?? inboundByShk.get(boxId);
      const returned = returnedByBox.get(boxId) ?? returnedByShk.get(boxId);
      const claim = claimsByBox.get(boxId);
      const description =
        claim?.description ||
        returned?.description ||
        inbound?.description ||
        inbound?.nomenclature ||
        null;
      const cost = parseNum(claim?.amount_rub ?? returned?.amount_rub ?? inbound?.price_rub ?? 0);
      const docNumber = claim?.doc_number || returned?.document_number || null;
      const rawDocDate = claim?.doc_date || returned?.document_date || inbound?.inventory_created_at || null;
      const docDate = rawDocDate == null || rawDocDate === "" ? null : parseDateOnly(rawDocDate);
      const sourceRow = claim?.row_number ?? inbound?.row_number ?? null;
      const shkVal =
        (inbound?.shk && String(inbound.shk).trim()) || (String(boxId).trim() || null);
      legacyRows.push({
        boxId,
        claimNumber: claim?.claim_number || null,
        declared: !!claim,
        docNumber,
        docDate,
        sourceRow,
        description,
        cost,
        inboundId: inbound?.id ?? null,
        returnedId: returned?.id ?? null,
        claimId: claim?.id ?? null,
        shk: shkVal,
        isReturned: returned != null,
      });
    }
    await insertSummaryBulk(legacyRows);

    await client.query("commit");
    return { rows: legacyRows.length };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // уже не в транзакции / соединение оборвано
    }
    throw error;
  } finally {
    try {
      client.release();
    } catch {
      /* ignore */
    }
  }
}

