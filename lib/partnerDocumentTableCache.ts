import type { Pool } from "pg";
import { getPool } from "../api/_db.js";
import type { VerifiedRegisteredUser } from "./verifyRegisteredUser.js";
import { canonInnForApiKey } from "./userApiKeyInnFilter.js";

function tableInnFilter(inn: unknown): string {
  return inn && String(inn).trim() ? String(inn).trim() : "";
}

export async function readPartnerDogovorsFromCache(inn?: unknown) {
  const pool = getPool();
  const filterInn = tableInnFilter(inn);
  const { rows } = await pool.query(
    `SELECT
       id,
       doc_number AS "docNumber",
       doc_date AS "docDate",
       customer_name AS "customerName",
       customer_inn AS "customerInn",
       title,
       edo_status AS "edoStatus",
       data,
       sort_order AS "sortOrder",
       fetched_at AS "fetchedAt"
     FROM cache_dogovors
     WHERE ($1::text = '' OR customer_inn = $1::text)
     ORDER BY doc_date DESC NULLS LAST, doc_number DESC, id DESC`,
    [filterInn],
  );
  return rows as { customerInn?: string }[];
}

export async function readPartnerSverkiFromCache(inn?: unknown) {
  const pool = getPool();
  const filterInn = tableInnFilter(inn);
  const { rows } = await pool.query(
    `SELECT
       id,
       doc_number AS "docNumber",
       doc_date AS "docDate",
       period_from AS "periodFrom",
       period_to AS "periodTo",
       customer_name AS "customerName",
       customer_inn AS "customerInn",
       edo_status AS "edoStatus",
       data,
       sort_order AS "sortOrder",
       fetched_at AS "fetchedAt"
     FROM cache_sverki
     WHERE ($1::text = '' OR customer_inn = $1::text)
     ORDER BY doc_date DESC NULLS LAST, doc_number DESC, id DESC`,
    [filterInn],
  );
  return rows as { customerInn?: string }[];
}

export async function readPartnerTariffsFromCache(inn?: unknown) {
  const pool = getPool();
  const filterInn = tableInnFilter(inn);
  const { rows } = await pool.query(
    `SELECT
       id,
       doc_date AS "docDate",
       doc_number AS "docNumber",
       customer_name AS "customerName",
       customer_inn AS "customerInn",
       city_from AS "cityFrom",
       city_to AS "cityTo",
       transport_type AS "transportType",
       is_dangerous AS "isDangerous",
       is_vet AS "isVet",
       tariff,
       data,
       sort_order AS "sortOrder",
       fetched_at AS "fetchedAt"
     FROM cache_tariffs
     WHERE ($1::text = '' OR customer_inn = $1::text)
     ORDER BY doc_date DESC NULLS LAST, doc_number DESC, id DESC`,
    [filterInn],
  );
  return rows as { customerInn?: string }[];
}

export async function readPartnerClaimsFromDb(
  pool: Pool,
  loginKey: string,
  verified: VerifiedRegisteredUser,
  dateFrom: string,
  dateTo: string,
  inn: unknown,
  limit = 200,
) {
  const claimsColsRes = await pool.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'claims'`,
  );
  const claimsCols = new Set(claimsColsRes.rows.map((r) => String(r.column_name || "").trim()));
  const hasExpertLogin = claimsCols.has("expert_login");

  const selectedInnNorm = canonInnForApiKey(String(inn ?? ""));
  const verifiedInnNorm = canonInnForApiKey(verified.inn ?? "");

  const where: string[] = [hasExpertLogin ? "(customer_login = $1 OR expert_login = $1)" : "customer_login = $1"];
  const params: unknown[] = [loginKey];

  if (selectedInnNorm) {
    if (!verified.accessAllInns && verifiedInnNorm && selectedInnNorm !== verifiedInnNorm) {
      return [];
    }
    params.push(selectedInnNorm);
    where.push(`regexp_replace(customer_inn::text, '\\D', '', 'g') = $${params.length}`);
  }

  params.push(dateFrom);
  where.push(`created_at >= ($${params.length}::date)`);
  params.push(dateTo);
  where.push(`created_at < ($${params.length}::date + interval '1 day')`);
  params.push(Math.min(200, Math.max(1, limit)));

  const { rows } = await pool.query(
    `SELECT
       id,
       claim_number AS "claimNumber",
       cargo_number AS "cargoNumber",
       claim_type AS "claimType",
       description,
       requested_amount AS "requestedAmount",
       approved_amount AS "approvedAmount",
       status,
       customer_company_name AS "customerCompanyName",
       customer_inn AS "customerInn",
       created_at AS "createdAt",
       updated_at AS "updatedAt"
     FROM claims
     WHERE ${where.join(" AND ")}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows as { customerInn?: string }[];
}

export function pickTableCustomerInn(row: { customerInn?: string }): string {
  return String(row.customerInn ?? "").trim();
}

export function pickClaimCustomerInn(row: { customerInn?: string }): string {
  return canonInnForApiKey(String(row.customerInn ?? ""));
}
