import type { Pool } from "pg";
import { HAULZ_LEGAL } from "./haulzLegal.js";

export type CompanyPayeeDetails = {
  name: string;
  inn: string;
  kpp: string;
  account: string;
  bankName: string;
  bic: string;
  corrAccount: string;
};

type PayeeRow = {
  name: string;
  inn: string;
  kpp: string;
  account: string;
  bank_name: string;
  bic: string;
  corr_account: string;
};

function rowToPayee(row: PayeeRow): CompanyPayeeDetails | null {
  const account = String(row.account ?? "").replace(/\s/g, "");
  const bic = String(row.bic ?? "").replace(/\s/g, "");
  const bankName = String(row.bank_name ?? "").trim();
  const corrAccount = String(row.corr_account ?? "").replace(/\s/g, "");

  if (!account || !bic || !bankName) return null;

  return {
    name: String(row.name ?? "").trim() || HAULZ_LEGAL.name,
    inn: String(row.inn ?? "").trim() || HAULZ_LEGAL.inn,
    kpp: String(row.kpp ?? "").trim() || HAULZ_LEGAL.kpp,
    account,
    bankName,
    bic,
    corrAccount,
  };
}

/** Банковские реквизиты получателя для QR (ГОСТ ST00012) из таблицы haulz_company_payee. */
export async function loadCompanyPayeeDetails(pool: Pool): Promise<CompanyPayeeDetails | null> {
  const { rows } = await pool.query<PayeeRow>(
    `SELECT name, inn, kpp, account, bank_name, bic, corr_account
     FROM haulz_company_payee
     WHERE id = 1`
  );
  const row = rows[0];
  if (!row) return null;
  return rowToPayee(row);
}

export async function isCompanyPayeeConfigured(pool: Pool): Promise<boolean> {
  return (await loadCompanyPayeeDetails(pool)) != null;
}
