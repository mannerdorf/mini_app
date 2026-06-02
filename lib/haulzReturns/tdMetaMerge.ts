import type { TdDraft, TdPrepared } from "./tdDocuments/types.js";
import type { HaulzWorkbook } from "./types.js";

/** Объединяет черновики ТД (поздние значения полей перекрывают ранние). */
export function mergeTdDraft(...drafts: (TdDraft | undefined)[]): TdDraft | undefined {
  const merged: TdDraft = {};
  for (const draft of drafts) {
    if (!draft) continue;
    if (draft.specification) {
      merged.specification = { ...merged.specification, ...draft.specification };
    }
    if (draft.proforma) {
      merged.proforma = { ...merged.proforma, ...draft.proforma };
    }
    if (draft.writeoff) {
      merged.writeoff = { ...merged.writeoff, ...draft.writeoff };
    }
    if (draft.poruchenie) {
      merged.poruchenie = { ...(merged.poruchenie ?? {}) };
      for (const [ul, fields] of Object.entries(draft.poruchenie)) {
        merged.poruchenie[ul] = { ...merged.poruchenie[ul], ...fields };
      }
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** Сохраняет снимок ТД и объединяет черновик с последними правками. */
export function mergeTdPrepared(
  stored: TdPrepared | undefined,
  incoming: TdPrepared | undefined,
  extraDraft?: TdDraft,
): TdPrepared | undefined {
  const base = incoming ?? stored;
  if (!base) return undefined;

  const mergedDraft = mergeTdDraft(stored?.draft, incoming?.draft, extraDraft) ?? base.draft ?? {};

  return {
    preparedAt: incoming?.preparedAt ?? stored?.preparedAt ?? base.preparedAt,
    fixRows: incoming?.fixRows?.length ? incoming.fixRows : stored?.fixRows ?? base.fixRows ?? [],
    writeoffs: incoming?.writeoffs?.length ? incoming.writeoffs : stored?.writeoffs ?? base.writeoffs ?? [],
    draft: mergedDraft,
  };
}

export function mergeWorkbookTdMeta(
  stored: Pick<HaulzWorkbook, "tdDraft" | "tdPrepared"> | null | undefined,
  incoming: Pick<HaulzWorkbook, "tdDraft" | "tdPrepared">,
): Pick<HaulzWorkbook, "tdDraft" | "tdPrepared"> {
  const tdDraft = mergeTdDraft(
    stored?.tdPrepared?.draft,
    stored?.tdDraft,
    incoming.tdPrepared?.draft,
    incoming.tdDraft,
  );
  const tdPrepared = mergeTdPrepared(stored?.tdPrepared, incoming.tdPrepared, tdDraft);

  return {
    tdDraft: tdDraft ?? tdPrepared?.draft,
    tdPrepared,
  };
}

/** Не теряет метаданные ТД при частичном обновлении workbook в UI. */
export function applyWorkbookTdMeta(
  previous: Pick<HaulzWorkbook, "tdDraft" | "tdPrepared"> | null | undefined,
  next: HaulzWorkbook,
): HaulzWorkbook {
  const meta = mergeWorkbookTdMeta(previous, next);
  return { ...next, ...meta };
}
