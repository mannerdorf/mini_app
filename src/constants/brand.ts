import type { HaulzOffice } from "../types";

/** Фон овала/оверскролла в Telegram, MAX и PWA — совпадает с `manifest.webmanifest` `background_color`. */
export const HAULZ_SPLASH_BACKGROUND = "#3655ff";

/** Прозрачная надпись HAULZ (фон задаётся в CSS). Полная иконка — `public/haulz-icon-source.png`, см. scripts/generate-haulz-brand-icons.sh. */
export const HAULZ_LOGO_SRC = "/haulz-wordmark.png";

export const HAULZ_OFFICES: HaulzOffice[] = [
    {
        city: "Калининград",
        address: "Железнодорожная улица, 12к4, Калининград, 236039",
        phone: "+7 (401) 227-95-55",
    },
    {
        city: "Москва / МО",
        address:
            "территория Индустриальный парк Андреевское, вл14А, деревня Андреевское, Ленинский городской округ, Московская область",
        phone: "+7 (958) 538-42-22",
    },
];

export const HAULZ_EMAIL = "Info@haulz.pro";

/** Диплинки ботов поддержки (MAX / Telegram). */
export const HAULZ_MAX_SUPPORT_BOT_URL = "https://max.ru/id9706037094_bot";
export const HAULZ_TG_SUPPORT_BOT_URL = "https://t.me/HAULZinfobot";
