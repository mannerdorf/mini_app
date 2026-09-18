export type BillingAmountRow = { jobId: string; amount: number | null; version?: number; status?: string; error?: string };
export type BillingDraft = { value: string; baseVersion?: number };
export type BillingDrafts = Record<string, BillingDraft>;
export const billingAmountText = (row: BillingAmountRow) => row.amount == null ? '' : String(row.amount);
export const canSelectBillingRow = (row: BillingAmountRow) => row.status === 'not_issued' && row.amount != null && !row.error;

/** A refresh never acknowledges a user's draft. Only its successful save may do that. */
export function reconcileBillingSelection(selected: Set<string>, rows: BillingAmountRow[]) {
  return new Set(rows.filter(row => selected.has(row.jobId) && canSelectBillingRow(row)).map(row => row.jobId));
}
export function editBillingAmount(drafts: BillingDrafts, row: BillingAmountRow, value: string): BillingDrafts {
  const next = { ...drafts };
  if (value === billingAmountText(row)) delete next[row.jobId];
  else next[row.jobId] = { value, baseVersion: drafts[row.jobId]?.baseVersion ?? row.version };
  return next;
}
export function billingDraftConflicts(row: BillingAmountRow, draft?: BillingDraft) {
  return Boolean(draft && draft.baseVersion !== row.version);
}
