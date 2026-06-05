import type { Pool } from "pg";

export type HaulzPartnerDirectoryKind = "active_partner" | "need_contract" | "new_partner";

export type HaulzPartnerDirectoryInfo = {
  kind: HaulzPartnerDirectoryKind;
  label: string;
  contractNumber?: string;
  inCustomerDirectory: boolean;
  customerName?: string;
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
  try {
    const { rows: contractRows } = await pool.query<{ doc_number: string }>(
      `select doc_number
       from cache_dogovors
       where customer_inn = $1 and nullif(trim(doc_number), '') is not null
       order by doc_date desc nulls last, id desc
       limit 1`,
      [inn],
    );
    contractNumber = String(contractRows[0]?.doc_number || "").trim() || undefined;
  } catch {
    /* cache_dogovors может отсутствовать */
  }

  if (inCustomerDirectory && contractNumber) {
    return {
      kind: "active_partner",
      label: `Действующий партнёр, номер договора ${contractNumber}`,
      contractNumber,
      inCustomerDirectory: true,
      customerName,
    };
  }

  if (inCustomerDirectory) {
    return {
      kind: "need_contract",
      label: "Необходимо заключить договор",
      inCustomerDirectory: true,
      customerName,
    };
  }

  return {
    kind: "new_partner",
    label: "Новый партнёр, необходимо заключить договор",
    inCustomerDirectory: false,
  };
}
