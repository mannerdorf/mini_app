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

function envTrim(key: string): string {
  return String(process.env[key] ?? "").trim();
}

/** Банковские реквизиты получателя для QR (ГОСТ ST00012). Задаются в env на сервере. */
export function loadCompanyPayeeDetails(): CompanyPayeeDetails | null {
  const account = envTrim("HAULZ_PAYEE_ACCOUNT").replace(/\s/g, "");
  const bic = envTrim("HAULZ_PAYEE_BIC").replace(/\s/g, "");
  const bankName = envTrim("HAULZ_PAYEE_BANK_NAME");
  const corrAccount = envTrim("HAULZ_PAYEE_CORR_ACCOUNT").replace(/\s/g, "");

  if (!account || !bic || !bankName) return null;

  return {
    name: envTrim("HAULZ_PAYEE_NAME") || HAULZ_LEGAL.name,
    inn: envTrim("HAULZ_PAYEE_INN") || HAULZ_LEGAL.inn,
    kpp: envTrim("HAULZ_PAYEE_KPP") || HAULZ_LEGAL.kpp,
    account,
    bankName,
    bic,
    corrAccount,
  };
}

export function isCompanyPayeeConfigured(): boolean {
  return loadCompanyPayeeDetails() != null;
}
