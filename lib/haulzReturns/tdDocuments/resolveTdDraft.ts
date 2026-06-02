import type { HaulzWorkbook } from "../types.js";
import { defaultProformaHeader, formatRuDate } from "./defaults.js";
import {
  extractDraftRuDate,
  normalizeProformaDraft,
  normalizeSpecificationDraft,
  replaceDraftRuDate,
  syncTitleDateFromFts,
} from "./draftDateFields.js";
import { firstHeaderTd } from "./prepareTd.js";
import type { TdDraft } from "./types.js";

/** Номер ТД в шапке: из поля спецификации, иначе первый ТД с листов УЛ. */
export function resolveHeaderTdFromDraft(
  specification: Record<string, string> | undefined,
  workbook?: HaulzWorkbook,
): string {
  const manual = String(specification?.headerTd ?? "").trim();
  if (manual) return manual;
  if (workbook) return firstHeaderTd(workbook);
  return "";
}

/** Общие поля шапки проформы берутся из спецификации (даты синхронизируются с 02 ФТС №). */
export function syncProformaHeaderFromSpecification(
  specification: Record<string, string>,
  proforma: Record<string, string> = {},
): Record<string, string> {
  const spec = normalizeSpecificationDraft({ ...specification });
  const ftsDate = extractDraftRuDate("fts", spec.fts ?? "") ?? formatRuDate();
  const titleBase =
    proforma.title?.trim() || defaultProformaHeader(ftsDate).title || `Счет-проформа №1 от ${ftsDate}`;
  return normalizeProformaDraft({
    ...proforma,
    productEaeu: spec.productEaeu,
    exportPermit: spec.exportPermit,
    zpu: spec.zpu,
    fts: spec.fts,
    title: syncTitleDateFromFts(titleBase, spec.fts ?? ""),
  });
}

export function applySpecificationFieldChange(
  spec: Record<string, string>,
  key: string,
  value: string,
): Record<string, string> {
  let next: Record<string, string> = { ...spec, [key]: value };
  if (key === "exportPermit") {
    const date = extractDraftRuDate("exportPermit", value);
    if (date) {
      next.fts = replaceDraftRuDate("fts", next.fts ?? `02 ФТС № от ${formatRuDate()}`, date);
    }
  }
  return normalizeSpecificationDraft(next);
}

export function applyProformaFieldChange(
  proforma: Record<string, string>,
  key: string,
  value: string,
): Record<string, string> {
  let next: Record<string, string> = { ...proforma, [key]: value };
  if (key === "exportPermit") {
    const date = extractDraftRuDate("exportPermit", value);
    if (date) {
      next.fts = replaceDraftRuDate("fts", next.fts ?? `02 ФТС № от ${formatRuDate()}`, date);
    }
  }
  return normalizeProformaDraft(next);
}

export function resolveTdExportDraft(draft: TdDraft, workbook?: HaulzWorkbook) {
  const specification = normalizeSpecificationDraft({ ...(draft.specification ?? {}) });
  const proforma = syncProformaHeaderFromSpecification(specification, draft.proforma ?? {});
  const headerTd = resolveHeaderTdFromDraft(specification, workbook);
  return { specification, proforma, headerTd };
}
