export const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const DRAFT_REVIEW_AGE_MS = 30 * 24 * 60 * 60 * 1000;
type Stored = { __pickupCache: 2; writtenAt: number; value: unknown };
export function storedValue(value: unknown, now = Date.now()): Stored { return {__pickupCache:2,writtenAt:now,value}; }
export function unpackValue(key: string, stored: unknown, now = Date.now()): {value:unknown;expired:boolean} {
  const envelope = stored as Partial<Stored> | undefined;
  const wrapped = envelope?.__pickupCache === 2;
  const value = wrapped ? envelope.value : stored;
  const written = wrapped ? Number(envelope.writtenAt) : Date.parse(String((value as {syncedAt?:string})?.syncedAt || ''));
  const expired = key.startsWith('snapshot:') && (!Number.isFinite(written) || now-written > SNAPSHOT_MAX_AGE_MS);
  return {value:expired?undefined:value,expired};
}
export function cacheBelongsTo(key: string, login: string): boolean {
  const owner=login.trim().toLowerCase();
  if (key === `outbox:${owner}` || key.startsWith(`snapshot:${owner}:`)) return true;
  if (!key.startsWith('driver-draft:')) return false;
  try { return JSON.parse(key.slice('driver-draft:'.length))[0] === owner; } catch { return false; }
}
export function cacheHasUnsent(key: string, value: unknown): boolean {
  if (key.startsWith('outbox:')) return Array.isArray(value) && value.length>0;
  if (!key.startsWith('driver-draft:') || !value || typeof value !== 'object') return false;
  const draft=value as {actual?:string;note?:string;photos?:unknown[]};
  return !!(draft.actual || draft.note || draft.photos?.length);
}
