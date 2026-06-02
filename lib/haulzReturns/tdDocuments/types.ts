import type { HaulzCarrier } from "../carriers.js";
import type { UlWriteoffRow } from "./collectTdRows.js";

export type SpecificationDraft = Record<string, string>;
export type ProformaDraft = Record<string, string>;

export type PoruchenieUlDraft = {
  number?: string;
  date?: string;
  contractNumber?: string;
  contractDate?: string;
};

export type TdDraft = {
  specification?: SpecificationDraft;
  proforma?: ProformaDraft;
  writeoff?: Record<string, { title?: string; tdLine?: string }>;
  poruchenie?: Record<string, PoruchenieUlDraft>;
};

export type TdPreparedWriteoff = {
  ulNumber: string;
  tdNumber: string;
  sheetNumber: number;
  rows: UlWriteoffRow[];
};

/** Снимок собранных ТД — хранится в БД до следующей «Подготовить ТД». */
export type TdPrepared = {
  preparedAt: string;
  fixRows: import("./collectTdRows.js").FixTdRow[];
  writeoffs: TdPreparedWriteoff[];
  draft: TdDraft;
};

export type TdDocType = "specification" | "proforma" | "writeoff" | "poruchenie" | "all";

export type WriteoffSheetInput = {
  ulNumber: string;
  tdNumber: string;
  sheetNumber?: number;
  rows: UlWriteoffRow[];
  titleOverride?: string;
  tdLineOverride?: string;
};

export type PoruchenieInput = {
  ulNumber: string;
  /** Номер поручения в шапке DOCX. */
  assignmentNumber: string;
  writeoffNumber: number;
  tdNumber: string;
  carrier: HaulzCarrier;
  rows: UlWriteoffRow[];
  date?: string;
  contractNumber?: string;
  contractDate?: string;
};

export type TdExportFile = { name: string; buffer: Buffer; mime: string };

export type TdExportContext = {
  workbook: import("../types.js").HaulzWorkbook;
  carriersById: Map<string, HaulzCarrier>;
  draft?: TdDraft;
};
