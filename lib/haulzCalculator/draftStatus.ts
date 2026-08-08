export type HaulzCalcDraftStatus =
  | "draft"
  | "new"
  | "awaiting_call"
  | "agreed"
  | "rejected"
  | "submitted";

export const HAULZ_CALC_DRAFT_STATUSES: HaulzCalcDraftStatus[] = [
  "draft",
  "new",
  "awaiting_call",
  "agreed",
  "rejected",
  "submitted",
];

export const HAULZ_CALC_DRAFT_STATUS_LABELS: Record<HaulzCalcDraftStatus, string> = {
  draft: "Черновик",
  new: "Новая",
  awaiting_call: "Согласовано, ожидает звонка",
  agreed: "Согласовано",
  rejected: "Не согласовано",
  submitted: "Оформлена",
};

export function parseHaulzCalcDraftStatus(raw: unknown): HaulzCalcDraftStatus {
  const s = String(raw ?? "").trim() as HaulzCalcDraftStatus;
  return HAULZ_CALC_DRAFT_STATUSES.includes(s) ? s : "draft";
}

/** Статусы заявок в журнале менеджера (без черновиков). */
export const MANAGER_JOURNAL_STATUSES: HaulzCalcDraftStatus[] = HAULZ_CALC_DRAFT_STATUSES.filter(
  (s) => s !== "draft",
);

/** Менеджер может выставить любой статус заявки, кроме «Черновик». */
export function canManagerSetDraftStatus(
  from: HaulzCalcDraftStatus,
  to: HaulzCalcDraftStatus,
): boolean {
  if (from === "draft" || to === "draft") return false;
  return HAULZ_CALC_DRAFT_STATUSES.includes(to);
}
