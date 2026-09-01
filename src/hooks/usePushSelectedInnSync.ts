import { useEffect, useRef } from "react";
import { syncPushSelectedInn } from "../api/client/notifications";
import { resolveAccountActiveInn } from "../lib/accountCustomer";
import { useAuth } from "../contexts/AuthContext";

/** Синхронизирует выбранный ИНН компании на сервер для автопуша (без служебного режима). */
export function usePushSelectedInnSync() {
  const { activeAccount, auth } = useAuth();
  const lastSyncedRef = useRef<string>("");

  useEffect(() => {
    const login = activeAccount?.login?.trim().toLowerCase() ?? "";
    if (!login) return;
    if (activeAccount?.accessAllInns || activeAccount?.permissions?.service_mode === true) return;

    const inn = resolveAccountActiveInn(activeAccount, auth);
    if (!inn) return;

    const key = `${login}:${inn}`;
    if (lastSyncedRef.current === key) return;
    lastSyncedRef.current = key;

    void syncPushSelectedInn({ login, inn }).catch(() => {
      lastSyncedRef.current = "";
    });
  }, [
    activeAccount?.login,
    activeAccount?.accessAllInns,
    activeAccount?.permissions?.service_mode,
    activeAccount?.activeCustomerInn,
    activeAccount?.customers,
    auth?.inn,
  ]);
}
