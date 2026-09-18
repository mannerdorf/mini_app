import { hasDocumentsOrderDrafts } from "../features/documents/orders/documentsOrderDraft";
import { useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useAppShell } from "../contexts/AppShellContext";
import { clearPickupForLogout } from "../features/pickup/client";

export function useAppLogout(setSearchText: (value: string) => void) {
  const { accounts, setAccounts, setActiveAccountId } = useAuth();
  const { setActiveTab } = useAppShell();

  return useCallback(async () => {
    if (hasDocumentsOrderDrafts() && !window.confirm("Есть незавершённые заявки. Выйти и удалить их черновики и выбранные файлы?")) return;
    try {
      const cleared = await clearPickupForLogout(accounts.map(a=>a.login), () => window.confirm("На устройстве есть неотправленные отметки или черновики с фото. Нажмите «Отмена», чтобы остаться и отправить их. Продолжить выход и удалить эти данные?"));
      if (!cleared) return;
    } catch {
      window.alert("Не удалось проверить и очистить локальные данные. Выход отменён: повторите после восстановления хранилища.");
      return;
    }
    setAccounts([]);
    setActiveAccountId(null);
    setActiveTab("cargo");
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem("haulz.auth");
        window.localStorage.removeItem("haulz.accounts");
        window.localStorage.removeItem("haulz.activeAccountId");
      } catch {
        // игнорируем ошибки удаления
      }
    }
    setSearchText("");
  }, [accounts, setAccounts, setActiveAccountId, setActiveTab, setSearchText]);
}
