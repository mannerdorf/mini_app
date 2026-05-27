/** Открытие Т-Бизнес / СберБизнес: сайт на десктопе, приложение на мобильных. */

export type BankBusinessId = "tbank" | "sber";

const BANK_CONFIG: Record<
  BankBusinessId,
  {
    label: string;
    webUrl: string;
    /** Схемы для открытия приложения (iOS / часть Android). */
    appSchemes: string[];
    androidIntent?: string;
    storeUrl: string;
  }
> = {
  tbank: {
    label: "Т-Бизнес",
    webUrl: "https://business.tbank.ru/",
    appSchemes: ["tbank://", "tinkoffbank://", "tinkoff://"],
    androidIntent:
      "intent://#Intent;scheme=tbank;package=ru.tinkoff.sme;S.browser_fallback_url=https%3A%2F%2Fbusiness.tbank.ru%2F;end",
    storeUrl: "https://www.tbank.ru/apps/",
  },
  sber: {
    label: "СберБизнес",
    webUrl: "https://sbi.sberbank.ru:9443/ic/dcb/index.html#/login",
    appSchemes: ["sbbol://", "sberbankonline://"],
    androidIntent:
      "intent://#Intent;scheme=sbbol;package=ru.sberbank_sbbol;S.browser_fallback_url=https%3A%2F%2Fsbi.sberbank.ru%3A9443%2Fic%2Fdcb%2Findex.html%23%2Flogin;end",
    storeUrl: "https://apps.sber.ru/apps/sberbusiness/",
  },
};

export function isMobileBankOpenDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  return navigator.maxTouchPoints > 0 && window.innerWidth < 900;
}

function openUrl(url: string, newTab: boolean): void {
  if (newTab) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.href = url;
}

/**
 * На десктопе — личный кабинет в браузере.
 * На телефоне — попытка открыть приложение, иначе магазин / веб-ЛК.
 *
 * Полноценная передача QR в приложение без договора с банком недоступна (нужен API Сбера / T-Bank Open API).
 * Пользователь сканирует QR на экране или создаёт платёж вручную в приложении.
 */
export function openBankBusiness(bank: BankBusinessId): void {
  const cfg = BANK_CONFIG[bank];
  if (!isMobileBankOpenDevice()) {
    openUrl(cfg.webUrl, true);
    return;
  }

  const isAndroid = /Android/i.test(navigator.userAgent);
  if (isAndroid && cfg.androidIntent) {
    window.location.href = cfg.androidIntent;
    return;
  }

  const scheme = cfg.appSchemes[0];
  const fallback = cfg.storeUrl;
  const started = Date.now();
  window.location.href = scheme;

  window.setTimeout(() => {
    if (document.visibilityState === "visible" && Date.now() - started < 2500) {
      openUrl(fallback, false);
    }
  }, 1200);
}

export function getBankBusinessConfig(bank: BankBusinessId) {
  return BANK_CONFIG[bank];
}
