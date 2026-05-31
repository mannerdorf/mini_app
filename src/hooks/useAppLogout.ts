import { useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useAppShell } from "../contexts/AppShellContext";

export function useAppLogout(setSearchText: (value: string) => void) {
  const { setAccounts, setActiveAccountId } = useAuth();
  const { setActiveTab } = useAppShell();

  return useCallback(() => {
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
  }, [setAccounts, setActiveAccountId, setActiveTab, setSearchText]);
}
