export type { TdDraft, TdDocType, TdPrepared, SpecificationDraft, ProformaDraft } from "./types.js";
export { collectFixRows, validateTdPrep, type FixTdRow, type UlWriteoffRow } from "./collectTdRows.js";
export { buildTdPrepared } from "./prepareTd.js";
export {
  isTdDraftDateField,
  splitDraftDateField,
  joinDraftDateField,
  ruDateToIso,
  isoDateToRu,
  replaceDraftRuDate,
  syncTitleDateFromFts,
  normalizeSpecificationDraft,
  normalizeProformaDraft,
  computeProformaTotals,
} from "./draftDateFields.js";
export {
  applyProformaFieldChange,
  applySpecificationFieldChange,
  resolveHeaderTdFromDraft,
  resolveTdExportDraft,
  syncProformaHeaderFromSpecification,
} from "./resolveTdDraft.js";
export {
  buildWriteoffInputs,
  poruchenieInputs,
  specificationPreviewRows,
  proformaPreviewRows,
  porucheniePreviewRows,
} from "./preview.js";
export {
  resolvePoruchenieUlDraft,
  defaultPoruchenieDate,
  defaultPoruchenieContractNumber,
  defaultPoruchenieContractDate,
  formatPoruchenieProseDate,
  formatPoruchenieTitleLine,
  formatPoruchenieCityLine,
  formatPoruchenieContractLine,
} from "./formatPoruchenieDraft.js";
export { isHolzCarrier } from "./isHolzCarrier.js";
export {
  defaultSpecificationDraft,
  defaultProformaDraft,
  formatRuDate,
} from "./defaults.js";
export { SPEC_EDITABLE_KEYS } from "./templateMaps.js";
export {
  SPEC_PREVIEW_COLUMNS,
  PROFORMA_PREVIEW_COLUMNS,
  WRITEOFF_PREVIEW_COLUMNS,
  PORUCHENIE_PREVIEW_COLUMNS,
  type PreviewColumn,
} from "./templateMaps.js";
