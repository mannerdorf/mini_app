import { useCallback } from "react";
import { getWebApp } from "../webApp";
import { isClientMobile } from "../lib/clientPlatform";
import { HAULZ_MAX_SUPPORT_BOT_URL, HAULZ_TG_SUPPORT_BOT_URL } from "../constants/brand";
import { createMaxAuthDeepLinkToken } from "../api/client/maxLink";
import { postGetPerevozkaJson } from "../api/client/perevozkiClient";
import { useAuth } from "../contexts/AuthContext";
import { useAppShell } from "../contexts/AppShellContext";

export function useSupportBotLinks() {
  const { accounts, activeAccountId, activeAccount } = useAuth();
  const { setActiveTab } = useAppShell();

  const openExternalLink = useCallback((url: string) => {
    const webApp = getWebApp();
    if (webApp && typeof (webApp as { openLink?: (u: string) => void }).openLink === "function") {
      (webApp as { openLink: (u: string) => void }).openLink(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const openMaxBotLink = useCallback((url: string) => {
    const webApp = getWebApp();
    const isMobile =
      typeof window !== "undefined" &&
      (isClientMobile() || window.innerWidth < 768 || /Android|iPhone|iPad/i.test(navigator.userAgent || ""));
    if (webApp && typeof webApp.openLink === "function") {
      try {
        webApp.openLink(url);
      } catch (e) {
        console.warn("[openMaxBotLink] openLink failed:", e);
      }
    }
    if (isMobile) {
      setTimeout(() => {
        const w = window.open(url, "_blank", "noopener,noreferrer");
        if (!w || w.closed) window.location.href = url;
      }, 100);
      return;
    }
    if (!webApp || typeof webApp.openLink !== "function") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const openTelegramBotWithAccount = useCallback(async () => {
    const url = new URL(HAULZ_TG_SUPPORT_BOT_URL);
    const webApp = getWebApp();
    if (webApp && typeof webApp.openTelegramLink === "function") {
      webApp.openTelegramLink(url.toString());
    } else {
      openExternalLink(url.toString());
    }
  }, [openExternalLink]);

  const openMaxBotWithAccount = useCallback(async () => {
    const account = accounts.find((acc) => acc.id === activeAccountId) || null;
    if (!account) {
      throw new Error("Сначала выберите компанию.");
    }
    const data = await createMaxAuthDeepLinkToken({
      login: account.login,
      password: account.password,
      customer: account.customer || null,
      inn: account.activeCustomerInn ?? null,
      accountId: account.id,
    });
    const url = new URL(HAULZ_MAX_SUPPORT_BOT_URL);
    url.searchParams.set("start", `haulz_auth_${data.token}`);
    openMaxBotLink(url.toString());
  }, [accounts, activeAccountId, openMaxBotLink]);

  const openAiChatDeepLink = useCallback(
    (cargoNumber?: string) => {
      if (typeof window !== "undefined" && cargoNumber) {
        window.sessionStorage.setItem(
          "haulz.chat.prefill",
          `Интересует информация по перевозке номер ${cargoNumber}`,
        );
        if (activeAccount?.login && activeAccount?.password) {
          const inn = activeAccount.activeCustomerInn ?? activeAccount.customers?.[0]?.inn ?? undefined;
          postGetPerevozkaJson({
            login: activeAccount.login,
            password: activeAccount.password,
            number: cargoNumber,
            ...(inn ? { inn } : {}),
            ...(activeAccount.isRegisteredUser ? { isRegisteredUser: true } : {}),
          })
            .then((data) => {
              try {
                window.sessionStorage.setItem("haulz.chat.cargoPreload", JSON.stringify(data));
              } catch {
                /* ignore */
              }
            })
            .catch(() => {});
        }
      }
      setActiveTab("cargo");
    },
    [activeAccount, setActiveTab],
  );

  return {
    openExternalLink,
    openTelegramBotWithAccount,
    openMaxBotWithAccount,
    openAiChatDeepLink,
  };
}
