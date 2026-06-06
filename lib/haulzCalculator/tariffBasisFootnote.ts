export type TariffBasis = {
  tariffNumber: string;
  tariffDate: string | null;
  contractNumber: string;
  contractDate: string | null;
};

export function formatDocDateRu(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

export function formatTariffBasisFootnote(basis: TariffBasis): string | null {
  const tariffNumber = String(basis.tariffNumber || "").trim();
  const contractNumber = String(basis.contractNumber || "").trim();
  if (!tariffNumber || !contractNumber) return null;

  const tariffDate = formatDocDateRu(basis.tariffDate);
  const contractDate = formatDocDateRu(basis.contractDate);
  const tariffDatePart = tariffDate ? ` от ${tariffDate}` : "";
  const contractDatePart = contractDate ? ` от ${contractDate}` : "";

  return `На основе согласованного тарифа №${tariffNumber}${tariffDatePart} по договору №${contractNumber}${contractDatePart}`;
}
