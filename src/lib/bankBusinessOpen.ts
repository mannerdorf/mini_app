/** Открытие приложений банков на Android; на десктопе — веб-ЛК. */

import { isClientAndroid, isClientMobile } from "./clientPlatform";

export type BankBusinessId = "sber" | "tbank" | "alfa" | "vtb";

/** Порядок кнопок в блоке «Оплата по QR» (Android). */
export const BANK_BUSINESS_PAY_ORDER: BankBusinessId[] = ["sber", "tbank", "alfa", "vtb"];

/** Страница приложения в RuStore (fallback, если приложение не установлено). */
const RUSTORE_APP = (packageName: string) =>
  `https://www.rustore.ru/catalog/app/${packageName}`;

const androidLaunchIntent = (packageName: string, rustoreUrl: string, scheme?: string): string => {
  const fallback = encodeURIComponent(rustoreUrl);
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
    /** Личный кабинет в браузере (только десктоп). */
    webUrl: string;
    androidPackage: string;
    androidScheme?: string;
    rustoreUrl: string;
    /** iOS / запасной вариант без Android intent. */
    appSchemes: string[];
  }
> = {
  sber: {
    label: "СберБизнес",
    shortLabel: "Сбер",
    webUrl: "https://sbi.sberbank.ru:9443/ic/dcb/index.html#/login",
    androidPackage: "ru.sberbank_sbbol",
    androidScheme: "sbbol",
    rustoreUrl: RUSTORE_APP("ru.sberbank_sbbol"),
    appSchemes: ["sbbol://", "sberbankonline://"],
  },
  tbank: {
    label: "Т-Бизнес",
    shortLabel: "Т-Бизнес",
    webUrl: "https://business.tbank.ru/",
    androidPackage: "ru.tinkoff.sme",
    androidScheme: "tbank",
    rustoreUrl: RUSTORE_APP("ru.tinkoff.sme"),
    appSchemes: ["tbank://", "tinkoffbank://", "tinkoff://"],
  },
  alfa: {
    label: "Альфа-Бизнес",
    shortLabel: "Альфа",
    webUrl: "https://link.alfabank.ru/",
    androidPackage: "ru.alfabank.oavdo.amc",
    androidScheme: "alfabank",
    rustoreUrl: RUSTORE_APP("ru.alfabank.oavdo.amc"),
    appSchemes: ["alfabank://", "alfabusiness://"],
  },
  vtb: {
    label: "ВТБ Бизнес",
    shortLabel: "ВТБ",
    webUrl: "https://www.vtb.ru/small-business/",
    androidPackage: "ru.vtb.smb",
    androidScheme: "vtb",
    rustoreUrl: RUSTORE_APP("ru.vtb.smb"),
    appSchemes: ["vtb://", "vtbbusiness://"],
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

/** Android: запуск приложения; если нет — страница в RuStore (не сайт банка). */
function openAndroidBankBusiness(bank: BankBusinessId): void {
  const cfg = BANK_CONFIG[bank];
  const intent = androidLaunchIntent(cfg.androidPackage, cfg.rustoreUrl, cfg.androidScheme);
  const started = Date.now();

  try {
    window.location.href = intent;
  } catch {
    openUrl(cfg.rustoreUrl, false);
    return;
  }

  window.setTimeout(() => {
    if (document.visibilityState === "visible" && Date.now() - started < 2800) {
      openUrl(cfg.rustoreUrl, false);
    }
  }, 1500);
}

/**
 * Десктоп — веб-ЛК банка.
 * Android — приложение банка или RuStore.
 * iOS — схема приложения, иначе RuStore в новой вкладке.
 */
export function openBankBusiness(bank: BankBusinessId): void {
  const cfg = BANK_CONFIG[bank];

  if (isClientAndroid()) {
    openAndroidBankBusiness(bank);
    return;
  }

  if (!isMobileBankOpenDevice()) {
    openUrl(cfg.webUrl, true);
    return;
  }

  const scheme = cfg.appSchemes[0];
  const started = Date.now();
  window.location.href = scheme;

  window.setTimeout(() => {
    if (document.visibilityState === "visible" && Date.now() - started < 2500) {
      openUrl(cfg.rustoreUrl, true);
    }
  }, 1200);
}

export function getBankBusinessConfig(bank: BankBusinessId) {
  return BANK_CONFIG[bank];
}

export function getBankRustoreUrl(bank: BankBusinessId): string {
  return BANK_CONFIG[bank].rustoreUrl;
}
