import type { Direction, MainlineMode } from '../../../../lib/haulzCalculator/types';
import type { PvzSelectionState } from './DocumentsOrderPvzSection';
import type { DocumentsOrderCargoState } from './DocumentsOrderCargoSection';
import type { DocumentsOrderSenderState } from './DocumentsOrderSenderBlock';

export type DocumentsOrderDraft = {
  direction: Direction; fromState: PvzSelectionState; toState: PvzSelectionState;
  cargo: DocumentsOrderCargoState; mainlineMode: MainlineMode; extraCodes: string[];
  nomerZayavki: string; dataZabora: string; sender: DocumentsOrderSenderState;
};
// Memory only: File objects survive section navigation, no credentials or payloads are persisted on disk.
const drafts = new Map<string, { login: string; value: DocumentsOrderDraft }>();
export function documentsOrderDraftKey(login: string, inn?: string | null, customer?: string | null) {
  return JSON.stringify([login.trim().toLowerCase(), inn || '', customer || '']);
}
export function readDocumentsOrderDraft(key: string) { return drafts.get(key)?.value; }
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (drafts.size) { event.preventDefault(); event.returnValue = ''; }
};
let listening = false;
function syncWarning() {
  if (typeof window === 'undefined') return;
  if (drafts.size && !listening) { window.addEventListener('beforeunload', beforeUnload); listening = true; }
  if (!drafts.size && listening) { window.removeEventListener('beforeunload', beforeUnload); listening = false; }
}
export function saveDocumentsOrderDraft(key: string, login: string, value: DocumentsOrderDraft) {
  drafts.set(key, { login: login.trim().toLowerCase(), value }); syncWarning();
}
export function clearDocumentsOrderDraft(key: string) { drafts.delete(key); syncWarning(); }
export function hasDocumentsOrderDrafts() { return drafts.size > 0; }
export function retainDocumentsOrderDraftAccounts(logins: string[]) {
  const allowed = new Set(logins.map(login=>login.trim().toLowerCase()));
  for (const [key, draft] of drafts) if (!allowed.has(draft.login)) drafts.delete(key);
  syncWarning();
}
