import type { HaulzOffice } from "../types";

/** Фон овала/оверскролла в Telegram, MAX и PWA — совпадает с `manifest.webmanifest` `background_color`. */
export const HAULZ_SPLASH_BACKGROUND = "#3655ff";

export const HAULZ_OFFICES: HaulzOffice[] = [
    { city: "Калининград", address: "Железнодорожная ул., 12к4", phone: "+7 (401) 227-95-55" },
    { city: "Москва / МО", address: "Индустриальный парк «Андреевское», вл. 14А", phone: "+7 (958) 538-42-22" },
];

export const HAULZ_EMAIL = "Info@haulz.pro";

/** Диплинки ботов поддержки (MAX / Telegram). */
export const HAULZ_MAX_SUPPORT_BOT_URL = "https://max.ru/id9706037094_bot";
export const HAULZ_TG_SUPPORT_BOT_URL = "https://t.me/HAULZinfobot";
