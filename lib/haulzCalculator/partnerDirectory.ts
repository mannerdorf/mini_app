import type { Pool } from "pg";
import { isEdoMyCounterpartyStatus } from "../kontragentEdoStatus.js";

export type HaulzPartnerDirectoryKind = "active_partner" | "need_contract" | "new_partner";

export type HaulzPartnerDirectoryInfo = {
  kind: HaulzPartnerDirectoryKind;
  label: string;
  contractNumber?: string;
  contractDate?: string | null;
  inCustomerDirectory: boolean;
  customerName?: string;
  hasEdo: boolean;
};

function normalizeInnDigits(inn: string): string {
  return String(inn || "").replace(/\D/g, "").trim();
}

export async function lookupPartnerDirectoryByInn(
  pool: Pool,
  innRaw: string,
): Promise<HaulzPartnerDirectoryInfo> {
  const inn = normalizeInnDigits(innRaw);
  if (!inn) {
    return {
      kind: "new_partner",
      label: "Новый партнёр, необходимо заключить договор",
      inCustomerDirectory: false,
      hasEdo: false,
    };
  }

  let customerName: string | undefined;
  let inCustomerDirectory = false;

  try {
    const { rows: customerRows } = await pool.query<{ customer_name: string | null }>(
      `select customer_name from cache_customers where inn = $1 limit 1`,
      [inn],
    );
    if (customerRows[0]) {
      inCustomerDirectory = true;
      customerName = String(customerRows[0].customer_name || "").trim() || undefined;
    }
  } catch {
    /* cache_customers может отсутствовать */
  }

  let contractNumber: string | undefined;
  let contractDate: string | null | undefined;
  try {
    const { rows: contractRows } = await pool.query<{ doc_number: string; doc_date: string | null }>(
      `select doc_number, doc_date
       from cache_dogovors
       where customer_inn = $1 and nullif(trim(doc_number), '') is not null
       order by doc_date desc nulls last, id desc
       limit 1`,
      [inn],
    );
    contractNumber = String(contractRows[0]?.doc_number || "").trim() || undefined;
    contractDate = contractRows[0]?.doc_date ? String(contractRows[0].doc_date) : null;
  } catch {
    /* cache_dogovors может отсутствовать */
  }

  let hasEdo = false;
  try {
    const { rows: supplierRows } = await pool.query<{ counterparty_status: string | null }>(
      `select counterparty_status from cache_suppliers where inn = $1 limit 1`,
      [inn],
    );
    hasEdo = isEdoMyCounterpartyStatus(supplierRows[0]?.counterparty_status);
  } catch {
    /* cache_suppliers может отсутствовать */
  }

  if (inCustomerDirectory && contractNumber) {
    return {
      kind: "active_partner",
      label: `Действующий партнёр, номер договора ${contractNumber}`,
      contractNumber,
      contractDate,
      inCustomerDirectory: true,
      customerName,
      hasEdo,
    };
  }

  if (inCustomerDirectory) {
    return {
      kind: "need_contract",
      label: "Необходимо заключить договор",
      inCustomerDirectory: true,
      customerName,
      hasEdo,
    };
  }

  return {
    kind: "new_partner",
    label: "Новый партнёр, необходимо заключить договор",
    inCustomerDirectory: false,
    hasEdo,
  };
}
