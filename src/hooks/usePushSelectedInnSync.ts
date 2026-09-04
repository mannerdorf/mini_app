import { useEffect, useRef } from "react";
import { syncPushSelectedInn } from "../api/client/notifications";
import { resolveAccountActiveInn } from "../lib/accountCustomer";
import { useAuth } from "../contexts/AuthContext";

/**
 * Синхронизирует выбранный ИНН компании на сервер для автопуша.
 * Пропускаем только когда в шапке включён служебный режим (useServiceRequest),
 * а не когда у пользователя просто есть право service_mode в CMS.
 */
export function usePushSelectedInnSync(useServiceRequest: boolean) {
  const { activeAccount, auth } = useAuth();
  const lastSyncedRef = useRef<string>("");

  useEffect(() => {
    const login = activeAccount?.login?.trim().toLowerCase() ?? "";
    if (!login) return;

    const inn = resolveAccountActiveInn(activeAccount, auth);
    if (useServiceRequest && !inn) return;
    if (!inn) return;

    const key = `${login}:${inn}`;
    if (lastSyncedRef.current === key) return;
    lastSyncedRef.current = key;

    void syncPushSelectedInn({ login, inn }).catch(() => {
      lastSyncedRef.current = "";
    });
  }, [
    useServiceRequest,
    activeAccount?.login,
    activeAccount?.activeCustomerInn,
    activeAccount?.customers,
    auth?.inn,
  ]);
}
