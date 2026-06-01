export type CellValue = string | number | boolean | null;

export type HaulzColumn = {
  key: string;
  label: string;
};

export type HaulzSheetRow = Record<string, CellValue> & {
  _rowId?: string;
};

export type HaulzSheet = {
  id: string;
  name: string;
  columns: HaulzColumn[];
  rows: HaulzSheetRow[];
};

export type HaulzWorkbook = {
  sheets: HaulzSheet[];
  /** Контрольные числа итог (кол. O) для подсветки UL */
  itogControlKeys: Set<string>;
};

export type OtpravkaRow = {
  cargoPlace: string;
  parcel: string;
};

export type UlDataRow = {
  rowNum: string;
  cargoPlace: string;
  parcel: string;
  airport: string;
  weight: CellValue;
  volume: CellValue;
  category: string;
  name: string;
  qty: CellValue;
  cost: CellValue;
};

export type UlSheetData = {
  ulNumber: string;
  rows: UlDataRow[];
};

export type ParsedUlFile = {
  fileName: string;
  ulNumber: string;
  sheet: UlSheetData;
};

export const ITog_HEADERS: HaulzColumn[] = [
  { key: "num", label: "номер" },
  { key: "ul", label: "УЛ" },
  { key: "line", label: "строка" },
  { key: "id", label: "ID" },
  { key: "parcel", label: "Номер посылки" },
  { key: "ulData", label: "Данные УЛ" },
  { key: "translate", label: "Перевод" },
  { key: "qty", label: "Кол-во" },
  { key: "weight", label: "Вес" },
  { key: "cost", label: "Стоимость" },
  { key: "seal", label: "Номер пломбы (места)" },
  { key: "ulPlaces", label: "Общее кол-во мест по УЛ" },
  { key: "stop", label: "STOP" },
  { key: "chars", label: "символов" },
  { key: "control", label: "Контрольное число" },
  { key: "englishOnly", label: "English only" },
  { key: "au585", label: "AU585 or AG925" },
  { key: "digitsOnly", label: "Digits only in F" },
  { key: "pinkList", label: "Pink list match" },
];

export const FIX_COLUMNS = ITog_HEADERS.slice(0, 15);

export const UL_HEADERS: HaulzColumn[] = [
  { key: "rowNum", label: "Номер п/п" },
  { key: "cargoPlace", label: "Грузовое место" },
  { key: "parcel", label: "Номер посылки" },
  { key: "airport", label: "Аэропорт назначения" },
  { key: "weight", label: "Вес факт." },
  { key: "volume", label: "Объем факт." },
  { key: "category", label: "Категория" },
  { key: "name", label: "Наименование" },
  { key: "qty", label: "кол-во" },
  { key: "cost", label: "Стоимость" },
  { key: "mark", label: "отметка" },
  { key: "rowNumMirror", label: "Номер п/п" },
  { key: "cargoMirror", label: "Грузовое место" },
  { key: "inItog", label: "" },
];
