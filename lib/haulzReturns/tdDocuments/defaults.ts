import { format } from "date-fns";

export function formatRuDate(d = new Date()): string {
  return format(d, "dd.MM.yyyy");
}

export function defaultSpecHeader(date = formatRuDate()): Record<string, string> {
  return {
    productEaeu: "ТОВАР ЕАЭС",
    exportPermit: `ВЫВОЗ РАЗРЕШЕН      ${date}`,
    zpu: "01 ЗПУ №",
    fts: `02 ФТС № от ${date}`,
    title: `Спецификация №1 от ${date} к CMR б/н от ${date}`,
    headerTd: "",
  };
}

export function defaultProformaHeader(date = formatRuDate()): Record<string, string> {
  return {
    productEaeu: "ТОВАР ЕАЭС",
    exportPermit: `ВЫВОЗ РАЗРЕШЕН      ${date}`,
    zpu: "01 ЗПУ №",
    fts: `02 ФТС № от ${date}`,
    title: `Счет-проформа №1 от ${date}`,
  };
}

export function defaultSpecificationDraft(headerTd = "") {
  const base = defaultSpecHeader();
  if (headerTd) base.headerTd = headerTd;
  return base;
}

export function defaultProformaDraft() {
  return defaultProformaHeader();
}
