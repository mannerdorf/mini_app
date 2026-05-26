import type { Pool } from "pg";
import { PUBLIC_OFFER_TEXT, PERSONAL_DATA_CONSENT_TEXT } from "../src/constants/legalTexts.js";

export type LegalDocumentType = "offer" | "consent";

export type LegalVersionRow = {
  id: number;
  document_type: LegalDocumentType;
  version_label: string;
  body_text: string;
  published_at: string | null;
  is_current: boolean;
  created_at: string;
  created_by: string | null;
};

export type LegalAcceptanceRow = {
  id: number;
  login: string;
  document_type: LegalDocumentType;
  version_id: number;
  version_label: string;
  accepted_at: string;
  ip: string | null;
  user_agent: string | null;
};

const SEED_VERSION_LABEL = "1.0";

let seedPromise: Promise<void> | null = null;

export async function ensureLegalDocumentsSeeded(pool: Pool): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const { rows } = await pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM legal_document_versions`
      );
      if (Number(rows[0]?.n || 0) > 0) return;

      const now = new Date().toISOString();
      for (const [document_type, body_text, version_label] of [
        ["offer", PUBLIC_OFFER_TEXT, SEED_VERSION_LABEL],
        ["consent", PERSONAL_DATA_CONSENT_TEXT, SEED_VERSION_LABEL],
      ] as const) {
        await pool.query(
          `INSERT INTO legal_document_versions (document_type, version_label, body_text, published_at, is_current, created_by)
           VALUES ($1, $2, $3, $4::timestamptz, true, 'system')`,
          [document_type, version_label, body_text, now]
        );
      }
    })().catch((e) => {
      seedPromise = null;
      throw e;
    });
  }
  await seedPromise;
}

export async function getCurrentLegalVersions(pool: Pool): Promise<Record<LegalDocumentType, LegalVersionRow | null>> {
  await ensureLegalDocumentsSeeded(pool);
  const { rows } = await pool.query<LegalVersionRow>(
    `SELECT id, document_type, version_label, body_text, published_at::text, is_current, created_at::text, created_by
     FROM legal_document_versions
     WHERE is_current = true`
  );
  const map: Record<LegalDocumentType, LegalVersionRow | null> = { offer: null, consent: null };
  for (const row of rows) {
    if (row.document_type === "offer" || row.document_type === "consent") {
      map[row.document_type] = row;
    }
  }
  return map;
}

export async function getLatestAcceptancesByLogin(
  pool: Pool,
  login: string
): Promise<Record<LegalDocumentType, LegalAcceptanceRow | null>> {
  const loginKey = login.trim().toLowerCase();
  const { rows } = await pool.query<LegalAcceptanceRow>(
    `SELECT DISTINCT ON (document_type)
       id, login, document_type, version_id, version_label, accepted_at::text, ip, user_agent
     FROM legal_acceptances
     WHERE lower(trim(login)) = $1
     ORDER BY document_type, accepted_at DESC`,
    [loginKey]
  );
  const map: Record<LegalDocumentType, LegalAcceptanceRow | null> = { offer: null, consent: null };
  for (const row of rows) {
    if (row.document_type === "offer" || row.document_type === "consent") {
      map[row.document_type] = row;
    }
  }
  return map;
}

export function needsLegalReacceptance(
  current: Record<LegalDocumentType, LegalVersionRow | null>,
  accepted: Record<LegalDocumentType, LegalAcceptanceRow | null>
): { offer: boolean; consent: boolean; any: boolean } {
  const offer = !!(current.offer && (!accepted.offer || accepted.offer.version_id !== current.offer.id));
  const consent = !!(current.consent && (!accepted.consent || accepted.consent.version_id !== current.consent.id));
  return { offer, consent, any: offer || consent };
}

export async function recordLegalAcceptances(
  pool: Pool,
  login: string,
  versionIds: { offer?: number; consent?: number },
  meta?: { ip?: string; userAgent?: string }
): Promise<void> {
  await ensureLegalDocumentsSeeded(pool);
  const loginKey = login.trim().toLowerCase();
  const current = await getCurrentLegalVersions(pool);

  for (const document_type of ["offer", "consent"] as const) {
    const versionId = versionIds[document_type] ?? current[document_type]?.id;
    if (!versionId) continue;
    const { rows } = await pool.query<{ version_label: string }>(
      `SELECT version_label FROM legal_document_versions WHERE id = $1 AND document_type = $2`,
      [versionId, document_type]
    );
    const label = rows[0]?.version_label;
    if (!label) continue;
    await pool.query(
      `INSERT INTO legal_acceptances (login, document_type, version_id, version_label, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [loginKey, document_type, versionId, label, meta?.ip ?? null, meta?.userAgent ?? null]
    );
  }
}

export async function publishLegalVersion(
  pool: Pool,
  documentType: LegalDocumentType,
  versionLabel: string,
  bodyText: string,
  createdBy: string
): Promise<LegalVersionRow> {
  await ensureLegalDocumentsSeeded(pool);
  const label = versionLabel.trim();
  const body = bodyText.trim();
  if (!label || !body) throw new Error("Укажите редакцию и текст документа");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE legal_document_versions SET is_current = false WHERE document_type = $1 AND is_current = true`,
      [documentType]
    );
    const { rows } = await client.query<LegalVersionRow>(
      `INSERT INTO legal_document_versions (document_type, version_label, body_text, published_at, is_current, created_by)
       VALUES ($1, $2, $3, now(), true, $4)
       RETURNING id, document_type, version_label, body_text, published_at::text, is_current, created_at::text, created_by`,
      [documentType, label, body, createdBy]
    );
    await client.query("COMMIT");
    return rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
