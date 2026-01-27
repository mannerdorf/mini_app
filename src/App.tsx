import { FormEvent, useEffect, useState, useCallback, useMemo } from "react";
// Импортируем все необходимые иконки
import { 
    LogOut, Truck, Loader2, Check, X, Moon, Sun, Eye, EyeOff, AlertTriangle, Package, Calendar, Tag, Layers, Weight, Filter, Search, ChevronDown, User as UserIcon, Scale, RussianRuble, List, Download, Maximize,
    Home, FileText, MessageCircle, User, LayoutGrid, TrendingUp, CornerUpLeft, ClipboardCheck, CreditCard, Minus, ArrowUp, ArrowDown, ArrowUpDown, Heart, Building2, Bell, Shield, TestTube, Info, ArrowLeft, Plus, Trash2, MapPin, Phone, Mail, Share2, Mic, Square
    // Все остальные импорты сохранены на случай использования в Cargo/Details
} from 'lucide-react';
import React from "react";
import { Button, Container, Flex, Grid, Input, Panel, Switch, Typography } from "@maxhub/max-ui";
import { ChatModal } from "./ChatModal";
import "./styles.css";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

// --- FRIENDLY HTTP ERRORS ---
async function readJsonOrText(res: Response): Promise<any> {
    const contentType = res.headers.get("content-type") || "";
    try {
        if (contentType.includes("application/json")) return await res.json();
    } catch { /* ignore */ }
    try {
        const text = await res.text();
        return text;
    } catch {
        return null;
    }
}

function humanizeStatus(status: number): string {
    if (status === 400) return "Неверный запрос. Проверьте данные.";
    if (status === 401 || status === 403) return "Неверный логин или пароль.";
    if (status === 404) return "Данные не найдены.";
    if (status === 408) return "Превышено время ожидания. Повторите попытку.";
    if (status === 429) return "Слишком много попыток. Попробуйте позже.";
    if (status >= 500) return "Ошибка сервера. Попробуйте позже.";
    return "Не удалось выполнить запрос. Попробуйте позже.";
}

async function ensureOk(res: Response, fallback?: string): Promise<void> {
    if (res.ok) return;
    const payload = await readJsonOrText(res);
    const statusMsg = humanizeStatus(res.status);
    const safe =
        (typeof payload === "object" && payload && (payload.error || payload.message))
            ? String(payload.error || payload.message)
            : (typeof payload === "string" && payload.trim() ? payload.trim() : "");
    // Для 404/500 всегда показываем человекочитаемо, не "сырые" тексты
    const message =
        res.status === 404 ? "Данные не найдены." :
        res.status >= 500 ? "Ошибка сервера. Попробуйте позже." :
        safe || fallback || statusMsg;
    throw new Error(message);
}

function extractCustomerFromPerevozki(payload: any): string | null {
    const list = Array.isArray(payload) ? payload : payload?.items || [];
    if (!Array.isArray(list)) return null;
    const item = list.find((entry: any) => entry?.Customer || entry?.customer);
    const customer = item?.Customer ?? item?.customer;
    return customer ? String(customer) : null;
}
// --- TELEGRAM MINI APP SUPPORT ---
const getWebApp = () => {
    if (typeof window === "undefined") return undefined;
    
    // MAX Bridge использует window.WebApp (после подключения max-web-app.js)
    // Telegram использует window.Telegram.WebApp
    const webApp = window.Telegram?.WebApp || (window as any).WebApp;

    // ЕСЛИ мы в MAX и initData пустое, пробуем распарсить из URL hash (#WebAppData=...)
    if (webApp && !webApp.initData && isMaxWebApp()) {
        try {
            const hash = window.location.hash || "";
            if (hash.includes("WebAppData=")) {
                const rawData = hash.split("WebAppData=")[1]?.split("&")[0];
                if (rawData) {
                    const decoded = decodeURIComponent(rawData);
                    webApp.initData = decoded;
                    
                    // Парсим в initDataUnsafe
                    const params = new URLSearchParams(decoded);
                    const unsafe: any = {};
                    params.forEach((val, key) => {
                        if (key === "user" || key === "chat") {
                            try { unsafe[key] = JSON.parse(val); } catch(e) {}
                        } else {
                            unsafe[key] = val;
                        }
                    });
                    webApp.initDataUnsafe = unsafe;
                    console.log("[getWebApp] Manually parsed WebAppData from hash:", unsafe);
                }
            }
        } catch (e) {
            console.error("[getWebApp] Error parsing MAX hash:", e);
        }
    }

    return webApp;
};

const isMaxWebApp = () => {
    if (typeof window === "undefined") return false;
    // MAX Bridge создаёт window.WebApp после подключения библиотеки
    // Также проверяем userAgent для дополнительной надёжности
    const ua = window.navigator?.userAgent || "";
    return Boolean(
        (window as any).WebApp && !window.Telegram?.WebApp || // MAX Bridge (но не Telegram)
        /max[^a-z0-9]?app/i.test(ua) ||
        /\bmax\b/i.test(ua)
    );
};

const isMaxDocsEnabled = () => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).has("maxdocs");
};

import { DOCUMENT_METHODS } from "./documentMethods";


// --- CONFIGURATION ---
const PROXY_API_BASE_URL = '/api/perevozki'; 
const PROXY_API_DOWNLOAD_URL = '/api/download'; 
const PROXY_API_SEND_DOC_URL = '/api/send-document'; 

// --- TYPES ---
type ApiError = { error?: string; [key: string]: unknown; };
type AuthData = { login: string; password: string; id?: string; };
type Account = {
    login: string;
    password: string;
    id: string;
    customer?: string;
    twoFactorEnabled?: boolean;
    twoFactorMethod?: "google" | "telegram";
    twoFactorTelegramLinked?: boolean;
};
// УДАЛЕНО: type Tab = "home" | "cargo" | "docs" | "support" | "profile";
type Tab = "home" | "cargo" | "docs" | "support" | "profile" | "dashboard"; // Все разделы + секретный dashboard
type DateFilter = "все" | "сегодня" | "неделя" | "месяц" | "период";
type StatusFilter = "all" | "in_transit" | "ready" | "delivering" | "delivered" | "favorites";
type HomePeriodFilter = "today" | "week" | "month" | "year" | "custom"; // Оставлено, так как это может использоваться в Home, который пока остается в коде ниже

// --- ИСПОЛЬЗУЕМ ТОЛЬКО ПЕРЕМЕННЫЕ ИЗ API ---
type CargoItem = {
    Number?: string; DatePrih?: string; DateVr?: string; State?: string; Mest?: number | string;
    PW?: number | string; W?: number | string; Value?: number | string; Sum?: number | string;
    StateBill?: string; Sender?: string; Customer?: string; [key: string]: any; // Для всех остальных полей
};

type CargoStat = {
    key: string; label: string; icon: React.ElementType; value: number | string; unit: string; bgColor: string;
};

// --- CONSTANTS ---
const getTodayDate = () => new Date().toISOString().split('T')[0];
const getSixMonthsAgoDate = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6); 
    return d.toISOString().split('T')[0];
};
const DEFAULT_DATE_FROM = getSixMonthsAgoDate();
const DEFAULT_DATE_TO = getTodayDate();

// Статистика (заглушка) - оставлено, так как компонент HomePage остается, но не используется
const STATS_LEVEL_1: CargoStat[] = [
    { key: 'total', label: 'Всего перевозок', icon: LayoutGrid, value: 125, unit: 'шт', bgColor: 'bg-indigo-500' },
    { key: 'payments', label: 'Счета', icon: RussianRuble, value: '1,250,000', unit: '₽', bgColor: 'bg-green-500' },
    { key: 'weight', label: 'Вес', icon: TrendingUp, value: 5400, unit: 'кг', bgColor: 'bg-yellow-500' },
    { key: 'volume', label: 'Объем', icon: Maximize, value: 125, unit: 'м³', bgColor: 'bg-pink-500' },
];

const STATS_LEVEL_2: { [key: string]: CargoStat[] } = {
    total: [
        { key: 'total_new', label: 'В работе', icon: Truck, value: 35, unit: 'шт', bgColor: 'bg-blue-400' },
        { key: 'total_in_transit', label: 'В пути', icon: TrendingUp, value: 50, unit: 'шт', bgColor: 'bg-indigo-400' },
        { key: 'total_completed', label: 'Завершено', icon: Check, value: 40, unit: 'шт', bgColor: 'bg-green-400' },
        { key: 'total_cancelled', label: 'Отменено', icon: X, value: 0, unit: 'шт', bgColor: 'bg-red-400' },
    ],
    payments: [
        { key: 'pay_paid', label: 'Оплачено', icon: ClipboardCheck, value: 750000, unit: '₽', bgColor: 'bg-green-400' },
        { key: 'pay_due', label: 'К оплате', icon: CreditCard, value: 500000, unit: '₽', bgColor: 'bg-yellow-400' },
        { key: 'pay_none', label: 'Нет счета', icon: Minus, value: 0, unit: 'шт', bgColor: 'bg-gray-400' },
    ],
    weight: [
        { key: 'weight_current', label: 'Общий вес', icon: Weight, value: 5400, unit: 'кг', bgColor: 'bg-red-400' },
        { key: 'weight_paid', label: 'Платный вес', icon: Scale, value: 4500, unit: 'кг', bgColor: 'bg-orange-400' },
        { key: 'weight_free', label: 'Бесплатный вес', icon: Layers, value: 900, unit: 'кг', bgColor: 'bg-purple-400' },
    ],
    volume: [
        { key: 'vol_current', label: 'Объем всего', icon: Maximize, value: 125, unit: 'м³', bgColor: 'bg-pink-400' },
        { key: 'vol_boxes', label: 'Кол-во мест', icon: Layers, value: 125, unit: 'шт', bgColor: 'bg-teal-400' },
    ],
};


// --- HELPERS ---
const getDateRange = (filter: DateFilter) => {
    const today = new Date();
    const dateTo = getTodayDate();
    let dateFrom = getTodayDate();
    switch (filter) {
        case 'все': dateFrom = getSixMonthsAgoDate(); break; // ИСПРАВЛЕНО: 'all' на 'все'
        case 'сегодня': dateFrom = getTodayDate(); break;
        case 'неделя': today.setDate(today.getDate() - 7); dateFrom = today.toISOString().split('T')[0]; break;
        case 'месяц': today.setMonth(today.getMonth() - 1); dateFrom = today.toISOString().split('T')[0]; break;
        default: break;
    }
    return { dateFrom, dateTo };
}

const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return '-';
    try {
        // Убеждаемся, что строка - это только дата (без времени) для корректного парсинга
        const cleanDateString = dateString.split('T')[0]; 
        const date = new Date(cleanDateString);
        if (!isNaN(date.getTime())) return date.toLocaleDateString('ru-RU');
    } catch { }
    return dateString;
};

const HOLIDAYS_MM_DD = new Set([
    "01-01", "01-02", "01-03", "01-04", "01-05", "01-06", "01-07", "01-08",
    "02-23", "03-08", "05-01", "05-09", "06-12", "11-04",
]);

const parseDateOnly = (dateString: string | undefined): Date | null => {
    if (!dateString) return null;
    const clean = dateString.split("T")[0].trim();
    if (!clean) return null;
    const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        const [, y, m, d] = isoMatch;
        return new Date(Number(y), Number(m) - 1, Number(d));
    }
    const dotMatch = clean.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (dotMatch) {
        const [, d, m, y] = dotMatch;
        return new Date(Number(y), Number(m) - 1, Number(d));
    }
    const slashMatch = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (slashMatch) {
        const [, d, m, y] = slashMatch;
        return new Date(Number(y), Number(m) - 1, Number(d));
    }
    const parsed = new Date(clean);
    return isNaN(parsed.getTime()) ? null : parsed;
};

const getDateInfo = (dateString: string | undefined) => {
    const text = formatDate(dateString);
    const date = parseDateOnly(dateString);
    if (!date) return { text, isWeekend: false, isHoliday: false };
    const day = date.getDay();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const key = `${mm}-${dd}`;
    const isWeekend = day === 0 || day === 6;
    const isHoliday = HOLIDAYS_MM_DD.has(key);
    return { text, isWeekend, isHoliday };
};

const getDateTextColor = (dateString: string | undefined) => {
    const info = getDateInfo(dateString);
    return info.isHoliday || info.isWeekend ? "#ef4444" : "var(--color-text-secondary)";
};

const DateText = ({ value, className, style }: { value?: string; className?: string; style?: React.CSSProperties }) => {
    const info = getDateInfo(value);
    const classes = [
        className,
        info.isHoliday ? "date-holiday" : info.isWeekend ? "date-weekend" : null,
    ]
        .filter(Boolean)
        .join(" ");
    return (
        <span className={classes} style={style}>
            {info.text}
        </span>
    );
};

const formatCurrency = (value: number | string | undefined): string => {
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === "")) return '-';
    const num = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
    return isNaN(num) ? String(value) : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 2 }).format(num);
};

// Функция для нормализации статуса
const normalizeStatus = (status: string | undefined): string => {
    if (!status) return '-';
    const lower = status.toLowerCase();
    // Заменяем "поставлена на доставку в месте прибытия" на "На доставке"
    if (lower.includes('поставлена на доставку в месте прибытия') || 
        lower.includes('поставлена на доставку')) {
        return 'На доставке';
    }
    return status;
};

const getStatusClass = (status: string | undefined) => {
    const normalized = normalizeStatus(status);
    const lower = (normalized || '').toLowerCase();
    if (lower.includes('доставлен') || lower.includes('заверш')) return 'status-value success';
    if (lower.includes('пути') || lower.includes('отправлен') || lower.includes('доставке')) return 'status-value transit';
    if (lower.includes('принят') || lower.includes('оформлен')) return 'status-value accepted';
    if (lower.includes('готов')) return 'status-value ready';
    return 'status-value';
};

// Компонент бейджа статуса с использованием MAX UI
const StatusBadge = ({ status }: { status: string | undefined }) => {
    const normalizedStatus = normalizeStatus(status);
    const lower = (normalizedStatus || '').toLowerCase();
    let badgeClass = 'max-badge';
    
    if (lower.includes('доставлен') || lower.includes('заверш')) {
        badgeClass += ' max-badge-success';
    } else if (lower.includes('доставке')) {
        badgeClass += ' max-badge-purple';
    } else if (lower.includes('пути') || lower.includes('отправлен') || lower.includes('готов')) {
        badgeClass += ' max-badge-warning';
    } else if (lower.includes('отменен') || lower.includes('аннулирован')) {
        badgeClass += ' max-badge-danger';
    } else {
        badgeClass += ' max-badge-default';
    }
    
    return (
        <span className={badgeClass}>
            {normalizedStatus || '-'}
        </span>
    );
};

// Компонент бейджа статуса счета с использованием MAX UI
const StatusBillBadge = ({ status }: { status: string | undefined }) => {
    const lower = (status || '').toLowerCase().trim();
    let badgeClass = 'max-badge';
    
    // Логика для статусов счета - сначала проверяем "не оплачен", чтобы не перехватить его другими условиями
    if (lower.includes('не оплачен') || lower.includes('неоплачен') || 
        lower.includes('не оплачён') || lower.includes('неоплачён') ||
        lower.includes('unpaid') || lower.includes('ожидает') || lower.includes('pending') ||
        lower === 'не оплачен' || lower === 'неоплачен') {
        badgeClass += ' max-badge-danger'; // Красный для не оплачен
    } else if (lower.includes('отменен') || lower.includes('аннулирован') || lower.includes('отменён') ||
               lower.includes('cancelled') || lower.includes('canceled')) {
        badgeClass += ' max-badge-danger'; // Красный для отменен
    } else if (lower.includes('оплачен') || lower.includes('paid') || lower.includes('оплачён')) {
        badgeClass += ' max-badge-success'; // Зеленый для оплачен
    } else if (lower.includes('частично') || lower.includes('partial') || lower.includes('частичн')) {
        badgeClass += ' max-badge-warning'; // Желтый для частично оплачен
    } else {
        badgeClass += ' max-badge-default'; // Серый для остальных
    }
    
    return (
        <span className={badgeClass}>
            {status || '-'}
        </span>
    );
};

// Функция для определения цвета суммы в зависимости от статуса оплаты
const getSumColorByPaymentStatus = (stateBill: string | undefined): string => {
    if (!stateBill) return 'var(--color-text-primary)';
    const lower = stateBill.toLowerCase().trim();
    
    // Сначала проверяем "не оплачен", чтобы не перехватить его другими условиями
    if (lower.includes('не оплачен') || lower.includes('неоплачен') || 
        lower.includes('не оплачён') || lower.includes('неоплачён') ||
        lower.includes('unpaid') || lower.includes('ожидает') || lower.includes('pending') ||
        lower === 'не оплачен' || lower === 'неоплачен') {
        return '#ef4444'; // Красный для не оплачен
    } else if (lower.includes('оплачен') || lower.includes('paid') || lower.includes('оплачён')) {
        return 'var(--color-success-status)'; // Зеленый для оплачен
    } else if (lower.includes('частично') || lower.includes('partial') || lower.includes('частичн')) {
        return 'var(--color-pending-status)'; // Желтый для частично оплачен
    }
    
    return 'var(--color-text-primary)'; // По умолчанию
};

const getPaymentFilterKey = (stateBill: string | undefined) => {
    if (!stateBill) return "unknown";
    const lower = stateBill.toLowerCase().trim();
    if (lower.includes('не оплачен') || lower.includes('неоплачен') || 
        lower.includes('не оплачён') || lower.includes('неоплачён') ||
        lower.includes('unpaid') || lower.includes('ожидает') || lower.includes('pending') ||
        lower === 'не оплачен' || lower === 'неоплачен') {
        return "unpaid";
    }
    if (lower.includes('отменен') || lower.includes('аннулирован') || lower.includes('отменён') ||
        lower.includes('cancelled') || lower.includes('canceled')) {
        return "cancelled";
    }
    if (lower.includes('оплачен') || lower.includes('paid') || lower.includes('оплачён')) {
        return "paid";
    }
    if (lower.includes('частично') || lower.includes('partial') || lower.includes('частичн')) {
        return "partial";
    }
    return "unknown";
};

const getFilterKeyByStatus = (s: string | undefined): StatusFilter => { 
    if (!s) return 'all'; 
    const normalized = normalizeStatus(s);
    const l = normalized.toLowerCase(); 
    if (l.includes('доставлен') || l.includes('заверш')) return 'delivered'; 
    if (l.includes('пути') || l.includes('отправлен')) return 'in_transit';
    if (l.includes('готов')) return 'ready';
    if (l.includes('доставке')) return 'delivering';
    return 'all'; 
}

const STATUS_MAP: Record<StatusFilter, string> = { "all": "Все", "in_transit": "В пути", "ready": "Готов к выдаче", "delivering": "На доставке", "delivered": "Доставлено", "favorites": "Избранные" };

const resolveChecked = (value: unknown): boolean => {
    if (typeof value === "boolean") return value;
    if (value && typeof value === "object") {
        const target = (value as { target?: { checked?: boolean } }).target;
        if (typeof target?.checked === "boolean") return target.checked;
    }
    return false;
};

const getFileNameFromDisposition = (header: string | null, fallback: string) => {
    if (!header) return fallback;
    const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
    const quotedMatch = header.match(/filename="([^"]+)"/i);
    if (quotedMatch?.[1]) return quotedMatch[1];
    const plainMatch = header.match(/filename=([^;]+)/i);
    if (plainMatch?.[1]) return plainMatch[1].trim();
    return fallback;
};

const PUBLIC_OFFER_TEXT = `Общество с ограниченной ответственностью «Холз», ОГРН 1237700687180, ИНН 9706037094, в лице Генерального директора, действующего на основании Устава, именуемое в дальнейшем «Исполнитель», настоящим предлагает любому юридическому лицу или индивидуальному предпринимателю, именуемому в дальнейшем «Заказчик», заключить договор на оказание логистических услуг на условиях настоящей публичной оферты.

1. Общие положения

1.1. Настоящая оферта является публичным предложением в соответствии со статьей 437 Гражданского кодекса Российской Федерации.
1.2. Акцептом настоящей оферты является оформление заявки через сайт, мини-приложение, API, подтверждение счета или оплата услуг Исполнителя.
1.3. Акцепт оферты означает полное и безоговорочное согласие Заказчика со всеми условиями настоящего договора.

2. Предмет договора

2.1. Исполнитель оказывает Заказчику логистические и транспортно-экспедиционные услуги по маршрутам Москва – Калининград и Калининград – Москва.
2.2. Услуги включают организацию перевозки грузов, экспедирование, консолидацию и деконсолидацию грузов, сопровождение и контроль доставки, оформление сопроводительных документов, а также иные логистические операции по заявке Заказчика.
2.3. Конкретные условия оказания услуг, включая маршрут, сроки, стоимость и характеристики груза, определяются в заявке Заказчика и являются неотъемлемой частью настоящего договора.

3. Порядок оформления и оказания услуг

3.1. Заказчик оформляет заявку путем заполнения электронной формы в мини-приложении Исполнителя или иным согласованным способом.
3.2. Заявка должна содержать сведения о грузе, включая наименование, вес, объем, тип упаковки, маршрут перевозки, сроки доставки, стоимость груза и контактные данные Заказчика.
3.3. Договор считается заключенным с момента подтверждения заявки Исполнителем и (или) выставления счета.
3.4. Электронные данные, сформированные в информационных системах Исполнителя, признаются сторонами юридически значимыми.

4. Стоимость услуг и порядок расчетов

4.1. Стоимость услуг определяется индивидуально и указывается в счете, заявке или коммерческом предложении Исполнителя.
4.2. Расчеты осуществляются в рублях Российской Федерации путем безналичного перевода.
4.3. Исполнитель вправе требовать предварительную оплату в размере до 100 процентов стоимости услуг.
4.4. Обязательства Заказчика по оплате считаются исполненными с момента зачисления денежных средств на расчетный счет Исполнителя.

5. Ответственность за груз

5.1. Ответственность Исполнителя за сохранность груза возникает с момента принятия груза к перевозке и прекращается в момент передачи груза грузополучателю.
5.2. Исполнитель несет ответственность исключительно за реальный ущерб, причиненный по его вине.
5.3. Размер ответственности Исполнителя ограничивается заявленной стоимостью груза, указанной Заказчиком в заявке, но не может превышать стоимость оплаченных услуг, если иное не согласовано сторонами отдельно.
5.4. Исполнитель не несет ответственности за утрату, повреждение или задержку груза в случаях предоставления Заказчиком недостоверной информации о грузе, ненадлежащей упаковки, скрытых дефектов груза, действия третьих лиц, решений государственных органов, а также при наступлении обстоятельств непреодолимой силы.
5.5. Грузы, требующие специальных условий перевозки, принимаются Исполнителем только при наличии предварительного письменного согласования.
5.6. Претензии по утрате или повреждению груза принимаются Исполнителем в течение трех рабочих дней с момента получения груза Заказчиком или грузополучателем.

6. Обязанности Заказчика

6.1. Заказчик обязуется предоставлять достоверную и полную информацию о грузе, обеспечивать надлежащую упаковку, своевременно оплачивать услуги Исполнителя и соблюдать требования законодательства Российской Федерации.

7. Форс-мажор

7.1. Стороны освобождаются от ответственности за полное или частичное неисполнение обязательств по договору при наступлении обстоятельств непреодолимой силы.
7.2. Сторона, для которой наступили такие обстоятельства, обязана уведомить другую сторону в разумный срок.

8. Срок действия и изменение условий

8.1. Договор вступает в силу с момента акцепта оферты и действует бессрочно.
8.2. Исполнитель вправе в одностороннем порядке изменять условия настоящей оферты путем публикации новой редакции.
8.3. Новая редакция оферты применяется к заявкам, оформленным после даты ее публикации.

9. Разрешение споров

9.1. Все споры и разногласия разрешаются путем переговоров.
9.2. При недостижении соглашения спор подлежит рассмотрению в арбитражном суде по месту нахождения Исполнителя.

10. Реквизиты Исполнителя

Общество с ограниченной ответственностью «Холз»
ОГРН: 1237700687180
ИНН: 9706037094
Юридический адрес: г. Москва, ул. Мытная, д. 28, стр. 3, пом. 1/1`;

const PERSONAL_DATA_CONSENT_TEXT = `Настоящим я, действуя свободно, своей волей и в своем интересе, подтверждаю согласие Обществу с ограниченной ответственностью «Холз» (ОГРН 1237700687180, ИНН 9706037094, юридический адрес: г. Москва, ул. Мытная, д. 28, стр. 3, пом. 1/1) (далее — Оператор) на обработку моих персональных данных в соответствии с требованиями Федерального закона от 27.07.2006 № 152-ФЗ «О персональных данных».

1. Персональные данные, на обработку которых дается согласие
К персональным данным относятся, включая, но не ограничиваясь:
— фамилия, имя, отчество;
— номер телефона;
— адрес электронной почты;
— реквизиты организации, которую я представляю;
— иные данные, предоставленные мной при использовании сайта, мини-приложения (мини-аппа), API, сервисов или при оформлении заявки на логистические услуги.

2. Цели обработки персональных данных
Обработка персональных данных осуществляется в целях:
— заключения и исполнения договоров на оказание логистических услуг;
— обработки заявок, оформленных через мини-приложение;
— идентификации пользователя мини-приложения;
— связи со мной по вопросам оказания услуг;
— выполнения требований законодательства Российской Федерации;
— улучшения качества сервисов и пользовательского опыта.

3. Перечень действий с персональными данными
Я даю согласие на совершение с моими персональными данными следующих действий: сбор, запись, систематизация, накопление, хранение, уточнение, использование, передача (в случаях, предусмотренных законодательством РФ), обезличивание, блокирование и уничтожение персональных данных с использованием средств автоматизации и без их использования.

4. Использование мини-приложения как форма согласия
Я подтверждаю и соглашаюсь с тем, что факт использования мини-приложения (мини-аппа) Оператора, включая вход, заполнение форм, отправку заявок, а также передачу данных через интерфейс мини-приложения, признается моим осознанным и однозначным согласием на обработку персональных данных на условиях настоящего документа.

5. Передача персональных данных третьим лицам
Оператор вправе передавать персональные данные третьим лицам исключительно в объеме, необходимом для оказания логистических услуг и исполнения обязательств по договору, а также в случаях, предусмотренных законодательством Российской Федерации.

6. Срок действия согласия
Настоящее согласие действует с момента начала использования мини-приложения, сайта или иных сервисов Оператора и до момента его отзыва субъектом персональных данных либо до достижения целей обработки.

7. Отзыв согласия
Согласие может быть отозвано путем направления письменного уведомления Оператору по адресу его местонахождения либо по электронным каналам связи, используемым Оператором.

8. Подтверждение
Я подтверждаю, что ознакомлен(а) с условиями обработки персональных данных, мои права и обязанности как субъекта персональных данных мне разъяснены и понятны.

Настоящее согласие считается предоставленным в электронной форме и не требует подписания на бумажном носителе.`;

const ABOUT_HAULZ_TEXT = `HAULZ — B2B-логистическая компания, работающая на направлении Москва ↔ Калининград.

Мы выстраиваем логистику на базе современных цифровых технологий, глубоких интеграций и электронного документооборота, что позволяет клиентам получать актуальные статусы, документы и закрывающие отчёты в цифровом виде.

Сервисы HAULZ могут интегрироваться с внутренними системами клиентов и обеспечивают быстрый доступ к счетам, УПД и данным по перевозкам через онлайн-кабинет, мини-приложение, API, бот.`;

type HaulzOffice = {
    city: string;
    address: string;
    phone: string;
};

const HAULZ_OFFICES: HaulzOffice[] = [
    { city: "Калининград", address: "Железнодорожная ул., 12к4", phone: "+7 (401) 227-95-55" },
    { city: "Москва / МО", address: "Индустриальный парк «Андреевское», вл. 14А", phone: "+7 (958) 538-42-22" },
];

const HAULZ_EMAIL = "Info@haulz.pro";

// ================== COMPONENTS ==================

// --- HOME PAGE (STATISTICS) - ОСТАВЛЕН, но не используется ---

function HomePage({ auth }: { auth: AuthData }) {
    const [periodFilter, setPeriodFilter] = useState<HomePeriodFilter>("month");
    const [customFrom, setCustomFrom] = useState(DEFAULT_DATE_FROM);
    const [customTo, setCustomTo] = useState(DEFAULT_DATE_TO);
    const [items, setItems] = useState<CargoItem[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);

    const apiDateRange = useMemo(() => {
        if (periodFilter === "custom") {
            return { dateFrom: customFrom, dateTo: customTo };
        }
        const today = new Date();
        const dateTo = getTodayDate();
        let dateFrom = dateTo;

        switch (periodFilter) {
            case "today":
                dateFrom = getTodayDate();
                break;
            case "week":
                today.setDate(today.getDate() - 7);
                dateFrom = today.toISOString().split("T")[0];
                break;
            case "month":
                today.setMonth(today.getMonth() - 1);
                dateFrom = today.toISOString().split("T")[0];
                break;
            case "year":
                today.setFullYear(today.getFullYear() - 1);
                dateFrom = today.toISOString().split("T")[0];
                break;
            default:
                break;
        }

        return { dateFrom, dateTo };
    }, [periodFilter, customFrom, customTo]);

    const loadStats = useCallback(async (dateFrom: string, dateTo: string) => {
        if (!auth) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(PROXY_API_BASE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    login: auth.login,
                    password: auth.password,
                    dateFrom,
                    dateTo,
                }),
            });
            await ensureOk(res, "Ошибка загрузки данных");
            const data = await res.json();
            const list = Array.isArray(data) ? data : (data.items || []);
            const mapNumber = (value: any): number => {
                if (value === null || value === undefined) return 0;
                if (typeof value === "number") return value;
                const parsed = parseFloat(String(value).replace(",", "."));
                return isNaN(parsed) ? 0 : parsed;
            };
            setItems(
                list.map((item: any) => ({
                    ...item,
                    Number: item.Number,
                    DatePrih: item.DatePrih,
                    DateVr: item.DateVr,
                    State: item.State,
                    Mest: mapNumber(item.Mest),
                    PW: mapNumber(item.PW),
                    W: mapNumber(item.W),
                    Value: mapNumber(item.Value),
                    Sum: mapNumber(item.Sum),
                    StateBill: item.StateBill,
                    Sender: item.Sender,
                    Customer: item.Customer ?? item.customer,
                }))
            );
        } catch (e: any) {
            setError(e.message || "Ошибка загрузки данных");
        } finally {
            setLoading(false);
        }
    }, [auth]);

    useEffect(() => {
        loadStats(apiDateRange.dateFrom, apiDateRange.dateTo);
    }, [apiDateRange, loadStats]);

    const totalShipments = items.length;
    const totalPaidWeight = useMemo(
        () => items.reduce((sum, item) => sum + (Number(item.PW) || 0), 0),
        [items]
    );
    const totalWeight = useMemo(
        () => items.reduce((sum, item) => sum + (Number(item.W) || 0), 0),
        [items]
    );
    const totalVolume = useMemo(
        () => items.reduce((sum, item) => sum + (Number(item.Value) || 0), 0),
        [items]
    );

    const formatTons = (kg: number) => {
        if (!kg) return "0 т";
        return (kg / 1000).toFixed(1) + " т";
    };

    const periodLabel = useMemo(() => {
        const { dateFrom, dateTo } = apiDateRange;
        if (periodFilter === "month") {
            const d = new Date(dateFrom);
            if (!isNaN(d.getTime())) {
                return d.toLocaleDateString("ru-RU", {
                    month: "long",
                    year: "numeric",
                });
            }
        }
        if (periodFilter === "year") {
            const d = new Date(dateFrom);
            if (!isNaN(d.getTime())) {
                return d.getFullYear().toString();
            }
        }
        return `${formatDate(dateFrom)} – ${formatDate(dateTo)}`;
    }, [apiDateRange, periodFilter]);

    const selectPeriod = (value: HomePeriodFilter) => {
        setPeriodFilter(value);
        setIsPeriodModalOpen(false);
        if (value !== "custom") {
            // при выборе предустановленного периода сбрасываем кастомные диапазоны к дефолту
            setCustomFrom(DEFAULT_DATE_FROM);
            setCustomTo(DEFAULT_DATE_TO);
        }
    };

    return (
        <div className="w-full max-w-lg">
            {/* Заголовок периода */}
            <div className="home-period-header mb-6">
                <Button
                    className="home-period-button"
                    onClick={() => setIsPeriodModalOpen(true)}
                >
                    <Typography.Body className="home-period-title">
                        Период:{" "}
                        <Typography.Label className="home-period-value">
                            {periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1)}
                        </Typography.Label>
                    </Typography.Body>
                    <ChevronDown className="w-5 h-5 ml-2" />
                </Button>
            </div>

            {/* Карточки статистики */}
            <Grid className="stats-grid" cols={2} gap={12}>
                <Panel className="stat-card">
                    <div className="flex justify-between items-center mb-2">
                        <Package className="w-5 h-5 text-theme-primary" />
                        <Typography.Label className="text-xs text-theme-secondary">
                            За период
                        </Typography.Label>
                    </div>
                    <Typography.Display className="text-2xl font-bold text-white">
                        {totalShipments}
                    </Typography.Display>
                    <Typography.Label className="text-sm text-theme-secondary mt-1">
                        Всего перевозок
                    </Typography.Label>
                </Panel>

                <Panel className="stat-card">
                    <div className="flex justify-between items-center mb-2">
                        <Scale className="w-5 h-5 text-theme-primary" />
                        <Typography.Label className="text-xs text-theme-secondary">
                            Платный вес
                        </Typography.Label>
                    </div>
                    <Typography.Display className="text-2xl font-bold text-white">
                        {formatTons(totalPaidWeight)}
                    </Typography.Display>
                    <Typography.Label className="text-sm text-theme-secondary mt-1">
                        Платный вес за период
                    </Typography.Label>
                </Panel>

                <Panel className="stat-card">
                    <div className="flex justify-between items-center mb-2">
                        <Weight className="w-5 h-5 text-theme-primary" />
                        <Typography.Label className="text-xs text-theme-secondary">Вес</Typography.Label>
                    </div>
                    <Typography.Display className="text-2xl font-bold text-white">
                        {formatTons(totalWeight)}
                    </Typography.Display>
                    <Typography.Label className="text-sm text-theme-secondary mt-1">
                        Фактический вес за период
                    </Typography.Label>
                </Panel>

                <Panel className="stat-card">
                    <div className="flex justify-between items-center mb-2">
                        <Maximize className="w-5 h-5 text-theme-primary" />
                        <Typography.Label className="text-xs text-theme-secondary">Объем</Typography.Label>
                    </div>
                    <Typography.Display className="text-2xl font-bold text-white">
                        {totalVolume.toFixed(1)}м³
                    </Typography.Display>
                    <Typography.Label className="text-sm text-theme-secondary mt-1">
                        Объем за период
                    </Typography.Label>
                </Panel>
            </Grid>

            {/* Умные нотификации */}
            <Typography.Headline style={{ marginTop: '1.5rem', marginBottom: '0.75rem', fontSize: '1rem' }}>
                Умные нотификации
            </Typography.Headline>
            <Grid className="stats-grid" cols={2} gap={12}>
                <Panel
                    className="stat-card"
                    onClick={() => onOpenCargoFilters({ search: "не оплачен" })}
                    style={{ cursor: 'pointer' }}
                >
                    <div className="flex justify-between items-center mb-2">
                        <CreditCard className="w-5 h-5 text-theme-primary" />
                        <Typography.Label className="text-xs text-theme-secondary">
                            Счета
                        </Typography.Label>
                    </div>
                    <Typography.Display className="text-2xl font-bold text-white">
                        {unpaidCount}
                    </Typography.Display>
                    <Typography.Label className="text-sm text-theme-secondary mt-1">
                        Не оплачено
                    </Typography.Label>
                </Panel>
                <Panel
                    className="stat-card"
                    onClick={() => onOpenCargoFilters({ status: "ready" })}
                    style={{ cursor: 'pointer' }}
                >
                    <div className="flex justify-between items-center mb-2">
                        <Check className="w-5 h-5 text-theme-primary" />
                        <Typography.Label className="text-xs text-theme-secondary">
                            Перевозки
                        </Typography.Label>
                    </div>
                    <Typography.Display className="text-2xl font-bold text-white">
                        {readyCount}
                    </Typography.Display>
                    <Typography.Label className="text-sm text-theme-secondary mt-1">
                        Готовы к выдаче
                    </Typography.Label>
                </Panel>
            </Grid>

            {/* Загрузка / ошибка */}
            {loading && (
                <Flex direction="column" align="center" className="text-center py-8">
                    <Loader2 className="animate-spin w-6 h-6 mx-auto text-theme-primary" />
                    <Typography.Body className="text-sm text-theme-secondary mt-2">
                        Обновление данных...
                    </Typography.Body>
                </Flex>
            )}
            {error && (
                <Flex align="center" className="login-error mt-4">
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    <Typography.Body>{error}</Typography.Body>
                </Flex>
            )}

            {/* Модальное окно выбора периода */}
            {isPeriodModalOpen && (
                <div
                    className="modal-overlay"
                    onClick={() => setIsPeriodModalOpen(false)}
                >
                    <div
                        className="modal-content"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="modal-header">
                            <Typography.Headline>Выбор периода</Typography.Headline>
                            <Button
                                className="modal-close-button"
                                onClick={() => setIsPeriodModalOpen(false)}
                                aria-label="Закрыть"
                            >
                                <X size={20} />
                            </Button>
                        </div>
                        <div className="space-y-3">
                            <Button
                                className="period-option-button"
                                onClick={() => selectPeriod("week")}
                            >
                                Неделя
                            </Button>
                            <Button
                                className="period-option-button"
                                onClick={() => selectPeriod("month")}
                            >
                                Месяц
                            </Button>
                            <Button
                                className="period-option-button"
                                onClick={() => selectPeriod("year")}
                            >
                                Год
                            </Button>
                            <Button
                                className="period-option-button"
                                onClick={() => {
                                    setIsPeriodModalOpen(false);
                                    setIsCustomModalOpen(true);
                                    setPeriodFilter("custom");
                                }}
                            >
                                Произвольный период
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Модальное окно выбора произвольного периода */}
            <CustomPeriodModal
                isOpen={isCustomModalOpen}
                onClose={() => setIsCustomModalOpen(false)}
                dateFrom={customFrom}
                dateTo={customTo}
                onApply={(from, to) => {
                    setCustomFrom(from);
                    setCustomTo(to);
                }}
            />
        </div>
    );
}

function CustomPeriodModal({
    isOpen,
    onClose,
    dateFrom,
    dateTo,
    onApply,
}: {
    isOpen: boolean;
    onClose: () => void;
    dateFrom: string;
    dateTo: string;
    onApply: (from: string, to: string) => void;
}) {
    const [localFrom, setLocalFrom] = useState<string>(dateFrom);
    const [localTo, setLocalTo] = useState<string>(dateTo);

    useEffect(() => {
        setLocalFrom(dateFrom);
        setLocalTo(dateTo);
    }, [dateFrom, dateTo]);

    if (!isOpen) return null;

    const handleApply = () => {
        if (!localFrom || !localTo) return;
        onApply(localFrom, localTo);
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <Typography.Headline>Произвольный период</Typography.Headline>
                    <Button
                        className="modal-close-button"
                        onClick={onClose}
                        aria-label="Закрыть"
                    >
                        <X size={20} />
                    </Button>
                </div>
                <div className="modal-body">
                    <label className="modal-label">
                        Дата с
                        <Input
                            type="date"
                            className="modal-input"
                            value={localFrom}
                            onChange={(e) => setLocalFrom(e.target.value)}
                        />
                    </label>
                    <label className="modal-label">
                        Дата по
                        <Input
                            type="date"
                            className="modal-input"
                            value={localTo}
                            onChange={(e) => setLocalTo(e.target.value)}
                        />
                    </label>
                </div>
                <div className="modal-footer">
                    <Button className="primary-button" onClick={handleApply}>
                        Применить
                    </Button>
                </div>
            </div>
        </div>
    );
}

// --- DASHBOARD PAGE (SECRET) ---
function DashboardPage({
    auth,
    onClose,
    onOpenCargoFilters,
}: {
    auth: AuthData;
    onClose: () => void;
    onOpenCargoFilters: (filters: { status?: StatusFilter; search?: string }) => void;
}) {
    const [items, setItems] = useState<CargoItem[]>([]);
    const [debugInfo, setDebugInfo] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Filters State (такие же как на странице грузов)
    const [dateFilter, setDateFilter] = useState<DateFilter>("неделя");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [customDateFrom, setCustomDateFrom] = useState(DEFAULT_DATE_FROM);
    const [customDateTo, setCustomDateTo] = useState(DEFAULT_DATE_TO);
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
    const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
    
    // Chart type selector
    const [chartType, setChartType] = useState<'money' | 'weight' | 'places'>('money');

    const unpaidCount = useMemo(() => {
        return items.filter(item => getPaymentFilterKey(item.StateBill) === "unpaid").length;
    }, [items]);

    const readyCount = useMemo(() => {
        return items.filter(item => getFilterKeyByStatus(item.State) === "ready").length;
    }, [items]);
    
    const testMaxMessage = async () => {
        const webApp = getWebApp();
        const logs: string[] = [];
        
        logs.push(`Time: ${new Date().toISOString()}`);
        logs.push(`Environment: ${isMaxWebApp() ? "MAX" : "Not MAX"}`);
        logs.push(`window.WebApp: ${!!(window as any).WebApp}`);
        logs.push(`window.Telegram.WebApp: ${!!window.Telegram?.WebApp}`);
        
        if (webApp) {
            logs.push(`initData: ${webApp.initData ? "present" : "absent"}`);
            logs.push(`initDataUnsafe keys: ${Object.keys(webApp.initDataUnsafe || {}).join(", ")}`);
            if (webApp.initDataUnsafe?.user) {
                logs.push(`user: ${JSON.stringify(webApp.initDataUnsafe.user)}`);
            }
            if (webApp.initDataUnsafe?.chat) {
                logs.push(`chat: ${JSON.stringify(webApp.initDataUnsafe.chat)}`);
            }
            
            const chatId = webApp.initDataUnsafe?.user?.id || webApp.initDataUnsafe?.chat?.id;
            logs.push(`Detected chatId: ${chatId}`);
            
            if (chatId) {
                try {
                    logs.push("Sending test message...");
                    const res = await fetch('/api/max-send-message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            chatId, 
                            text: `🛠 ТЕСТ ИЗ ДАШБОРДА\nChatID: ${chatId}\nTime: ${new Date().toLocaleTimeString()}` 
                        })
                    });
                    const resData = await res.json().catch(() => ({}));
                    logs.push(`Response status: ${res.status}`);
                    logs.push(`Response data: ${JSON.stringify(resData)}`);
                } catch (e: any) {
                    logs.push(`Error: ${e.message}`);
                }
            } else {
                logs.push("Error: No chatId found!");
            }
        } else {
            logs.push("Error: WebApp is not available!");
        }
        
        setDebugInfo(logs.join("\n"));
        console.log("[testMaxMessage]", logs);
    };

    const apiDateRange = useMemo(() => 
        dateFilter === "период" 
            ? { dateFrom: customDateFrom, dateTo: customDateTo } 
            : getDateRange(dateFilter), 
        [dateFilter, customDateFrom, customDateTo]
    );
    
    const loadCargo = useCallback(async (dateFrom: string, dateTo: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(PROXY_API_BASE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    login: auth.login,
                    password: auth.password,
                    dateFrom,
                    dateTo
                })
            });
            await ensureOk(res, "Ошибка загрузки данных");
            const data = await res.json();
            const list = Array.isArray(data) ? data : data.items || [];
            setItems(list.map((item: any) => ({
                ...item,
                Number: item.Number,
                DatePrih: item.DatePrih,
                DateVr: item.DateVr,
                State: item.State,
                Mest: item.Mest,
                PW: item.PW,
                W: item.W,
                Value: item.Value,
                Sum: item.Sum,
                StateBill: item.StateBill,
                Sender: item.Sender,
                Customer: item.Customer ?? item.customer,
            })));
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [auth]);
    
    useEffect(() => {
        loadCargo(apiDateRange.dateFrom, apiDateRange.dateTo);
    }, [apiDateRange, loadCargo]);
    
    // Фильтрация
    const filteredItems = useMemo(() => {
        let res = items;
        if (statusFilter === 'favorites') {
            // Фильтр избранных (если нужно)
            const favorites = JSON.parse(localStorage.getItem('haulz.favorites') || '[]') as string[];
            res = res.filter(i => i.Number && favorites.includes(i.Number));
        } else if (statusFilter !== 'all') {
            res = res.filter(i => getFilterKeyByStatus(i.State) === statusFilter);
        }
        return res;
    }, [items, statusFilter]);
    
    // Подготовка данных для графиков (группировка по датам)
    const chartData = useMemo(() => {
        const dataMap = new Map<string, { date: string; sum: number; pw: number; mest: number }>();
        
        filteredItems.forEach(item => {
            if (!item.DatePrih) return;
            
            // Используем исходную дату для группировки, но форматируем для отображения
            const dateKey = item.DatePrih.split('T')[0]; // YYYY-MM-DD
            const displayDate = formatDate(item.DatePrih);
            if (!dateKey || displayDate === '-') return;
            
            const existing = dataMap.get(dateKey) || { date: displayDate, sum: 0, pw: 0, mest: 0 };
            existing.sum += typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
            existing.pw += typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
            existing.mest += typeof item.Mest === 'string' ? parseFloat(item.Mest) || 0 : (item.Mest || 0);
            dataMap.set(dateKey, existing);
        });
        
        return Array.from(dataMap.values()).sort((a, b) => {
            // Сортируем по дате (формат DD.MM.YYYY)
            const partsA = a.date.split('.');
            const partsB = b.date.split('.');
            if (partsA.length !== 3 || partsB.length !== 3) return 0;
            const dateA = new Date(parseInt(partsA[2]), parseInt(partsA[1]) - 1, parseInt(partsA[0]));
            const dateB = new Date(parseInt(partsB[2]), parseInt(partsB[1]) - 1, parseInt(partsB[0]));
            return dateA.getTime() - dateB.getTime();
        });
    }, [filteredItems]);
    
    // Функция для создания SVG графика
    const renderChart = (
        data: { date: string; value: number }[],
        title: string,
        color: string,
        formatValue: (val: number) => string
    ) => {
        if (data.length === 0) {
            return (
                <Panel className="cargo-card" style={{ marginBottom: '1rem' }}>
                    <Typography.Headline style={{ marginBottom: '1rem', fontSize: '1rem' }}>{title}</Typography.Headline>
                    <Typography.Body className="text-theme-secondary">Нет данных для отображения</Typography.Body>
                    <Flex style={{ gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                        <Button className="filter-button" type="button" onClick={() => setDateFilter("месяц")} style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}>
                            За месяц
                        </Button>
                        <Button className="filter-button" type="button" onClick={() => setDateFilter("все")} style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}>
                            За всё время
                        </Button>
                        <Button className="filter-button" type="button" onClick={() => setStatusFilter("all")} style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}>
                            Сбросить фильтр статуса
                        </Button>
                    </Flex>
                </Panel>
            );
        }
        
        // Округляем значения до целых
        const roundedData = data.map(d => ({ ...d, value: Math.round(d.value) }));
        const maxValue = Math.max(...roundedData.map(d => d.value), 1);
        const scaleMax = maxValue * 1.1; // Максимум шкалы = max + 10%
        
        const chartHeight = 250;
        const paddingLeft = 60;
        const paddingRight = 30;
        const paddingTop = 30;
        const paddingBottom = 80;
        const availableWidth = 350;
        const barSpacing = 6;
        const barWidth = Math.max(12, (availableWidth - paddingLeft - paddingRight - (roundedData.length - 1) * barSpacing) / roundedData.length);
        const chartWidth = paddingLeft + paddingRight + roundedData.length * (barWidth + barSpacing) - barSpacing;
        const availableHeight = chartHeight - paddingTop - paddingBottom;
        
        // Градиенты для столбцов (полутона, сложные)
        const gradientId = `gradient-${color.replace('#', '')}`;
        // Создаем более светлый и темный оттенки для градиента
        const hexToRgb = (hex: string) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : null;
        };
        const rgb = hexToRgb(color);
        const lightColor = rgb ? `rgb(${Math.min(255, rgb.r + 40)}, ${Math.min(255, rgb.g + 40)}, ${Math.min(255, rgb.b + 40)})` : color;
        const darkColor = rgb ? `rgb(${Math.max(0, rgb.r - 30)}, ${Math.max(0, rgb.g - 30)}, ${Math.max(0, rgb.b - 30)})` : color;
        
        return (
            <div>
                <div style={{ overflowX: 'auto', width: '100%' }}>
                    <svg 
                        width={Math.max(chartWidth, '100%')} 
                        height={chartHeight}
                        style={{ minWidth: `${chartWidth}px`, display: 'block' }}
                    >
                        {/* Определение градиента */}
                        <defs>
                            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor={lightColor} stopOpacity="0.9" />
                                <stop offset="100%" stopColor={darkColor} stopOpacity="0.6" />
                            </linearGradient>
                        </defs>
                        
                        {/* Горизонтальная ось */}
                        <line 
                            x1={paddingLeft} 
                            y1={chartHeight - paddingBottom} 
                            x2={chartWidth - paddingRight} 
                            y2={chartHeight - paddingBottom} 
                            stroke="var(--color-border)" 
                            strokeWidth="1.5" 
                            opacity="0.5"
                        />
                        
                        {/* Вертикальная ось */}
                        <line 
                            x1={paddingLeft} 
                            y1={paddingTop} 
                            x2={paddingLeft} 
                            y2={chartHeight - paddingBottom} 
                            stroke="var(--color-border)" 
                            strokeWidth="1.5" 
                            opacity="0.5"
                        />
                        
                        {/* Столбцы */}
                        {roundedData.map((d, idx) => {
                            const barHeight = (d.value / scaleMax) * availableHeight;
                            const x = paddingLeft + idx * (barWidth + barSpacing);
                            const y = chartHeight - paddingBottom - barHeight;
                            
                            return (
                                <g key={idx}>
                                    {/* Столбец с градиентом */}
                                    <rect
                                        x={x}
                                        y={y}
                                        width={barWidth}
                                        height={barHeight}
                                        fill={`url(#${gradientId})`}
                                        rx="4"
                                        style={{ transition: 'all 0.3s ease' }}
                                    />
                                    
                                    {/* Значение вертикально внутри столбца */}
                                    {barHeight > 20 && (
                                        <text
                                            x={x + barWidth / 2}
                                            y={y + barHeight / 2}
                                            fontSize="7"
                                            fill="var(--color-text-primary)"
                                            textAnchor="middle"
                                            fontWeight="600"
                                            dominantBaseline="middle"
                                            transform={`rotate(-90 ${x + barWidth / 2} ${y + barHeight / 2})`}
                                        >
                                            {formatValue(d.value)}
                                        </text>
                                    )}
                                    
                                    {/* Дата вертикально под столбцом */}
                                    <text
                                        x={x + barWidth / 2}
                                        y={chartHeight - paddingBottom + 20}
                                        fontSize="10"
                                        fill={getDateTextColor(d.date)}
                                        textAnchor="middle"
                                        transform={`rotate(-45 ${x + barWidth / 2} ${chartHeight - paddingBottom + 20})`}
                                    >
                                        {d.date.split('.').slice(0, 2).join('.')}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                </div>
            </div>
        );
    };
    
    return (
        <div className="w-full">
            {/* Filters (такие же как на странице грузов) */}
            <div className="filters-container">
                <div className="filter-group">
                    <Button className="filter-button" onClick={() => { setIsDateDropdownOpen(!isDateDropdownOpen); setIsStatusDropdownOpen(false); }}>
                        Дата: {dateFilter === 'период' ? 'Период' : dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1)} <ChevronDown className="w-4 h-4"/>
                    </Button>
                    {isDateDropdownOpen && (
                        <div className="filter-dropdown">
                            {['сегодня', 'неделя', 'месяц', 'период'].map(key => (
                                <div key={key} className="dropdown-item" onClick={() => { 
                                    setDateFilter(key as any); 
                                    setIsDateDropdownOpen(false); 
                                    if(key === 'период') setIsCustomModalOpen(true); 
                                }}>
                                    <Typography.Body>{key.charAt(0).toUpperCase() + key.slice(1)}</Typography.Body>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="filter-group">
                    <Button className="filter-button" onClick={() => { setIsStatusDropdownOpen(!isStatusDropdownOpen); setIsDateDropdownOpen(false); }}>
                        Статус: {STATUS_MAP[statusFilter]} <ChevronDown className="w-4 h-4"/>
                    </Button>
                    {isStatusDropdownOpen && (
                        <div className="filter-dropdown">
                            {Object.keys(STATUS_MAP).map(key => (
                                <div key={key} className="dropdown-item" onClick={() => { 
                                    setStatusFilter(key as any); 
                                    setIsStatusDropdownOpen(false); 
                                }}>
                                    <Typography.Body>{STATUS_MAP[key as StatusFilter]}</Typography.Body>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            
            <Typography.Body className="text-sm text-theme-secondary mb-4 text-center">
                Период: <DateText value={apiDateRange.dateFrom} /> – <DateText value={apiDateRange.dateTo} />
            </Typography.Body>
            
            {loading && (
                <Flex justify="center" className="text-center py-8">
                    <Loader2 className="animate-spin w-6 h-6 mx-auto text-theme-primary" />
                </Flex>
            )}
            
            {error && (
                <Flex align="center" className="login-error mt-4">
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    <Typography.Body>{error}</Typography.Body>
                </Flex>
            )}
            
            {!loading && !error && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1.5rem', position: 'relative' }}>
                    {/* Переключатель типа данных в правом верхнем углу */}
                    <Flex justify="flex-end" style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 10 }}>
                        <Flex gap="0.5rem" align="center" style={{ background: 'var(--color-bg-hover)', padding: '0.25rem', borderRadius: '8px' }}>
                            <Button
                                className="filter-button"
                                style={{ 
                                    padding: '0.5rem', 
                                    minWidth: 'auto',
                                    background: chartType === 'money' ? 'var(--color-primary-blue)' : 'transparent',
                                    border: chartType === 'money' ? '1px solid var(--color-primary-blue)' : '1px solid transparent'
                                }}
                                onClick={() => setChartType('money')}
                                title="Деньги"
                            >
                                <RussianRuble className="w-4 h-4" style={{ color: chartType === 'money' ? 'white' : 'var(--color-text-secondary)' }} />
                            </Button>
                            <Button
                                className="filter-button"
                                style={{ 
                                    padding: '0.5rem', 
                                    minWidth: 'auto',
                                    background: chartType === 'weight' ? '#10b981' : 'transparent',
                                    border: chartType === 'weight' ? '1px solid #10b981' : '1px solid transparent'
                                }}
                                onClick={() => setChartType('weight')}
                                title="Вес"
                            >
                                <Weight className="w-4 h-4" style={{ color: chartType === 'weight' ? 'white' : 'var(--color-text-secondary)' }} />
                            </Button>
                            <Button
                                className="filter-button"
                                style={{ 
                                    padding: '0.5rem', 
                                    minWidth: 'auto',
                                    background: chartType === 'places' ? '#f59e0b' : 'transparent',
                                    border: chartType === 'places' ? '1px solid #f59e0b' : '1px solid transparent'
                                }}
                                onClick={() => setChartType('places')}
                                title="Места"
                            >
                                <Package className="w-4 h-4" style={{ color: chartType === 'places' ? 'white' : 'var(--color-text-secondary)' }} />
                            </Button>
                        </Flex>
                    </Flex>
                    
                    {(() => {
                        let chartDataForType: { date: string; value: number }[];
                        let title: string;
                        let color: string;
                        let formatValue: (val: number) => string;
                        
                        switch (chartType) {
                            case 'money':
                                chartDataForType = chartData.map(d => ({ date: d.date, value: Math.round(d.sum) }));
                                title = "Динамика в деньгах";
                                color = "#6366f1";
                                formatValue = (val) => `${Math.round(val).toLocaleString('ru-RU')} ₽`;
                                break;
                            case 'weight':
                                chartDataForType = chartData.map(d => ({ date: d.date, value: Math.round(d.pw) }));
                                title = "Динамика в платном весе";
                                color = "#10b981";
                                formatValue = (val) => `${Math.round(val)} кг`;
                                break;
                            case 'places':
                                chartDataForType = chartData.map(d => ({ date: d.date, value: Math.round(d.mest) }));
                                title = "Динамика в местах";
                                color = "#f59e0b";
                                formatValue = (val) => `${Math.round(val)}`;
                                break;
                        }
                        
                        return renderChart(chartDataForType, title, color, formatValue);
                    })()}
                </Panel>
            )}
            
            <FilterDialog 
                isOpen={isCustomModalOpen} 
                onClose={() => setIsCustomModalOpen(false)} 
                dateFrom={customDateFrom} 
                dateTo={customDateTo} 
                onApply={(f, t) => { 
                    setCustomDateFrom(f); 
                    setCustomDateTo(t); 
                }} 
            />
        </div>
    );
}

// --- ACCOUNT SWITCHER (CLICK DROPDOWN) ---
function AccountSwitcher({ 
    accounts, 
    activeAccountId, 
    onSwitchAccount 
}: { 
    accounts: Account[]; 
    activeAccountId: string | null; 
    onSwitchAccount: (accountId: string) => void; 
}) {
    const [isOpen, setIsOpen] = useState(false);
    const activeAccount = accounts.find(acc => acc.id === activeAccountId);
    const activeLabel = activeAccount?.customer || activeAccount?.login || 'Не выбран';
    
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.account-switcher')) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [isOpen]);
    
    return (
        <div className="account-switcher filter-group" style={{ position: 'relative' }}>
            <Button 
                className="filter-button"
                onClick={() => setIsOpen(!isOpen)}
                style={{ 
                    padding: '0.5rem 0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.9rem'
                }}
                title={`Переключить аккаунт (${accounts.length} аккаунтов)`}
            >
                <UserIcon className="w-4 h-4" />
                <Typography.Body style={{ fontSize: '0.9rem' }}>{activeLabel}</Typography.Body>
                <ChevronDown className="w-4 h-4" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </Button>
            {isOpen && (
                <div className="filter-dropdown" style={{ minWidth: '200px' }}>
                    {accounts.map((account) => (
                        <div 
                            key={account.id}
                            className={`dropdown-item ${activeAccountId === account.id ? 'active' : ''}`}
                            onClick={() => {
                                onSwitchAccount(account.id);
                                setIsOpen(false);
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                backgroundColor: activeAccountId === account.id ? 'var(--color-bg-hover)' : 'transparent'
                            }}
                        >
                            <Flex align="center" style={{ flex: 1, gap: '0.5rem' }}>
                                <Building2 className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
                                <Typography.Body style={{ fontSize: '0.9rem', fontWeight: activeAccountId === account.id ? 'bold' : 'normal' }}>
                                    {account.customer || account.login}
                                </Typography.Body>
                            </Flex>
                            {activeAccountId === account.id && (
                                <Check className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Типы для навигации профиля
type ProfileView = 'main' | 'companies' | 'addCompanyMethod' | 'addCompanyByINN' | 'addCompanyByLogin' | 'about' | 'tinyurl-test';

function truncateForLog(u: string, max = 80) {
    return u.length <= max ? u : u.slice(0, max) + '...';
}

function TinyUrlTestPage({ onBack }: { onBack: () => void }) {
    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: '0.5rem' }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: '1.25rem' }}>Дашборды</Typography.Headline>
            </Flex>
            <Panel className="cargo-card" style={{ padding: '1rem' }}>
                <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                    Раздел временно недоступен.
                </Typography.Body>
            </Panel>
        </div>
    );

    const [inputUrl, setInputUrl] = useState('');
    const [shortUrl, setShortUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [maxDebugInfo, setMaxDebugInfo] = useState<string>("");

    const testMaxMessage = async () => {
        const webApp = getWebApp();
        const testLogs: string[] = [];
        
        testLogs.push(`Time: ${new Date().toISOString()}`);
        testLogs.push(`Environment: ${isMaxWebApp() ? "MAX" : "Not MAX"}`);
        testLogs.push(`window.WebApp: ${!!(window as any).WebApp}`);
        testLogs.push(`URL: ${window.location.href}`);
        
        if (webApp) {
            // Попробуем вызвать ready() еще раз
            if (typeof webApp.ready === "function") {
                try { webApp.ready(); testLogs.push("Called webApp.ready()"); } catch(e) { testLogs.push(`ready() error: ${e}`); }
            }

            testLogs.push(`initData Type: ${typeof webApp.initData}`);
            if (webApp.initData) {
                testLogs.push(`initData Length: ${webApp.initData.length}`);
                testLogs.push(`initData Value: ${webApp.initData.substring(0, 100)}`);
            } else {
                testLogs.push("initData is EMPTY string or null");
            }
            
            const unsafe = webApp.initDataUnsafe || {};
            const unsafeKeys = Object.keys(unsafe);
            testLogs.push(`initDataUnsafe Keys (${unsafeKeys.length}): ${unsafeKeys.join(", ")}`);
            
            if (unsafe.user) testLogs.push(`user: ${JSON.stringify(unsafe.user)}`);
            if (unsafe.chat) testLogs.push(`chat: ${JSON.stringify(unsafe.chat)}`);
            
            // Проверка всех свойств window на наличие слова "id" или "user" или "chat"
            testLogs.push("--- Searching Global Scope ---");
            const globals = Object.keys(window).filter(k => 
                (k.toLowerCase().includes("id") || k.toLowerCase().includes("user") || k.toLowerCase().includes("chat")) &&
                !k.startsWith("webkit") && !k.startsWith("on") && k !== "id"
            );
            testLogs.push(`Global matches: ${globals.slice(0, 10).join(", ")}`);
            globals.slice(0, 5).forEach(k => {
                try {
                    const val = (window as any)[k];
                    if (typeof val !== "function" && typeof val !== "object") {
                        testLogs.push(`${k}: ${val}`);
                    }
                } catch(e) {}
            });

            // Проверяем Telegram.WebApp отдельно
            if (window.Telegram?.WebApp) {
                testLogs.push(`Telegram.WebApp.initData: ${window.Telegram.WebApp.initData ? "YES" : "NO"}`);
            }

            const chatId = unsafe.user?.id || unsafe.chat?.id || (window as any).WebAppUser?.id || (window as any).userId;
            testLogs.push(`Detected chatId from unsafe: ${chatId}`);

            // Попытка прямого парсинга из URL для отладки
            let manualChatId = null;
            try {
                const hash = window.location.hash;
                if (hash.includes("WebAppData=")) {
                    const data = decodeURIComponent(hash.split("WebAppData=")[1].split("&")[0]);
                    const params = new URLSearchParams(data);
                    const chatStr = params.get("chat");
                    if (chatStr) {
                        const chatObj = JSON.parse(chatStr);
                        manualChatId = chatObj.id;
                        testLogs.push(`Manual parse chatId (chat): ${manualChatId}`);
                    }
                    if (!manualChatId) {
                        const userStr = params.get("user");
                        if (userStr) {
                            const userObj = JSON.parse(userStr);
                            manualChatId = userObj.id;
                            testLogs.push(`Manual parse chatId (user): ${manualChatId}`);
                        }
                    }
                }
            } catch(e) { testLogs.push(`Manual parse error: ${e}`); }

            const finalId = chatId || manualChatId;
            testLogs.push(`Final Detected chatId: ${finalId}`);
            
            if (finalId) {
                try {
                    testLogs.push("Sending test message...");
                    const res = await fetch('/api/max-send-message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            chatId: finalId, 
                            text: `🛠 ТЕСТ ИЗ ПРОФИЛЯ\nChatID: ${finalId}\nTime: ${new Date().toLocaleTimeString()}` 
                        })
                    });
                    const resStatus = res.status;
                    const resText = await res.text();
                    testLogs.push(`Response status: ${resStatus}`);
                    
                    try {
                        const resData = JSON.parse(resText);
                        if (resStatus !== 200) {
                            testLogs.push(`Error Data: ${JSON.stringify(resData)}`);
                        } else {
                            testLogs.push("✅ Message sent successfully!");
                        }
                    } catch (e) {
                        testLogs.push(`Raw Response (not JSON): ${resText.substring(0, 200)}`);
                    }
                } catch (e: any) {
                    testLogs.push(`Fetch Error: ${e.message}`);
                }
            }
        }
        
        setMaxDebugInfo(testLogs.join("\n"));
    };

    const addLog = (message: string) => {
        const timestamp = new Date().toLocaleTimeString('ru-RU');
        setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
    };

    const handlePing = async () => {
        setError(null);
        addLog('Проверка GET /api/shorten-ping...');
        try {
            const res = await fetch('/api/shorten-ping', { method: 'GET' });
            const data = await res.json().catch(() => ({}));
            addLog(`GET ответ: status=${res.status}, ok=${res.ok}`);
            addLog(`tinyurl_configured: ${data.tinyurl_configured === true ? 'ДА' : 'НЕТ'}`);
            if (data.tinyurl_configured) addLog('✅ Токен TinyURL задан. Можно пробовать сокращать.');
            else addLog('❌ TINYURL_API_TOKEN не задан в Vercel.');
        } catch (e: any) {
            addLog(`❌ Ошибка: ${e?.message || String(e)}`);
        }
    };

    const handleShorten = async () => {
        if (!inputUrl.trim()) {
            setError('Введите URL');
            return;
        }
        try {
            new URL(inputUrl);
        } catch {
            setError('Неверный формат URL');
            return;
        }

        setLoading(true);
        setError(null);
        setShortUrl(null);
        addLog(`Начало сокращения URL: ${truncateForLog(inputUrl)}`);

        try {
            addLog('Клиент → POST /api/shorten');
            addLog(`Тело запроса: {"url":"${truncateForLog(inputUrl)}"} (длина: ${inputUrl.length})`);
            
            const res = await fetch('/api/shorten', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: inputUrl }),
            });

            const raw = await res.text();
            addLog(`Ответ: status=${res.status}, ok=${res.ok}`);

            if (res.ok) {
                let data: any = {};
                try { data = JSON.parse(raw); } catch { data = { message: raw }; }
                if (data.short_url) {
                    setShortUrl(data.short_url);
                    addLog(`✅ Успешно! Короткая ссылка: ${data.short_url}`);
                } else {
                    setError('Короткая ссылка не получена');
                    addLog(`❌ В ответе нет short_url`);
                }
            } else {
                let errData: any = {};
                try { errData = JSON.parse(raw); } catch { errData = { message: raw }; }
                if (raw.includes('FUNCTION_INVOCATION_FAILED')) {
                    addLog('Сервер упал до ответа. Детали — в логах Vercel (Functions → /api/shorten).');
                }
                setError(errData.message || errData.error || raw || `Ошибка ${res.status}`);
                addLog(`❌ Ошибка: ${errData.error || errData.message || raw}`);
            }
        } catch (e: any) {
            const msg = e?.message || String(e);
            addLog(`❌ Исключение: ${msg}`);
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: '0.5rem' }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: '1.25rem' }}>Тест TinyURL</Typography.Headline>
            </Flex>

            <Panel className="cargo-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                <Typography.Label style={{ marginBottom: '0.5rem', display: 'block' }}>
                    Введите длинную ссылку:
                </Typography.Label>
                <Input
                    type="url"
                    placeholder="https://example.com/very/long/url..."
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    className="login-input"
                    style={{ marginBottom: '0.75rem' }}
                    disabled={loading}
                />
                <Flex style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                    <Button
                        className="filter-button"
                        onClick={handlePing}
                        disabled={loading}
                        style={{ flex: 1, minWidth: '140px' }}
                    >
                        Проверить подключение
                    </Button>
                    <Button
                        className="button-primary"
                        onClick={handleShorten}
                        disabled={loading || !inputUrl.trim()}
                        style={{ flex: 1, minWidth: '140px' }}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                Сокращаю...
                            </>
                        ) : (
                            'Сократить ссылку'
                        )}
                    </Button>
                </Flex>

                {error && (
                    <Flex align="center" className="login-error mt-4">
                        <AlertTriangle className="w-5 h-5 mr-2" />
                        <Typography.Body>{error}</Typography.Body>
                    </Flex>
                )}

                {shortUrl && (
                    <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--color-bg-secondary)', borderRadius: '0.5rem' }}>
                        <Typography.Label style={{ marginBottom: '0.5rem', display: 'block' }}>
                            Короткая ссылка:
                        </Typography.Label>
                        <Typography.Body
                            style={{
                                wordBreak: 'break-all',
                                color: 'var(--color-primary)',
                                cursor: 'pointer',
                            }}
                            onClick={() => {
                                navigator.clipboard?.writeText(shortUrl).then(() => {
                                    alert('Скопировано!');
                                });
                            }}
                        >
                            {shortUrl}
                        </Typography.Body>
                    </div>
                )}
            </Panel>

            {isMaxWebApp() && (
                <Panel className="cargo-card mb-4" style={{ padding: '1rem', background: '#222', color: '#fff', border: '1px dashed #555', marginTop: '1rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#ffcc00' }}>🛠 MAX Debug (Profile Section)</Typography.Headline>
                    <Flex vertical gap="0.75rem">
                        <Button onClick={testMaxMessage} className="filter-button" style={{ background: '#ffcc00', color: '#000', fontWeight: 'bold' }}>
                            Отправить тестовое сообщение
                        </Button>
                        {maxDebugInfo && (
                            <pre style={{ 
                                background: '#000', 
                                padding: '0.75rem', 
                                borderRadius: '8px', 
                                fontSize: '0.75rem', 
                                overflowX: 'auto',
                                whiteSpace: 'pre-wrap',
                                border: '1px solid #333'
                            }}>
                                {maxDebugInfo}
                            </pre>
                        )}
                    </Flex>
                </Panel>
            )}

            <Panel className="cargo-card" style={{ padding: '1rem' }}>
                <Typography.Label style={{ marginBottom: '0.75rem', display: 'block' }}>
                    Логи:
                </Typography.Label>
                <div
                    style={{
                        maxHeight: '400px',
                        overflowY: 'auto',
                        background: 'var(--color-bg-secondary)',
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        fontSize: '0.85rem',
                        fontFamily: 'monospace',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                    }}
                >
                    {logs.length === 0 ? (
                        <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>
                            Логи появятся здесь после попытки сокращения ссылки...
                        </Typography.Body>
                    ) : (
                        logs.map((log, idx) => (
                            <div key={idx} style={{ marginBottom: '0.25rem' }}>
                                {log}
                            </div>
                        ))
                    )}
                </div>
                {logs.length > 0 && (
                    <Button
                        className="filter-button"
                        onClick={() => setLogs([])}
                        style={{ marginTop: '0.75rem', width: '100%' }}
                    >
                        Очистить логи
                    </Button>
                )}
            </Panel>
        </div>
    );
}

function AiChatProfilePage({
    onBack,
    auth,
    accountId,
    customer,
    onOpenCargo,
    chatId,
    onOpenTelegramBot
}: {
    onBack: () => void;
    auth: AuthData | null;
    accountId: string | null;
    customer: string | null;
    onOpenCargo: (cargoNumber: string) => void;
    chatId: string | null;
    onOpenTelegramBot?: () => Promise<void>;
}) {
    const [prefillMessage, setPrefillMessage] = useState<string | undefined>(undefined);
    const [tgLinkError, setTgLinkError] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const stored = window.sessionStorage.getItem("haulz.chat.prefill");
        if (stored) {
            setPrefillMessage(stored);
            window.sessionStorage.removeItem("haulz.chat.prefill");
        }
    }, []);

    return (
        <div
            className="w-full"
            style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 240px)' }}
        >
            <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: '0.5rem' }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: '1.25rem' }}>AI чат</Typography.Headline>
                {onOpenTelegramBot && (
                    <Button
                        className="filter-button"
                        style={{ marginLeft: 'auto' }}
                        onClick={async () => {
                            setTgLinkError(null);
                            try {
                                await onOpenTelegramBot();
                            } catch (e: any) {
                                setTgLinkError(e?.message || "Не удалось открыть Telegram-бота.");
                            }
                        }}
                    >
                        Открыть в Telegram
                    </Button>
                )}
            </Flex>
            {tgLinkError && (
                <Typography.Body style={{ color: 'var(--color-error-text)', marginBottom: '0.5rem' }}>
                    {tgLinkError}
                </Typography.Body>
            )}
            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                {auth ? (
                    <ChatPage
                        auth={auth}
                        sessionOverride={`ai_${customer || accountId || "anon"}_${chatId || "anon"}`}
                        userIdOverride={chatId || customer || accountId || "anon"}
                        customerOverride={customer || undefined}
                        prefillMessage={prefillMessage}
                        onClearPrefill={() => setPrefillMessage(undefined)}
                        onOpenCargo={onOpenCargo}
                    />
                ) : (
                    <Panel className="cargo-card" style={{ padding: '1rem', width: '100%' }}>
                        <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                            Сначала выберите компанию.
                        </Typography.Body>
                    </Panel>
                )}
            </div>
        </div>
    );
}

function AboutCompanyPage({ onBack }: { onBack: () => void }) {
    const normalizePhoneToTel = (phone: string) => {
        const digits = phone.replace(/[^\d+]/g, "");
        return digits.startsWith("+") ? digits : `+${digits}`;
    };

    const getMapsUrl = (address: string) => {
        const q = encodeURIComponent(address);
        return `https://yandex.ru/maps/?text=${q}`;
    };

    const shareText = async (title: string, text: string) => {
        try {
            // Web Share API (лучше всего для мессенджеров на мобилках)
            if (typeof navigator !== "undefined" && (navigator as any).share) {
                await (navigator as any).share({ title, text });
                return;
            }
        } catch {
            // игнорируем ошибки шаринга/отмены
        }
        // Фоллбек: копирование в буфер
        try {
            if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                alert("Скопировано");
                return;
            }
        } catch {
            // ignore
        }
        // Последний фоллбек
        try {
            const ta = document.createElement("textarea");
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            alert("Скопировано");
        } catch {
            alert(text);
        }
    };

    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: '0.5rem' }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: '1.25rem' }}>О компании</Typography.Headline>
            </Flex>

            <Panel className="cargo-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                <Typography.Body style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: '0.95rem' }}>
                    {ABOUT_HAULZ_TEXT}
                </Typography.Body>
            </Panel>

            <Typography.Body style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                Контакты
            </Typography.Body>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '0.75rem' }}>
                {HAULZ_OFFICES.map((office) => (
                    <Panel key={office.city} className="cargo-card" style={{ padding: '1rem' }}>
                        <Flex align="center" justify="space-between" style={{ marginBottom: '0.5rem', gap: '0.5rem' }}>
                            <Typography.Body style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                                {office.city}
                            </Typography.Body>
                            <Button
                                className="filter-button"
                                type="button"
                                title="Поделиться"
                                aria-label="Поделиться"
                                style={{ padding: '0.25rem 0.5rem', minWidth: 'auto' }}
                                onClick={() => {
                                    const text = `HAULZ — ${office.city}\nАдрес: ${office.address}\nТел.: ${office.phone}\nEmail: ${HAULZ_EMAIL}`;
                                    shareText(`HAULZ — ${office.city}`, text);
                                }}
                            >
                                <Share2 className="w-4 h-4" />
                            </Button>
                        </Flex>
                        <a
                            className="filter-button"
                            href={getMapsUrl(`${office.city}, ${office.address}`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                width: "100%",
                                justifyContent: "flex-start",
                                gap: "0.5rem",
                                padding: "0.5rem 0.75rem",
                                marginBottom: "0.5rem",
                                backgroundColor: "transparent",
                                textDecoration: "none",
                            }}
                            title="Открыть маршрут"
                        >
                            <MapPin className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />
                            <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                                {office.address}
                            </Typography.Body>
                        </a>
                        <a
                            className="filter-button"
                            href={`tel:${normalizePhoneToTel(office.phone)}`}
                            style={{
                                width: "100%",
                                justifyContent: "flex-start",
                                gap: "0.5rem",
                                padding: "0.5rem 0.75rem",
                                backgroundColor: "transparent",
                                textDecoration: "none",
                            }}
                            title="Позвонить"
                        >
                            <Phone className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />
                            <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                                {office.phone}
                            </Typography.Body>
                        </a>
                    </Panel>
                ))}
            </div>

            <Panel className="cargo-card" style={{ padding: '1rem' }}>
                <Flex align="center" justify="space-between" style={{ gap: '0.5rem' }}>
                    <a
                        className="filter-button"
                        href={`mailto:${HAULZ_EMAIL}`}
                        style={{
                            width: "100%",
                            justifyContent: "flex-start",
                            gap: "0.5rem",
                            padding: "0.5rem 0.75rem",
                            backgroundColor: "transparent",
                            textDecoration: "none",
                            marginRight: "0.5rem",
                        }}
                        title="Написать письмо"
                    >
                        <Mail className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />
                        <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                            {HAULZ_EMAIL}
                        </Typography.Body>
                    </a>
                    <Button
                        className="filter-button"
                        type="button"
                        title="Поделиться"
                        aria-label="Поделиться"
                        style={{ padding: '0.25rem 0.5rem', minWidth: 'auto', flexShrink: 0 }}
                        onClick={() => {
                            const text = `HAULZ\nEmail: ${HAULZ_EMAIL}\nТел.: ${HAULZ_OFFICES.map(o => `${o.city}: ${o.phone}`).join(" | ")}`;
                            shareText("HAULZ — контакты", text);
                        }}
                    >
                        <Share2 className="w-4 h-4" />
                    </Button>
                </Flex>
            </Panel>
        </div>
    );
}

// --- PROFILE PAGE ---
function ProfilePage({ 
    accounts, 
    activeAccountId, 
    onSwitchAccount, 
    onAddAccount, 
    onRemoveAccount,
    onOpenOffer,
    onOpenPersonalConsent,
    onOpenNotifications,
    onOpenCargo,
    onOpenTelegramBot,
    onUpdateAccount
}: { 
    accounts: Account[]; 
    activeAccountId: string | null; 
    onSwitchAccount: (accountId: string) => void; 
    onAddAccount: (login: string, password: string) => Promise<void>; 
    onRemoveAccount: (accountId: string) => void;
    onOpenOffer: () => void;
    onOpenPersonalConsent: () => void;
    onOpenNotifications: () => void;
    onOpenCargo: (cargoNumber: string) => void;
    onOpenTelegramBot?: () => Promise<void>;
    onUpdateAccount: (accountId: string, patch: Partial<Account>) => void;
}) {
    const [currentView, setCurrentView] = useState<ProfileView>('main');
    const activeAccount = accounts.find(acc => acc.id === activeAccountId) || null;
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
    const [twoFactorMethod, setTwoFactorMethod] = useState<"google" | "telegram">("google");
    const [twoFactorTelegramLinked, setTwoFactorTelegramLinked] = useState(false);
    const [tgLinkLoading, setTgLinkLoading] = useState(false);
    const [tgLinkError, setTgLinkError] = useState<string | null>(null);
    const [tgLinkChecking, setTgLinkChecking] = useState(false);

    const checkTelegramLinkStatus = useCallback(async () => {
        if (!activeAccount?.login || !activeAccountId) return false;
        try {
            const res = await fetch(`/api/2fa?login=${encodeURIComponent(activeAccount.login)}`);
            if (!res.ok) return false;
            const data = await res.json();
            const linked = !!data?.settings?.telegramLinked;
            setTwoFactorTelegramLinked(linked);
            onUpdateAccount(activeAccountId, { twoFactorTelegramLinked: linked });
            return linked;
        } catch {
            return false;
        }
    }, [activeAccount?.login, activeAccountId, onUpdateAccount]);

    const pollTelegramLink = useCallback(async () => {
        if (tgLinkChecking) return;
        setTgLinkChecking(true);
        try {
            let attempts = 0;
            let linked = false;
            while (attempts < 10 && !linked) {
                linked = await checkTelegramLinkStatus();
                if (linked) break;
                await new Promise((r) => setTimeout(r, 2000));
                attempts += 1;
            }
        } finally {
            setTgLinkChecking(false);
        }
    }, [checkTelegramLinkStatus, tgLinkChecking]);

    useEffect(() => {
        if (!activeAccount) return;
        setTwoFactorEnabled(!!activeAccount.twoFactorEnabled);
        setTwoFactorMethod(activeAccount.twoFactorMethod ?? "google");
        setTwoFactorTelegramLinked(!!activeAccount.twoFactorTelegramLinked);
    }, [activeAccount?.id]);

    useEffect(() => {
        if (!twoFactorEnabled || twoFactorMethod !== "telegram") return;
        if (twoFactorTelegramLinked) return;
        void checkTelegramLinkStatus();
    }, [twoFactorEnabled, twoFactorMethod, twoFactorTelegramLinked, checkTelegramLinkStatus]);

    // Настройки
    const settingsItems = [
        { 
            id: 'companies', 
            label: 'Мои компании', 
            icon: <Building2 className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('companies')
        },
        // temporarily hidden: notifications and dashboards
    ];
    
    // Информация
    const infoItems = [
        { 
            id: 'about', 
            label: 'О компании', 
            icon: <Info className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('about')
        },
        { 
            id: 'offer', 
            label: 'Публичная оферта', 
            icon: <FileText className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => onOpenOffer()
        },
        { 
            id: 'consent', 
            label: 'Согласие на обработку персональных данных', 
            icon: <Shield className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => onOpenPersonalConsent()
        },
    ];
    
    if (currentView === 'companies') {
        return <CompaniesListPage 
            accounts={accounts}
            activeAccountId={activeAccountId}
            onSwitchAccount={onSwitchAccount}
            onRemoveAccount={onRemoveAccount}
            onBack={() => setCurrentView('main')}
            onAddCompany={() => setCurrentView('addCompanyMethod')}
        />;
    }
    
    if (currentView === 'addCompanyMethod') {
        return <CompaniesPage onBack={() => setCurrentView('companies')} onSelectMethod={(method) => {
            if (method === 'inn') {
                setCurrentView('addCompanyByINN');
            } else {
                setCurrentView('addCompanyByLogin');
            }
        }} />;
    }
    
    if (currentView === 'addCompanyByINN') {
        return <AddCompanyByINNPage 
            onBack={() => setCurrentView('addCompanyMethod')} 
            onSuccess={() => setCurrentView('companies')}
        />;
    }
    
    if (currentView === 'addCompanyByLogin') {
        return <AddCompanyByLoginPage 
            onBack={() => setCurrentView('addCompanyMethod')} 
            onAddAccount={onAddAccount}
            onSuccess={() => setCurrentView('companies')}
        />;
    }

    if (currentView === 'tinyurl-test') {
        return <TinyUrlTestPage onBack={() => setCurrentView('main')} />;
    }

    if (currentView === 'about') {
        return <AboutCompanyPage onBack={() => setCurrentView('main')} />;
    }
    
    return (
        <div className="w-full">
            {/* Настройки */}
            <div style={{ marginBottom: '1.5rem' }}>
                <Typography.Body style={{ marginBottom: '1.25rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Настройки</Typography.Body>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {settingsItems.map((item) => (
                        <Panel
                            key={item.id}
                            className="cargo-card"
                            onClick={item.onClick}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '1rem',
                                cursor: 'pointer'
                            }}
                        >
                            <Flex align="center" style={{ flex: 1, gap: '0.75rem' }}>
                                <div style={{ color: 'var(--color-primary)' }}>{item.icon}</div>
                                <Typography.Body style={{ fontSize: '0.9rem' }}>{item.label}</Typography.Body>
                            </Flex>
                        </Panel>
                    ))}
                </div>
            </div>
            
            {/* Безопасность */}
            <div style={{ marginBottom: '1.5rem' }}>
                <Typography.Body style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Безопасность</Typography.Body>
                <Panel
                    className="cargo-card"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '1rem',
                        gap: '0.75rem'
                    }}
                >
                    <Flex align="center" style={{ flex: 1, gap: '0.75rem' }}>
                        <div style={{ color: 'var(--color-primary)' }}>
                            <Shield className="w-5 h-5" />
                        </div>
                        <Typography.Body style={{ fontSize: '0.9rem' }}>
                            Двухфакторная аутентификация
                        </Typography.Body>
                    </Flex>
                    <Switch
                        checked={twoFactorEnabled}
                        onCheckedChange={(value) => {
                            const next = resolveChecked(value);
                            setTwoFactorEnabled(next);
                            if (activeAccountId) {
                                onUpdateAccount(activeAccountId, { twoFactorEnabled: next });
                            }
                        }}
                        onChange={(event) => {
                            const next = resolveChecked(event);
                            setTwoFactorEnabled(next);
                            if (activeAccountId) {
                                onUpdateAccount(activeAccountId, { twoFactorEnabled: next });
                            }
                        }}
                    />
                </Panel>
                {twoFactorEnabled && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                        <Panel
                            className="cargo-card"
                            onClick={() => {
                                setTwoFactorMethod("google");
                                if (activeAccountId) {
                                    onUpdateAccount(activeAccountId, { twoFactorMethod: "google" });
                                }
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '0.85rem 1rem',
                                cursor: 'pointer',
                                border: twoFactorMethod === "google" ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                                boxShadow: twoFactorMethod === "google" ? '0 0 0 2px rgba(37, 99, 235, 0.15)' : undefined
                            }}
                        >
                            <Flex align="center" style={{ flex: 1, gap: '0.75rem' }}>
                                <Typography.Body style={{ fontSize: '0.9rem' }}>Google Аутентификация</Typography.Body>
                            </Flex>
                            {twoFactorMethod === "google" && <Check className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />}
                        </Panel>
                        <Panel
                            className="cargo-card"
                            onClick={() => {
                                setTwoFactorMethod("telegram");
                                if (activeAccountId) {
                                    onUpdateAccount(activeAccountId, { twoFactorMethod: "telegram" });
                                }
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '0.85rem 1rem',
                                cursor: 'pointer',
                                border: twoFactorMethod === "telegram" ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                                boxShadow: twoFactorMethod === "telegram" ? '0 0 0 2px rgba(37, 99, 235, 0.15)' : undefined
                            }}
                        >
                            <Flex align="center" style={{ flex: 1, gap: '0.75rem' }}>
                                <Typography.Body style={{ fontSize: '0.9rem' }}>Телеграм Аутентификация</Typography.Body>
                            </Flex>
                            {twoFactorMethod === "telegram" && <Check className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />}
                        </Panel>
                        {twoFactorMethod === "telegram" && (
                            <Panel
                                className="cargo-card"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.85rem 1rem',
                                    gap: '0.75rem'
                                }}
                            >
                                <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                    {twoFactorTelegramLinked
                                        ? "Telegram привязан."
                                        : tgLinkChecking
                                            ? "Ожидаем подтверждение привязки..."
                                            : "Привяжите Telegram, чтобы включить 2FA."}
                                </Typography.Body>
                                {!twoFactorTelegramLinked && (
                                    <Button
                                        className="button-primary"
                                        type="button"
                                        disabled={!onOpenTelegramBot || tgLinkLoading || tgLinkChecking}
                                        onClick={async () => {
                                            if (!onOpenTelegramBot) return;
                                            try {
                                                setTgLinkError(null);
                                                setTgLinkLoading(true);
                                                await onOpenTelegramBot();
                                                await pollTelegramLink();
                                            } catch (e: any) {
                                                setTgLinkError(e?.message || "Не удалось открыть Telegram.");
                                            } finally {
                                                setTgLinkLoading(false);
                                            }
                                        }}
                                    >
                                        {tgLinkLoading || tgLinkChecking ? <Loader2 className="animate-spin w-4 h-4" /> : "Открыть Telegram"}
                                    </Button>
                                )}
                                {twoFactorTelegramLinked && (
                                    <Button
                                        className="filter-button"
                                        type="button"
                                        disabled={tgLinkLoading}
                                        onClick={async () => {
                                            if (!activeAccount?.login || !activeAccountId) return;
                                            try {
                                                setTgLinkError(null);
                                                setTgLinkLoading(true);
                                                const loginKey = activeAccount.login.trim().toLowerCase();
                                                const res = await fetch("/api/2fa-telegram", {
                                                    method: "POST",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({ login: loginKey, action: "unlink" }),
                                                });
                                                if (!res.ok) {
                                                    const err = await readJsonOrText(res);
                                                    throw new Error(err?.error || "Не удалось отключить Telegram");
                                                }
                                                setTwoFactorTelegramLinked(false);
                                                setTwoFactorEnabled(false);
                                                setTwoFactorMethod("google");
                                                onUpdateAccount(activeAccountId, {
                                                    twoFactorTelegramLinked: false,
                                                    twoFactorEnabled: false,
                                                    twoFactorMethod: "google",
                                                });
                                            } catch (e: any) {
                                                setTgLinkError(e?.message || "Не удалось отключить Telegram");
                                            } finally {
                                                setTgLinkLoading(false);
                                            }
                                        }}
                                    >
                                        Отключить Telegram
                                    </Button>
                                )}
                            </Panel>
                        )}
                        {twoFactorMethod === "telegram" && tgLinkError && (
                            <Flex align="center" className="login-error" style={{ marginTop: '0.5rem' }}>
                                <AlertTriangle className="w-4 h-4 mr-2" />
                                <Typography.Body style={{ fontSize: '0.85rem' }}>{tgLinkError}</Typography.Body>
                            </Flex>
                        )}
                    </div>
                )}
            </div>

            {/* Информация */}
            <div>
                <Typography.Body style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Информация</Typography.Body>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {infoItems.map((item) => (
                        <Panel
                            key={item.id}
                            className="cargo-card"
                            onClick={item.onClick}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '1rem',
                                cursor: 'pointer'
                            }}
                        >
                            <Flex align="center" style={{ flex: 1, gap: '0.75rem' }}>
                                <div style={{ color: 'var(--color-primary)' }}>{item.icon}</div>
                                <Typography.Body style={{ fontSize: '0.9rem' }}>{item.label}</Typography.Body>
                            </Flex>
                        </Panel>
                    ))}
                </div>
            </div>
        </div>
    );
}

// --- COMPANIES PAGE (CHOOSE ADDITION METHOD) ---
function CompaniesPage({ onBack, onSelectMethod }: { onBack: () => void; onSelectMethod: (method: 'inn' | 'login') => void }) {
    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: '0.5rem' }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: '1.25rem' }}>Мои компании</Typography.Headline>
            </Flex>
            
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ 
                    width: '60px', 
                    height: '60px', 
                    borderRadius: '50%', 
                    backgroundColor: 'var(--color-bg-card)', 
                    border: '1px solid var(--color-border)',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    margin: '0 auto 1rem'
                }}>
                    <Building2 className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
                </div>
                <Typography.Headline style={{ marginBottom: '0.5rem', fontSize: '1.1rem' }}>Выберите способ добавления</Typography.Headline>
                <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', display: 'block', marginTop: '0.5rem' }}>
                    Добавьте компанию по ИНН или используя логин и пароль
                </Typography.Body>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <Panel 
                    className="cargo-card"
                    onClick={() => onSelectMethod('inn')}
                    style={{ cursor: 'pointer', padding: '1rem' }}
                >
                    <Typography.Body style={{ marginBottom: '0.25rem', fontSize: '0.9rem', fontWeight: '600' }}>По ИНН</Typography.Body>
                    <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                        Введите ИНН компании для добавления
                    </Typography.Body>
                </Panel>
                
                <Panel 
                    className="cargo-card"
                    onClick={() => onSelectMethod('login')}
                    style={{ cursor: 'pointer', padding: '1rem' }}
                >
                    <Typography.Body style={{ marginBottom: '0.25rem', fontSize: '0.9rem', fontWeight: '600' }}>По логину и паролю</Typography.Body>
                    <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                        Используйте логин и пароль для доступа
                    </Typography.Body>
                </Panel>
            </div>
        </div>
    );
}

// --- ADD COMPANY BY INN PAGE ---
function AddCompanyByINNPage({ onBack, onSuccess }: { onBack: () => void; onSuccess: () => void }) {
    const [inn, setInn] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [otpCode, setOtpCode] = useState("");
    const [showCodeInput, setShowCodeInput] = useState(false);
    
    const handleSubmitINN = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        
        if (!inn || (inn.length !== 10 && inn.length !== 12)) {
            setError("ИНН должен содержать 10 или 12 цифр");
            return;
        }
        
        try {
            setLoading(true);
            // Здесь будет запрос к API для проверки ИНН
            // Пока симулируем успешный ответ
            await new Promise(resolve => setTimeout(resolve, 1000));
            setOtpCode("");
            setShowCodeInput(true);
        } catch (err: any) {
            setError(err.message || "Ошибка при проверке ИНН");
        } finally {
            setLoading(false);
        }
    };
    
    const handleOtpChange = (value: string) => {
        const digits = (value || "").replace(/\D/g, "").slice(0, 6);
        setOtpCode(digits);
        if (error) setError(null);
    };
    
    const handleCodeSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (otpCode.length !== 6) {
            setError("Введите полный код");
            return;
        }
        
        try {
            setLoading(true);
            // Здесь будет запрос к API для подтверждения кода
            await new Promise(resolve => setTimeout(resolve, 1000));
            onSuccess();
        } catch (err: any) {
            setError(err.message || "Неверный код подтверждения");
        } finally {
            setLoading(false);
        }
    };
    
    if (showCodeInput) {
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={onBack} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Введите код подтверждения</Typography.Headline>
                </Flex>
                
                <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                    <div style={{ 
                        width: '52px', 
                        height: '52px', 
                        borderRadius: '50%', 
                        backgroundColor: 'var(--color-bg-card)', 
                        border: '1px solid var(--color-border)',
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        margin: '0 auto 0.75rem'
                    }}>
                        <FileText className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                    </div>
                    <Typography.Headline style={{ marginBottom: '0.5rem', fontSize: '1.1rem' }}>Введите код подтверждения</Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', display: 'block', marginTop: '0.5rem' }}>
                        Код отправлен на почту руководителя компании
                    </Typography.Body>
                </div>
                
                <Panel className="cargo-card" style={{ padding: '1rem' }}>
                    <form onSubmit={handleCodeSubmit}>
                        <input
                            className="login-input"
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoComplete="one-time-code"
                            placeholder="------"
                            value={otpCode}
                            onChange={(e) => handleOtpChange(e.target.value)}
                            style={{
                                width: '100%',
                                maxWidth: '320px',
                                margin: '0 auto 1.25rem',
                                display: 'block',
                                textAlign: 'center',
                                letterSpacing: '0.5rem',
                                fontSize: '1.25rem',
                                padding: '0.9rem 0.75rem',
                            }}
                            autoFocus
                        />
                        
                        {error && (
                            <Typography.Body className="login-error" style={{ marginBottom: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>
                                {error}
                            </Typography.Body>
                        )}
                        
                        <Button className="button-primary" type="submit" disabled={loading} style={{ width: '100%', marginBottom: '0.75rem', fontSize: '0.9rem', padding: '0.75rem' }}>
                            {loading ? <Loader2 className="animate-spin w-4 h-4" /> : "Подтвердить"}
                        </Button>
                        
                        <Button type="button" className="filter-button" onClick={onBack} style={{ width: '100%', fontSize: '0.9rem', padding: '0.75rem' }}>
                            Отмена
                        </Button>
                    </form>
                </Panel>
            </div>
        );
    }
    
    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: '0.5rem' }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: '1.25rem' }}>Введите ИНН компании</Typography.Headline>
            </Flex>
            
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                <div style={{ 
                    width: '52px', 
                    height: '52px', 
                    borderRadius: '50%', 
                    backgroundColor: 'var(--color-bg-card)', 
                    border: '1px solid var(--color-border)',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    margin: '0 auto 0.75rem'
                }}>
                    <Building2 className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                </div>
                <Typography.Headline style={{ marginBottom: '0.5rem', fontSize: '1.1rem' }}>Введите ИНН компании</Typography.Headline>
                <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', display: 'block', marginTop: '0.5rem' }}>
                    Мы проверим компанию и отправим код подтверждения на почту руководителя
                </Typography.Body>
            </div>
            
            <Panel className="cargo-card" style={{ padding: '1rem' }}>
                <form onSubmit={handleSubmitINN}>
                    <div className="field" style={{ marginBottom: '1.5rem' }}>
                        <Input
                            className="login-input"
                            type="text"
                            inputMode="numeric"
                            placeholder="ИНН (10 или 12 цифр)"
                            value={inn}
                            onChange={(e) => {
                                const value = e.target.value.replace(/\D/g, '');
                                if (value.length <= 12) {
                                    setInn(value);
                                    setError(null);
                                }
                            }}
                            autoFocus
                            style={{ fontSize: '0.9rem' }}
                        />
                    </div>
                    
                    {error && (
                        <Typography.Body className="login-error" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                            {error}
                        </Typography.Body>
                    )}
                    
                    <Button className="button-primary" type="submit" disabled={loading} style={{ width: '100%', marginBottom: '0.75rem', fontSize: '0.9rem', padding: '0.75rem' }}>
                        {loading ? <Loader2 className="animate-spin w-4 h-4" /> : "Получить код"}
                    </Button>
                    
                    <Button type="button" className="filter-button" onClick={onBack} style={{ width: '100%', fontSize: '0.9rem', padding: '0.75rem' }}>
                        Отмена
                    </Button>
                </form>
            </Panel>
        </div>
    );
}

// --- ADD COMPANY BY LOGIN PAGE ---
function AddCompanyByLoginPage({ 
    onBack, 
    onAddAccount, 
    onSuccess 
}: { 
    onBack: () => void; 
    onAddAccount: (login: string, password: string) => Promise<void>;
    onSuccess: () => void;
}) {
    const [login, setLogin] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [agreeOffer, setAgreeOffer] = useState(true);
    const [agreePersonal, setAgreePersonal] = useState(true);
    
    const resolveChecked = (value: boolean | "on" | "off" | undefined): boolean => {
        if (typeof value === "boolean") return value;
        if (value === "on") return true;
        return false;
    };
    
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        
        if (!login || !password) {
            setError("Введите логин и пароль");
            return;
        }
        
        if (!agreeOffer || !agreePersonal) {
            setError("Подтвердите согласие с условиями");
            return;
        }
        
        try {
            setLoading(true);
            await onAddAccount(login, password);
            onSuccess();
        } catch (err: any) {
            setError(err.message || "Ошибка при добавлении аккаунта");
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: '0.5rem' }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: '1.25rem' }}>Введите логин и пароль</Typography.Headline>
            </Flex>
            
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ 
                    width: '60px', 
                    height: '60px', 
                    borderRadius: '50%', 
                    backgroundColor: 'var(--color-bg-card)', 
                    border: '1px solid var(--color-border)',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    margin: '0 auto 1rem'
                }}>
                    <UserIcon className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
                </div>
                <Typography.Headline style={{ marginBottom: '0.5rem', fontSize: '1.1rem' }}>Введите логин и пароль</Typography.Headline>
                <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', display: 'block', marginTop: '0.5rem' }}>
                    Используйте ваши учетные данные для доступа к перевозкам
                </Typography.Body>
            </div>
            
            <Panel className="cargo-card" style={{ padding: '1rem' }}>
                <form onSubmit={handleSubmit}>
                    <div className="field" style={{ marginBottom: '1rem' }}>
                        <Input
                            className="login-input"
                            type="text"
                            placeholder="Логин (email)"
                            value={login}
                            onChange={(e) => setLogin(e.target.value)}
                            autoComplete="username"
                            style={{ fontSize: '0.9rem' }}
                        />
                    </div>
                    <div className="field" style={{ marginBottom: '1rem' }}>
                        <div className="password-input-container">
                            <Input
                                className="login-input password"
                                type={showPassword ? "text" : "password"}
                                placeholder="Пароль"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                                style={{paddingRight: '3rem', fontSize: '0.9rem'}}
                            />
                            <Button type="button" className="toggle-password-visibility" onClick={() => setShowPassword(!showPassword)}>
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </Button>
                        </div>
                    </div>
                    <label className="checkbox-row switch-wrapper" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                        <Typography.Body style={{ fontSize: '0.85rem' }}>
                            Согласие с{" "}
                            <a href="#" onClick={(e) => { e.preventDefault(); }}>
                                публичной офертой
                            </a>
                        </Typography.Body>
                        <Switch
                            checked={agreeOffer}
                            onCheckedChange={(value) => setAgreeOffer(resolveChecked(value))}
                            onChange={(event) => setAgreeOffer(resolveChecked(event))}
                        />
                    </label>
                    <label className="checkbox-row switch-wrapper" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                        <Typography.Body style={{ fontSize: '0.85rem' }}>
                            Согласие на{" "}
                            <a href="#" onClick={(e) => { e.preventDefault(); }}>
                                обработку данных
                            </a>
                        </Typography.Body>
                        <Switch
                            checked={agreePersonal}
                            onCheckedChange={(value) => setAgreePersonal(resolveChecked(value))}
                            onChange={(event) => setAgreePersonal(resolveChecked(event))}
                        />
                    </label>
                    {error && (
                        <Typography.Body className="login-error" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                            {error}
                        </Typography.Body>
                    )}
                    <Button className="button-primary" type="submit" disabled={loading} style={{ width: '100%', marginBottom: '0.75rem', fontSize: '0.9rem', padding: '0.75rem' }}>
                        {loading ? <Loader2 className="animate-spin w-4 h-4" /> : "Подтвердить"}
                    </Button>
                    <Button type="button" className="filter-button" onClick={onBack} style={{ width: '100%', fontSize: '0.9rem', padding: '0.75rem' }}>
                        Отмена
                    </Button>
                </form>
            </Panel>
        </div>
    );
}

// --- COMPANIES LIST PAGE ---
function CompaniesListPage({
    accounts,
    activeAccountId,
    onSwitchAccount,
    onRemoveAccount,
    onBack,
    onAddCompany
}: {
    accounts: Account[];
    activeAccountId: string | null;
    onSwitchAccount: (accountId: string) => void;
    onRemoveAccount: (accountId: string) => void;
    onBack: () => void;
    onAddCompany: () => void;
}) {
    const holdTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
    const isHoldingRef = React.useRef(false);
    
    useEffect(() => {
        return () => {
            if (holdTimeoutRef.current) {
                clearTimeout(holdTimeoutRef.current);
            }
        };
    }, []);
    
    const handlePressStart = (accountId: string) => {
        if (activeAccountId === accountId) return; // Не переключаем, если уже активен
        
        isHoldingRef.current = true;
        holdTimeoutRef.current = setTimeout(() => {
            if (isHoldingRef.current) {
                onSwitchAccount(accountId);
            }
        }, 2000); // 2 секунды
    };
    
    const handlePressEnd = () => {
        isHoldingRef.current = false;
        if (holdTimeoutRef.current) {
            clearTimeout(holdTimeoutRef.current);
            holdTimeoutRef.current = null;
        }
    };
    
    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: '0.5rem' }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: '1.25rem' }}>Мои компании</Typography.Headline>
            </Flex>
            
            {accounts.length === 0 ? (
                <Panel className="cargo-card" style={{ padding: '1rem', textAlign: 'center' }}>
                    <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                        Нет добавленных компаний
                    </Typography.Body>
                </Panel>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                    {accounts.map((account) => (
                        <Panel
                            key={account.id}
                            className="cargo-card"
                            onMouseDown={() => handlePressStart(account.id)}
                            onMouseUp={handlePressEnd}
                            onMouseLeave={handlePressEnd}
                            onTouchStart={() => handlePressStart(account.id)}
                            onTouchEnd={handlePressEnd}
                            style={{
                                padding: '1rem',
                                cursor: activeAccountId === account.id ? 'default' : 'pointer'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '0.75rem' }}>
                                <Flex align="center" style={{ flex: 1, gap: '0.5rem', minWidth: 0 }}>
                                    <Building2 className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
                                    <Typography.Body
                                        style={{
                                            fontSize: '0.9rem',
                                            fontWeight: activeAccountId === account.id ? '600' : 'normal',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {account.customer || account.login}
                                    </Typography.Body>
                                </Flex>

                                <Flex align="center" style={{ gap: '0.5rem', flexShrink: 0 }}>
                                    {activeAccountId === account.id && (
                                        <span className="status-value success">Активна</span>
                                    )}
                                    {accounts.length > 1 && (
                                        <Button 
                                            className="filter-button" 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onRemoveAccount(account.id);
                                            }}
                                            style={{ padding: '0.25rem 0.5rem', minWidth: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                            title="Удалить компанию"
                                            aria-label="Удалить компанию"
                                        >
                                            <Trash2 className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />
                                        </Button>
                                    )}
                                </Flex>
                            </div>
                        </Panel>
                    ))}
                </div>
            )}
            
            <Button 
                className="button-primary" 
                onClick={onAddCompany}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.9rem', padding: '0.75rem' }}
            >
                <Plus className="w-4 h-4" />
                Добавить компанию
            </Button>
        </div>
    );
}

// --- CARGO PAGE (LIST ONLY) ---
function CargoPage({ 
    auth, 
    searchText, 
    onOpenChat, 
    onCustomerDetected,
    contextCargoNumber,
    onClearContextCargo,
    initialStatusFilter,
    onClearQuickFilters
}: { 
    auth: AuthData; 
    searchText: string; 
    onOpenChat: (cargoNumber?: string) => void | Promise<void>; 
    onCustomerDetected?: (customer: string) => void;
    contextCargoNumber?: string | null;
    onClearContextCargo?: () => void;
    initialStatusFilter?: StatusFilter;
    onClearQuickFilters?: () => void;
}) {
    const [items, setItems] = useState<CargoItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedCargo, setSelectedCargo] = useState<CargoItem | null>(null);
    
    // Filters State
    const [dateFilter, setDateFilter] = useState<DateFilter>("неделя");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [customDateFrom, setCustomDateFrom] = useState(DEFAULT_DATE_FROM);
    const [customDateTo, setCustomDateTo] = useState(DEFAULT_DATE_TO);
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
    const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
    const [showSummary, setShowSummary] = useState(true);
    // Sort State
    const [sortBy, setSortBy] = useState<'datePrih' | 'dateVr' | null>(null);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    
    // Favorites State
    const [favorites, setFavorites] = useState<Set<string>>(new Set());
    
    // Загружаем избранные из localStorage при монтировании
    useEffect(() => {
        try {
            const saved = localStorage.getItem('haulz.favorites');
            if (saved) {
                const parsed = JSON.parse(saved) as string[];
                setFavorites(new Set(parsed));
            }
        } catch {
            // Игнорируем ошибки чтения
        }
    }, []);
    
    // Сохраняем избранные в localStorage при изменении
    useEffect(() => {
        try {
            localStorage.setItem('haulz.favorites', JSON.stringify(Array.from(favorites)));
        } catch {
            // Игнорируем ошибки записи
        }
    }, [favorites]);
    
    // Функции для работы с избранными
    const toggleFavorite = useCallback((cargoNumber: string | undefined) => {
        if (!cargoNumber) return;
        setFavorites(prev => {
            const newSet = new Set(prev);
            if (newSet.has(cargoNumber)) {
                newSet.delete(cargoNumber);
            } else {
                newSet.add(cargoNumber);
            }
            return newSet;
        });
    }, []);
    
    const isFavorite = useCallback((cargoNumber: string | undefined): boolean => {
        return cargoNumber ? favorites.has(cargoNumber) : false;
    }, [favorites]);

    const apiDateRange = useMemo(() => dateFilter === "период" ? { dateFrom: customDateFrom, dateTo: customDateTo } : getDateRange(dateFilter), [dateFilter, customDateFrom, customDateTo]); // ИСПРАВЛЕНО: 'custom' на 'период'

    // Удалена функция findDeliveryDate, используем DateVr напрямую.

    const loadCargo = useCallback(async (dateFrom: string, dateTo: string) => {
        setLoading(true); setError(null);
        try {
            const res = await fetch(PROXY_API_BASE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: auth.login, password: auth.password, dateFrom, dateTo }) });
            await ensureOk(res, "Ошибка загрузки данных");
            const data = await res.json();
            const list = Array.isArray(data) ? data : data.items || [];
            
            // МАППИНГ ДАННЫХ: используем только указанные поля API
            const mapped = list.map((item: any) => ({
                ...item,
                Number: item.Number, 
                DatePrih: item.DatePrih, 
                DateVr: item.DateVr, // Дата доставки
                State: item.State, 
                Mest: item.Mest, 
                PW: item.PW, // Платный вес
                W: item.W, // Общий вес
                Value: item.Value, // Объем
                Sum: item.Sum, 
                StateBill: item.StateBill, // Статус счета
                Sender: item.Sender, // Отправитель
                Customer: item.Customer ?? item.customer, // Заказчик
            }));
            setItems(mapped);

            const customer = mapped.find((item: CargoItem) => item.Customer)?.Customer;
            if (customer && onCustomerDetected) {
                onCustomerDetected(customer);
            }
        } catch (e: any) { setError(e.message); } finally { setLoading(false); }
    }, [auth]);

    useEffect(() => { loadCargo(apiDateRange.dateFrom, apiDateRange.dateTo); }, [apiDateRange, loadCargo]);

    useEffect(() => {
        if (initialStatusFilter) setStatusFilter(initialStatusFilter);
        setIsStatusDropdownOpen(false);
        if (initialStatusFilter) {
            onClearQuickFilters?.();
        }
    }, [initialStatusFilter, onClearQuickFilters]);

    useEffect(() => {
        if (!contextCargoNumber) return;
        const match = items.find(item => String(item.Number) === String(contextCargoNumber));
        if (match) {
            setSelectedCargo(match);
            onClearContextCargo?.();
            return;
        }
        if (!loading) {
            onClearContextCargo?.();
        }
    }, [contextCargoNumber, items, loading, onClearContextCargo]);

    // Client-side filtering and sorting
    const filteredItems = useMemo(() => {
        let res = items;
        if (statusFilter === 'favorites') {
            // Фильтр избранных
            res = res.filter(i => i.Number && favorites.has(i.Number));
        } else if (statusFilter !== 'all') {
            res = res.filter(i => getFilterKeyByStatus(i.State) === statusFilter);
        }
        if (searchText) {
            const lower = searchText.toLowerCase();
            // Обновлены поля поиска: PW вместо PV, добавлен Sender
            res = res.filter(i => [i.Number, i.State, i.Sender, i.Customer, formatDate(i.DatePrih), formatCurrency(i.Sum), String(i.PW), String(i.Mest)].join(' ').toLowerCase().includes(lower));
        }
        
        // Применяем сортировку ТОЛЬКО по датам
        if (sortBy) {
            res = [...res].sort((a, b) => {
                // Функция для безопасного парсинга даты
                const parseDate = (dateString: string | undefined): number | null => {
                    if (!dateString) return null;
                    
                    const str = String(dateString).trim();
                    if (!str || str === '' || str === '-') return null;
                    
                    try {
                        // Сначала пробуем стандартный формат ISO (YYYY-MM-DD или YYYY-MM-DDTHH:mm:ss)
                        let cleanStr = str.split('T')[0].trim();
                        let date = new Date(cleanStr);
                        
                        if (!isNaN(date.getTime())) {
                            return date.getTime();
                        }
                        
                        // Пробуем формат DD.MM.YYYY
                        const dotParts = cleanStr.split('.');
                        if (dotParts.length === 3) {
                            const day = parseInt(dotParts[0], 10);
                            const month = parseInt(dotParts[1], 10) - 1;
                            const year = parseInt(dotParts[2], 10);
                            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                                date = new Date(year, month, day);
                                if (!isNaN(date.getTime())) {
                                    return date.getTime();
                                }
                            }
                        }
                        
                        // Пробуем формат DD/MM/YYYY
                        const slashParts = cleanStr.split('/');
                        if (slashParts.length === 3) {
                            const day = parseInt(slashParts[0], 10);
                            const month = parseInt(slashParts[1], 10) - 1;
                            const year = parseInt(slashParts[2], 10);
                            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                                date = new Date(year, month, day);
                                if (!isNaN(date.getTime())) {
                                    return date.getTime();
                                }
                            }
                        }
                        
                        // Пробуем формат DD-MM-YYYY
                        const dashParts = cleanStr.split('-');
                        if (dashParts.length === 3 && dashParts[0].length <= 2) {
                            const day = parseInt(dashParts[0], 10);
                            const month = parseInt(dashParts[1], 10) - 1;
                            const year = parseInt(dashParts[2], 10);
                            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                                date = new Date(year, month, day);
                                if (!isNaN(date.getTime())) {
                                    return date.getTime();
                                }
                            }
                        }
                    } catch (e) {
                        // Игнорируем ошибки парсинга
                    }
                    
                    return null;
                };
                
                let timestampA: number | null = null;
                let timestampB: number | null = null;
                
                // Сортируем ТОЛЬКО по выбранной дате
                if (sortBy === 'datePrih') {
                    timestampA = parseDate(a.DatePrih);
                    timestampB = parseDate(b.DatePrih);
                } else if (sortBy === 'dateVr') {
                    timestampA = parseDate(a.DateVr);
                    timestampB = parseDate(b.DateVr);
                }
                
                // Обрабатываем случаи с null/undefined - элементы без даты идут в конец
                if (timestampA === null && timestampB === null) {
                    // Если оба без даты, возвращаем 0 (сохраняем исходный порядок, НЕ сортируем по другим полям)
                    return 0;
                }
                if (timestampA === null) return 1; // Элементы без даты идут в конец
                if (timestampB === null) return -1; // Элементы без даты идут в конец
                
                // Сортируем ТОЛЬКО по разнице дат, без дополнительных критериев
                const diff = timestampA - timestampB;
                if (diff === 0) {
                    // Если даты одинаковые, возвращаем 0 (не используем другие критерии)
                    return 0;
                }
                return sortOrder === 'asc' ? diff : -diff;
            });
        }
        
        return res;
    }, [items, statusFilter, searchText, sortBy, sortOrder, favorites]);

    // Подсчет сумм из отфильтрованных элементов
    const summary = useMemo(() => {
        const totalSum = filteredItems.reduce((acc, item) => {
            const sum = typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
            return acc + sum;
        }, 0);
        
        const totalMest = filteredItems.reduce((acc, item) => {
            const mest = typeof item.Mest === 'string' ? parseFloat(item.Mest) || 0 : (item.Mest || 0);
            return acc + mest;
        }, 0);
        
        const totalPW = filteredItems.reduce((acc, item) => {
            const pw = typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
            return acc + pw;
        }, 0);
        
        return {
            sum: totalSum,
            mest: totalMest,
            pw: totalPW
        };
    }, [filteredItems]);


    return (
        <div className="w-full">
            {/* Filters */}
            <div className="filters-container">
                <div className="filter-group" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Button className="filter-button" onClick={() => { setIsDateDropdownOpen(!isDateDropdownOpen); setIsStatusDropdownOpen(false); }}>
                        Дата: {dateFilter === 'период' ? 'Период' : dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1)} <ChevronDown className="w-4 h-4"/>
                    </Button>
                    {isDateDropdownOpen && <div className="filter-dropdown">
                        {['сегодня', 'неделя', 'месяц', 'период'].map(key => (
                            <div key={key} className="dropdown-item" onClick={() => { setDateFilter(key as any); setIsDateDropdownOpen(false); if(key==='период') setIsCustomModalOpen(true); }}>
                                <Typography.Body>{key.charAt(0).toUpperCase() + key.slice(1)}</Typography.Body>
                            </div>
                        ))}
                    </div>}
                    {/* Кнопка сортировки по датам */}
                    <Button 
                        className="filter-button" 
                        style={{ padding: '0.5rem', minWidth: 'auto' }}
                        onClick={() => {
                            if (!sortBy) {
                                // Нет сортировки -> сортировка по дате прихода (по убыванию)
                                setSortBy('datePrih');
                                setSortOrder('desc');
                            } else if (sortBy === 'datePrih' && sortOrder === 'desc') {
                                // Дата прихода (убывание) -> дата прихода (возрастание)
                                setSortOrder('asc');
                            } else if (sortBy === 'datePrih' && sortOrder === 'asc') {
                                // Дата прихода (возрастание) -> дата доставки (убывание)
                                setSortBy('dateVr');
                                setSortOrder('desc');
                            } else if (sortBy === 'dateVr' && sortOrder === 'desc') {
                                // Дата доставки (убывание) -> дата доставки (возрастание)
                                setSortOrder('asc');
                            } else if (sortBy === 'dateVr' && sortOrder === 'asc') {
                                // Дата доставки (возрастание) -> сброс
                                setSortBy(null);
                                setSortOrder('desc');
                            }
                        }}
                        title={
                            !sortBy ? "Сортировать по дате прихода" :
                            sortBy === 'datePrih' && sortOrder === 'desc' ? "Сортировать по дате прихода (возрастание)" :
                            sortBy === 'datePrih' && sortOrder === 'asc' ? "Сортировать по дате доставки" :
                            sortBy === 'dateVr' && sortOrder === 'desc' ? "Сортировать по дате доставки (возрастание)" :
                            "Сбросить сортировку"
                        }
                    >
                        {!sortBy ? (
                            <ArrowUpDown className="w-4 h-4" style={{ opacity: 0.5 }} />
                        ) : sortOrder === 'asc' ? (
                            <ArrowUp className="w-4 h-4" />
                        ) : (
                            <ArrowDown className="w-4 h-4" />
                        )}
                    </Button>
                </div>
                <div className="filter-group">
                    <Button className="filter-button" onClick={() => { setIsStatusDropdownOpen(!isStatusDropdownOpen); setIsDateDropdownOpen(false); }}>
                        Статус: {STATUS_MAP[statusFilter]} <ChevronDown className="w-4 h-4"/>
                    </Button>
                    {isStatusDropdownOpen && <div className="filter-dropdown">
                        {Object.keys(STATUS_MAP).map(key => (
                            <div key={key} className="dropdown-item" onClick={() => { setStatusFilter(key as any); setIsStatusDropdownOpen(false); }}>
                                <Typography.Body>{STATUS_MAP[key as StatusFilter]}</Typography.Body>
                            </div>
                        ))}
                    </div>}
                </div>
            </div>

            <Typography.Body className="text-sm text-theme-secondary mb-4 text-center">
                Период: <DateText value={apiDateRange.dateFrom} /> – <DateText value={apiDateRange.dateTo} />
            </Typography.Body>

            {/* Суммирующая строка */}
            <div className="cargo-card mb-4" style={{ padding: '0.75rem' }}>
                <Flex justify="center" align="center">
                    <Flex gap="1.5rem" align="center" style={{ flexWrap: 'wrap' }}>
                        <Flex direction="column" align="center">
                            <Typography.Label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Сумма</Typography.Label>
                            <Typography.Body style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                {formatCurrency(summary.sum)}
                            </Typography.Body>
                        </Flex>
                        <Flex direction="column" align="center">
                            <Typography.Label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Мест</Typography.Label>
                            <Typography.Body style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                {summary.mest.toFixed(0)}
                            </Typography.Body>
                        </Flex>
                        <Flex direction="column" align="center">
                            <Typography.Label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Плат. вес</Typography.Label>
                            <Typography.Body style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                {summary.pw.toFixed(2)} кг
                            </Typography.Body>
                        </Flex>
                    </Flex>
                </Flex>
            </div>

            {/* List */}
            {loading && (
                <Flex justify="center" className="text-center py-8">
                    <Loader2 className="animate-spin w-6 h-6 mx-auto text-theme-primary" />
                </Flex>
            )}
            {!loading && !error && filteredItems.length === 0 && (
                <Panel className="empty-state-card">
                    <Flex direction="column" align="center">
                        <Package className="w-12 h-12 mx-auto mb-4 text-theme-secondary opacity-50" />
                        <Typography.Body className="text-theme-secondary">Ничего не найдено</Typography.Body>
                        <Typography.Body className="text-theme-secondary" style={{ fontSize: '0.85rem', marginTop: '0.25rem', textAlign: 'center' }}>
                            Попробуйте изменить период или сбросить фильтры
                        </Typography.Body>
                        <Flex style={{ gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                            <Button className="filter-button" type="button" onClick={() => setDateFilter("месяц")} style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}>
                                За месяц
                            </Button>
                            <Button className="filter-button" type="button" onClick={() => setDateFilter("все")} style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}>
                                За всё время
                            </Button>
                            <Button className="filter-button" type="button" onClick={() => setStatusFilter("all")} style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}>
                                Все статусы
                            </Button>
                        </Flex>
                    </Flex>
                </Panel>
            )}
            
            {/* List */}
            {filteredItems.length > 0 && (
            <div className="cargo-list">
                {filteredItems.map((item: CargoItem, idx: number) => (
                        <Panel 
                            key={item.Number || idx} 
                            className="cargo-card"
                            onClick={() => setSelectedCargo(item)}
                            style={{ cursor: 'pointer', marginBottom: '0.75rem', position: 'relative' }}
                        >
                            <Flex justify="space-between" align="start" style={{ marginBottom: '0.5rem' }}>
                                <Typography.Body style={{ fontWeight: 600, fontSize: '1rem' }}>
                                    {item.Number}
                                </Typography.Body>
                                <Flex align="center" gap="0.5rem">
                                    <Button
                                        style={{ 
                                            padding: '0.25rem', 
                                            minWidth: 'auto', 
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            if (!item.Number) return;

                                            const baseOrigin = typeof window !== "undefined" ? window.location.origin : "";
                                            
                                            // Формируем длинные ссылки для каждого документа
                                            const longUrls: Record<string, string> = {};
                                            const docTypes: Array<{ label: "ЭР" | "СЧЕТ" | "УПД" | "АПП"; metod: string }> = [
                                                { label: "ЭР", metod: DOCUMENT_METHODS["ЭР"] },
                                                { label: "СЧЕТ", metod: DOCUMENT_METHODS["СЧЕТ"] },
                                                { label: "УПД", metod: DOCUMENT_METHODS["УПД"] },
                                                { label: "АПП", metod: DOCUMENT_METHODS["АПП"] },
                                            ];
                                            
                                            for (const { label, metod } of docTypes) {
                                                const params = new URLSearchParams({
                                                    login: auth.login,
                                                    password: auth.password,
                                                    metod,
                                                    number: item.Number!,
                                                });
                                                longUrls[label] = `${baseOrigin}${PROXY_API_DOWNLOAD_URL}?${params.toString()}`;
                                            }
                                            
                                            // Передаем данные в TinyURL через /api/shorten-doc (параллельно)
                                            // Это создает временные токены, чтобы не светить логин/пароль в ссылках
                                            const shortUrls: Record<string, string> = {};
                                            console.log('[share] Starting to shorten URLs via TinyURL (token mode)...');
                                            
                                            const shortenPromises = docTypes.map(async ({ label, metod }) => {
                                                try {
                                                    console.log(`[share] Creating token for ${label}...`);
                                                    
                                                    const res = await fetch('/api/shorten-doc', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({
                                                            login: auth.login,
                                                            password: auth.password,
                                                            metod,
                                                            number: item.Number,
                                                        }),
                                                    });
                                                    
                                                    console.log(`[share] Response for ${label}: status=${res.status}, ok=${res.ok}`);
                                                    
                                                    if (res.ok) {
                                                        const data = await res.json();
                                                        console.log(`[share] Response data for ${label}:`, data);
                                                        shortUrls[label] = data.shortUrl || data.short_url;
                                                        console.log(`[share] TinyURL short URL for ${label}: ${shortUrls[label]}`);
                                                    } else {
                                                        const errorText = await res.text().catch(() => '');
                                                        console.error(`[share] Failed to shorten ${label}: ${res.status} ${errorText}`);
                                                        // Если токенизация не сработала, используем прямую ссылку (хотя это менее безопасно)
                                                        shortUrls[label] = longUrls[label];
                                                    }
                                                } catch (error: any) {
                                                    console.error(`[share] Exception shortening ${label}:`, error?.message || error);
                                                    shortUrls[label] = longUrls[label];
                                                }
                                            });
                                            
                                            // Ждем завершения всех запросов
                                            await Promise.all(shortenPromises);
                                            console.log('[share] All shorten requests completed. Short URLs:', shortUrls);

                                            const lines: string[] = [];
                                            lines.push(`Перевозка: ${item.Number}`);
                                            if (item.State) lines.push(`Статус: ${normalizeStatus(item.State)}`);
                                            if (item.DatePrih) lines.push(`Приход: ${formatDate(item.DatePrih)}`);
                                            if (item.DateVr) lines.push(`Доставка: ${formatDate(item.DateVr)}`);
                                            if (item.Sender) lines.push(`Отправитель: ${item.Sender}`);
                                            if (item.Customer) lines.push(`Заказчик: ${item.Customer}`);
                                            if (item.Mest !== undefined) lines.push(`Мест: ${item.Mest}`);
                                            if (item.PW !== undefined) lines.push(`Плат. вес: ${item.PW} кг`);
                                            if (item.W !== undefined) lines.push(`Вес: ${item.W} кг`);
                                            if (item.Value !== undefined) lines.push(`Объем: ${item.Value} м³`);
                                            if (item.Sum !== undefined) lines.push(`Стоимость: ${formatCurrency(item.Sum as any)}`);
                                            if (item.StateBill) lines.push(`Статус счета: ${item.StateBill}`);

                                            // Остальные поля (если нужно "всю информацию")
                                            Object.entries(item).forEach(([k, v]) => {
                                                if ([
                                                    "Number","State","DatePrih","DateVr","Sender","Customer","Mest","PW","W","Value","Sum","StateBill"
                                                ].includes(k)) return;
                                                if (v === undefined || v === null || v === "" || (typeof v === "string" && v.trim() === "")) return;
                                                lines.push(`${k}: ${String(v)}`);
                                            });

                                            lines.push("");
                                            lines.push("Документы:");
                                            lines.push(`ЭР: ${shortUrls["ЭР"] || "(не удалось сократить)"}`);
                                            lines.push(`Счет: ${shortUrls["СЧЕТ"] || "(не удалось сократить)"}`);
                                            lines.push(`УПД: ${shortUrls["УПД"] || "(не удалось сократить)"}`);
                                            lines.push(`АПП: ${shortUrls["АПП"] || "(не удалось сократить)"}`);
                                            
                                            const text = lines.join("\n");

                                            try {
                                                if (typeof navigator !== "undefined" && (navigator as any).share) {
                                                    await (navigator as any).share({
                                                        title: `HAULZ — перевозка ${item.Number}`,
                                                        text,
                                                    });
                                                    return;
                                                }
                                            } catch {
                                                // ignore
                                            }

                                            try {
                                                if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                                                    await navigator.clipboard.writeText(text);
                                                    alert("Скопировано");
                                                    return;
                                                }
                                            } catch {
                                                // ignore
                                            }

                                            alert(text);
                                        }}
                                        title="Поделиться"
                                    >
                                        <Share2 className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />
                                    </Button>
                                    <Button
                                        style={{ 
                                            padding: '0.25rem', 
                                            minWidth: 'auto', 
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onOpenChat(item.Number);
                                        }}
                                        title="Открыть AI чат"
                                    >
                                        <MessageCircle className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />
                                    </Button>
                                    <Button
                                        style={{ 
                                            padding: '0.25rem', 
                                            minWidth: 'auto', 
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleFavorite(item.Number);
                                        }}
                                        title={isFavorite(item.Number) ? "Удалить из избранного" : "Добавить в избранное"}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.opacity = '0.7';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.opacity = '1';
                                        }}
                                    >
                                        <Heart 
                                            className="w-4 h-4" 
                                            style={{ 
                                                fill: isFavorite(item.Number) ? '#ef4444' : 'transparent',
                                                color: isFavorite(item.Number) ? '#ef4444' : 'var(--color-text-secondary)',
                                                transition: 'all 0.2s'
                                            }} 
                                        />
                                    </Button>
                                    <Calendar className="w-4 h-4 text-theme-secondary" />
                                    <Typography.Label className="text-theme-secondary" style={{ fontSize: '0.85rem' }}>
                                        <DateText value={item.DatePrih} />
                                    </Typography.Label>
                            </Flex>
                        </Flex>
                            <Flex justify="space-between" align="center" style={{ marginBottom: '0.5rem' }}>
                                <StatusBadge status={item.State} />
                                <Typography.Body style={{ fontWeight: 600, fontSize: '1rem', color: getSumColorByPaymentStatus(item.StateBill) }}>
                                    {formatCurrency(item.Sum)}
                                </Typography.Body>
                            </Flex>
                            <Typography.Label style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>
                                Заказчик: {item.Customer || '-'}
                            </Typography.Label>
                            <Flex justify="space-between" align="center" style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                <Flex gap="1rem">
                                    <Typography.Label>Мест: {item.Mest || '-'}</Typography.Label>
                                    <Typography.Label>Вес: {item.PW ? `${item.PW} кг` : '-'}</Typography.Label>
                                </Flex>
                                <StatusBillBadge status={item.StateBill} />
                        </Flex>
                    </Panel>
                ))}
            </div>
            )}

            {selectedCargo && (
                <CargoDetailsModal
                    item={selectedCargo}
                    isOpen={!!selectedCargo}
                    onClose={() => setSelectedCargo(null)}
                    auth={auth}
                    onOpenChat={onOpenChat}
                    isFavorite={isFavorite}
                    onToggleFavorite={toggleFavorite}
                />
            )}
            <FilterDialog isOpen={isCustomModalOpen} onClose={() => setIsCustomModalOpen(false)} dateFrom={customDateFrom} dateTo={customDateTo} onApply={(f, t) => { setCustomDateFrom(f); setCustomDateTo(t); }} />
        </div>
    );
}

// --- SHARED COMPONENTS ---

function FilterDialog({ isOpen, onClose, dateFrom, dateTo, onApply }: { isOpen: boolean; onClose: () => void; dateFrom: string; dateTo: string; onApply: (from: string, to: string) => void; }) {
    const [tempFrom, setTempFrom] = useState(dateFrom);
    const [tempTo, setTempTo] = useState(dateTo);
    useEffect(() => { if (isOpen) { setTempFrom(dateFrom); setTempTo(dateTo); } }, [isOpen, dateFrom, dateTo]);
    if (!isOpen) return null;
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <Typography.Headline>Произвольный диапазон</Typography.Headline>
                    <Button className="modal-close-button" onClick={onClose} aria-label="Закрыть"><X size={20} /></Button>
                </div>
                <form onSubmit={e => { e.preventDefault(); onApply(tempFrom, tempTo); onClose(); }}>
                    <div style={{marginBottom: '1rem'}}><Typography.Label className="detail-item-label">Дата начала:</Typography.Label><Input type="date" className="login-input date-input" value={tempFrom} onChange={e => setTempFrom(e.target.value)} required /></div>
                    <div style={{marginBottom: '1.5rem'}}><Typography.Label className="detail-item-label">Дата окончания:</Typography.Label><Input type="date" className="login-input date-input" value={tempTo} onChange={e => setTempTo(e.target.value)} required /></div>
                    <Button className="button-primary" type="submit">Применить</Button>
                </form>
            </div>
        </div>
    );
}

function CargoDetailsModal({
    item,
    isOpen,
    onClose,
    auth,
    onOpenChat,
    isFavorite,
    onToggleFavorite,
}: {
    item: CargoItem;
    isOpen: boolean;
    onClose: () => void;
    auth: AuthData;
    onOpenChat: (cargoNumber?: string) => void | Promise<void>;
    isFavorite: (cargoNumber: string | undefined) => boolean;
    onToggleFavorite: (cargoNumber: string | undefined) => void;
}) {
    const [downloading, setDownloading] = useState<string | null>(null);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    const [pdfViewer, setPdfViewer] = useState<{ url: string; name: string; docType: string; blob?: Blob; downloadFileName?: string } | null>(null);
    
    // Очистка blob URL при закрытии
    useEffect(() => {
        if (!isOpen && pdfViewer) {
            URL.revokeObjectURL(pdfViewer.url);
            setPdfViewer(null);
        }
    }, [isOpen, pdfViewer]);
    
    // Раскрываем на весь экран при открытии документов (MAX Bridge)
    useEffect(() => {
        if (isOpen) {
            const webApp = getWebApp();
            if (webApp && typeof webApp.expand === "function" && isMaxWebApp()) {
                webApp.expand();
            }
        }
    }, [isOpen]);
    
    if (!isOpen) return null;

    const renderValue = (val: any, unit = '') => {
        // Улучшенная проверка на пустоту: проверяем на undefined, null и строку, 
        // которая после обрезки пробелов становится пустой.
        if (val === undefined || val === null || (typeof val === 'string' && val.trim() === "")) return '-';
        
        // Обработка сложных объектов/массивов
        if (typeof val === 'object' && val !== null && !React.isValidElement(val)) {
            try {
                if (Object.keys(val).length === 0) return '-';
                return <pre style={{whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.75rem', margin: 0}}>{JSON.stringify(val, null, 2)}</pre>;
            } catch (e) {
                return String(val); 
            }
        }
        
        const num = typeof val === 'string' ? parseFloat(val) : val;
        // Форматирование чисел
        if (typeof num === 'number' && !isNaN(num)) {
            if (unit.toLowerCase() === 'кг' || unit.toLowerCase() === 'м³') {
                 // Округляем до двух знаков для кг и м³
                return `${num.toFixed(2)}${unit ? ' ' + unit : ''}`;
            }
        }
        
        return `${val}${unit ? ' ' + unit : ''}`;
    };
    
    const downloadFile = (blob: Blob, fileName: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    
    const handleDownload = async (docType: string) => {
        if (!item.Number) return alert("Нет номера перевозки");
        setDownloading(docType); setDownloadError(null);
        try {
            const res = await fetch(PROXY_API_DOWNLOAD_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    login: auth.login,
                    password: auth.password,
                    metod: DOCUMENT_METHODS[docType],
                    number: item.Number,
                }),
            });
            if (!res.ok) {
                // Человеческие сообщения вместо "Ошибка 404/500"
                let message =
                    res.status === 404
                        ? "Документ не обнаружен"
                        : res.status >= 500
                            ? "Ошибка сервера. Попробуйте позже"
                            : "Не удалось получить документ";
                try {
                    const errData = await res.json();
                    if (errData?.message && res.status !== 404 && res.status < 500) {
                        message = String(errData.message);
                    }
                } catch {
                    // ignore parsing errors
                }
                throw new Error(message);
            }

            const data = await res.json();

            if (!data?.data || !data.name) {
                throw new Error("Документ не обнаружен");
            }

            // Декодируем base64 в бинарный файл
            const byteCharacters = atob(data.data);
            const byteNumbers = new Array(byteCharacters.length).fill(0).map((_, i) => byteCharacters.charCodeAt(i));
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: "application/pdf" });
            const fileName = data.name || `${docType}_${item.Number}.pdf`;

            // Метод 4: object/embed - показываем встроенным просмотрщиком
            const url = URL.createObjectURL(blob);
            setPdfViewer({
                url,
                name: fileName,
                docType,
                blob, // Сохраняем blob для скачивания
                downloadFileName: fileName
            });
            
            // Если скачали УПД в MAX - закрываем мини-апп после скачивания
            if (docType === 'УПД' && isMaxWebApp()) {
                const webApp = getWebApp();
                if (webApp && typeof webApp.close === "function") {
                    // Даём время на скачивание, затем закрываем
                    setTimeout(() => {
                        webApp.close();
                    }, 1000);
                }
            }
        } catch (e: any) { setDownloadError(e.message); } finally { setDownloading(null); }
    };


    const handleDownloadMax = async (docType: string) => {
        if (!item.Number) return alert("Нет номера перевозки");
        setDownloading(docType); 
        setDownloadError(null);
        
        try {
            const webApp = getWebApp();
            const metod = DOCUMENT_METHODS[docType];
            const origin = typeof window !== "undefined" ? window.location.origin : "";
            const directUrl = `${origin}${PROXY_API_DOWNLOAD_URL}?login=${encodeURIComponent(auth.login)}&password=${encodeURIComponent(auth.password)}&metod=${encodeURIComponent(metod)}&number=${encodeURIComponent(item.Number)}`;

            // Сокращаем ссылку через наш прокси (TinyURL)
            const shortenRes = await fetch('/api/shorten', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: directUrl })
            });

            if (!shortenRes.ok) {
                throw new Error("Ошибка сокращения ссылки");
            }

            const { short_url } = await shortenRes.json();

            if (webApp && typeof webApp.openLink === "function") {
                webApp.openLink(short_url, { try_instant_view: false } as any);
            } else {
                window.open(short_url, "_blank", "noopener,noreferrer");
            }
            
        } catch (e: any) {
            setDownloadError(e.message || "Ошибка");
            console.error("Download error:", e);
        } finally {
            setDownloading(null);
        }
    };

    // Список явно отображаемых полей (из API примера)
    const EXCLUDED_KEYS = ['Number', 'DatePrih', 'DateVr', 'State', 'Mest', 'PW', 'W', 'Value', 'Sum', 'StateBill', 'Sender', 'Customer'];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <Flex align="center" justify="space-between">
                        <Flex align="center" gap="0.5rem">
                        <Button
                            className="filter-button"
                            style={{ padding: '0.25rem 0.5rem', minWidth: 'auto' }}
                            onClick={async () => {
                                if (!item.Number) return;
                                setDownloading("share");
                                
                                try {
                                    const baseOrigin = typeof window !== "undefined" ? window.location.origin : "";
                                    const docTypes: Array<{ label: "ЭР" | "СЧЕТ" | "УПД" | "АПП"; metod: string }> = [
                                        { label: "ЭР", metod: DOCUMENT_METHODS["ЭР"] },
                                        { label: "СЧЕТ", metod: DOCUMENT_METHODS["СЧЕТ"] },
                                        { label: "УПД", metod: DOCUMENT_METHODS["УПД"] },
                                        { label: "АПП", metod: DOCUMENT_METHODS["АПП"] },
                                    ];
                                    
                                    const shortUrls: Record<string, string> = {};
                                    const longUrls: Record<string, string> = {};
                                    
                                    const shortenPromises = docTypes.map(async ({ label, metod }) => {
                                        const params = new URLSearchParams({
                                            login: auth.login,
                                            password: auth.password,
                                            metod,
                                            number: item.Number!,
                                        });
                                        const longUrl = `${baseOrigin}${PROXY_API_DOWNLOAD_URL}?${params.toString()}`;
                                        longUrls[label] = longUrl;

                                        try {
                                            const res = await fetch('/api/shorten-doc', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    login: auth.login,
                                                    password: auth.password,
                                                    metod,
                                                    number: item.Number,
                                                }),
                                            });
                                            
                                            if (res.ok) {
                                                const data = await res.json();
                                                shortUrls[label] = data.shortUrl || data.short_url;
                                            } else {
                                                shortUrls[label] = longUrl;
                                            }
                                        } catch {
                                            shortUrls[label] = longUrl;
                                        }
                                    });
                                    
                                    await Promise.all(shortenPromises);

                                    const lines: string[] = [];
                                    lines.push(`Перевозка: ${item.Number}`);
                                    if (item.State) lines.push(`Статус: ${normalizeStatus(item.State)}`);
                                    if (item.DatePrih) lines.push(`Приход: ${formatDate(item.DatePrih)}`);
                                    if (item.DateVr) lines.push(`Доставка: ${formatDate(item.DateVr)}`);
                                    if (item.Sender) lines.push(`Отправитель: ${item.Sender}`);
                                    if (item.Customer) lines.push(`Заказчик: ${item.Customer}`);
                                    if (item.Mest !== undefined) lines.push(`Мест: ${item.Mest}`);
                                    if (item.PW !== undefined) lines.push(`Плат. вес: ${item.PW} кг`);
                                    if (item.Sum !== undefined) lines.push(`Стоимость: ${formatCurrency(item.Sum as any)}`);
                                    if (item.StateBill) lines.push(`Статус счета: ${item.StateBill}`);
                                    
                                    lines.push("");
                                    lines.push("Документы:");
                                    lines.push(`ЭР: ${shortUrls["ЭР"]}`);
                                    lines.push(`Счет: ${shortUrls["СЧЕТ"]}`);
                                    lines.push(`УПД: ${shortUrls["УПД"]}`);
                                    lines.push(`АПП: ${shortUrls["АПП"]}`);
                                    
                                    const text = lines.join("\n");

                                    if (typeof navigator !== "undefined" && (navigator as any).share) {
                                        await (navigator as any).share({
                                            title: `HAULZ — перевозка ${item.Number}`,
                                            text,
                                        });
                                    } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                                        await navigator.clipboard.writeText(text);
                                        alert("Информация скопирована в буфер обмена");
                                    } else {
                                        alert(text);
                                    }
                                } catch (e: any) {
                                    console.error("Share error:", e);
                                    alert("Ошибка при попытке поделиться");
                                } finally {
                                    setDownloading(null);
                                }
                            }}
                            title="Поделиться"
                        >
                            {downloading === "share" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                        </Button>
                        <Button
                            style={{ 
                                padding: '0.25rem', 
                                minWidth: 'auto', 
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                            onClick={() => onOpenChat(item.Number)}
                            title="Открыть AI чат"
                        >
                            <MessageCircle className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />
                        </Button>
                        <Button
                            style={{ 
                                padding: '0.25rem', 
                                minWidth: 'auto', 
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                            onClick={() => onToggleFavorite(item.Number)}
                            title={isFavorite(item.Number) ? "Удалить из избранного" : "Добавить в избранное"}
                        >
                            <Heart 
                                className="w-4 h-4" 
                                style={{ 
                                    fill: isFavorite(item.Number) ? '#ef4444' : 'transparent',
                                    color: isFavorite(item.Number) ? '#ef4444' : 'var(--color-text-secondary)',
                                    transition: 'all 0.2s'
                                }} 
                            />
                        </Button>
                        </Flex>
                        <Button className="modal-close-button" onClick={onClose} aria-label="Закрыть"><X size={20} /></Button>
                    </Flex>
                </div>
                {downloadError && <Typography.Body className="login-error mb-2">{downloadError}</Typography.Body>}
                
                {/* Явно отображаемые поля (из API примера) */}
                <div className="details-grid-modal">
                    <DetailItem label="Номер" value={item.Number} />
                    <DetailItem label="Статус" value={normalizeStatus(item.State)} statusClass={getStatusClass(item.State)} />
                    <DetailItem label="Приход" value={<DateText value={item.DatePrih} />} />
                    <DetailItem label="Доставка" value={(() => {
                        // Показываем дату доставки только если груз доставлен
                        const status = normalizeStatus(item.State);
                        const lower = status.toLowerCase();
                        if (lower.includes('доставлен') || lower.includes('заверш')) {
                            return <DateText value={item.DateVr} />;
                        }
                        return '-';
                    })()} /> {/* Используем DateVr */}
                    <DetailItem label="Отправитель" value={item.Sender || '-'} /> {/* Добавляем Sender */}
                    <DetailItem label="Заказчик" value={item.Customer || '-'} />
                    <DetailItem label="Мест" value={renderValue(item.Mest)} icon={<Layers className="w-4 h-4 mr-1 text-theme-primary"/>} />
                    <DetailItem label="Плат. вес" value={renderValue(item.PW, 'кг')} icon={<Scale className="w-4 h-4 mr-1 text-theme-primary"/>} highlighted /> {/* Используем PW */}
                    <DetailItem label="Вес" value={renderValue(item.W, 'кг')} icon={<Weight className="w-4 h-4 mr-1 text-theme-primary"/>} /> {/* Используем W */}
                    <DetailItem label="Объем" value={renderValue(item.Value, 'м³')} icon={<List className="w-4 h-4 mr-1 text-theme-primary"/>} /> {/* Используем Value */}
                    <DetailItem label="Стоимость" value={formatCurrency(item.Sum)} textColor={getSumColorByPaymentStatus(item.StateBill)} />
                    <DetailItem label="Статус Счета" value={<StatusBillBadge status={item.StateBill} />} highlighted /> {/* Используем StateBill */}
                </div>
                
                {/* ДОПОЛНИТЕЛЬНЫЕ поля из API - УДАЛЕН ЗАГОЛОВОК "Прочие данные из API" */}
                
                <div className="details-grid-modal">
                    {Object.entries(item)
                        .filter(([key]) => !EXCLUDED_KEYS.includes(key))
                        .map(([key, val]) => {
                            // Пропускаем, если значение пустое
                            if (val === undefined || val === null || val === "" || (typeof val === 'string' && val.trim() === "") || (typeof val === 'object' && val !== null && Object.keys(val).length === 0)) return null; 
                            // Пропускаем, если значение - 0
                            if (val === 0 && key.toLowerCase().includes('date') === false) return null;
                            
                            return <DetailItem key={key} label={key} value={renderValue(val)} />;
                        })}
                </div>
                
                <Typography.Headline style={{marginTop: '1rem', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600}}>
                    Документы
                </Typography.Headline>
                
                {/* Умные сценарии документов */}
                {(() => {
                    const isPaid = item.StateBill?.toLowerCase().includes('оплачен') || 
                                  item.StateBill?.toLowerCase().includes('paid') ||
                                  item.StateBill === 'Оплачен';
                    
                    // Базовые документы (всегда доступны)
                    const baseDocs = ['ЭР', 'АПП'];
                    
                    // Документы (как было ранее): УПД доступен кнопкой в разделе выгрузки документов
                    const availableDocs = [...baseDocs, 'СЧЕТ', 'УПД'];
                    
                    return (
                        <>
                <div className="document-buttons">
                                {availableDocs.map(doc => {
                                    const isUPD = doc === 'УПД';
                                    const isHighlighted = isUPD && isPaid; // Подсветка для УПД если оплачен
                                    return (
                                        <Button 
                                            key={doc} 
                                            className={`doc-button ${isHighlighted ? 'doc-button-highlighted' : ''}`}
                                            onClick={() => handleDownload(doc)} 
                                            disabled={downloading === doc}
                                            style={isHighlighted ? {
                                                border: '2px solid var(--color-primary-blue)',
                                                boxShadow: '0 0 8px rgba(37, 99, 235, 0.3)'
                                            } : {}}
                                        >
                            {downloading === doc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 mr-2" />} {doc}
                        </Button>
                                    );
                                })}
                </div>
                        </>
                    );
                })()}


                {/* Встроенный просмотрщик PDF (метод 4: object/embed) */}
                {pdfViewer && (
                    <div style={{ marginTop: '1rem', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
                        <div style={{ padding: '0.5rem', background: 'var(--color-bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography.Label style={{ fontSize: '0.8rem' }}>{pdfViewer.name}</Typography.Label>
                            <Button size="small" onClick={() => { URL.revokeObjectURL(pdfViewer.url); setPdfViewer(null); }}>
                                <X size={16} />
                                </Button>
                        </div>
                        <object 
                            data={pdfViewer.url} 
                            type="application/pdf" 
                            style={{ width: '100%', height: '500px' }}
                        >
                            <Typography.Body style={{ padding: '1rem', textAlign: 'center' }}>
                                Ваш браузер не поддерживает просмотр PDF.
                            </Typography.Body>
                        </object>
                    </div>
                )}
            </div>
        </div>
    );
}

const DetailItem = ({ label, value, icon, statusClass, highlighted, textColor }: any) => (
    <div className={`details-item-modal ${highlighted ? 'highlighted-detail' : ''}`}>
        <Typography.Label className="detail-item-label">{label}</Typography.Label>
        <Flex align="center" className={`detail-item-value ${statusClass || ''}`}>
            {icon}
            <Typography.Body style={textColor ? { color: textColor } : {}}>{value}</Typography.Body>
        </Flex>
    </div>
);

// УДАЛЕНО: function StubPage({ title }: { title: string }) { return <div className="w-full p-8 text-center"><h2 className="title">{title}</h2><p className="subtitle">Раздел в разработке</p></div>; }

function TabBar({ active, onChange, onCargoPressStart, onCargoPressEnd, showAllTabs }: { active: Tab, onChange: (t: Tab) => void, onCargoPressStart?: () => void, onCargoPressEnd?: () => void, showAllTabs?: boolean }) {
    if (showAllTabs) {
    return (
        <div className="tabbar-container">
                <TabBtn label="" icon={<Home />} active={active === "home" || active === "dashboard"} onClick={() => onChange("home")} />
                <TabBtn 
                    label="" 
                    icon={<Truck />} 
                    active={active === "cargo"} 
                    onClick={() => {
                        // Если секретный режим уже активирован, просто переключаемся на грузы
                        onChange("cargo");
                    }} 
                />
                <TabBtn label="" icon={<FileText />} active={active === "docs"} onClick={() => onChange("docs")} />
                <TabBtn label="" icon={<MessageCircle />} active={active === "support"} onClick={() => onChange("support")} />
                <TabBtn label="" icon={<User />} active={active === "profile"} onClick={() => onChange("profile")} />
        </div>
    );
}
    
    return (
        <div className="tabbar-container">
            {/* Обычный режим: Главная(дашборд) + Грузы + Профиль */}
            <TabBtn label="" icon={<Home />} active={active === "home" || active === "dashboard"} onClick={() => onChange("home")} />
            <TabBtn 
                label="" 
                icon={<Truck />} 
                active={active === "cargo" || active === "dashboard"} 
                onClick={() => {
                    onChange("cargo");
                }}
                onMouseDown={onCargoPressStart}
                onMouseUp={onCargoPressEnd}
                onMouseLeave={onCargoPressEnd}
                onTouchStart={onCargoPressStart}
                onTouchEnd={onCargoPressEnd}
            />
            <TabBtn label="" icon={<MessageCircle />} active={active === "support"} onClick={() => onChange("support")} />
            <TabBtn label="" icon={<User />} active={active === "profile"} onClick={() => onChange("profile")} />
        </div>
    );
}
const TabBtn = ({ label, icon, active, onClick, onMouseDown, onMouseUp, onMouseLeave, onTouchStart, onTouchEnd }: any) => (
    <Button 
        className={`tab-button ${active ? 'active' : ''}`} 
        onClick={onClick}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        title={label || undefined}
    >
        <Flex align="center" justify="center">
            <div className="tab-icon">{icon}</div>
        </Flex>
    </Button>
);

function SupportRedirectPage({ onOpenSupport }: { onOpenSupport: () => void }) {
    const didRunRef = React.useRef(false);

    useEffect(() => {
        if (didRunRef.current) return;
        didRunRef.current = true;
    }, [onOpenSupport]);

    const message = "Поддержка временно доступна только внутри мини‑приложения.";

    return (
        <div className="w-full p-8 text-center">
            <Typography.Headline>Поддержка</Typography.Headline>
            <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>{message}</Typography.Body>
        </div>
    );
}

function ChatPage({ 
    prefillMessage, 
    onClearPrefill,
    auth,
    cargoItems,
    sessionOverride,
    userIdOverride,
    customerOverride,
    onOpenCargo
}: { 
    prefillMessage?: string; 
    onClearPrefill?: () => void;
    auth?: AuthData;
    cargoItems?: CargoItem[];
    sessionOverride?: string;
    userIdOverride?: string;
    customerOverride?: string;
    onOpenCargo?: (cargoNumber: string) => void;
}) {
    const [messages, setMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
    const [inputValue, setInputValue] = useState("");
    const [isTyping, setIsReady] = useState(false);
    const [hasLoadedHistory, setHasLoadedHistory] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [sessionId, setSessionId] = useState<string>(() => {
        if (sessionOverride) return sessionOverride;
        if (typeof window === "undefined") return "server";
        const key = "haulz.chat.sessionId";
        const existing = window.localStorage.getItem(key);
        if (existing) return existing;
        const sid =
            typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `s_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        window.localStorage.setItem(key, sid);
        return sid;
    });
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const recorderRef = React.useRef<MediaRecorder | null>(null);
    const chunksRef = React.useRef<Blob[]>([]);
    const streamRef = React.useRef<MediaStream | null>(null);
    const ffmpegRef = React.useRef<FFmpeg | null>(null);
    const ffmpegLoadingRef = React.useRef<Promise<FFmpeg> | null>(null);

    const renderLineWithLinks = (line: string) => {
        const parts: React.ReactNode[] = [];
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const cargoRegex = /№\s*\d{4,}|\b\d{6,}\b/g;
        const combined = new RegExp(`${urlRegex.source}|${cargoRegex.source}`, "g");
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        let keyIndex = 0;
        const openChatLink = (url: string) => {
            const webApp = (window as any)?.Telegram?.WebApp || (window as any)?.MaxWebApp;
            if (webApp && typeof webApp.openLink === "function") {
                webApp.openLink(url);
                return;
            }
            window.open(url, "_blank", "noopener,noreferrer");
        };

        while ((match = combined.exec(line)) !== null) {
            const start = match.index;
            const rawValue = match[0];
            if (start > lastIndex) {
                parts.push(line.slice(lastIndex, start));
            }

            if (rawValue.startsWith("http")) {
                parts.push(
                    <button
                        key={`url-${keyIndex}`}
                        type="button"
                        onClick={() => openChatLink(rawValue)}
                        style={{
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            margin: 0,
                            cursor: "pointer",
                            color: "inherit",
                            textDecoration: "underline",
                            font: "inherit",
                            textAlign: "left"
                        }}
                    >
                        {rawValue}
                    </button>
                );
            } else if (onOpenCargo) {
                const cargoNumber = rawValue.replace(/\D+/g, "");
                parts.push(
                    <button
                        key={`cargo-${keyIndex}`}
                        type="button"
                        onClick={() => onOpenCargo(cargoNumber)}
                        style={{
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            margin: 0,
                            cursor: "pointer",
                            color: "inherit",
                            textDecoration: "underline",
                            font: "inherit"
                        }}
                    >
                        {rawValue}
                    </button>
                );
            } else {
                parts.push(rawValue);
            }

            lastIndex = start + rawValue.length;
            keyIndex += 1;
        }

        if (lastIndex < line.length) {
            parts.push(line.slice(lastIndex));
        }

        return parts;
    };

    const renderMessageContent = (text: string) => {
        const blocks = String(text || "").split(/\n{2,}/).filter(Boolean);
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {blocks.map((block, blockIndex) => {
                    const lines = block.split(/\n/).filter(Boolean);
                    const isBulleted = lines.length > 0 && lines.every(line => /^[-•]\s+/.test(line));
                    const isNumbered = lines.length > 0 && lines.every(line => /^\d+[.)]\s+/.test(line));

                    if (isBulleted) {
                        return (
                            <ul key={blockIndex} style={{ margin: 0, paddingLeft: '1.25rem', listStyleType: 'disc' }}>
                                {lines.map((line, lineIndex) => (
                                    <li key={lineIndex}>
                                        <Typography.Body style={{ color: 'inherit', fontSize: '0.95rem', lineHeight: '1.4', margin: 0 }}>
                                            {renderLineWithLinks(line.replace(/^[-•]\s+/, ""))}
                                        </Typography.Body>
                                    </li>
                                ))}
                            </ul>
                        );
                    }

                    if (isNumbered) {
                        return (
                            <ol key={blockIndex} style={{ margin: 0, paddingLeft: '1.25rem' }}>
                                {lines.map((line, lineIndex) => (
                                    <li key={lineIndex}>
                                        <Typography.Body style={{ color: 'inherit', fontSize: '0.95rem', lineHeight: '1.4', margin: 0 }}>
                                            {renderLineWithLinks(line.replace(/^\d+[.)]\s+/, ""))}
                                        </Typography.Body>
                                    </li>
                                ))}
                            </ol>
                        );
                    }

                    return (
                        <Typography.Body
                            key={blockIndex}
                            style={{ color: 'inherit', fontSize: '0.95rem', lineHeight: '1.4', margin: 0, whiteSpace: 'pre-wrap' }}
                        >
                            {renderLineWithLinks(block)}
                        </Typography.Body>
                    );
                })}
            </div>
        );
    };

    const stopStream = () => {
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    };

    const loadFfmpeg = async () => {
        if (ffmpegRef.current) return ffmpegRef.current;
        if (!ffmpegLoadingRef.current) {
            const ffmpeg = new FFmpeg();
            const baseUrl = "https://unpkg.com/@ffmpeg/core@0.12.6/dist";
            ffmpegLoadingRef.current = (async () => {
                await ffmpeg.load({
                    coreURL: `${baseUrl}/ffmpeg-core.js`,
                    wasmURL: `${baseUrl}/ffmpeg-core.wasm`,
                    workerURL: `${baseUrl}/ffmpeg-core.worker.js`
                });
                ffmpegRef.current = ffmpeg;
                return ffmpeg;
            })();
        }
        return ffmpegLoadingRef.current;
    };

    const convertAacToMp4 = async (inputBlob: Blob) => {
        const ffmpeg = await loadFfmpeg();
        const inputName = "input.aac";
        const outputName = "output.mp4";
        try {
            await ffmpeg.writeFile(inputName, await fetchFile(inputBlob));
            await ffmpeg.exec(["-i", inputName, "-c:a", "aac", "-b:a", "128k", outputName]);
            const data = await ffmpeg.readFile(outputName);
            return new Blob([data], { type: "audio/mp4" });
        } finally {
            try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }
            try { await ffmpeg.deleteFile(outputName); } catch { /* ignore */ }
        }
    };

    const encodeWav = (audioBuffer: AudioBuffer) => {
        const channelCount = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const length = audioBuffer.length;
        const buffer = new ArrayBuffer(44 + length * 2 * channelCount);
        const view = new DataView(buffer);
        let offset = 0;

        const writeString = (s: string) => {
            for (let i = 0; i < s.length; i += 1) {
                view.setUint8(offset++, s.charCodeAt(i));
            }
        };

        writeString("RIFF");
        view.setUint32(offset, 36 + length * 2 * channelCount, true); offset += 4;
        writeString("WAVE");
        writeString("fmt ");
        view.setUint32(offset, 16, true); offset += 4; // PCM chunk size
        view.setUint16(offset, 1, true); offset += 2; // PCM format
        view.setUint16(offset, channelCount, true); offset += 2;
        view.setUint32(offset, sampleRate, true); offset += 4;
        view.setUint32(offset, sampleRate * channelCount * 2, true); offset += 4;
        view.setUint16(offset, channelCount * 2, true); offset += 2;
        view.setUint16(offset, 16, true); offset += 2;
        writeString("data");
        view.setUint32(offset, length * 2 * channelCount, true); offset += 4;

        for (let i = 0; i < length; i += 1) {
            for (let ch = 0; ch < channelCount; ch += 1) {
                const sample = audioBuffer.getChannelData(ch)[i];
                const clamped = Math.max(-1, Math.min(1, sample));
                view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
                offset += 2;
            }
        }

        return new Blob([buffer], { type: "audio/wav" });
    };

    const convertAacToWav = async (blob: Blob) => {
        const arrayBuffer = await blob.arrayBuffer();
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        try {
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            return encodeWav(audioBuffer);
        } finally {
            audioContext.close().catch(() => {});
        }
    };

    const getAudioFileName = (mimeType: string) => {
        if (mimeType.includes("webm")) return "voice.webm";
        if (mimeType.includes("ogg")) return "voice.ogg";
        if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "voice.mp3";
        if (mimeType.includes("wav")) return "voice.wav";
        if (mimeType.includes("mp4")) return "voice.mp4";
        if (mimeType.includes("m4a")) return "voice.m4a";
        return "voice.webm";
    };

    const transcribeAndSend = async (blob: Blob) => {
        setIsTranscribing(true);
        try {
            if (!blob || blob.size < 256) {
                throw new Error("Запись слишком короткая");
            }
            const rawType = blob.type || recorderRef.current?.mimeType || "audio/webm";
            let baseType = rawType.split(";")[0];
            if (baseType === "audio/aac" || baseType === "audio/x-aac") {
                // iOS can return raw AAC (ADTS). Convert to MP4 (AAC) via ffmpeg.wasm.
                try {
                    blob = await convertAacToMp4(blob);
                    baseType = "audio/mp4";
                } catch (err) {
                    // Fallback to WAV if ffmpeg fails to load or convert.
                    blob = await convertAacToWav(blob);
                    baseType = "audio/wav";
                }
            }
            const fileName = getAudioFileName(baseType);
            const file = new File([blob], fileName, { type: baseType });
            const formData = new FormData();
            formData.append("audio", file);

            const res = await fetch("/api/transcribe", {
                method: "POST",
                body: formData
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || `Ошибка ${res.status}`);
            }
            const text = String(data?.text || "").trim();
            if (text) {
                await handleSend(text);
            } else {
                setMessages(prev => [...prev, { role: 'assistant', content: "Не удалось распознать речь." }]);
            }
        } catch (e: any) {
            const msg = e?.message || "Не удалось распознать речь";
            setMessages(prev => [...prev, { role: 'assistant', content: `Ошибка распознавания: ${msg}` }]);
        } finally {
            setIsTranscribing(false);
        }
    };

    const startRecording = async () => {
        if (isRecording || isTranscribing) return;
        if (typeof MediaRecorder === "undefined") {
            setMessages(prev => [...prev, { role: 'assistant', content: "Запись голоса не поддерживается в этом браузере." }]);
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const preferredTypes = [
                "audio/webm;codecs=opus",
                "audio/ogg;codecs=opus",
                "audio/webm",
                "audio/ogg",
                "audio/mp4",
                "audio/mpeg"
            ];
            const mimeType = preferredTypes.find(type => MediaRecorder.isTypeSupported(type));
            const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            chunksRef.current = [];

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            recorder.onstop = async () => {
                const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
                stopStream();
                await transcribeAndSend(blob);
            };

            recorderRef.current = recorder;
            recorder.start();
            setIsRecording(true);
        } catch (e) {
            stopStream();
            setMessages(prev => [...prev, { role: 'assistant', content: "Не удалось получить доступ к микрофону." }]);
        }
    };

    const stopRecording = () => {
        if (!recorderRef.current) return;
        recorderRef.current.stop();
        recorderRef.current = null;
        setIsRecording(false);
    };

    useEffect(() => {
        return () => {
            if (recorderRef.current && recorderRef.current.state !== "inactive") {
                try { recorderRef.current.stop(); } catch { /* ignore */ }
            }
            stopStream();
        };
    }, []);

    useEffect(() => {
        if (!sessionOverride) return;
        setSessionId(sessionOverride);
        setMessages([]);
        setInputValue("");
        setHasLoadedHistory(false);
    }, [sessionOverride]);

    useEffect(() => {
        let isActive = true;
        const loadHistory = async () => {
            if (!sessionId) return;
            try {
                const res = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, action: "history" })
                });
                if (!res.ok) return;
                const data = await res.json().catch(() => ({}));
                if (!isActive) return;
                if (Array.isArray(data?.history)) {
                    setMessages(
                        data.history
                            .filter((item: any) => item?.role === "user" || item?.role === "assistant")
                            .map((item: any) => ({ role: item.role, content: String(item.content || "") }))
                    );
                }
            } finally {
                if (isActive) setHasLoadedHistory(true);
            }
        };

        loadHistory();
        return () => {
            isActive = false;
        };
    }, [sessionId]);

    // Начальное приветствие
    useEffect(() => {
        if (hasLoadedHistory && messages.length === 0) {
            setMessages([
                { role: 'assistant', content: "Здравствуйте! Я AI-помощник HAULZ. Чем я могу вам помочь? 🚛" }
            ]);
        }
    }, [hasLoadedHistory, messages.length]);

    // Автоматическая прокрутка вниз
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    // Обработка предзаполненного сообщения
    useEffect(() => {
        if (prefillMessage && prefillMessage.trim()) {
            handleSend(prefillMessage);
            if (onClearPrefill) onClearPrefill();
        }
    }, [prefillMessage]);

    const handleSend = async (text: string) => {
        const messageText = text || inputValue.trim();
        if (!messageText || isTyping) return;

        const newMessages = [...messages, { role: 'user' as const, content: messageText }];
        setMessages(newMessages);
        setInputValue("");
        setIsReady(true);

        try {
            if (auth?.login && auth?.password) {
                const today = new Date().toISOString().split("T")[0];
                await fetch('/api/perevozki', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        login: auth.login,
                        password: auth.password,
                        dateFrom: "2024-01-01",
                        dateTo: today,
                        customer: customerOverride,
                    }),
                }).catch(() => {});
            }

            // Подготавливаем контекст (только важные поля, чтобы не перегружать токены)
            const context = {
                userLogin: auth?.login,
                customer: customerOverride,
                activeCargoCount: cargoItems?.length || 0,
                recentCargo: cargoItems?.slice(0, 5).map(i => ({
                    number: i.Number,
                    status: normalizeStatus(i.State),
                    date: i.DatePrih,
                    sender: i.Sender
                }))
            };

            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    sessionId,
                    userId: userIdOverride || auth?.login,
                    message: messageText,
                    context,
                    customer: customerOverride,
                    auth: auth?.login && auth?.password ? { login: auth.login, password: auth.password } : undefined
                })
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || data?.message || `Ошибка ${res.status}`);
            }
            if (!sessionOverride && data?.sessionId && typeof data.sessionId === "string" && data.sessionId !== sessionId) {
                setSessionId(data.sessionId);
                if (typeof window !== "undefined") {
                    window.localStorage.setItem("haulz.chat.sessionId", data.sessionId);
                }
            }
            setMessages(prev => [...prev, { role: 'assistant', content: data.reply || "" }]);
        } catch (e: any) {
            const msg = e?.message || "Не удалось получить ответ";
            setMessages(prev => [...prev, { 
                role: 'assistant', 
                content: `Ошибка: ${msg}` 
            }]);
        } finally {
            setIsReady(false);
        }
    };

    return (
        <div className="chat-shell" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%' }}>
            {/* Окно сообщений */}
            <div 
                ref={scrollRef}
                className="chat-messages"
                style={{ 
                    flex: 1, 
                    overflowY: 'auto', 
                    padding: '1rem', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '1rem',
                    scrollBehavior: 'smooth' 
                }}
            >
                {messages.map((msg, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        <div className={`chat-bubble ${msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}`} style={{ 
                            maxWidth: '85%', 
                            padding: '0.75rem 1rem', 
                            borderRadius: '1rem', 
                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                            backgroundColor: msg.role === 'user' ? 'var(--color-theme-primary)' : 'var(--color-panel-secondary)',
                            color: msg.role === 'user' ? '#fff' : 'inherit',
                            borderBottomRightRadius: msg.role === 'user' ? '0' : '1rem',
                            borderBottomLeftRadius: msg.role === 'user' ? '1rem' : '0',
                            border: msg.role === 'user' ? 'none' : '1px solid var(--color-border)'
                        }}>
                            {renderMessageContent(msg.content)}
                        </div>
                    </div>
                ))}
                {isTyping && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <div style={{ 
                            padding: '0.75rem 1rem', 
                            borderRadius: '1rem', 
                            backgroundColor: 'var(--color-panel-secondary)',
                            border: '1px solid var(--color-border)',
                            borderBottomLeftRadius: '0'
                        }}>
                            <Loader2 className="w-5 h-5 animate-spin text-theme-primary" />
                        </div>
                    </div>
                )}
            </div>

            {/* Поле ввода */}
            <div className="chat-input-bar" style={{ padding: '0.75rem', background: 'var(--color-bg-primary)', borderTop: '1px solid var(--color-border)' }}>
                <form 
                    onSubmit={(e) => { e.preventDefault(); handleSend(inputValue); }}
                    style={{ display: 'flex', gap: '0.5rem', height: '44px' }}
                >
                    <Input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Напишите ваш вопрос..."
                        className="chat-input"
                        style={{ flex: 1, height: '44px' }}
                        disabled={isTyping || isRecording || isTranscribing}
                    />
                    <Button 
                        type="submit" 
                        disabled={!inputValue.trim() || isTyping || isRecording || isTranscribing}
                        className="chat-action-button chat-send-button"
                        style={{ padding: '0.5rem', minWidth: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <ArrowUp size={20} />
                    </Button>
                </form>
            </div>
        </div>
    );
}

// ----------------- MAIN APP -----------------

export default function App() {
    // --- Telegram Init ---
    useEffect(() => {
        let mounted = true;
        let cleanupHandler: (() => void) | undefined;
        let attempts = 0;

        const initWebApp = () => {
            const webApp = getWebApp();
            if (!webApp || !mounted) return false;

            try {
                if (typeof webApp.ready === "function") {
                    webApp.ready();
                }
                
                // Настройка цветов для MAX Bridge
                if (isMaxWebApp()) {
                    // Устанавливаем цвет фона - всегда белый для MAX
                    if (typeof webApp.setBackgroundColor === "function") {
                        webApp.setBackgroundColor('#ffffff');
                    }
                    
                    // Устанавливаем цвет хедера (визуально привязываем к бренду)
                    if (typeof webApp.setHeaderColor === "function") {
                        webApp.setHeaderColor('#2563eb'); // Синий цвет бренда HAULZ
                    }
                }
                
                if (typeof webApp.expand === "function") {
                    webApp.expand();
                }
                // Для MAX не используем автоматическую тему из colorScheme
                if (!isMaxWebApp() && typeof webApp.colorScheme === "string") {
                    setTheme(webApp.colorScheme);
                }
            } catch {
                // Игнорируем, если WebApp API частично недоступен
            }

            const themeHandler = () => {
                // Для MAX не используем автоматическую тему
                if (!isMaxWebApp() && typeof webApp.colorScheme === "string") {
                    setTheme(webApp.colorScheme);
                }
                // Для MAX всегда белый фон
                if (isMaxWebApp()) {
                    if (typeof webApp.setBackgroundColor === "function") {
                        webApp.setBackgroundColor('#ffffff');
                    }
                }
            };

            if (typeof webApp.onEvent === "function") {
                webApp.onEvent("themeChanged", themeHandler);
                cleanupHandler = () => webApp.offEvent?.("themeChanged", themeHandler);
            }

            return true;
        };

        // На Android WebApp может появиться позже, поэтому немного подождём
        if (!initWebApp()) {
            const timer = setInterval(() => {
                attempts += 1;
                const ready = initWebApp();
                if (ready || attempts > 40) {
                    clearInterval(timer);
                }
            }, 100);

            return () => {
                mounted = false;
                clearInterval(timer);
                cleanupHandler?.();
            };
        }

        return () => {
            mounted = false;
            cleanupHandler?.();
        };
    }, []);

    // Множественные аккаунты
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
    
    // Вычисляем текущий активный аккаунт
    const auth = useMemo(() => {
        if (!activeAccountId) return null;
        const account = accounts.find(acc => acc.id === activeAccountId);
        return account ? { login: account.login, password: account.password } : null;
    }, [accounts, activeAccountId]);
    const activeAccount = useMemo(() => {
        if (!activeAccountId) return null;
        return accounts.find(acc => acc.id === activeAccountId) || null;
    }, [accounts, activeAccountId]);
    const persistTwoFactorSettings = useCallback(async (account: Account, patch: Partial<Account>) => {
        const login = account.login;
        if (!login) return;
        const enabled = patch.twoFactorEnabled ?? account.twoFactorEnabled ?? false;
        const method = patch.twoFactorMethod ?? account.twoFactorMethod ?? "google";
        const telegramLinked = patch.twoFactorTelegramLinked ?? account.twoFactorTelegramLinked ?? false;
        try {
            await fetch("/api/2fa", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login, enabled, method, telegramLinked })
            });
        } catch {
            // silent: server storage is best-effort
        }
    }, []);

    useEffect(() => {
        if (!activeAccount?.login) return;
        let cancelled = false;
        const load = async () => {
            try {
                const res = await fetch(`/api/2fa?login=${encodeURIComponent(activeAccount.login)}`);
                if (!res.ok) return;
                const data = await res.json();
                const settings = data?.settings;
                if (!settings || cancelled) return;
                setAccounts(prev =>
                    prev.map(acc =>
                        acc.id === activeAccount.id
                            ? {
                                ...acc,
                                twoFactorEnabled: !!settings.enabled,
                                twoFactorMethod: settings.method === "telegram" ? "telegram" : "google",
                                twoFactorTelegramLinked: !!settings.telegramLinked
                            }
                            : acc
                    )
                );
            } catch {
                // ignore load errors
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [activeAccount?.id, activeAccount?.login]);
    const [activeTab, setActiveTab] = useState<Tab>(() => {
        // "Страница" для поддержки, чтобы можно было ограничить Bitrix по URL: ?tab=support
        if (typeof window === "undefined") return "cargo";
        try {
            const url = new URL(window.location.href);
            const t = (url.searchParams.get("tab") || "").toLowerCase();
            if (t === "support") return "support";
            if (t === "profile") return "profile";
            if (t === "cargo") return "cargo";
            if (t === "home" || t === "dashboard") return "dashboard";
            if (t === "docs") return "docs";
        } catch {
            // ignore
        }
        // Первый запуск: "Грузы"
        return "cargo";
    });
    const [cargoQuickFilters, setCargoQuickFilters] = useState<{
        status?: StatusFilter;
        search?: string;
    } | null>(null);
    const [theme, setTheme] = useState('dark'); 
    const [showDashboard, setShowDashboard] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [pinCode, setPinCode] = useState('');
    const [pinError, setPinError] = useState(false);
    const hasRestoredTabRef = React.useRef(false);
    const hasUrlTabOverrideRef = React.useRef(false);

    const updateActiveAccountCustomer = useCallback((customer: string) => {
        if (!activeAccountId || !customer) return;
        setAccounts(prev => {
            const current = prev.find(acc => acc.id === activeAccountId);
            if (!current || current.customer === customer) {
                return prev;
            }
            return prev.map(acc =>
                acc.id === activeAccountId ? { ...acc, customer } : acc
            );
        });
    }, [activeAccountId]);
    
    const openSecretPinModal = () => {
        setShowPinModal(true);
        setPinCode('');
        setPinError(false);
    };
    
    // Проверка пин-кода (для входа и выхода)
    const handlePinSubmit = (e?: FormEvent) => {
        if (e) e.preventDefault();
        if (pinCode === '1984') {
            // Переключаем состояние секретного режима
            if (showDashboard) {
                // Выход из секретного режима
                setShowDashboard(false);
                setActiveTab("cargo");
            } else {
                // Вход в секретный режим
                setShowDashboard(true);
                setActiveTab("dashboard");
            }
            setShowPinModal(false);
            setPinCode('');
            setPinError(false);
        } else {
            setPinError(true);
            setPinCode('');
        }
    }; 
    const [startParam, setStartParam] = useState<string | null>(null);
    const [contextCargoNumber, setContextCargoNumber] = useState<string | null>(null); 
    
    // ИНИЦИАЛИЗАЦИЯ ПУСТЫМИ СТРОКАМИ (данные берутся с фронта)
    const [login, setLogin] = useState(""); 
    const [password, setPassword] = useState(""); 
    
    const [agreeOffer, setAgreeOffer] = useState(true);
    const [agreePersonal, setAgreePersonal] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false); 
    const [twoFactorPending, setTwoFactorPending] = useState(false);
    const [twoFactorCode, setTwoFactorCode] = useState("");
    const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
    const [twoFactorLoading, setTwoFactorLoading] = useState(false);
    const [pendingLogin, setPendingLogin] = useState<{ login: string; loginKey: string; password: string; customer?: string | null } | null>(null);
    
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [isOfferOpen, setIsOfferOpen] = useState(false);
    const [isPersonalConsentOpen, setIsPersonalConsentOpen] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);

    useEffect(() => { 
        document.body.className = `${theme}-mode`; 
        // Для MAX всегда белый фон при изменении темы
        if (isMaxWebApp()) {
            const webApp = getWebApp();
            if (webApp && typeof webApp.setBackgroundColor === "function") {
                webApp.setBackgroundColor('#ffffff');
            }
        }
    }, [theme]);

    // Обработка start_param для контекстного запуска
    useEffect(() => {
        if (typeof window === "undefined") return;
        
        const webApp = getWebApp();
        if (!webApp) return;
        
        // Получаем start_param из WebApp (MAX/Telegram)
        const param = (webApp as any).startParam || 
                     (webApp as any).initDataUnsafe?.start_param ||
                     new URLSearchParams(window.location.search).get('start_param') ||
                     new URLSearchParams(window.location.search).get('startapp');
        
        if (param) {
            setStartParam(param);
            console.log('📱 Start param:', param);
            
            // Парсим параметры: invoice_123, upd_456, delivery_789
            if (param.startsWith('invoice_')) {
                const number = param.replace('invoice_', '');
                setContextCargoNumber(number);
                setActiveTab('cargo');
            } else if (param.startsWith('upd_')) {
                const number = param.replace('upd_', '');
                setContextCargoNumber(number);
                setActiveTab('cargo');
            } else if (param.startsWith('delivery_')) {
                const number = param.replace('delivery_', '');
                setContextCargoNumber(number);
                setActiveTab('cargo');
            } else if (param.startsWith('haulz_n_')) {
                // Обработка нашего нового формата: haulz_n_[номер](_c_[chatId])
                const parts = param.split('_');
                const number = parts[2]; // haulz(0)_n(1)_NUMBER(2)
                if (number) {
                    setContextCargoNumber(number);
                    setActiveTab('cargo');
                }
            }
        }
    }, []);

    // Загрузка аккаунтов из localStorage
    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            // Если tab задан в URL — не перетираем восстановлением из localStorage
            try {
                const url = new URL(window.location.href);
                const t = (url.searchParams.get("tab") || "").toLowerCase();
                if (t) hasUrlTabOverrideRef.current = true;
            } catch {
                // ignore
            }

            const saved = window.localStorage.getItem("haulz.auth");
            if (saved) {
                const parsed = JSON.parse(saved) as AuthData;
                if (parsed?.login && parsed?.password) {
                    // Миграция старого формата в новый
                    const accountId = parsed.id || `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    const account: Account = {
                        login: parsed.login,
                        password: parsed.password,
                        id: accountId
                    };
                    setAccounts([account]);
                    setActiveAccountId(accountId);
                }
            }
            
            // Загружаем массив аккаунтов (новый формат)
            const savedAccounts = window.localStorage.getItem("haulz.accounts");
            const savedActiveId = window.localStorage.getItem("haulz.activeAccountId");
            const savedTab = window.localStorage.getItem("haulz.lastTab");
            if (savedAccounts) {
                try {
                    const parsedAccounts = JSON.parse(savedAccounts) as Account[];
                    if (Array.isArray(parsedAccounts) && parsedAccounts.length > 0) {
                        setAccounts(parsedAccounts);
                        if (savedActiveId && parsedAccounts.find(acc => acc.id === savedActiveId)) {
                            setActiveAccountId(savedActiveId);
                        } else {
                            setActiveAccountId(parsedAccounts[0].id);
                        }
                        // Восстанавливаем последнюю вкладку (без сохранения секретного режима)
                        if (savedTab && !hasUrlTabOverrideRef.current) {
                            const allowed: Tab[] = ["home", "cargo", "profile", "dashboard", "docs", "support"];
                            const t = savedTab as Tab;
                            if (allowed.includes(t)) {
                                // docs доступны только в секретном режиме — фоллбек на cargo
                                if ((t === "docs") && !showDashboard) {
                                    setActiveTab("cargo");
                                } else if (t === "home") {
                                    setActiveTab("dashboard");
                                } else {
                                    setActiveTab(t);
                                }
                            }
                        }
                        hasRestoredTabRef.current = true;
                    }
                } catch {
                    // Игнорируем ошибки парсинга
                }
            }
        } catch {
            // игнорируем ошибки чтения
        }
    }, []);

    // Сохраняем последнюю вкладку, чтобы при следующем запуске открыть на ней
    useEffect(() => {
        if (!hasRestoredTabRef.current) return;
        try {
            window.localStorage.setItem("haulz.lastTab", activeTab);
        } catch {
            // игнорируем ошибки записи
        }
    }, [activeTab]);

    // Синхронизируем URL (для ограничения Bitrix по ссылке)
    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const url = new URL(window.location.href);
            if (activeTab === "support") url.searchParams.set("tab", "support");
            else url.searchParams.delete("tab");
            window.history.replaceState(null, "", url.toString());
        } catch {
            // ignore
        }
    }, [activeTab]);
    
    // Сохранение аккаунтов в localStorage
    useEffect(() => {
        if (typeof window === "undefined" || accounts.length === 0) return;
        try {
            window.localStorage.setItem("haulz.accounts", JSON.stringify(accounts));
            if (activeAccountId) {
                window.localStorage.setItem("haulz.activeAccountId", activeAccountId);
            }
        } catch {
            // игнорируем ошибки записи
        }
    }, [accounts, activeAccountId]);
    const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    const handleSearch = (text: string) => setSearchText(text.toLowerCase().trim());

    const MAX_SUPPORT_BOT_URL = "https://max.ru/id9706037094_bot";
    const TG_SUPPORT_BOT_URL = "https://t.me/Haulzapp_bot";

    const openExternalLink = (url: string) => {
        const webApp = getWebApp();
        if (webApp && typeof (webApp as any).openLink === "function") {
            (webApp as any).openLink(url);
        } else {
            window.open(url, "_blank", "noopener,noreferrer");
        }
    };

    const openTelegramBotWithAccount = async () => {
        const activeAccount = accounts.find(acc => acc.id === activeAccountId) || null;
        if (!activeAccount) {
            throw new Error("Сначала выберите компанию.");
        }
        const res = await fetch("/api/tg-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                login: activeAccount.login,
                password: activeAccount.password,
                customer: activeAccount.customer || null,
                accountId: activeAccount.id,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.token) {
            throw new Error(data?.error || "Не удалось создать ссылку для Telegram.");
        }
        const url = new URL(TG_SUPPORT_BOT_URL);
        url.searchParams.set("start", `haulz_auth_${data.token}`);

        const webApp = getWebApp();
        if (webApp && typeof webApp.openTelegramLink === "function") {
            webApp.openTelegramLink(url.toString());
        } else {
            openExternalLink(url.toString());
        }
    };

    const openMaxBotLink = (url: string) => {
        const webApp = getWebApp();
        // Используем метод openLink из Bridge, чтобы MAX открыл это именно как внешнюю ссылку (переход в чат)
        if (webApp && typeof webApp.openLink === "function") {
            console.log("[openMaxBotLink] Opening via Bridge.openLink:", url);
            webApp.openLink(url);
            
            // Закрываем мини-апп через небольшую паузу, чтобы дать чату открыться
            setTimeout(() => {
                if (typeof (webApp as any).close === "function") {
                    try { (webApp as any).close(); } catch { /* ignore */ }
                }
            }, 500);
        } else {
            console.log("[openMaxBotLink] Bridge.openLink not available, using location.href");
            window.location.href = url;
        }
    };

    const buildMaxBotLink = (cargoNumber?: string) => {
        // MAX: передаем параметры в payload через startapp
        // Формат: haulz_n_[номер]_c_[chatId]
        const webApp = getWebApp();
        const chatId = webApp?.initDataUnsafe?.chat?.id || webApp?.initDataUnsafe?.user?.id;
        
        if (!cargoNumber) {
            return MAX_SUPPORT_BOT_URL;
        }

        let payload = "haulz_support";
        if (cargoNumber) {
            const safeNumber = String(cargoNumber).trim().replace(/[^0-9A-Za-zА-Яа-я._-]/g, "");
            payload = `haulz_n_${safeNumber}`;
            if (chatId) {
                payload += `_c_${chatId}`;
            }
        } else if (chatId) {
            payload = `haulz_c_${chatId}`;
        }

        const url = new URL(MAX_SUPPORT_BOT_URL);
        url.searchParams.set("startapp", payload);
        url.searchParams.set("start", payload); // Для совместимости
        return url.toString();
    };

    const buildTgBotLink = (cargoNumber?: string) => {
        // Telegram: передаем параметры в payload через start
        // Формат: haulz_n_[номер]_u_[userId]
        const webApp = getWebApp();
        const userId = webApp?.initDataUnsafe?.user?.id;
        
        if (!cargoNumber) {
            return TG_SUPPORT_BOT_URL;
        }

        let payload = "haulz_support";
        if (cargoNumber) {
            const safeNumber = String(cargoNumber).trim().replace(/[^0-9A-Za-zА-Яа-я._-]/g, "");
            payload = `haulz_n_${safeNumber}`;
            if (userId) {
                payload += `_u_${userId}`;
            }
        } else if (userId) {
            payload = `haulz_u_${userId}`;
        }

        const url = new URL(TG_SUPPORT_BOT_URL);
        url.searchParams.set("start", payload);
        return url.toString();
    };

    const openAiChatDeepLink = (cargoNumber?: string) => {
        if (typeof window !== "undefined") {
            if (cargoNumber) {
                window.sessionStorage.setItem(
                    "haulz.chat.prefill",
                    `Пожалуйста, предоставьте полную информацию по перевозке № ${cargoNumber} без ссылок на документы`
                );
            }
        }
        setActiveTab("support");
    };

    const openCargoFromChat = (cargoNumber: string) => {
        if (!cargoNumber) return;
        setContextCargoNumber(cargoNumber);
        setActiveTab("cargo");
    };

    const openCargoWithFilters = (filters: { status?: StatusFilter; search?: string }) => {
        setCargoQuickFilters(filters);
        if (filters.search) {
            setSearchText(filters.search);
            handleSearch(filters.search);
        }
        setActiveTab("cargo");
    };
    const chatIdentity = (() => {
        const webApp = getWebApp();
        const userId = webApp?.initDataUnsafe?.user?.id;
        const chatId = webApp?.initDataUnsafe?.chat?.id;
        if (userId) return String(userId);
        if (chatId) return String(chatId);
        return null;
    })();

    const openSupportChat = async (cargoNumber?: string) => {
        setActiveTab("support");
        return;
        const webApp = getWebApp();

        // В MAX используем схему с диплинком (startapp)
        if (isMaxWebApp()) {
            const botLink = buildMaxBotLink(cargoNumber);
            console.log("[openSupportChat] Redirecting to MAX bot with payload:", botLink);
            
            const chatId = webApp?.initDataUnsafe?.chat?.id || webApp?.initDataUnsafe?.user?.id;
            if (chatId) {
                fetch('/api/max-send-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        chatId, 
                        text: cargoNumber 
                            ? `Перехожу в бота по перевозке ${cargoNumber}...` 
                            : "Перехожу в поддержку..." 
                    })
                }).catch(() => {});
            }

            openMaxBotLink(botLink);
            return;
        }

        // В Telegram также переходим на диплинк бота
        const isTg = !!(window as any).Telegram?.WebApp;
        if (isTg) {
            const botLink = buildTgBotLink(cargoNumber);
            console.log("[openSupportChat] Redirecting to Telegram bot with payload:", botLink);
            
            if (webApp && typeof webApp.openTelegramLink === "function") {
                webApp.openTelegramLink(botLink);
            } else {
                openExternalLink(botLink);
            }
            
            // Закрываем мини-апп
            setTimeout(() => {
                if (webApp && typeof webApp.close === "function") {
                    try { webApp.close(); } catch { /* ignore */ }
                }
            }, 500);
            return;
        }

        // В обычном браузере показываем заглушку
        setActiveTab("support");
    };

    const handleLoginSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setTwoFactorError(null);
        if (!login || !password) return setError("Введите логин и пароль");
        if (!agreeOffer || !agreePersonal) return setError("Подтвердите согласие с условиями");

        try {
            setLoading(true);
            // ИСПРАВЛЕНО: 'all' на 'все'
            const { dateFrom, dateTo } = getDateRange("все");
            const res = await fetch(PROXY_API_BASE_URL, {
                method: "POST", 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login, password, dateFrom, dateTo }),
            });
            await ensureOk(res, "Ошибка авторизации");
            const payload = await readJsonOrText(res);
            const detectedCustomer = extractCustomerFromPerevozki(payload);
            const loginKey = login.trim().toLowerCase();
            const twoFaRes = await fetch(`/api/2fa?login=${encodeURIComponent(loginKey)}`);
            const twoFaJson = twoFaRes.ok ? await twoFaRes.json() : null;
            const twoFaSettings = twoFaJson?.settings;
            const twoFaEnabled = !!twoFaSettings?.enabled;
            const twoFaMethod = twoFaSettings?.method === "telegram" ? "telegram" : "google";
            const twoFaLinked = !!twoFaSettings?.telegramLinked;

            if (twoFaEnabled && twoFaMethod === "telegram") {
                if (!twoFaLinked) {
                    setError("Сначала привяжите Telegram в профиле.");
                    return;
                }
                const sendRes = await fetch("/api/2fa-telegram", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login: loginKey, action: "send" }),
                });
                if (!sendRes.ok) {
                    const err = await readJsonOrText(sendRes);
                    throw new Error(err?.error || "Не удалось отправить код");
                }
                setPendingLogin({ login, password, customer: detectedCustomer, loginKey });
                setTwoFactorPending(true);
                setTwoFactorCode("");
                return;
            }

            const existingAccount = accounts.find(acc => acc.login === login);
            let accountId: string;
            if (existingAccount) {
                accountId = existingAccount.id;
                if (detectedCustomer && existingAccount.customer !== detectedCustomer) {
                    setAccounts(prev =>
                        prev.map(acc =>
                            acc.id === existingAccount.id
                                ? { ...acc, customer: detectedCustomer }
                                : acc
                        )
                    );
                }
                setActiveAccountId(accountId);
            } else {
                accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const newAccount: Account = { login, password, id: accountId, customer: detectedCustomer || undefined };
                setAccounts(prev => [...prev, newAccount]);
                setActiveAccountId(accountId);
            }
            setActiveTab((prev) => prev || "cargo");
        } catch (err: any) {
            setError(err?.message || "Ошибка сети.");
        } finally {
            setLoading(false);
        }
    };

    const handleTwoFactorSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setTwoFactorError(null);
        if (!pendingLogin?.loginKey || !twoFactorCode.trim()) {
            setTwoFactorError("Введите код из Telegram.");
            return;
        }
        try {
            setTwoFactorLoading(true);
            const res = await fetch("/api/2fa-telegram", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login: pendingLogin.loginKey, action: "verify", code: twoFactorCode.trim() }),
            });
            if (!res.ok) {
                const err = await readJsonOrText(res);
                throw new Error(err?.error || "Неверный код");
            }

            const detectedCustomer = pendingLogin.customer;
            const existingAccount = accounts.find(acc => acc.login === pendingLogin.login);
            let accountId: string;
            if (existingAccount) {
                accountId = existingAccount.id;
                if (detectedCustomer && existingAccount.customer !== detectedCustomer) {
                    setAccounts(prev =>
                        prev.map(acc =>
                            acc.id === existingAccount.id
                                ? { ...acc, customer: detectedCustomer }
                                : acc
                        )
                    );
                }
                setActiveAccountId(accountId);
            } else {
                accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const newAccount: Account = {
                    login: pendingLogin.login,
                    password: pendingLogin.password,
                    id: accountId,
                    customer: detectedCustomer || undefined
                };
                setAccounts(prev => [...prev, newAccount]);
                setActiveAccountId(accountId);
            }
            setActiveTab((prev) => prev || "cargo");
            setTwoFactorPending(false);
            setPendingLogin(null);
            setTwoFactorCode("");
        } catch (err: any) {
            setTwoFactorError(err?.message || "Неверный код");
        } finally {
            setTwoFactorLoading(false);
        }
    };

    const handleLogout = () => {
        setAccounts([]);
        setActiveAccountId(null);
        setActiveTab("cargo");
        setPassword(""); 
        if (typeof window !== "undefined") {
            try {
                window.localStorage.removeItem("haulz.auth");
                window.localStorage.removeItem("haulz.accounts");
                window.localStorage.removeItem("haulz.activeAccountId");
            } catch {
                // игнорируем ошибки удаления
            }
        }
        setIsSearchExpanded(false); setSearchText('');
    }
    
    // Удаление аккаунта
    const handleRemoveAccount = (accountId: string) => {
        const newAccounts = accounts.filter(acc => acc.id !== accountId);
        setAccounts(newAccounts);
        
        if (activeAccountId === accountId) {
            // Если удалили активный аккаунт, переключаемся на первый доступный
            if (newAccounts.length > 0) {
                setActiveAccountId(newAccounts[0].id);
            } else {
                setActiveAccountId(null);
                setActiveTab("cargo");
            }
        }
    };
    
    // Переключение аккаунта
    const handleSwitchAccount = (accountId: string) => {
        setActiveAccountId(accountId);
    };

    // Обновление полей аккаунта (например, 2FA настройки)
    const handleUpdateAccount = (accountId: string, patch: Partial<Account>) => {
        let target: Account | null = null;
        setAccounts(prev => {
            const next = prev.map(acc => acc.id === accountId ? { ...acc, ...patch } : acc);
            target = next.find(acc => acc.id === accountId) || null;
            return next;
        });
        if (target && ("twoFactorEnabled" in patch || "twoFactorMethod" in patch || "twoFactorTelegramLinked" in patch)) {
            void persistTwoFactorSettings(target, patch);
        }
    };
    
    // Добавление нового аккаунта (для страницы профиля)
    const handleAddAccount = async (login: string, password: string) => {
        // Проверяем, не существует ли уже такой аккаунт
        if (accounts.find(acc => acc.login === login)) {
            throw new Error("Аккаунт с таким логином уже добавлен");
        }
        
        // Проверяем авторизацию
        const { dateFrom, dateTo } = getDateRange("все");
        const res = await fetch(PROXY_API_BASE_URL, {
            method: "POST", 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login, password, dateFrom, dateTo }),
        });

        if (!res.ok) {
            let message = `Ошибка авторизации`;
            try {
                const errorData = await res.json() as ApiError;
                if (errorData.error) message = errorData.error;
            } catch { }
            throw new Error(message);
        }

        const payload = await readJsonOrText(res);
        const detectedCustomer = extractCustomerFromPerevozki(payload);
        
        // Создаем новый аккаунт
        const accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newAccount: Account = { login, password, id: accountId, customer: detectedCustomer || undefined };
        setAccounts(prev => [...prev, newAccount]);
        setActiveAccountId(accountId);
    };

    if (!auth) {
        return (
            <Container className={`app-container login-form-wrapper`}>
                <Panel mode="secondary" className="login-card">
                    <div className="absolute top-4 right-4">
                        <Button
                            className="theme-toggle-button-login"
                            onClick={toggleTheme}
                            title={theme === 'dark' ? 'Светлый режим' : 'Темный режим'}
                            aria-label={theme === 'dark' ? 'Включить светлый режим' : 'Включить темный режим'}
                        >
                            {/* ИСПРАВЛЕНИЕ: Убран class text-yellow-400 */}
                            {theme === 'dark' 
                                ? <Sun className="w-5 h-5 text-theme-primary" /> 
                                : <Moon className="w-5 h-5 text-theme-primary" />}
                        </Button>
                    </div>
                    <Flex justify="center" className="mb-4 h-10 mt-6">
                        <Typography.Title className="logo-text">HAULZ</Typography.Title>
                    </Flex>
                    <Typography.Body className="tagline">
                        Доставка грузов в Калининград и обратно
                    </Typography.Body>
                    {twoFactorPending ? (
                        <form onSubmit={handleTwoFactorSubmit} className="form">
                            <Typography.Body style={{ marginBottom: '0.75rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                                Введите код из Telegram
                            </Typography.Body>
                            <div className="field">
                                <Input
                                    className="login-input"
                                    type="text"
                                    placeholder="Код подтверждения"
                                    value={twoFactorCode}
                                    onChange={(e) => setTwoFactorCode(e.target.value)}
                                />
                            </div>
                            <Button className="button-primary" type="submit" disabled={twoFactorLoading}>
                                {twoFactorLoading ? <Loader2 className="animate-spin w-5 h-5" /> : "Подтвердить код"}
                            </Button>
                            <Flex justify="center" style={{ marginTop: '0.75rem', gap: '0.5rem' }}>
                                <Button
                                    type="button"
                                    className="filter-button"
                                    disabled={twoFactorLoading}
                                    onClick={async () => {
                                        if (!pendingLogin?.loginKey) return;
                                        try {
                                            setTwoFactorError(null);
                                            setTwoFactorLoading(true);
                                            const resend = await fetch("/api/2fa-telegram", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ login: pendingLogin.loginKey, action: "send" }),
                                            });
                                            if (!resend.ok) {
                                                const err = await readJsonOrText(resend);
                                                throw new Error(err?.error || "Не удалось отправить код");
                                            }
                                        } catch (err: any) {
                                            setTwoFactorError(err?.message || "Не удалось отправить код");
                                        } finally {
                                            setTwoFactorLoading(false);
                                        }
                                    }}
                                >
                                    Отправить код еще раз
                                </Button>
                                <Button
                                    type="button"
                                    className="filter-button"
                                    disabled={twoFactorLoading}
                                    onClick={() => {
                                        setTwoFactorPending(false);
                                        setPendingLogin(null);
                                        setTwoFactorCode("");
                                    }}
                                >
                                    Назад
                                </Button>
                            </Flex>
                            {twoFactorError && (
                                <Flex align="center" className="login-error mt-4">
                                    <AlertTriangle className="w-5 h-5 mr-2" />
                                    <Typography.Body>{twoFactorError}</Typography.Body>
                                </Flex>
                            )}
                        </form>
                    ) : (
                        <form onSubmit={handleLoginSubmit} className="form">
                            <div className="field">
                                <Input
                                    className="login-input"
                                    type="text"
                                    placeholder="Логин (email)"
                                    value={login}
                                    onChange={(e) => setLogin(e.target.value)}
                                    autoComplete="username"
                                />
                            </div>
                            <div className="field">
                                <div className="password-input-container">
                                    <Input
                                        className="login-input password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Пароль"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        autoComplete="current-password"
                                        style={{paddingRight: '3rem'}}
                                    />
                                    <Button type="button" className="toggle-password-visibility" onClick={() => setShowPassword(!showPassword)}>
                                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </Button>
                                </div>
                            </div>
                            {/* ТУМБЛЕРЫ ВОССТАНОВЛЕНЫ */}
                            <label className="checkbox-row switch-wrapper">
                                <Typography.Body>
                                    Согласие с{" "}
                                    <a href="#" onClick={(e) => { e.preventDefault(); setIsOfferOpen(true); }}>
                                        публичной офертой
                                    </a>
                                </Typography.Body>
                                <Switch
                                    checked={agreeOffer}
                                    onCheckedChange={(value) => setAgreeOffer(resolveChecked(value))}
                                    onChange={(event) => setAgreeOffer(resolveChecked(event))}
                                />
                            </label>
                            <label className="checkbox-row switch-wrapper">
                                <Typography.Body>
                                    Согласие на{" "}
                                    <a href="#" onClick={(e) => { e.preventDefault(); setIsPersonalConsentOpen(true); }}>
                                        обработку данных
                                    </a>
                                </Typography.Body>
                                <Switch
                                    checked={agreePersonal}
                                    onCheckedChange={(value) => setAgreePersonal(resolveChecked(value))}
                                    onChange={(event) => setAgreePersonal(resolveChecked(event))}
                                />
                            </label>
                            <Button className="button-primary" type="submit" disabled={loading}>
                                {loading ? <Loader2 className="animate-spin w-5 h-5" /> : "Подтвердить"}
                            </Button>
                            <Flex justify="center" style={{ marginTop: '1rem' }}>
                                <Typography.Body 
                                    style={{ 
                                        color: 'var(--color-primary-blue)', 
                                        cursor: 'pointer',
                                        textDecoration: 'underline',
                                        fontSize: '0.9rem'
                                    }}
                                    onClick={() => {
                                        const webApp = getWebApp();
                                        const forgotPasswordUrl = 'https://lk.haulz.pro/forgot-password';
                                        if (webApp && typeof webApp.openLink === 'function') {
                                            webApp.openLink(forgotPasswordUrl);
                                        } else {
                                            window.open(forgotPasswordUrl, '_blank', 'noopener,noreferrer');
                                        }
                                    }}
                                >
                                    Забыли пароль?
                                </Typography.Body>
                            </Flex>
                        </form>
                    )}
                    {error && (
                        <Flex align="center" className="login-error mt-4">
                            <AlertTriangle className="w-5 h-5 mr-2" />
                            <Typography.Body>{error}</Typography.Body>
                        </Flex>
                    )}
                    {isOfferOpen && (
                        <div className="modal-overlay" onClick={() => setIsOfferOpen(false)}>
                            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                                <div className="modal-header">
                                    <Button className="modal-close-button" onClick={() => setIsOfferOpen(false)} aria-label="Закрыть">
                                        <X size={20} />
                                    </Button>
                                </div>
                                <div style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", lineHeight: 1.45 }}>
                                    {PUBLIC_OFFER_TEXT}
                                </div>
                            </div>
                        </div>
                    )}
                    {isPersonalConsentOpen && (
                        <div className="modal-overlay" onClick={() => setIsPersonalConsentOpen(false)}>
                            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                                <div className="modal-header">
                                    <Button className="modal-close-button" onClick={() => setIsPersonalConsentOpen(false)} aria-label="Закрыть">
                                        <X size={20} />
                                    </Button>
                                </div>
                                <div style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", lineHeight: 1.45 }}>
                                    {PERSONAL_DATA_CONSENT_TEXT}
                                </div>
                            </div>
                        </div>
                    )}
                </Panel>
            </Container>
        );
    }

    return (
        <Container className={`app-container`}>
            <header className="app-header">
                <Flex align="center" justify="space-between" className="header-top-row">
                    <Flex align="center" className="header-auth-info" style={{ position: 'relative' }}>
                        {accounts.length > 1 ? (
                            <AccountSwitcher 
                                accounts={accounts}
                                activeAccountId={activeAccountId}
                                onSwitchAccount={handleSwitchAccount}
                            />
                        ) : (
                            <Flex align="center">
                        <UserIcon className="w-4 h-4 mr-2" />
                                <Typography.Body>{activeAccount?.customer || activeAccount?.login || 'Не выбран'}</Typography.Body>
                            </Flex>
                        )}
                    </Flex>
                    <Flex align="center" className="space-x-3">
                        <Button className="search-toggle-button" onClick={toggleTheme} title={theme === 'dark' ? 'Светлый режим' : 'Темный режим'} aria-label={theme === 'dark' ? 'Включить светлый режим' : 'Включить темный режим'}>
                            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </Button>
                        <Button className="search-toggle-button" onClick={() => { setIsSearchExpanded(!isSearchExpanded); if(isSearchExpanded) { handleSearch(''); setSearchText(''); } }}>
                            {isSearchExpanded ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
                        </Button>
                        <Button className="search-toggle-button" onClick={handleLogout} title="Выход" aria-label="Выйти">
                            <LogOut className="w-5 h-5" />
                        </Button>
                    </Flex>
                </Flex>
                <div className={`search-container ${isSearchExpanded ? 'expanded' : 'collapsed'}`}>
                    <Search className="w-5 h-5 text-theme-secondary flex-shrink-0 ml-1" />
                    <Input type="search" placeholder="Поиск..." className="search-input" value={searchText} onChange={(e) => { setSearchText(e.target.value); handleSearch(e.target.value); }} />
                    {searchText && <Button className="search-toggle-button" onClick={() => { setSearchText(''); handleSearch(''); }} aria-label="Очистить поиск"><X className="w-4 h-4" /></Button>}
                </div>
            </header>
            <div className="app-main">
                <div className="w-full max-w-4xl">
                    {showDashboard && activeTab === "dashboard" && auth && (
                        <DashboardPage
                            auth={auth}
                            onClose={() => {}}
                            onOpenCargoFilters={openCargoWithFilters}
                        />
                    )}
                    {showDashboard && activeTab === "cargo" && auth && (
                        <CargoPage
                            auth={auth}
                            searchText={searchText}
                            onOpenChat={openAiChatDeepLink}
                            onCustomerDetected={updateActiveAccountCustomer}
                            contextCargoNumber={contextCargoNumber}
                            onClearContextCargo={() => setContextCargoNumber(null)}
                            initialStatusFilter={cargoQuickFilters?.status}
                            onClearQuickFilters={() => setCargoQuickFilters(null)}
                        />
                    )}
                    {showDashboard && activeTab === "docs" && (
                        <div className="w-full p-8 text-center">
                            <Typography.Headline>Документы</Typography.Headline>
                            <Typography.Body className="text-theme-secondary">Раздел в разработке</Typography.Body>
                </div>
                    )}
                    {showDashboard && activeTab === "support" && (
                        <AiChatProfilePage
                            onBack={() => setActiveTab("cargo")}
                            auth={activeAccount ? { login: activeAccount.login, password: activeAccount.password } : null}
                            accountId={activeAccountId}
                            customer={activeAccount?.customer || null}
                            onOpenCargo={openCargoFromChat}
                            chatId={chatIdentity}
                            onOpenTelegramBot={openTelegramBotWithAccount}
                        />
                    )}
                    {showDashboard && activeTab === "profile" && (
                        <ProfilePage 
                            accounts={accounts}
                            activeAccountId={activeAccountId}
                            onSwitchAccount={handleSwitchAccount}
                            onAddAccount={handleAddAccount}
                            onRemoveAccount={handleRemoveAccount}
                            onOpenOffer={() => setIsOfferOpen(true)}
                            onOpenPersonalConsent={() => setIsPersonalConsentOpen(true)}
                            onOpenNotifications={openSecretPinModal}
                            onOpenCargo={openCargoFromChat}
                            onOpenTelegramBot={openTelegramBotWithAccount}
                            onUpdateAccount={handleUpdateAccount}
                        />
                    )}
                    {!showDashboard && activeTab === "cargo" && auth && (
                        <CargoPage
                            auth={auth}
                            searchText={searchText}
                            onOpenChat={openAiChatDeepLink}
                            onCustomerDetected={updateActiveAccountCustomer}
                            contextCargoNumber={contextCargoNumber}
                            onClearContextCargo={() => setContextCargoNumber(null)}
                            initialStatusFilter={cargoQuickFilters?.status}
                            onClearQuickFilters={() => setCargoQuickFilters(null)}
                        />
                    )}
                    {!showDashboard && (activeTab === "dashboard" || activeTab === "home") && auth && (
                        <DashboardPage
                            auth={auth}
                            onClose={() => {}}
                            onOpenCargoFilters={openCargoWithFilters}
                        />
                    )}
                    {!showDashboard && activeTab === "support" && auth && (
                        <AiChatProfilePage
                            onBack={() => setActiveTab("cargo")}
                            auth={activeAccount ? { login: activeAccount.login, password: activeAccount.password } : null}
                            accountId={activeAccountId}
                            customer={activeAccount?.customer || null}
                            onOpenCargo={openCargoFromChat}
                            chatId={chatIdentity}
                            onOpenTelegramBot={openTelegramBotWithAccount}
                        />
                    )}
                    {!showDashboard && activeTab === "profile" && (
                        <ProfilePage 
                            accounts={accounts}
                            activeAccountId={activeAccountId}
                            onSwitchAccount={handleSwitchAccount}
                            onAddAccount={handleAddAccount}
                            onRemoveAccount={handleRemoveAccount}
                            onOpenOffer={() => setIsOfferOpen(true)}
                            onOpenPersonalConsent={() => setIsPersonalConsentOpen(true)}
                            onOpenNotifications={openSecretPinModal}
                            onOpenCargo={openCargoFromChat}
                            onOpenTelegramBot={openTelegramBotWithAccount}
                            onUpdateAccount={handleUpdateAccount}
                        />
                    )}
            </div>
            </div>
            <TabBar 
                active={activeTab} 
                onChange={(tab) => {
                    if (showDashboard) {
                        if (tab === "home") {
                            // При клике на "Главная" переходим на дашборд, но не выходим из секретного режима
                            setActiveTab("dashboard");
                        } else if (tab === "cargo") {
                            // При клике на "Грузы" переходим на грузы, но остаемся в секретном режиме
                            setActiveTab("cargo");
                        } else if (tab === "support" && isMaxWebApp()) {
                            // MAX: поддержка через бота или тестовое сообщение
                            openSupportChat();
                        } else {
                            // Для других вкладок просто переключаемся, остаемся в секретном режиме
                            setActiveTab(tab);
                        }
                    } else {
                        // В обычном режиме "home" ведёт на дашборд
                        if (tab === "home") setActiveTab("dashboard");
                        else if (tab === "support" && isMaxWebApp()) {
                            openSupportChat();
                        } else setActiveTab(tab);
                    }
                }}
                // вход в секретный режим теперь через "Уведомления" в профиле
                showAllTabs={showDashboard}
            />

            {/* Оферта/Согласие должны открываться и из раздела Профиль */}
            {isOfferOpen && (
                <div className="modal-overlay" onClick={() => setIsOfferOpen(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <Typography.Headline style={{ fontSize: '1.1rem' }}>Публичная оферта</Typography.Headline>
                            <Button className="modal-close-button" onClick={() => setIsOfferOpen(false)} aria-label="Закрыть">
                                <X size={20} />
                            </Button>
                        </div>
                        <div style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", lineHeight: 1.45 }}>
                            {PUBLIC_OFFER_TEXT}
                        </div>
                    </div>
                </div>
            )}
            {isPersonalConsentOpen && (
                <div className="modal-overlay" onClick={() => setIsPersonalConsentOpen(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <Typography.Headline style={{ fontSize: '1.1rem' }}>Согласие на обработку персональных данных</Typography.Headline>
                            <Button className="modal-close-button" onClick={() => setIsPersonalConsentOpen(false)} aria-label="Закрыть">
                                <X size={20} />
                            </Button>
                        </div>
                        <div style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", lineHeight: 1.45 }}>
                            {PERSONAL_DATA_CONSENT_TEXT}
                        </div>
                    </div>
                </div>
            )}
            
            {/* Модальное окно для ввода пин-кода */}
            {showPinModal && (
                <div className="modal-overlay" onClick={() => { setShowPinModal(false); setPinCode(''); setPinError(false); }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <Button className="modal-close-button" onClick={() => { setShowPinModal(false); setPinCode(''); setPinError(false); }} aria-label="Закрыть">
                                <X size={20} />
                            </Button>
                        </div>
                        <form onSubmit={handlePinSubmit}>
                            <div style={{ marginBottom: '1rem' }}>
                                <Input
                                    type="password"
                                    className="login-input"
                                    placeholder=""
                                    value={pinCode}
                                    onChange={(e) => {
                                        setPinCode(e.target.value);
                                        setPinError(false);
                                    }}
                                    autoFocus
                                    maxLength={4}
                                    style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5rem' }}
                                />
                                {pinError && (
                                    <Typography.Body className="login-error" style={{ marginTop: '0.5rem', textAlign: 'center' }}>
                                        Неверный пин-код
                                    </Typography.Body>
                                )}
                            </div>
                            <Button className="button-primary" type="submit" style={{ width: '100%' }}>
                                Войти
                            </Button>
                        </form>
                    </div>
                </div>
            )}
            
            <ChatModal
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                userId={auth?.login || "anon"}
            />
        </Container>
    );
}
