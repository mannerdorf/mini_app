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

/** Менеджер после звонка: только из «ожидает звонка» → согласовано / не согласовано. */
export function canManagerSetDraftStatus(
  from: HaulzCalcDraftStatus,
  to: HaulzCalcDraftStatus,
): boolean {
  if (to === "agreed" || to === "rejected") return from === "awaiting_call";
  return false;
}
