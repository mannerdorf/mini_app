import type { AccountPermissions } from "../../types";

export type DocSectionKey =
  | "Счета"
  | "ЭДО"
  | "УПД"
  | "Заявки"
  | "Отправки"
  | "Претензии"
  | "Договоры"
  | "Акты сверок"
  | "Тарифы";

export const DOC_SECTIONS: { key: DocSectionKey; label: string }[] = [
  { key: "ЭДО", label: "ЭДО" },
  { key: "Счета", label: "Счета" },
  { key: "УПД", label: "УПД" },
  { key: "Заявки", label: "Заявки" },
  { key: "Отправки", label: "Отправки" },
  { key: "Претензии", label: "Претензии" },
  { key: "Договоры", label: "Договоры" },
  { key: "Акты сверок", label: "Акты сверок" },
  { key: "Тарифы", label: "Тарифы" },
];

export const DOC_SECTION_TO_PERMISSION: Record<
  Exclude<DocSectionKey, "ЭДО">,
  keyof AccountPermissions
> = {
  Счета: "doc_invoices",
  УПД: "doc_acts",
  Заявки: "doc_orders",
  Отправки: "doc_sendings",
  Претензии: "doc_claims",
  Договоры: "doc_contracts",
  "Акты сверок": "doc_acts_settlement",
  Тарифы: "doc_tariffs",
};
