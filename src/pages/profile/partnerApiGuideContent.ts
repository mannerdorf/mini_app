import { PARTNER_API_PUBLIC_ORIGIN } from "../../constants/partnerApi";

/** Секция описания Partner API в профиле. */
export type PartnerApiGuideSection = {
    id: string;
    title: string;
    intro?: string;
    steps?: string[];
    tableHeaders?: string[];
    tableRows?: { cells: string[] }[];
    bullets?: string[];
    code?: string;
    footnote?: string;
};

export const PARTNER_API_GUIDE_SECTIONS: PartnerApiGuideSection[] = [
    {
        id: "about",
        title: "Что это",
        intro:
            "Partner API v1 — REST-интерфейс для внешних систем (1С, CRM, собственные скрипты). Данные читаются из кэша HAULZ — те же списки перевозок, документов и файлов, что в мини-приложении. Запись через API не поддерживается.",
    },
    {
        id: "base-url",
        title: "Базовый URL",
        intro: "Все запросы отправляйте на сервер API (не на haulz.ru — там только интерфейс приложения):",
        code: PARTNER_API_PUBLIC_ORIGIN,
        footnote: "Путь метода добавляется к этому адресу, например POST …/api/partner/v1/cargo",
    },
    {
        id: "auth",
        title: "Авторизация",
        bullets: [
            "Заголовок: Authorization: Bearer <полный ключ haulz_…>",
            "Формат ключа: haulz_<12 hex>_<64 hex secret> — полный токен показывается один раз при создании.",
            "Префикс haulz_…_ без секрета не работает.",
            "У ключа отдельные права (scope) — без нужного scope запрос вернёт 403.",
            "Опционально ограничьте ключ списком ИНН при создании или в редактировании.",
        ],
    },
    {
        id: "get-key",
        title: "Как получить ключ",
        steps: [
            "Войдите в HAULZ под зарегистрированным аккаунтом (email и пароль).",
            "Откройте Профиль → API.",
            "Нажмите «Создать ключ», выберите права и при необходимости ИНН.",
            "Сохраните полный токен — повторно он не отображается.",
            "Проверьте запрос в справочнике ниже или из своей системы с Bearer.",
        ],
    },
    {
        id: "request-format",
        title: "Формат запросов",
        bullets: [
            "Почти все методы — POST с Content-Type: application/json.",
            "Даты: YYYY-MM-DD (dateFrom, dateTo).",
            "inn — ИНН заказчика; пустая строка или отсутствие — без фильтра (в пределах прав ключа).",
            "serviceMode — boolean, где поддерживается (перевозки, заявки).",
            "Логин и пароль в теле Partner API не передаются — только Bearer.",
            "Ответ download: JSON { data: base64, name } — файл PDF или другой документ.",
        ],
        code: `curl -X POST "${PARTNER_API_PUBLIC_ORIGIN}/api/partner/v1/cargo" \\
  -H "Authorization: Bearer haulz_YOUR_FULL_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"dateFrom":"2026-01-01","dateTo":"2026-01-31","inn":"","serviceMode":false}'`,
    },
    {
        id: "endpoints",
        title: "Методы API",
        intro: "Каждый метод требует свой scope на ключе. Подробные примеры — в справочнике запросов ниже.",
        tableHeaders: ["Метод", "Путь", "Назначение"],
        tableRows: [
            { cells: ["GET", "/api/partner/v1/health", "Проверка доступности (Bearer опционален)"] },
            { cells: ["POST", "/api/partner/v1/cargo", "Список перевозок"] },
            { cells: ["POST", "/api/partner/v1/invoices", "Список счетов"] },
            { cells: ["POST", "/api/partner/v1/acts", "Список УПД"] },
            { cells: ["POST", "/api/partner/v1/orders", "Список заявок"] },
            { cells: ["POST", "/api/partner/v1/claims", "Претензии"] },
            { cells: ["POST", "/api/partner/v1/contracts", "Договоры"] },
            { cells: ["POST", "/api/partner/v1/sverki", "Акты сверок"] },
            { cells: ["POST", "/api/partner/v1/tariffs", "Тарифы"] },
            { cells: ["POST", "/api/partner/v1/download", "Скачать ЭР, АПП, счёт, УПД (metod + number)"] },
        ],
    },
    {
        id: "download",
        title: "Скачивание документов",
        bullets: [
            "POST /api/partner/v1/download, scope documents:read.",
            "Тело: metod — ЭР, АПП, Счет или Акт (для УПД); number — номер перевозки; inn — опционально.",
            "Ответ: JSON с полями data (base64) и name (имя файла).",
        ],
    },
    {
        id: "key-management",
        title: "Управление ключами",
        bullets: [
            "Отключение — тумблер «Вкл./Выкл.» у активного ключа (запросы временно не принимаются).",
            "Изменение прав — кнопка с карандашом: scope и ИНН.",
            "Отзыв — корзина; ключ удаляется безвозвратно, нужно создать новый.",
            "Поле last_used_at обновляется при успешном вызове Partner API.",
        ],
    },
    {
        id: "errors",
        title: "Ошибки и ограничения",
        tableHeaders: ["Код", "Причина"],
        tableRows: [
            { cells: ["400", "Неверное тело запроса (даты, поля, metod)"] },
            { cells: ["401", "Нет Bearer, неверный или отозванный ключ"] },
            { cells: ["403", "Нет нужного scope, ключ отключён, ИНН не разрешён для ключа"] },
            { cells: ["404", "Перевозка или документ не найдены (download)"] },
            { cells: ["405", "Неверный HTTP-метод"] },
            { cells: ["500", "Ошибка сервера — сохраните request_id из ответа"] },
        ],
        footnote: "Только чтение из кэша. Прямые вызовы 1С через Partner API не выполняются.",
    },
];
