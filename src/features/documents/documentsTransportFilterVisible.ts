export function isDocumentsTransportFilterVisible(
  docSection: string,
  effectiveServiceMode: boolean,
): boolean {
  if (!effectiveServiceMode || docSection === "Тарифы") return false;
  return ![
    "Заявки",
    "Акты сверок",
    "Договоры",
    "Претензии",
    "Отправки",
  ].includes(docSection);
}
