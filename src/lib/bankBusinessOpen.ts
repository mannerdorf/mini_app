/** Открытие приложений банков на Android; на десктопе — веб-ЛК. */

import { getWebApp } from "../webApp";
import { isClientAndroid, isClientMobile } from "./clientPlatform";

export type BankBusinessId = "sber" | "tbank" | "alfa" | "vtb";

/** Порядок кнопок в блоке «Оплата по QR» (Android). */
export const BANK_BUSINESS_PAY_ORDER: BankBusinessId[] = ["sber", "tbank", "alfa", "vtb"];

/** Страница приложения в RuStore (если приложение не установлено). */
const RUSTORE_APP = (packageName: string) =>
  `https://www.rustore.ru/catalog/app/${packageName}`;

/** Intent без browser_fallback_url — иначе Chrome сразу уходит на RuStore/сайт, не давая открыть app. */
const androidLaunchIntentOnly = (packageName: string, scheme?: string): string => {
  if (scheme) {
    return `intent://#Intent;scheme=${scheme};package=${packageName};end`;
  }
  return `intent://#Intent;package=${packageName};action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end`;
};

const BANK_CONFIG: Record<
  BankBusinessId,
  {
    label: string;
    shortLabel: string;
    webUrl: string;
    androidPackage: string;
    androidScheme?: string;
    rustoreUrl: string;
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
  window.location.assign(url);
}

/**
 * Deep link / intent: Telegram & MAX — openLink; Chrome — iframe для intent://; иначе location.
 */
function navigateDeepLink(url: string): void {
  if (typeof window === "undefined") return;

  const webApp = getWebApp();
  if (webApp && typeof webApp.openLink === "function") {
    try {
      webApp.openLink(url);
      return;
    } catch {
      /* пробуем ниже */
    }
  }

  if (url.startsWith("intent:")) {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "display:none;width:0;height:0;border:0";
    iframe.src = url;
    document.body.appendChild(iframe);
    window.setTimeout(() => iframe.remove(), 3000);
    return;
  }

  window.location.assign(url);
}

function pageStillVisible(sinceMs: number, maxMs: number): boolean {
  return document.visibilityState === "visible" && Date.now() - sinceMs < maxMs;
}

/**
 * Android: цепочка без мгновенного fallback на URL.
 * 1) кастомные схемы банка (sbbol://, tbank://…)
 * 2) intent:// с package (запуск установленного приложения)
 * 3) RuStore — установка
 */
function openAndroidBankBusiness(bank: BankBusinessId): void {
  const cfg = BANK_CONFIG[bank];
  const started = Date.now();
  const schemes = [...new Set([...(cfg.appSchemes || []), cfg.androidScheme ? `${cfg.androidScheme}://` : ""])].filter(Boolean));
  const intentUrl = androidLaunchIntentOnly(cfg.androidPackage, cfg.androidScheme);

  let step = 0;

  const runStep = () => {
    if (!pageStillVisible(started, 4000)) return;

    if (step < schemes.length) {
      navigateDeepLink(schemes[step]!);
      step += 1;
      window.setTimeout(runStep, 450);
      return;
    }

    if (step === schemes.length) {
      navigateDeepLink(intentUrl);
      step += 1;
      window.setTimeout(runStep, 550);
      return;
    }

    if (pageStillVisible(started, 4000)) {
      openUrl(cfg.rustoreUrl, false);
    }
  };

  runStep();
}

/**
 * Десктоп — веб-ЛК банка.
 * Android — приложение (схема → intent) или RuStore.
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
  navigateDeepLink(scheme);

  window.setTimeout(() => {
    if (pageStillVisible(started, 2500)) {
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
