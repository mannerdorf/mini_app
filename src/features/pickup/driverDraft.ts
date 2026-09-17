import { cacheRead, cacheWrite } from "./client";

export type PickupStep = "arrive" | "pickup_places" | "pickup_photos" | "pickup_confirm" | "problem";
export type DriverDraft = { actual: string; note: string; photos: string[]; step: PickupStep; version: number; updatedAt?: number };
export const draftKey = (login: string, jobId: string) => `driver-draft:${JSON.stringify([login.trim().toLowerCase(), jobId])}`;
export const hasDriverDraft = (draft: DriverDraft) => !!(draft.actual || draft.note || draft.photos.length);

/** Empty forms adopt the visible job revision; entered data keeps its original revision. */
export function updateDriverDraft<K extends keyof DriverDraft>(
  draft: DriverDraft,
  visibleVersion: number,
  field: K,
  value: DriverDraft[K] | ((old: DriverDraft[K]) => DriverDraft[K]),
): DriverDraft {
  return {
    ...draft,
    updatedAt: Date.now(),
    version: hasDriverDraft(draft) ? draft.version : visibleVersion,
    [field]: typeof value === "function" ? value(draft[field]) : value,
  };
}

/** Serialize writes per key so an older photo write cannot resurrect a submitted draft. */
export function createDriverDraftStore(read = cacheRead<DriverDraft>, write = cacheWrite) {
  const pending = new Map<string, Promise<void>>();
  return {
    async read(key: string) {
      await pending.get(key)?.catch(() => {});
      return read(key);
    },
    write(key: string, value: DriverDraft | undefined) {
      const previous = pending.get(key) ?? Promise.resolve();
      const next = previous.catch(() => {}).then(() => write(key, value));
      pending.set(key, next);
      void next.finally(() => { if (pending.get(key) === next) pending.delete(key); }).catch(() => {});
      return next;
    },
  };
}
export const driverDraftStore = createDriverDraftStore();
