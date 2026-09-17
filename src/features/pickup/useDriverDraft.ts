import { useEffect, useRef, useState } from "react";
import { driverDraftStore, hasDriverDraft, updateDriverDraft, type DriverDraft } from "./driverDraft";
import { DRAFT_REVIEW_AGE_MS } from "./cachePolicy";

/** Mount with a key tied to login + job. Updates to job.version must not remount this hook. */
export function useDriverDraft(key: string, initial: DriverDraft) {
  const [draft, setDraft] = useState(initial);
  const current = useRef(initial);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [storageError, setStorageError] = useState("");
  const revision = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    void driverDraftStore.read(key).then(saved => {
      if (!active) return;
      if (saved) { current.current = saved; setDraft(saved); }
    }).catch(() => {
      if (active) setStorageError("Не удалось восстановить черновик. Хранилище устройства недоступно.");
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; mounted.current = false; };
  }, [key]);
  function update<K extends keyof DriverDraft>(field: K, value: DriverDraft[K] | ((old: DriverDraft[K]) => DriverDraft[K])) {
    if (!ready || !mounted.current) return;
    const next = updateDriverDraft(current.current, initial.version, field, value);
    current.current = next;
    setDraft(next);
    const id = ++revision.current;
    setSaving(true);
    void driverDraftStore.write(key, next).then(() => {
      if (revision.current === id) setStorageError("");
    }).catch(() => {
      if (revision.current === id) setStorageError("Черновик не сохранён на устройстве. Не закрывайте приложение; освободите место или отправьте отметку при наличии связи.");
    }).finally(() => { if (revision.current === id) setSaving(false); });
  }
  async function clear() {
    ++revision.current;
    setClearing(true);
    try {
      await driverDraftStore.write(key, undefined);
      current.current = initial;
      setDraft(initial);
      setSaving(false);
      setStorageError("");
    } finally { setClearing(false); setSaving(false); }
  }
  const needsReview = hasDriverDraft(draft) && (!draft.updatedAt || Date.now()-draft.updatedAt > DRAFT_REVIEW_AGE_MS);
  return { draft, update, ready, saving, clearing, storageError, clear, needsReview, dirty: hasDriverDraft(draft) };
}
