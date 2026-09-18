import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react';

type EditState = { dirty: boolean; busy: boolean };
const EditContext = createContext<Map<string, EditState> | null>(null);
export function usePickupEditGuard() {
  const states = useRef(new Map<string, EditState>()).current;
  const [notice, setNotice] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if ([...states.values()].some(state => state.dirty || state.busy)) {
        event.preventDefault(); event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [states]);
  const canClose = (discard = false) => {
    if ([...states.values()].some(state => state.busy)) {
      setNotice('Дождитесь завершения сохранения.'); return false;
    }
    if (!discard && [...states.values()].some(state => state.dirty)) { setConfirmClose(true); return false; }
    setConfirmClose(false); setNotice(''); return true;
  };
  return { states, canClose, notice, confirmClose, cancelClose: () => setConfirmClose(false) };
}
export const PickupEditGuardProvider = EditContext.Provider;

/** Keep a local draft tied to the version it was edited against, not each polling snapshot. */
export function usePickupVersionedDraft<T>(version: number, serverValue: T) {
  const [base, setBase] = useState({ version, value: serverValue });
  const [value, setValue] = useState(serverValue);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(value) !== JSON.stringify(base.value);
  const conflict = dirty && base.version !== version;
  const registry = useContext(EditContext);
  const id = useId();
  useEffect(() => {
    registry?.set(id, { dirty, busy: saving });
    return () => { registry?.delete(id); };
  }, [registry, id, dirty, saving]);
  useEffect(() => {
    if (!dirty && !saving && base.version !== version) {
      setBase({ version, value: serverValue }); setValue(serverValue);
    }
  }, [version, serverValue, base.version, dirty, saving]);
  return {
    value, setValue, saving, setSaving, dirty, conflict, version: base.version,
    saved: () => setBase({ version: base.version, value }),
    acceptServer: () => { setBase({ version, value: serverValue }); setValue(serverValue); },
    keepDraft: () => setBase({ version, value: serverValue }),
  };
}
export function PickupDraftConflict({ children, acceptServer, keepDraft }: {
  children: React.ReactNode; acceptServer: () => void; keepDraft: () => void;
}) {
  return <div role="alert" className="pk-panel">
    <p>Данные забора изменились. Ваш ввод сохранён. {children}</p>
    <div className="pk-actions">
      <button type="button" onClick={acceptServer}>Принять данные сервера</button>
      <button type="button" onClick={keepDraft}>Оставить мой ввод</button>
    </div>
  </div>;
}
