import { appendSheetSummaryRow, syncUlSheetFromControlKeys } from "./ulTotals.js";
import { ensureItogRowIds } from "./itogRowKeys.js";

export type CellValue = string | number | boolean | null;

export type HaulzColumn = {
  key: string;
  label: string;
};

export type HaulzSheetRow = Record<string, CellValue> & {
  _rowId?: string;
  /** Строка итогов УЛ (вес, объём, места, сумма) */
  _isSummary?: boolean;
};

export type HaulzSheet = {
  id: string;
  name: string;
  columns: HaulzColumn[];
  rows: HaulzSheetRow[];
  /** Строки УЛ не переданы в API — подгрузить из файла в БД */
  ulDeferred?: boolean;
  /** Строки УЛ изменены вручную — не перезаписывать из файла при reprocess */
  ulLocallyEdited?: boolean;
};

export type HaulzWorkbook = {
  sheets: HaulzSheet[];
  /** Контрольные числа итог (кол. O) для подсветки UL */
  itogControlKeys: Set<string>;
  /** Номера УЛ, удалённые пользователем — не восстанавливать из файлов в БД */
  excludedUlNumbers: Set<string>;
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
  { key: "englishOnly", label: "Только латиница" },
  { key: "au585", label: "AU585 или AG925" },
  { key: "digitsOnly", label: "Только цифры в F" },
  { key: "pinkList", label: "Розовый список" },
];

export const FIX_COLUMNS = ITog_HEADERS.slice(0, 15);

export const KGD_COLUMNS: HaulzColumn[] = [
  { key: "num", label: "номер" },
  { key: "ul", label: "УЛ" },
  { key: "line", label: "Строка" },
  { key: "parcel", label: "посылка" },
  { key: "dupCount", label: "Повторов" },
];

export const PLOMBY_HEADERS: HaulzColumn[] = [
  { key: "parcel", label: "Номер посылки" },
  { key: "cargoPlace", label: "Грузовое место" },
];

export const STOP_HEADERS: HaulzColumn[] = [
  { key: "word", label: "Наименование" },
  { key: "result", label: "Результат" },
];

export const UL_HEADERS: HaulzColumn[] = [
  { key: "rowNum", label: "Номер п/п" },
  { key: "cargoPlace", label: "Грузовое место" },
  { key: "parcel", label: "Номер посылки" },
  { key: "airport", label: "Пункт назначения" },
  { key: "weight", label: "Вес факт." },
  { key: "volume", label: "Объем факт." },
  { key: "category", label: "Категория" },
  { key: "name", label: "Наименование" },
  { key: "qty", label: "кол-во" },
  { key: "cost", label: "Стоимость" },
  { key: "mark", label: "отметка" },
  { key: "rowNumMirror", label: "Номер п/п" },
  { key: "cargoMirror", label: "Грузовое место" },
  { key: "inItog", label: "В итоге" },
];

/** Подставляет русские заголовки как в эталонной таблице (в т.ч. для старых сессий из БД). */
export function canonicalColumnsForSheet(sheet: Pick<HaulzSheet, "id">): HaulzColumn[] {
  switch (sheet.id) {
    case "itog":
      return ITog_HEADERS;
    case "kgd":
      return KGD_COLUMNS;
    case "plomby":
      return PLOMBY_HEADERS;
    case "stop":
      return STOP_HEADERS;
    case "fix":
      return FIX_COLUMNS;
    default:
      if (sheet.id.startsWith("ul-")) return UL_HEADERS;
      return [];
  }
}

export function normalizeWorkbookColumns(wb: HaulzWorkbook): HaulzWorkbook {
  return {
    ...wb,
    sheets: wb.sheets.map((s) => {
      const columns = canonicalColumnsForSheet(s);
      let sheet = columns.length ? { ...s, columns } : s;
      if (sheet.rows.length > 0) {
        if (sheet.id.startsWith("ul-") && !sheet.ulDeferred) {
          sheet = syncUlSheetFromControlKeys(sheet, wb.itogControlKeys);
        } else if (sheet.id === "itog") {
          const dataRows = ensureItogRowIds(sheet.rows);
          sheet = appendSheetSummaryRow({ ...sheet, rows: dataRows });
        } else if (sheet.id === "kgd") {
          sheet = appendSheetSummaryRow(sheet);
        }
      }
      return sheet;
    }),
  };
}
