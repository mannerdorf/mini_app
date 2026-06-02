/** Строки и колонки шаблонов Excel (1-based). */

export const SPEC_TEMPLATE = {
  sheetName: "Спецификация",
  header: {
    row1Col5: { row: 1, col: 5, key: "productEaeu" },
    row2Col5: { row: 2, col: 5, key: "exportPermit" },
    row3Col5: { row: 3, col: 5, key: "zpu" },
    row4Col5: { row: 4, col: 5, key: "fts" },
    row5Title: { row: 5, col: 1, key: "title" },
    row5Td: { row: 5, col: 5, key: "headerTd" },
  },
  tableHeaderRow: 12,
  dataStartRow: 13,
  dataCols: {
    num: 1,
    id: 2,
    parcel: 3,
    name: 4,
    qty: 5,
    weight: 6,
    cost: 7,
    tdNumber: 8,
  },
} as const;

export const PROFORMA_TEMPLATE = {
  sheetName: "проформа",
  header: {
    row1Col5: { row: 1, col: 5, key: "productEaeu" },
    row2Col5: { row: 2, col: 5, key: "exportPermit" },
    row3Col5: { row: 3, col: 5, key: "zpu" },
    row4Col5: { row: 4, col: 5, key: "fts" },
    row5Title: { row: 5, col: 1, key: "title" },
    row5Td: { row: 5, col: 5, key: "headerTd" },
  },
  tableHeaderRow: 10,
  dataStartRow: 11,
  dataCols: {
    num: 1,
    id: 2,
    parcel: 3,
    name: 4,
    qty: 5,
    weight: 6,
    cost: 7,
  },
} as const;

export const PORUCHENIE_TEMPLATE = {
  sheetName: "Поручение",
  titleRow: 1,
  cityRow: 2,
  preambleRow: 3,
  preambleMergeRows: 3,
  tableHeaderRow: 6,
  dataStartRow: 7,
  headerCols: 8,
  dataCols: {
    num: 1,
    ulLine: 2,
    id: 3,
    parcel: 4,
    weight: 5,
    name: 6,
    qty: 7,
    cost: 8,
  },
} as const;

export const WRITEOFF_TEMPLATE = {
  titleRow: 2,
  tdRow: 3,
  tableHeaderRow: 6,
  dataStartRow: 7,
  dataCols: {
    num: 1,
    ulLine: 2,
    id: 3,
    parcel: 4,
    airport: 5,
    weight: 6,
    volume: 7,
    category: 8,
    name: 9,
    qty: 10,
    cost: 11,
  },
} as const;

export const SPEC_EDITABLE_KEYS = [
  "productEaeu",
  "exportPermit",
  "zpu",
  "fts",
  "title",
  "headerTd",
] as const;

export type SpecEditableKey = (typeof SPEC_EDITABLE_KEYS)[number];

export type PreviewColumn = { key: string; label: string };

/** Заголовки preview-таблиц — как в шаблонах Excel. */
export const SPEC_PREVIEW_COLUMNS: PreviewColumn[] = [
  { key: "num", label: "№ П/П" },
  { key: "id", label: "ID Посылки" },
  { key: "parcel", label: "Номер посылки" },
  { key: "name", label: "Наименование" },
  { key: "qty", label: "Кол-во" },
  { key: "weight", label: "Вес" },
  { key: "cost", label: "Стоимость" },
  { key: "tdNumber", label: "Номер ТД" },
];

export const PROFORMA_PREVIEW_COLUMNS: PreviewColumn[] = [
  { key: "num", label: "№ П/П" },
  { key: "id", label: "ID Посылки" },
  { key: "parcel", label: "Номер посылки" },
  { key: "name", label: "Наименование" },
  { key: "qty", label: "Кол-во" },
  { key: "weight", label: "Вес" },
  { key: "cost", label: "Стоимость" },
];

export const WRITEOFF_PREVIEW_COLUMNS: PreviewColumn[] = [
  { key: "num", label: "№" },
  { key: "rowNum", label: "Номер п/п по УЛ" },
  { key: "id", label: "ID Посылки" },
  { key: "parcel", label: "Номер посылки" },
  { key: "airport", label: "Аэропорт назначения" },
  { key: "weight", label: "Вес факт." },
  { key: "volume", label: "Объем факт." },
  { key: "category", label: "Категория" },
  { key: "name", label: "Наименование" },
  { key: "qty", label: "кол-во" },
  { key: "cost", label: "Стоимость" },
];

/** Столбцы preview поручения — как в DOCX-шаблоне. */
export const PORUCHENIE_PREVIEW_COLUMNS: PreviewColumn[] = [
  { key: "num", label: "№" },
  { key: "rowNum", label: "Номер п/п по УЛ" },
  { key: "id", label: "ID Посылки" },
  { key: "parcel", label: "Номер посылки" },
  { key: "weight", label: "Вес факт." },
  { key: "name", label: "Наименование" },
  { key: "qty", label: "кол-во" },
  { key: "cost", label: "Стоимость" },
];
