/** Открытие Т-Бизнес / СберБизнес: сайт на десктопе, приложение на мобильных. */

import { isClientAndroid, isClientMobile } from "./clientPlatform";

export type BankBusinessId = "sber" | "tbank" | "alfa" | "vtb";

/** Порядок кнопок в блоке «Оплата по QR» (Android). */
export const BANK_BUSINESS_PAY_ORDER: BankBusinessId[] = ["sber", "tbank", "alfa", "vtb"];

const androidLaunchIntent = (packageName: string, fallbackUrl: string, scheme?: string): string => {
  const fallback = encodeURIComponent(fallbackUrl);
  if (scheme) {
    return `intent://#Intent;scheme=${scheme};package=${packageName};S.browser_fallback_url=${fallback};end`;
  }
  return `intent://#Intent;package=${packageName};action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;S.browser_fallback_url=${fallback};end`;
};

const BANK_CONFIG: Record<
  BankBusinessId,
  {
    label: string;
    shortLabel: string;
    webUrl: string;
    /** Схемы для открытия приложения (iOS / часть Android). */
    appSchemes: string[];
    androidIntent?: string;
    storeUrl: string;
  }
> = {
  sber: {
    label: "СберБизнес",
    shortLabel: "Сбер",
    webUrl: "https://sbi.sberbank.ru:9443/ic/dcb/index.html#/login",
    appSchemes: ["sbbol://", "sberbankonline://"],
    androidIntent: androidLaunchIntent(
      "ru.sberbank_sbbol",
      "https://sbi.sberbank.ru:9443/ic/dcb/index.html#/login",
      "sbbol"
    ),
    storeUrl: "https://apps.sber.ru/apps/sberbusiness/",
  },
  tbank: {
    label: "Т-Бизнес",
    shortLabel: "Т-Бизнес",
    webUrl: "https://business.tbank.ru/",
    appSchemes: ["tbank://", "tinkoffbank://", "tinkoff://"],
    androidIntent: androidLaunchIntent("ru.tinkoff.sme", "https://business.tbank.ru/", "tbank"),
    storeUrl: "https://www.tbank.ru/apps/",
  },
  alfa: {
    label: "Альфа-Бизнес",
    shortLabel: "Альфа",
    webUrl: "https://link.alfabank.ru/",
    appSchemes: ["alfabank://", "alfabusiness://"],
    androidIntent: androidLaunchIntent(
      "ru.alfabank.oavdo.amc",
      "https://link.alfabank.ru/",
      "alfabank"
    ),
    storeUrl: "https://www.rustore.ru/catalog/app/ru.alfabank.oavdo.amc",
  },
  vtb: {
    label: "ВТБ Бизнес",
    shortLabel: "ВТБ",
    webUrl: "https://www.vtb.ru/small-business/",
    appSchemes: ["vtb://", "vtbbusiness://"],
    androidIntent: androidLaunchIntent("ru.vtb.smb", "https://www.vtb.ru/small-business/", "vtb"),
    storeUrl: "https://www.rustore.ru/catalog/app/ru.vtb.smb",
  },
};

export function isMobileBankOpenDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  if (isClientMobile()) return true;
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

  if (isClientAndroid() && cfg.androidIntent) {
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
