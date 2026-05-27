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

const DEFAULT_PAYEE: CompanyPayeeDetails = {
  name: "ООО «Холз»",
  inn: "9706037094",
  kpp: "770601001",
  account: "40702810910001507546",
  bankName: "АО «ТИНЬКОФФ БАНК»",
  bic: "044525974",
  corrAccount: "30101810145250000974",
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

function payeeFromEnv(): CompanyPayeeDetails | null {
  const account = String(process.env.HAULZ_PAYEE_ACCOUNT ?? "").replace(/\s/g, "");
  const bic = String(process.env.HAULZ_PAYEE_BIC ?? "").replace(/\s/g, "");
  const bankName = String(process.env.HAULZ_PAYEE_BANK_NAME ?? "").trim();
  if (!account || !bic || !bankName) return null;
  return {
    name: String(process.env.HAULZ_PAYEE_NAME ?? "").trim() || DEFAULT_PAYEE.name,
    inn: String(process.env.HAULZ_PAYEE_INN ?? "").trim() || DEFAULT_PAYEE.inn,
    kpp: String(process.env.HAULZ_PAYEE_KPP ?? "").trim() || DEFAULT_PAYEE.kpp,
    account,
    bankName,
    bic,
    corrAccount: String(process.env.HAULZ_PAYEE_CORR_ACCOUNT ?? "").replace(/\s/g, "") || DEFAULT_PAYEE.corrAccount,
  };
}

/** Банковские реквизиты получателя для QR (ГОСТ ST00012) из таблицы haulz_company_payee. */
export async function loadCompanyPayeeDetails(pool: Pool): Promise<CompanyPayeeDetails | null> {
  try {
    const { rows } = await pool.query<PayeeRow>(
      `SELECT name, inn, kpp, account, bank_name, bic, corr_account
       FROM haulz_company_payee
       WHERE id = 1`
    );
    const row = rows[0];
    const fromDb = row ? rowToPayee(row) : null;
    if (fromDb) return fromDb;
  } catch {
    /* таблица не создана — env / дефолт */
  }
  return payeeFromEnv() ?? DEFAULT_PAYEE;
}

export async function isCompanyPayeeConfigured(pool: Pool): Promise<boolean> {
  return (await loadCompanyPayeeDetails(pool)) != null;
}
