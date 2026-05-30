/** Открытие приложений банков на Android; на десктопе — веб-ЛК. */

import { getWebApp } from "../webApp";
import { isClientAndroid, isClientMobile } from "./clientPlatform";

export type BankBusinessId = "sber" | "tbank" | "alfa" | "vtb";

export type BankBusinessDisplayConfig = {
  label: string;
  shortLabel: string;
};

/** Порядок кнопок в блоке «Оплата по QR» (Android). */
export const BANK_BUSINESS_PAY_ORDER: BankBusinessId[] = ["sber", "tbank", "alfa", "vtb"];

const RUSTORE_APP = (packageName: string) =>
  `https://www.rustore.ru/catalog/app/${packageName}`;

const MOBILE_OPEN_LINK_RETRY_MS = 100;
/** Одна попытка открыть установленное приложение по схеме (после intent). */
const ANDROID_SCHEME_RETRY_MS = 400;
/** Установка только через RuStore — Google Play в РФ недоступен. */
const ANDROID_FALLBACK_RUSTORE_MS = 2200;
const ANDROID_CHAIN_MAX_MS = 5000;
const MOBILE_SCHEME_FALLBACK_MS = 1200;
const IFRAME_INTENT_REMOVE_MS = 3000;

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
    /** Страница установки на Android — только RuStore. */
    androidInstallUrl: string;
    appSchemes: string[];
  }
> = {
  sber: {
    label: "СберБизнес",
    shortLabel: "Сбер",
    webUrl: "https://sbi.sberbank.ru:9443/ic/dcb/index.html#/login",
    androidPackage: "ru.sberbank_sbbol",
    androidScheme: "sbbol",
    androidInstallUrl: RUSTORE_APP("ru.sberbank_sbbol"),
    appSchemes: ["sbbol://", "sberbankonline://"],
  },
  tbank: {
    label: "Т-Бизнес",
    shortLabel: "Т-Бизнес",
    webUrl: "https://business.tbank.ru/",
    androidPackage: "ru.tinkoff.sme",
    androidScheme: "tbank",
    androidInstallUrl: RUSTORE_APP("ru.tinkoff.sme"),
    appSchemes: ["tbank://", "tinkoffbank://", "tinkoff://"],
  },
  alfa: {
    label: "Альфа-Бизнес",
    shortLabel: "Альфа",
    webUrl: "https://link.alfabank.ru/",
    androidPackage: "ru.alfabank.oavdo.amc",
    androidScheme: "alfabank",
    androidInstallUrl: RUSTORE_APP("ru.alfabank.oavdo.amc"),
    appSchemes: ["alfabank://", "alfabusiness://"],
  },
  vtb: {
    label: "ВТБ Бизнес",
    shortLabel: "ВТБ",
    webUrl: "https://www.vtb.ru/small-business/",
    androidPackage: "ru.vtb.smb",
    androidScheme: "vtb",
    androidInstallUrl: RUSTORE_APP("ru.vtb.smb"),
    appSchemes: ["vtb://", "vtbbusiness://"],
  },
};

let openSessionId = 0;
const pendingTimeouts: number[] = [];
let visibilityCleanup: (() => void) | null = null;

function clearPendingBankOpen(): void {
  pendingTimeouts.forEach((id) => window.clearTimeout(id));
  pendingTimeouts.length = 0;
  if (visibilityCleanup) {
    document.removeEventListener("visibilitychange", visibilityCleanup);
    window.removeEventListener("pagehide", visibilityCleanup);
    visibilityCleanup = null;
  }
}

function scheduleBankStep(fn: () => void, ms: number, sessionId: number): void {
  const id = window.setTimeout(() => {
    if (sessionId !== openSessionId) return;
    fn();
  }, ms);
  pendingTimeouts.push(id);
}

function startBankOpenSession(): number {
  clearPendingBankOpen();
  openSessionId += 1;
  const sessionId = openSessionId;

  const onHide = () => {
    if (document.visibilityState === "hidden") {
      clearPendingBankOpen();
      openSessionId += 1;
    }
  };
  visibilityCleanup = onHide;
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onHide);

  return sessionId;
}

export function isMobileBankOpenDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  if (isClientMobile()) return true;
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  return navigator.maxTouchPoints > 0 && window.innerWidth < 900;
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function openUrl(url: string, newTab: boolean): void {
  if (newTab) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.assign(url);
}

function navigateIntentViaIframe(url: string): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "display:none;width:0;height:0;border:0";
  iframe.src = url;
  document.body.appendChild(iframe);
  window.setTimeout(() => iframe.remove(), IFRAME_INTENT_REMOVE_MS);
}

/**
 * Deep link: intent — только iframe; https — openLink; custom scheme — openLink + location (как openMaxBotLink).
 */
function navigateDeepLink(url: string): void {
  if (typeof window === "undefined") return;

  if (url.startsWith("intent:")) {
    navigateIntentViaIframe(url);
    return;
  }

  const webApp = getWebApp();
  const hasOpenLink = Boolean(webApp && typeof webApp.openLink === "function");

  if (isHttpUrl(url)) {
    if (hasOpenLink) {
      try {
        webApp!.openLink(url);
      } catch {
        /* ниже */
      }
      if (isClientMobile()) {
        window.setTimeout(() => {
          window.location.assign(url);
        }, MOBILE_OPEN_LINK_RETRY_MS);
        return;
      }
      return;
    }
    window.location.assign(url);
    return;
  }

  if (hasOpenLink) {
    try {
      webApp!.openLink(url);
    } catch {
      /* ниже */
    }
  }

  if (isClientMobile()) {
    window.setTimeout(() => {
      window.location.assign(url);
    }, MOBILE_OPEN_LINK_RETRY_MS);
    return;
  }

  window.location.assign(url);
}

function pageStillVisible(sinceMs: number, maxMs: number, sessionId: number): boolean {
  if (sessionId !== openSessionId) return false;
  return document.visibilityState === "visible" && Date.now() - sinceMs < maxMs;
}

/**
 * Android: intent с package → официальный storeUrl → RuStore (если отличается).
 * Без перебора «голых» custom schemes. Fallback отменяется при уходе со страницы (hidden).
 */
function openAndroidBankBusiness(bank: BankBusinessId): void {
  const sessionId = startBankOpenSession();
  const cfg = BANK_CONFIG[bank];
  const started = Date.now();
  const intentUrl = androidLaunchIntentOnly(cfg.androidPackage, cfg.androidScheme);

  navigateDeepLink(intentUrl);

  scheduleBankStep(() => {
    if (!pageStillVisible(started, ANDROID_CHAIN_MAX_MS, sessionId)) return;
    openUrl(cfg.storeUrl, true);
  }, ANDROID_FALLBACK_STORE_MS, sessionId);

  if (cfg.rustoreUrl !== cfg.storeUrl) {
    scheduleBankStep(() => {
      if (!pageStillVisible(started, ANDROID_CHAIN_MAX_MS, sessionId)) return;
      openUrl(cfg.rustoreUrl, true);
    }, ANDROID_FALLBACK_RUSTORE_MS, sessionId);
  }
}

/**
 * Десктоп — веб-ЛК банка.
 * Android — приложение (intent) или магазин / RuStore.
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

  const sessionId = startBankOpenSession();
  const scheme = cfg.appSchemes[0];
  const started = Date.now();
  navigateDeepLink(scheme);

  scheduleBankStep(() => {
    if (!pageStillVisible(started, 2500, sessionId)) return;
    openUrl(cfg.webUrl, true);
  }, MOBILE_SCHEME_FALLBACK_MS, sessionId);
}

export function getBankBusinessConfig(bank: BankBusinessId): BankBusinessDisplayConfig {
  const { label, shortLabel } = BANK_CONFIG[bank];
  return { label, shortLabel };
}
