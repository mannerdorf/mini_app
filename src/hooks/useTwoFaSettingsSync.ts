import { useEffect } from "react";
import { fetchTwoFaSettings } from "../api/client/twoFa";
import { useAuth } from "../contexts/AuthContext";

export function useTwoFaSettingsSync() {
  const { activeAccount, setAccounts } = useAuth();

  useEffect(() => {
    if (!activeAccount?.login) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchTwoFaSettings(activeAccount.login);
        const settings = data?.settings;
        if (!settings || cancelled) return;
        setAccounts(prev =>
          prev.map(acc =>
            acc.id === activeAccount.id
              ? {
                  ...acc,
                  twoFactorEnabled: !!settings.enabled,
                  twoFactorMethod: settings.method === "telegram" ? "telegram" : "google",
                  twoFactorTelegramLinked: !!settings.telegramLinked,
                  twoFactorGoogleSecretSet: !!settings.googleSecretSet,
                }
              : acc,
          ),
        );
      } catch {
        // ignore load errors
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeAccount?.id, activeAccount?.login, setAccounts]);
}
