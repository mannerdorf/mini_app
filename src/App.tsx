import React, { FormEvent, useEffect, useState, useCallback, useMemo, useRef, useLayoutEffect } from "react";
import {
    LogOut, Truck, Loader2, Check, X, Moon, Sun, Eye, EyeOff, AlertTriangle, Package, Calendar, Tag, Layers, Weight, Filter, Search, ChevronDown, User as UserIcon, Scale, RussianRuble, List, Download, Maximize,
    Home, FileText, MessageCircle, User, LayoutGrid, TrendingUp, TrendingDown, CornerUpLeft, ClipboardCheck, CreditCard, Minus, ArrowUp, ArrowDown, ArrowUpDown, Heart, Building2, Bell, Shield, Info, ArrowLeft, Plus, Trash2, MapPin, Phone, Mail, Share2, Mic, Square, Ship
} from "lucide-react";
import { createPortal } from "react-dom";
import { Button, Container, Flex, Grid, Input, Panel, Switch, Typography } from "@maxhub/max-ui";
import { ChatModal } from "./ChatModal";
import "./styles.css";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import {
    ensureOk,
    readJsonOrText,
    extractErrorMessage,
    extractCustomerFromPerevozki,
    extractInnFromPerevozki,
    getExistingInns,
    dedupeCustomersByInn,
} from "./utils";
import { getWebApp, isMaxWebApp, isMaxDocsEnabled } from "./webApp";
import { DOCUMENT_METHODS } from "./documentMethods";
// import { NotificationsPage } from "./pages/NotificationsPage"; // temporarily disabled
import { TapSwitch } from "./components/TapSwitch";
import type {
    Account, ApiError, AuthData, CargoItem, CargoStat, CompanyRow, CustomerOption,
    DateFilter, HaulzOffice, HeaderCompanyRow, HomePeriodFilter, PerevozkaTimelineStep,
    PerevozkiRole, ProfileView, StatusFilter, Tab,
} from "./types";

// --- CONFIGURATION ---
const PROXY_API_BASE_URL = '/api/perevozki';
const PROXY_API_GETCUSTOMERS_URL = '/api/getcustomers';
// GetPerevozki и Getcustomers — только для авторизации. Запрос данных перевозок — только GetPerevozki с DateB, DateE, INN (через PROXY_API_BASE_URL с auth.inn).
const PROXY_API_DOWNLOAD_URL = '/api/download';
const PROXY_API_SEND_DOC_URL = '/api/send-document';
const PROXY_API_GETPEREVOZKA_URL = '/api/getperevozka';

// --- CONSTANTS ---
const getTodayDate = () => new Date().toISOString().split('T')[0];
const getSixMonthsAgoDate = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6); 
    return d.toISOString().split('T')[0];
};
const DEFAULT_DATE_FROM = getSixMonthsAgoDate();
const DEFAULT_DATE_TO = getTodayDate();

/** Плановые сроки доставки (дней): MSK-KGD авто 7 / паром 20; KGD-MSK авто и паром 60 */
const AUTO_PLAN_DAYS = 7;
const FERRY_PLAN_DAYS = 20;
const KGD_MSK_PLAN_DAYS = 60;

function isFerry(item: CargoItem): boolean {
    return item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1;
}

function isRouteKgdMsk(item: CargoItem): boolean {
    return cityToCode(item.CitySender) === 'KGD' && cityToCode(item.CityReceiver) === 'MSK';
}

function getPlanDays(item: CargoItem): number {
    if (isRouteKgdMsk(item)) return KGD_MSK_PLAN_DAYS;
    return isFerry(item) ? FERRY_PLAN_DAYS : AUTO_PLAN_DAYS;
}

function getSlaInfo(item: CargoItem): { planDays: number; actualDays: number; onTime: boolean; delayDays: number } | null {
    const from = item?.DatePrih ? new Date(item.DatePrih).getTime() : NaN;
    const to = item?.DateVr ? new Date(item.DateVr).getTime() : NaN;
    if (isNaN(from) || isNaN(to)) return null;
    const actualDays = Math.round((to - from) / (24 * 60 * 60 * 1000));
    const planDays = getPlanDays(item);
    const onTime = actualDays <= planDays;
    const delayDays = Math.max(0, actualDays - planDays);
    return { planDays, actualDays, onTime, delayDays };
}

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
    let dateTo = getTodayDate();
    let dateFrom = getTodayDate();
    switch (filter) {
        case 'все': dateFrom = getSixMonthsAgoDate(); break;
        case 'сегодня': dateFrom = getTodayDate(); break;
        case 'вчера': (() => { const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); const d = yesterday.toISOString().split('T')[0]; dateFrom = d; dateTo = d; })(); break;
        case 'неделя': today.setDate(today.getDate() - 7); dateFrom = today.toISOString().split('T')[0]; break;
        case 'месяц': today.setMonth(today.getMonth() - 1); dateFrom = today.toISOString().split('T')[0]; break;
        case 'год': dateFrom = `${today.getFullYear()}-01-01`; break;
        default: break;
    }
    return { dateFrom, dateTo };
}

/** Вычисляет предыдущий период для сравнения (неделя/месяц/год/период) */
const getPreviousPeriodRange = (filter: DateFilter, currentFrom: string, currentTo: string): { dateFrom: string; dateTo: string } | null => {
    const today = new Date();
    let dateTo: string;
    let dateFrom: string;
    
    switch (filter) {
        case 'неделя': {
            // Предыдущая неделя: 7 дней назад от начала текущей недели
            const currentFromDate = new Date(currentFrom + 'T00:00:00');
            const prevWeekEnd = new Date(currentFromDate);
            prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
            const prevWeekStart = new Date(prevWeekEnd);
            prevWeekStart.setDate(prevWeekStart.getDate() - 6);
            dateFrom = prevWeekStart.toISOString().split('T')[0];
            dateTo = prevWeekEnd.toISOString().split('T')[0];
            break;
        }
        case 'месяц': {
            // Предыдущий месяц
            const currentFromDate = new Date(currentFrom + 'T00:00:00');
            const prevMonthEnd = new Date(currentFromDate);
            prevMonthEnd.setDate(0); // Последний день предыдущего месяца
            const prevMonthStart = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), 1);
            dateFrom = prevMonthStart.toISOString().split('T')[0];
            dateTo = prevMonthEnd.toISOString().split('T')[0];
            break;
        }
        case 'год': {
            // Предыдущий год
            const currentYear = new Date(currentFrom + 'T00:00:00').getFullYear();
            const prevYear = currentYear - 1;
            dateFrom = `${prevYear}-01-01`;
            dateTo = `${prevYear}-12-31`;
            break;
        }
        case 'период': {
            // Для кастомного периода: предыдущий период той же длительности
            const currentFromDate = new Date(currentFrom + 'T00:00:00');
            const currentToDate = new Date(currentTo + 'T00:00:00');
            const daysDiff = Math.ceil((currentToDate.getTime() - currentFromDate.getTime()) / (1000 * 60 * 60 * 24));
            const prevPeriodEnd = new Date(currentFromDate);
            prevPeriodEnd.setDate(prevPeriodEnd.getDate() - 1);
            const prevPeriodStart = new Date(prevPeriodEnd);
            prevPeriodStart.setDate(prevPeriodStart.getDate() - daysDiff);
            dateFrom = prevPeriodStart.toISOString().split('T')[0];
            dateTo = prevPeriodEnd.toISOString().split('T')[0];
            break;
        }
        default:
            return null; // Для 'сегодня', 'вчера', 'все' не считаем предыдущий период
    }
    
    return { dateFrom, dateTo };
}

const WEEKDAY_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'] as const;
const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'] as const;

const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return '-';
    try {
        const cleanDateString = dateString.split('T')[0];
        const date = new Date(cleanDateString);
        if (!isNaN(date.getTime())) {
            const dayShort = WEEKDAY_SHORT[date.getDay()] ?? '';
            return dayShort ? `${dayShort}, ${date.toLocaleDateString('ru-RU')}` : date.toLocaleDateString('ru-RU');
        }
    } catch { }
    return dateString;
};

/** Дата и время (день недели + DD.MM.YYYY, HH:mm) для статусов перевозки; withPlus — со знаком + перед временем (со 2-й строки) */
const formatDateTime = (dateString: string | undefined, withPlus?: boolean): string => {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
            const dayShort = WEEKDAY_SHORT[date.getDay()] ?? '';
            const d = dayShort ? `${dayShort}, ${date.toLocaleDateString('ru-RU')}` : date.toLocaleDateString('ru-RU');
            const t = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: undefined });
            return withPlus ? `${d}, +${t}` : `${d}, ${t}`;
        }
    } catch { }
    return dateString;
};

/** Только дата (день недели + DD.MM.YYYY) для колонки «Дата доставки» в статусах перевозки */
const formatTimelineDate = (dateString: string | undefined): string => {
    if (!dateString) return '—';
    try {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
            const dayShort = WEEKDAY_SHORT[date.getDay()] ?? '';
            return dayShort ? `${dayShort}, ${date.toLocaleDateString('ru-RU')}` : date.toLocaleDateString('ru-RU');
        }
    } catch { }
    return dateString;
};

/** Только время (HH:mm) для колонки «Время доставки» в статусах перевозки; withPlus — со знаком + */
const formatTimelineTime = (dateString: string | undefined, withPlus?: boolean): string => {
    if (!dateString) return '—';
    try {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
            const t = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: undefined });
            return withPlus ? `+${t}` : t;
        }
    } catch { }
    return '—';
};

const HOLIDAYS_MM_DD = new Set([
    "01-01", "01-02", "01-03", "01-04", "01-05", "01-06", "01-07", "01-08",
    "02-23", "03-08", "05-01", "05-09", "06-12", "11-04",
]);

const parseDateOnly = (dateString: string | undefined): Date | null => {
    if (!dateString) return null;
    let clean = dateString.split("T")[0].trim();
    const dayDateMatch = clean.match(/,\s*(\d{2}\.\d{2}\.\d{4})$/);
    if (dayDateMatch) clean = dayDateMatch[1];
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

const DAY_SHORT: Record<number, string> = { 0: "вс", 1: "пн", 2: "вт", 3: "ср", 4: "чт", 5: "пт", 6: "сб" };

const getDateInfo = (dateString: string | undefined) => {
    const date = parseDateOnly(dateString);
    if (!date) return { text: dateString || '-', dayShort: "", isWeekend: false, isHoliday: false };
    const day = date.getDay();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const yyyy = date.getFullYear();
    const dateOnly = `${dd}.${mm}.${yyyy}`;
    const key = `${mm}-${dd}`;
    const isWeekend = day === 0 || day === 6;
    const isHoliday = HOLIDAYS_MM_DD.has(key);
    const dayShort = DAY_SHORT[day] ?? "";
    return { text: dateOnly, dayShort, isWeekend, isHoliday };
};

const getDateTextColor = (dateString: string | undefined) => {
    const info = getDateInfo(dateString);
    return info.isHoliday || info.isWeekend ? "#ef4444" : "var(--color-text-secondary)";
};

/** День недели 1 раз; выходные и праздники — день недели красным */
const DateText = ({ value, className, style }: { value?: string; className?: string; style?: React.CSSProperties }) => {
    const info = getDateInfo(value);
    const isRedDay = info.isWeekend || info.isHoliday;
    return (
        <span className={className || undefined} style={style}>
            {info.dayShort ? (
                <>
                    <span style={isRedDay ? { color: "#ef4444" } : undefined}>{info.dayShort}</span>
                    {", "}
                    {info.text}
                </>
            ) : (
                info.text
            )}
        </span>
    );
};

const formatCurrency = (value: number | string | undefined, integers?: boolean): string => {
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === "")) return '-';
    const num = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
    if (isNaN(num)) return String(value);
    const rounded = integers ? Math.round(num) : num;
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: integers ? 0 : 2,
        maximumFractionDigits: integers ? 0 : 2,
    }).format(rounded);
};

/** Все города Калининградской области → KGD; все города Московской области → MSK */
const cityToCode = (city: string | number | undefined | null): string => {
    if (city === undefined || city === null) return '';
    const s = String(city).trim().toLowerCase();
    // Калининградская область: область, Калининград и города области
    if (/калининградская\s*область|калининград|кгд/.test(s)) return 'KGD';
    if (/советск|черняховск|балтийск|гусев|светлый|гурьевск|зеленоградск|светлогорск|пионерский|багратионовск|нестеров|озёрск|правдинск|полесск|лаврово|мамоново|янтарный/.test(s)) return 'KGD';
    // Московская область: область, Москва и города области
    if (/московская\s*область|москва|мск|msk/.test(s)) return 'MSK';
    if (/подольск|балашиха|химки|королёв|мытищи|люберцы|электросталь|коломна|одинцово|серпухов|орехово-зуево|раменское|жуковский|пушкино|сергиев\s*посад|воскресенск|лобня|клин|дубна|егорьевск|чехов|дмитров|ступино|ногинск|долгопрудный|реутов|андреевск|фрязино|троицк|ивантеевка|дзержинский|видное|красногорск|домодедово|железнодорожный|котельники/.test(s)) return 'MSK';
    return String(city).trim();
};

/** Убирает «ООО», «ИП», «(ИП)» из названия компании для отображения */
const stripOoo = (name: string | undefined | null): string => {
    if (!name || typeof name !== 'string') return name ?? '';
    return name
        .replace(/\s*ООО\s*«?/gi, ' ')
        .replace(/»?\s*ООО\s*/gi, ' ')
        .replace(/\s*\(\s*ИП\s*\)\s*/gi, ' ')
        .replace(/(^|\s)ИП(\s|$)/gi, '$1$2')
        .replace(/\s+/g, ' ')
        .trim() || name;
};

/** Транслитерация кириллицы в латиницу для имени файла при скачивании */
const TRANSLIT_MAP: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z',
    'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
    'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
};
const transliterateFilename = (fileName: string): string => {
    if (!fileName || typeof fileName !== 'string') return fileName || '';
    let out = '';
    for (let i = 0; i < fileName.length; i++) {
        const c = fileName[i];
        const lower = c.toLowerCase();
        if (TRANSLIT_MAP[lower] !== undefined) {
            out += c === c.toUpperCase() && c !== c.toLowerCase() ? TRANSLIT_MAP[lower].charAt(0).toUpperCase() + TRANSLIT_MAP[lower].slice(1) : TRANSLIT_MAP[lower];
        } else {
            out += c;
        }
    }
    return out;
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

const getPaymentFilterKey = (stateBill: string | undefined): 'unpaid' | 'cancelled' | 'paid' | 'partial' | 'unknown' => {
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

type BillStatusFilterKey = 'all' | ReturnType<typeof getPaymentFilterKey>;
const BILL_STATUS_MAP: Record<BillStatusFilterKey, string> = {
    all: 'Все',
    paid: 'Оплачен',
    unpaid: 'Не оплачен',
    partial: 'Частично',
    cancelled: 'Отменён',
    unknown: 'Не указан',
};

/** Статус «получена информация» — исключаем из отображения и фильтров */
const isReceivedInfoStatus = (s: string | undefined): boolean => {
    if (!s) return false;
    const l = normalizeStatus(s).toLowerCase();
    return /получена\s*информация|полученаинформация/.test(l) || (l.includes('получена') && l.includes('информация'));
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

/** Выпадающее меню поверх всего — рендер в document.body, чтобы не обрезалось контейнером с overflow */
function FilterDropdownPortal({ triggerRef, isOpen, children }: { triggerRef: React.RefObject<HTMLElement | null>; isOpen: boolean; children: React.ReactNode }) {
    const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
    useLayoutEffect(() => {
        if (!isOpen || !triggerRef.current) {
            setRect(null);
            return;
        }
        const el = triggerRef.current;
        const r = el.getBoundingClientRect();
        setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 160) });
    }, [isOpen, triggerRef]);
    if (!isOpen || !rect || typeof document === 'undefined') return null;
    return createPortal(
        <div className="filter-dropdown filter-dropdown-portal" style={{ top: rect.top, left: rect.left, minWidth: rect.width }}>
            {children}
        </div>,
        document.body
    );
}

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
        if (!auth?.login || !auth?.password) {
            setItems([]);
            setLoading(false);
            return;
        }
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
                    ...(auth.inn ? { inn: auth.inn } : {}),
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

    // При смене аккаунта — перезапрос данных под выбранным аккаунтом
    useEffect(() => {
        loadStats(apiDateRange.dateFrom, apiDateRange.dateTo);
    }, [apiDateRange, loadStats, auth]);

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

            {showSums && (
                <>
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
                </>
            )}

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
    showSums = true,
    useServiceRequest = false,
}: {
    auth: AuthData;
    onClose: () => void;
    onOpenCargoFilters: (filters: { status?: StatusFilter; search?: string }) => void;
    /** false = роль только отправитель/получатель, раздел с суммами недоступен */
    showSums?: boolean;
    /** служебный режим: запрос перевозок только по датам (без INN и Mode) */
    useServiceRequest?: boolean;
}) {
    const [items, setItems] = useState<CargoItem[]>([]);
    const [prevPeriodItems, setPrevPeriodItems] = useState<CargoItem[]>([]);
    const [prevPeriodLoading, setPrevPeriodLoading] = useState(false);
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
    const [dateDropdownMode, setDateDropdownMode] = useState<'main' | 'months'>('main');
    const [selectedMonthForFilter, setSelectedMonthForFilter] = useState<{ year: number; month: number } | null>(null);
    const monthLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const monthWasLongPressRef = useRef(false);
    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
    const [senderFilter, setSenderFilter] = useState<string>('');
    const [receiverFilter, setReceiverFilter] = useState<string>('');
    const [customerFilter, setCustomerFilter] = useState<string>('');
    const [billStatusFilter, setBillStatusFilter] = useState<BillStatusFilterKey>('all');
    const [typeFilter, setTypeFilter] = useState<'all' | 'ferry' | 'auto'>('all');
    const [routeFilter, setRouteFilter] = useState<'all' | 'MSK-KGD' | 'KGD-MSK'>('all');
    const [isSenderDropdownOpen, setIsSenderDropdownOpen] = useState(false);
    const [isReceiverDropdownOpen, setIsReceiverDropdownOpen] = useState(false);
    const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
    const [isBillStatusDropdownOpen, setIsBillStatusDropdownOpen] = useState(false);
    const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
    const [isRouteDropdownOpen, setIsRouteDropdownOpen] = useState(false);
    const dateButtonRef = useRef<HTMLDivElement>(null);
    const statusButtonRef = useRef<HTMLDivElement>(null);
    const senderButtonRef = useRef<HTMLDivElement>(null);
    const receiverButtonRef = useRef<HTMLDivElement>(null);
    const customerButtonRef = useRef<HTMLDivElement>(null);
    const billStatusButtonRef = useRef<HTMLDivElement>(null);
    const typeButtonRef = useRef<HTMLDivElement>(null);
    const routeButtonRef = useRef<HTMLDivElement>(null);
    const [slaDetailsOpen, setSlaDetailsOpen] = useState(false);
    
    // Chart type selector: деньги / вес / объём (при !showSums доступны только вес и объём)
    const [chartType, setChartType] = useState<'money' | 'paidWeight' | 'weight' | 'volume' | 'pieces'>(() => (showSums ? 'money' : 'paidWeight'));
    const [stripTab, setStripTab] = useState<'type' | 'sender' | 'receiver' | 'customer'>('type');
    /** true = показывать проценты, false = показывать в рублях/кг/м³/шт (по типу графика) */
    const [stripShowAsPercent, setStripShowAsPercent] = useState(true);
    /** Раскрытая строка в таблице «Перевозки вне SLA»: по клику показываем статусы в виде таблицы */
    const [expandedSlaCargoNumber, setExpandedSlaCargoNumber] = useState<string | null>(null);
    const [expandedSlaItem, setExpandedSlaItem] = useState<CargoItem | null>(null);
    const [slaTimelineSteps, setSlaTimelineSteps] = useState<PerevozkaTimelineStep[] | null>(null);
    const [slaTimelineLoading, setSlaTimelineLoading] = useState(false);
    const [slaTimelineError, setSlaTimelineError] = useState<string | null>(null);
    /** Сортировка таблицы «Перевозки вне SLA»: колонка и направление */
    const [slaTableSortColumn, setSlaTableSortColumn] = useState<string | null>(null);
    const [slaTableSortOrder, setSlaTableSortOrder] = useState<'asc' | 'desc'>('asc');

    const handleSlaTableSort = (column: string) => {
        if (slaTableSortColumn === column) {
            setSlaTableSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        } else {
            setSlaTableSortColumn(column);
            setSlaTableSortOrder('asc');
        }
    };

    const sortOutOfSlaRows = <T extends { item: CargoItem; sla: NonNullable<ReturnType<typeof getSlaInfo>> }>(rows: T[]): T[] => {
        if (!slaTableSortColumn) return rows;
        const order = slaTableSortOrder === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            let va: string | number;
            let vb: string | number;
            switch (slaTableSortColumn) {
                case 'number': va = (a.item.Number ?? ''); vb = (b.item.Number ?? ''); break;
                case 'date': va = new Date(a.item.DatePrih || 0).getTime(); vb = new Date(b.item.DatePrih || 0).getTime(); break;
                case 'status': va = normalizeStatus(a.item.State) || ''; vb = normalizeStatus(b.item.State) || ''; break;
                case 'customer': va = stripOoo((a.item.Customer ?? (a.item as any).customer) ?? ''); vb = stripOoo((b.item.Customer ?? (b.item as any).customer) ?? ''); break;
                case 'mest': va = Number(a.item.Mest) || 0; vb = Number(b.item.Mest) || 0; break;
                case 'pw': va = Number(a.item.PW) || 0; vb = Number(b.item.PW) || 0; break;
                case 'sum': va = Number(a.item.Sum) || 0; vb = Number(b.item.Sum) || 0; break;
                case 'days': va = a.sla.actualDays; vb = b.sla.actualDays; break;
                case 'plan': va = a.sla.planDays; vb = b.sla.planDays; break;
                case 'delay': va = a.sla.delayDays; vb = b.sla.delayDays; break;
                default: return 0;
            }
            const cmp = typeof va === 'string' && typeof vb === 'string'
                ? va.localeCompare(vb)
                : (va < vb ? -1 : va > vb ? 1 : 0);
            return cmp * order;
        });
    };

    // При отключении раздела сумм (роль отправитель/получатель) переключаем тип графика с денег на вес
    useEffect(() => {
        if (!showSums && chartType === 'money') setChartType('paidWeight');
    }, [showSums]);

    // При выключении служебного режима сбрасываем вкладку «Заказчик»
    useEffect(() => {
        if (!useServiceRequest && stripTab === 'customer') setStripTab('type');
    }, [useServiceRequest, stripTab]);

    // Загрузка статусов перевозки при раскрытии строки в таблице «Перевозки вне SLA»
    useEffect(() => {
        if (!expandedSlaCargoNumber || !expandedSlaItem || !auth?.login || !auth?.password) {
            setSlaTimelineSteps(null);
            setSlaTimelineError(null);
            return;
        }
        let cancelled = false;
        setSlaTimelineLoading(true);
        setSlaTimelineError(null);
        fetchPerevozkaTimeline(auth, expandedSlaCargoNumber, expandedSlaItem)
            .then((steps) => { if (!cancelled) setSlaTimelineSteps(steps); })
            .catch((e: any) => { if (!cancelled) setSlaTimelineError(e?.message || 'Не удалось загрузить статусы'); })
            .finally(() => { if (!cancelled) setSlaTimelineLoading(false); });
        return () => { cancelled = true; };
    }, [expandedSlaCargoNumber, expandedSlaItem, auth?.login, auth?.password]);

    const unpaidCount = useMemo(() => {
        return items.filter(item => !isReceivedInfoStatus(item.State) && getPaymentFilterKey(item.StateBill) === "unpaid").length;
    }, [items]);

    const readyCount = useMemo(() => {
        return items.filter(item => !isReceivedInfoStatus(item.State) && getFilterKeyByStatus(item.State) === "ready").length;
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

    const apiDateRange = useMemo(() => {
        if (dateFilter === "период") return { dateFrom: customDateFrom, dateTo: customDateTo };
        if (dateFilter === "месяц" && selectedMonthForFilter) {
            const { year, month } = selectedMonthForFilter;
            const pad = (n: number) => String(n).padStart(2, '0');
            const lastDay = new Date(year, month, 0).getDate();
            return {
                dateFrom: `${year}-${pad(month)}-01`,
                dateTo: `${year}-${pad(month)}-${pad(lastDay)}`,
            };
        }
        return getDateRange(dateFilter);
    }, [dateFilter, customDateFrom, customDateTo, selectedMonthForFilter]);
    
    const loadCargo = useCallback(async (dateFrom: string, dateTo: string) => {
        if (!auth?.login || !auth?.password) {
            setItems([]);
            setLoading(false);
            setError(null);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const body: Record<string, unknown> = {
                login: auth.login,
                password: auth.password,
                dateFrom,
                dateTo,
            };
            if (!useServiceRequest && auth.inn) body.inn = auth.inn;
            if (useServiceRequest) body.serviceMode = true;
            const res = await fetch(PROXY_API_BASE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
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
    }, [auth, useServiceRequest]);

    // Загрузка данных для предыдущего периода (только в служебном режиме)
    const loadPrevPeriodCargo = useCallback(async (dateFrom: string, dateTo: string) => {
        if (!auth?.login || !auth?.password || !useServiceRequest) {
            setPrevPeriodItems([]);
            return;
        }
        setPrevPeriodLoading(true);
        try {
            const body: Record<string, unknown> = {
                login: auth.login,
                password: auth.password,
                dateFrom,
                dateTo,
                serviceMode: true,
            };
            const res = await fetch(PROXY_API_BASE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            await ensureOk(res, "Ошибка загрузки данных предыдущего периода");
            const data = await res.json();
            const list = Array.isArray(data) ? data : data.items || [];
            setPrevPeriodItems(list.map((item: any) => ({
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
            console.error("Ошибка загрузки предыдущего периода:", e);
            setPrevPeriodItems([]);
        } finally {
            setPrevPeriodLoading(false);
        }
    }, [auth, useServiceRequest]);

    // Всегда грузим данные по текущему выбранному аккаунту; при смене аккаунта или служебного режима — перезапрос
    useEffect(() => {
        loadCargo(apiDateRange.dateFrom, apiDateRange.dateTo);
    }, [apiDateRange, loadCargo, auth, useServiceRequest]);

    // Загрузка данных предыдущего периода (только в служебном режиме)
    useEffect(() => {
        if (!useServiceRequest) {
            setPrevPeriodItems([]);
            return;
        }
        const prevRange = getPreviousPeriodRange(dateFilter, apiDateRange.dateFrom, apiDateRange.dateTo);
        if (prevRange) {
            loadPrevPeriodCargo(prevRange.dateFrom, prevRange.dateTo);
        } else {
            setPrevPeriodItems([]);
        }
    }, [useServiceRequest, dateFilter, apiDateRange, loadPrevPeriodCargo]);

    const uniqueSenders = useMemo(() => [...new Set(items.map(i => (i.Sender ?? '').trim()).filter(Boolean))].sort(), [items]);
    const uniqueReceivers = useMemo(() => [...new Set(items.map(i => (i.Receiver ?? (i as any).receiver ?? '').trim()).filter(Boolean))].sort(), [items]);
    const uniqueCustomers = useMemo(() => [...new Set(items.map(i => (i.Customer ?? (i as any).customer ?? '').trim()).filter(Boolean))].sort(), [items]);
    
    // Фильтрация
    const filteredItems = useMemo(() => {
        let res = items.filter(i => !isReceivedInfoStatus(i.State));
        if (statusFilter === 'favorites') {
            // Фильтр избранных (если нужно)
            const favorites = JSON.parse(localStorage.getItem('haulz.favorites') || '[]') as string[];
            res = res.filter(i => i.Number && favorites.includes(i.Number));
        } else if (statusFilter !== 'all') {
            res = res.filter(i => getFilterKeyByStatus(i.State) === statusFilter);
        }
        if (senderFilter) res = res.filter(i => (i.Sender ?? '').trim() === senderFilter);
        if (receiverFilter) res = res.filter(i => (i.Receiver ?? (i as any).receiver ?? '').trim() === receiverFilter);
        if (customerFilter) res = res.filter(i => (i.Customer ?? (i as any).customer ?? '').trim() === customerFilter);
        if (billStatusFilter !== 'all') res = res.filter(i => getPaymentFilterKey(i.StateBill) === billStatusFilter);
        if (typeFilter === 'ferry') res = res.filter(i => i?.AK === true || i?.AK === 'true' || i?.AK === '1' || i?.AK === 1);
        if (typeFilter === 'auto') res = res.filter(i => !(i?.AK === true || i?.AK === 'true' || i?.AK === '1' || i?.AK === 1));
        if (routeFilter === 'MSK-KGD') res = res.filter(i => cityToCode(i.CitySender) === 'MSK' && cityToCode(i.CityReceiver) === 'KGD');
        if (routeFilter === 'KGD-MSK') res = res.filter(i => cityToCode(i.CitySender) === 'KGD' && cityToCode(i.CityReceiver) === 'MSK');
        return res;
    }, [items, statusFilter, senderFilter, receiverFilter, customerFilter, billStatusFilter, typeFilter, routeFilter]);

    /** Фильтрация данных предыдущего периода (те же фильтры, что и для текущего) */
    const filteredPrevPeriodItems = useMemo(() => {
        if (!useServiceRequest || prevPeriodItems.length === 0) return [];
        let res = prevPeriodItems.filter(i => !isReceivedInfoStatus(i.State));
        if (statusFilter === 'favorites') {
            const favorites = JSON.parse(localStorage.getItem('haulz.favorites') || '[]') as string[];
            res = res.filter(i => i.Number && favorites.includes(i.Number));
        } else if (statusFilter !== 'all') {
            res = res.filter(i => getFilterKeyByStatus(i.State) === statusFilter);
        }
        if (senderFilter) res = res.filter(i => (i.Sender ?? '').trim() === senderFilter);
        if (receiverFilter) res = res.filter(i => (i.Receiver ?? (i as any).receiver ?? '').trim() === receiverFilter);
        if (customerFilter) res = res.filter(i => (i.Customer ?? (i as any).customer ?? '').trim() === customerFilter);
        if (billStatusFilter !== 'all') res = res.filter(i => getPaymentFilterKey(i.StateBill) === billStatusFilter);
        if (typeFilter === 'ferry') res = res.filter(i => i?.AK === true || i?.AK === 'true' || i?.AK === '1' || i?.AK === 1);
        if (typeFilter === 'auto') res = res.filter(i => !(i?.AK === true || i?.AK === 'true' || i?.AK === '1' || i?.AK === 1));
        if (routeFilter === 'MSK-KGD') res = res.filter(i => cityToCode(i.CitySender) === 'MSK' && cityToCode(i.CityReceiver) === 'KGD');
        if (routeFilter === 'KGD-MSK') res = res.filter(i => cityToCode(i.CitySender) === 'KGD' && cityToCode(i.CityReceiver) === 'MSK');
        return res;
    }, [prevPeriodItems, useServiceRequest, statusFilter, senderFilter, receiverFilter, customerFilter, billStatusFilter, typeFilter, routeFilter]);
    
    // Подготовка данных для графиков (группировка по датам)
    const chartData = useMemo(() => {
        const dataMap = new Map<string, { date: string; sum: number; pw: number; w: number; mest: number; vol: number }>();
        
        filteredItems.forEach(item => {
            if (!item.DatePrih) return;
            const dateKey = item.DatePrih.split('T')[0];
            const displayDate = formatDate(item.DatePrih);
            if (!dateKey || displayDate === '-') return;
            const existing = dataMap.get(dateKey) || { date: displayDate, dateKey, sum: 0, pw: 0, w: 0, mest: 0, vol: 0 };
            existing.sum += typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
            existing.pw += typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
            existing.w += typeof item.W === 'string' ? parseFloat(item.W) || 0 : (item.W || 0);
            existing.mest += typeof item.Mest === 'string' ? parseFloat(item.Mest) || 0 : (item.Mest || 0);
            existing.vol += typeof item.Value === 'string' ? parseFloat(item.Value) || 0 : (item.Value || 0);
            dataMap.set(dateKey, existing);
        });
        return Array.from(dataMap.values()).sort((a, b) => (a.dateKey || a.date).localeCompare(b.dateKey || b.date));
    }, [filteredItems]);

    const DIAGRAM_COLORS = ['#06b6d4', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#3b82f6', '#ef4444', '#84cc16'];
    const stripTotals = useMemo(() => {
        let sum = 0, pw = 0, w = 0, vol = 0, mest = 0;
        filteredItems.forEach(item => {
            sum += typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
            pw += typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
            w += typeof item.W === 'string' ? parseFloat(item.W) || 0 : (item.W || 0);
            vol += typeof item.Value === 'string' ? parseFloat(item.Value) || 0 : (item.Value || 0);
            mest += typeof item.Mest === 'string' ? parseFloat(item.Mest) || 0 : (item.Mest || 0);
        });
        return { sum, pw, w, vol, mest };
    }, [filteredItems]);
    const getValForChart = useCallback((item: CargoItem) => {
        if (chartType === 'money') return typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
        if (chartType === 'paidWeight') return typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
        if (chartType === 'weight') return typeof item.W === 'string' ? parseFloat(item.W) || 0 : (item.W || 0);
        if (chartType === 'pieces') return typeof item.Mest === 'string' ? parseFloat(item.Mest) || 0 : (item.Mest || 0);
        return typeof item.Value === 'string' ? parseFloat(item.Value) || 0 : (item.Value || 0);
    }, [chartType]);

    const stripDiagramByType = useMemo(() => {
        let autoVal = 0, ferryVal = 0;
        filteredItems.forEach(item => {
            const v = getValForChart(item);
            if (item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1) ferryVal += v;
            else autoVal += v;
        });
        let autoPrev = 0, ferryPrev = 0;
        const hasPrev = useServiceRequest && filteredPrevPeriodItems.length > 0;
        if (hasPrev) {
            filteredPrevPeriodItems.forEach(item => {
                const v = getValForChart(item);
                if (item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1) ferryPrev += v;
                else autoPrev += v;
            });
        }
        const total = autoVal + ferryVal || 1;
        const dynamics = (cur: number, prev: number): number | null => {
            if (!hasPrev) return null;
            if (prev === 0) return cur > 0 ? 100 : null;
            return Math.round(((cur - prev) / prev) * 100);
        };
        return [
            { label: 'Авто', value: autoVal, percent: Math.round((autoVal / total) * 100), color: DIAGRAM_COLORS[0], dynamics: dynamics(autoVal, autoPrev) },
            { label: 'Паром', value: ferryVal, percent: Math.round((ferryVal / total) * 100), color: DIAGRAM_COLORS[1], dynamics: dynamics(ferryVal, ferryPrev) },
        ];
    }, [filteredItems, filteredPrevPeriodItems, useServiceRequest, chartType, getValForChart]);
    const slaStats = useMemo(() => {
        const withSla = filteredItems.map(i => getSlaInfo(i)).filter((s): s is NonNullable<ReturnType<typeof getSlaInfo>> => s != null);
        const total = withSla.length;
        const onTime = withSla.filter(s => s.onTime).length;
        const delayed = withSla.filter(s => !s.onTime);
        const avgDelay = delayed.length > 0
            ? Math.round(delayed.reduce((sum, s) => sum + s.delayDays, 0) / delayed.length)
            : 0;
        // Мин/макс/среднее только по неотрицательным срокам доставки (ошибки дат дают отрицательные значения)
        const actualDaysValid = withSla.map(s => s.actualDays).filter(d => d >= 0);
        const minDays = actualDaysValid.length ? Math.min(...actualDaysValid) : 0;
        const maxDays = actualDaysValid.length ? Math.max(...actualDaysValid) : 0;
        const avgDays = actualDaysValid.length ? Math.round(actualDaysValid.reduce((a, b) => a + b, 0) / actualDaysValid.length) : 0;
        return { total, onTime, percentOnTime: total ? Math.round((onTime / total) * 100) : 0, avgDelay, minDays, maxDays, avgDays };
    }, [filteredItems]);

    const slaStatsByType = useMemo(() => {
        const autoItems = filteredItems.filter(i => !isFerry(i));
        const ferryItems = filteredItems.filter(i => isFerry(i));
        const calc = (arr: CargoItem[]) => {
            const withSla = arr.map(i => getSlaInfo(i)).filter((s): s is NonNullable<ReturnType<typeof getSlaInfo>> => s != null);
            const total = withSla.length;
            const onTime = withSla.filter(s => s.onTime).length;
            const delayed = withSla.filter(s => !s.onTime);
            const avgDelay = delayed.length > 0 ? Math.round(delayed.reduce((sum, s) => sum + s.delayDays, 0) / delayed.length) : 0;
            return { total, onTime, percentOnTime: total ? Math.round((onTime / total) * 100) : 0, avgDelay };
        };
        return { auto: calc(autoItems), ferry: calc(ferryItems) };
    }, [filteredItems]);

    /** Перевозки вне SLA по типу (для таблицы в подробностях, только в служебном режиме) */
    const outOfSlaByType = useMemo(() => {
        const withSla = filteredItems
            .map(i => ({ item: i, sla: getSlaInfo(i) }))
            .filter((x): x is { item: CargoItem; sla: NonNullable<ReturnType<typeof getSlaInfo>> } => x.sla != null && !x.sla.onTime);
        return {
            auto: withSla.filter(x => !isFerry(x.item)),
            ferry: withSla.filter(x => isFerry(x.item)),
        };
    }, [filteredItems]);

    const sortedOutOfSlaAuto = useMemo(() => sortOutOfSlaRows(outOfSlaByType.auto), [outOfSlaByType.auto, slaTableSortColumn, slaTableSortOrder]);
    const sortedOutOfSlaFerry = useMemo(() => sortOutOfSlaRows(outOfSlaByType.ferry), [outOfSlaByType.ferry, slaTableSortColumn, slaTableSortOrder]);

    const slaTrend = useMemo(() => {
        const withSla = filteredItems
            .map(i => ({ item: i, sla: getSlaInfo(i) }))
            .filter((x): x is { item: CargoItem; sla: NonNullable<ReturnType<typeof getSlaInfo>> } => x.sla != null);
        if (withSla.length < 4) return null;
        const sorted = [...withSla].sort((a, b) => (new Date(a.item.DateVr || 0).getTime()) - (new Date(b.item.DateVr || 0).getTime()));
        const mid = Math.floor(sorted.length / 2);
        const first = sorted.slice(0, mid);
        const second = sorted.slice(mid);
        const p1 = first.length ? Math.round((first.filter(x => x.sla.onTime).length / first.length) * 100) : 0;
        const p2 = second.length ? Math.round((second.filter(x => x.sla.onTime).length / second.length) * 100) : 0;
        if (p2 > p1) return 'up';
        if (p2 < p1) return 'down';
        return null;
    }, [filteredItems]);

    const stripDiagramBySender = useMemo(() => {
        const map = new Map<string, number>();
        const prevMap = new Map<string, number>();
        filteredItems.forEach(item => {
            const key = (item.Sender ?? '').trim() || '—';
            map.set(key, (map.get(key) || 0) + getValForChart(item));
        });
        const hasPrev = useServiceRequest && filteredPrevPeriodItems.length > 0;
        if (hasPrev) {
            filteredPrevPeriodItems.forEach(item => {
                const key = (item.Sender ?? '').trim() || '—';
                prevMap.set(key, (prevMap.get(key) || 0) + getValForChart(item));
            });
        }
        const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
        return [...map.entries()]
            .map(([name, value], i) => {
                const prevVal = prevMap.get(name) ?? 0;
                const dynamics = hasPrev ? (prevVal === 0 ? (value > 0 ? 100 : null) : Math.round(((value - prevVal) / prevVal) * 100)) : null;
                return { name: stripOoo(name), value, percent: Math.round((value / total) * 100), color: DIAGRAM_COLORS[i % DIAGRAM_COLORS.length], dynamics };
            })
            .sort((a, b) => b.value - a.value);
    }, [filteredItems, filteredPrevPeriodItems, useServiceRequest, chartType, getValForChart]);
    const stripDiagramByReceiver = useMemo(() => {
        const map = new Map<string, number>();
        const prevMap = new Map<string, number>();
        filteredItems.forEach(item => {
            const key = (item.Receiver ?? (item as any).receiver ?? '').trim() || '—';
            map.set(key, (map.get(key) || 0) + getValForChart(item));
        });
        const hasPrev = useServiceRequest && filteredPrevPeriodItems.length > 0;
        if (hasPrev) {
            filteredPrevPeriodItems.forEach(item => {
                const key = (item.Receiver ?? (item as any).receiver ?? '').trim() || '—';
                prevMap.set(key, (prevMap.get(key) || 0) + getValForChart(item));
            });
        }
        const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
        return [...map.entries()]
            .map(([name, value], i) => {
                const prevVal = prevMap.get(name) ?? 0;
                const dynamics = hasPrev ? (prevVal === 0 ? (value > 0 ? 100 : null) : Math.round(((value - prevVal) / prevVal) * 100)) : null;
                return { name: stripOoo(name), value, percent: Math.round((value / total) * 100), color: DIAGRAM_COLORS[i % DIAGRAM_COLORS.length], dynamics };
            })
            .sort((a, b) => b.value - a.value);
    }, [filteredItems, filteredPrevPeriodItems, useServiceRequest, chartType, getValForChart]);
    const stripDiagramByCustomer = useMemo(() => {
        const map = new Map<string, number>();
        const prevMap = new Map<string, number>();
        filteredItems.forEach(item => {
            const key = (item.Customer ?? (item as any).customer ?? '').trim() || '—';
            map.set(key, (map.get(key) || 0) + getValForChart(item));
        });
        const hasPrev = useServiceRequest && filteredPrevPeriodItems.length > 0;
        if (hasPrev) {
            filteredPrevPeriodItems.forEach(item => {
                const key = (item.Customer ?? (item as any).customer ?? '').trim() || '—';
                prevMap.set(key, (prevMap.get(key) || 0) + getValForChart(item));
            });
        }
        const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
        return [...map.entries()]
            .map(([name, value], i) => {
                const prevVal = prevMap.get(name) ?? 0;
                const dynamics = hasPrev ? (prevVal === 0 ? (value > 0 ? 100 : null) : Math.round(((value - prevVal) / prevVal) * 100)) : null;
                return { name: stripOoo(name), value, percent: Math.round((value / total) * 100), color: DIAGRAM_COLORS[i % DIAGRAM_COLORS.length], dynamics };
            })
            .sort((a, b) => b.value - a.value);
    }, [filteredItems, filteredPrevPeriodItems, useServiceRequest, chartType, getValForChart]);

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
                                    
                                    {/* Дата вертикально под столбцом: день 1 раз, выходные/праздники — красным */}
                                    <text
                                        x={x + barWidth / 2}
                                        y={chartHeight - paddingBottom + 20}
                                        fontSize="10"
                                        fill={getDateTextColor((d as { dateKey?: string }).dateKey || d.date)}
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
    
    const formatStripValue = (): string => {
        if (chartType === 'money') return `${Math.round(stripTotals.sum || 0).toLocaleString('ru-RU')} ₽`;
        if (chartType === 'paidWeight') return `${Math.round(stripTotals.pw || 0).toLocaleString('ru-RU')} кг`;
        if (chartType === 'weight') return `${Math.round(stripTotals.w || 0).toLocaleString('ru-RU')} кг`;
        if (chartType === 'pieces') return `${Math.round(stripTotals.mest || 0).toLocaleString('ru-RU')} шт`;
        const vol = Number(stripTotals.vol);
        return `${(isNaN(vol) ? 0 : vol).toFixed(2).replace('.', ',')} м³`;
    };

    /** Тренд период к периоду: текущий период vs предыдущий период (только в служебном режиме) */
    const periodToPeriodTrend = useMemo(() => {
        if (!useServiceRequest || filteredPrevPeriodItems.length === 0) return null;
        
        const getVal = (item: CargoItem) => {
            if (chartType === 'money') return typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
            if (chartType === 'paidWeight') return typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
            if (chartType === 'weight') return typeof item.W === 'string' ? parseFloat(item.W) || 0 : (item.W || 0);
            if (chartType === 'pieces') return typeof item.Mest === 'string' ? parseFloat(item.Mest) || 0 : (item.Mest || 0);
            return typeof item.Value === 'string' ? parseFloat(item.Value) || 0 : (item.Value || 0);
        };
        
        const currentVal = filteredItems.reduce((acc, item) => acc + getVal(item), 0);
        const prevVal = filteredPrevPeriodItems.reduce((acc, item) => acc + getVal(item), 0);
        
        if (prevVal === 0) return currentVal > 0 ? { direction: 'up', percent: 100 } : null;
        
        const percent = Math.round(((currentVal - prevVal) / prevVal) * 100);
        return {
            direction: currentVal > prevVal ? 'up' : currentVal < prevVal ? 'down' : null,
            percent: Math.abs(percent),
        };
    }, [useServiceRequest, filteredItems, filteredPrevPeriodItems, chartType]);

    /** Тренд по выбранной метрике: первая половина периода vs вторая половина */
    const stripTrend = useMemo(() => {
        if (chartData.length < 4) return null;
        const mid = Math.floor(chartData.length / 2);
        const firstHalf = chartData.slice(0, mid);
        const secondHalf = chartData.slice(mid);
        const getVal = (d: { sum: number; pw: number; w: number; mest: number; vol: number }) => {
            if (chartType === 'money') return d.sum;
            if (chartType === 'paidWeight') return d.pw;
            if (chartType === 'weight') return d.w;
            if (chartType === 'pieces') return d.mest;
            return d.vol;
        };
        const v1 = firstHalf.reduce((acc, d) => acc + getVal(d), 0);
        const v2 = secondHalf.reduce((acc, d) => acc + getVal(d), 0);
        if (v2 > v1) return 'up';
        if (v2 < v1) return 'down';
        return null;
    }, [chartData, chartType]);

    if (!auth?.login || !auth?.password) {
        return (
            <div className="w-full p-4">
                <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Нет доступа к дашборду. Выберите аккаунт в профиле.</Typography.Body>
            </div>
        );
    }

    return (
        <div className="w-full">
            {/* Закреплённый блок: фильтры над дашбордом */}
            <div className="cargo-page-sticky-header" style={{ marginBottom: '1rem' }}>
            <div className="filters-container filters-row-scroll">
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={dateButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsDateDropdownOpen(!isDateDropdownOpen); setDateDropdownMode('main'); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Дата: {dateFilter === 'период' ? 'Период' : dateFilter === 'месяц' && selectedMonthForFilter ? `${MONTH_NAMES[selectedMonthForFilter.month - 1]} ${selectedMonthForFilter.year}` : dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1)} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={dateButtonRef} isOpen={isDateDropdownOpen}>
                        {dateDropdownMode === 'months' ? (
                            <>
                                <div className="dropdown-item" onClick={() => setDateDropdownMode('main')} style={{ fontWeight: 600 }}>
                                    ← Назад
                                </div>
                                {MONTH_NAMES.map((name, i) => (
                                    <div
                                        key={i}
                                        className="dropdown-item"
                                        onClick={() => {
                                            const year = new Date().getFullYear();
                                            setDateFilter('месяц');
                                            setSelectedMonthForFilter({ year, month: i + 1 });
                                            setIsDateDropdownOpen(false);
                                            setDateDropdownMode('main');
                                        }}
                                    >
                                        <Typography.Body>{name} {new Date().getFullYear()}</Typography.Body>
                                    </div>
                                ))}
                            </>
                        ) : (
                            ['сегодня', 'вчера', 'неделя', 'месяц', 'год', 'период'].map(key => {
                                const isMonth = key === 'месяц';
                                return (
                                    <div
                                        key={key}
                                        className="dropdown-item"
                                        title={isMonth ? 'Клик — текущий месяц; удерживайте — выбор месяца' : undefined}
                                        onPointerDown={isMonth ? () => {
                                            monthWasLongPressRef.current = false;
                                            monthLongPressTimerRef.current = setTimeout(() => {
                                                monthLongPressTimerRef.current = null;
                                                monthWasLongPressRef.current = true;
                                                setDateDropdownMode('months');
                                            }, 500);
                                        } : undefined}
                                        onPointerUp={isMonth ? () => {
                                            if (monthLongPressTimerRef.current) {
                                                clearTimeout(monthLongPressTimerRef.current);
                                                monthLongPressTimerRef.current = null;
                                            }
                                        } : undefined}
                                        onPointerLeave={isMonth ? () => {
                                            if (monthLongPressTimerRef.current) {
                                                clearTimeout(monthLongPressTimerRef.current);
                                                monthLongPressTimerRef.current = null;
                                            }
                                        } : undefined}
                                        onClick={() => {
                                            if (isMonth && monthWasLongPressRef.current) {
                                                monthWasLongPressRef.current = false;
                                                return;
                                            }
                                            if (key === 'период') {
                                                let r: { dateFrom: string; dateTo: string };
                                                if (dateFilter === "период") {
                                                    r = { dateFrom: customDateFrom, dateTo: customDateTo };
                                                } else if (dateFilter === "месяц" && selectedMonthForFilter) {
                                                    const { year, month } = selectedMonthForFilter;
                                                    const pad = (n: number) => String(n).padStart(2, '0');
                                                    const lastDay = new Date(year, month, 0).getDate();
                                                    r = { dateFrom: `${year}-${pad(month)}-01`, dateTo: `${year}-${pad(month)}-${pad(lastDay)}` };
                                                } else {
                                                    r = getDateRange(dateFilter);
                                                }
                                                setCustomDateFrom(r.dateFrom);
                                                setCustomDateTo(r.dateTo);
                                            }
                                            setDateFilter(key as any);
                                            if (key === 'месяц') setSelectedMonthForFilter(null);
                                            setIsDateDropdownOpen(false);
                                            if (key === 'период') setIsCustomModalOpen(true);
                                        }}
                                    >
                                        <Typography.Body>{key === 'год' ? 'Год' : key.charAt(0).toUpperCase() + key.slice(1)}</Typography.Body>
                                    </div>
                                );
                            })
                        )}
                    </FilterDropdownPortal>
                </div>
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={statusButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsStatusDropdownOpen(!isStatusDropdownOpen); setIsDateDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Статус: {STATUS_MAP[statusFilter]} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={statusButtonRef} isOpen={isStatusDropdownOpen}>
                        {Object.keys(STATUS_MAP).map(key => (
                            <div key={key} className="dropdown-item" onClick={() => { setStatusFilter(key as any); setIsStatusDropdownOpen(false); }}>
                                <Typography.Body>{STATUS_MAP[key as StatusFilter]}</Typography.Body>
                            </div>
                        ))}
                    </FilterDropdownPortal>
                </div>
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={senderButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsSenderDropdownOpen(!isSenderDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Отправитель: {senderFilter ? stripOoo(senderFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={senderButtonRef} isOpen={isSenderDropdownOpen}>
                        <div className="dropdown-item" onClick={() => { setSenderFilter(''); setIsSenderDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        {uniqueSenders.map(s => (
                            <div key={s} className="dropdown-item" onClick={() => { setSenderFilter(s); setIsSenderDropdownOpen(false); }}><Typography.Body>{stripOoo(s)}</Typography.Body></div>
                        ))}
                    </FilterDropdownPortal>
                </div>
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={receiverButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsReceiverDropdownOpen(!isReceiverDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Получатель: {receiverFilter ? stripOoo(receiverFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={receiverButtonRef} isOpen={isReceiverDropdownOpen}>
                        <div className="dropdown-item" onClick={() => { setReceiverFilter(''); setIsReceiverDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        {uniqueReceivers.map(r => (
                            <div key={r} className="dropdown-item" onClick={() => { setReceiverFilter(r); setIsReceiverDropdownOpen(false); }}><Typography.Body>{stripOoo(r)}</Typography.Body></div>
                        ))}
                    </FilterDropdownPortal>
                </div>
                {!useServiceRequest && (
                    <div className="filter-group" style={{ flexShrink: 0 }}>
                        <div ref={customerButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsCustomerDropdownOpen(!isCustomerDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                                Заказчик: {customerFilter ? stripOoo(customerFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={customerButtonRef} isOpen={isCustomerDropdownOpen}>
                            <div className="dropdown-item" onClick={() => { setCustomerFilter(''); setIsCustomerDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                            {uniqueCustomers.map(c => (
                                <div key={c} className="dropdown-item" onClick={() => { setCustomerFilter(c); setIsCustomerDropdownOpen(false); }}><Typography.Body>{stripOoo(c)}</Typography.Body></div>
                            ))}
                        </FilterDropdownPortal>
                    </div>
                )}
                {useServiceRequest && (
                    <div className="filter-group" style={{ flexShrink: 0 }}>
                        <div ref={billStatusButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsBillStatusDropdownOpen(!isBillStatusDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                                Статус счёта: {BILL_STATUS_MAP[billStatusFilter]} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={billStatusButtonRef} isOpen={isBillStatusDropdownOpen}>
                            {(['all', 'paid', 'unpaid', 'partial', 'cancelled', 'unknown'] as const).map(key => (
                                <div key={key} className="dropdown-item" onClick={() => { setBillStatusFilter(key); setIsBillStatusDropdownOpen(false); }}>
                                    <Typography.Body>{BILL_STATUS_MAP[key]}</Typography.Body>
                                </div>
                            ))}
                        </FilterDropdownPortal>
                    </div>
                )}
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={typeButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsTypeDropdownOpen(!isTypeDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Тип: {typeFilter === 'all' ? 'Все' : typeFilter === 'ferry' ? 'Паром' : 'Авто'} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={typeButtonRef} isOpen={isTypeDropdownOpen}>
                        <div className="dropdown-item" onClick={() => { setTypeFilter('all'); setIsTypeDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        <div className="dropdown-item" onClick={() => { setTypeFilter('ferry'); setIsTypeDropdownOpen(false); }}><Typography.Body>Паром</Typography.Body></div>
                        <div className="dropdown-item" onClick={() => { setTypeFilter('auto'); setIsTypeDropdownOpen(false); }}><Typography.Body>Авто</Typography.Body></div>
                    </FilterDropdownPortal>
                </div>
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={routeButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsRouteDropdownOpen(!isRouteDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); }}>
                            Маршрут: {routeFilter === 'all' ? 'Все' : routeFilter} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={routeButtonRef} isOpen={isRouteDropdownOpen}>
                        <div className="dropdown-item" onClick={() => { setRouteFilter('all'); setIsRouteDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        <div className="dropdown-item" onClick={() => { setRouteFilter('MSK-KGD'); setIsRouteDropdownOpen(false); }}><Typography.Body>MSK – KGD</Typography.Body></div>
                        <div className="dropdown-item" onClick={() => { setRouteFilter('KGD-MSK'); setIsRouteDropdownOpen(false); }}><Typography.Body>KGD – MSK</Typography.Body></div>
                    </FilterDropdownPortal>
                </div>
            </div>
            </div>

            {showSums && (
            <>
            {/* Раскрывающаяся полоска: в свёрнутом виде — период + переключатели; в развёрнутом — переключатель и диаграммы */}
            <div
                className="home-strip"
                style={{
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    marginBottom: '1rem',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        padding: '0.75rem 1rem',
                        minWidth: 0,
                    }}
                >
                    <span style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Typography.Body style={{ color: 'var(--color-primary-blue)', fontWeight: 600, fontSize: '0.6rem' }}>
                            <DateText value={apiDateRange.dateFrom} /> – <DateText value={apiDateRange.dateTo} />
                        </Typography.Body>
                    </span>
                    <Flex gap="0.25rem" align="center" style={{ flexShrink: 0 }}>
                        {showSums && (
                            <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'money' ? 'var(--color-primary-blue)' : 'transparent', border: 'none' }} onClick={() => setChartType('money')} title="Рубли"><RussianRuble className="w-4 h-4" style={{ color: chartType === 'money' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        )}
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'paidWeight' ? '#10b981' : 'transparent', border: 'none' }} onClick={() => setChartType('paidWeight')} title="Платный вес"><Scale className="w-4 h-4" style={{ color: chartType === 'paidWeight' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'weight' ? '#0d9488' : 'transparent', border: 'none' }} onClick={() => setChartType('weight')} title="Вес"><Weight className="w-4 h-4" style={{ color: chartType === 'weight' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'volume' ? '#f59e0b' : 'transparent', border: 'none' }} onClick={() => setChartType('volume')} title="Объём"><List className="w-4 h-4" style={{ color: chartType === 'volume' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'pieces' ? '#8b5cf6' : 'transparent', border: 'none' }} onClick={() => setChartType('pieces')} title="Шт"><Package className="w-4 h-4" style={{ color: chartType === 'pieces' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                    </Flex>
                </div>
                {(
                    <div style={{ padding: '1.25rem 1rem 1rem', borderTop: '1px solid var(--color-border)' }}>
                        <Flex align="center" gap="0.5rem" style={{ marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                            <Typography.Body style={{ fontWeight: 600, fontSize: '0.6rem' }}>{formatStripValue()}</Typography.Body>
                            {useServiceRequest && prevPeriodLoading && (
                                <Flex align="center" gap="0.35rem" style={{ flexShrink: 0 }} title="Расчёт динамики">
                                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-primary-blue)' }} />
                                </Flex>
                            )}
                            {useServiceRequest && !prevPeriodLoading && periodToPeriodTrend && (
                                <>
                                    {periodToPeriodTrend.direction === 'up' && (
                                        <Flex align="center" gap="0.25rem" style={{ flexShrink: 0 }}>
                                            <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-success-status)' }} />
                                            <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-success-status)', fontWeight: 600 }}>
                                                +{periodToPeriodTrend.percent}%
                                            </Typography.Body>
                                        </Flex>
                                    )}
                                    {periodToPeriodTrend.direction === 'down' && (
                                        <Flex align="center" gap="0.25rem" style={{ flexShrink: 0 }}>
                                            <TrendingDown className="w-5 h-5" style={{ color: '#ef4444' }} />
                                            <Typography.Body style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: 600 }}>
                                                -{periodToPeriodTrend.percent}%
                                            </Typography.Body>
                                        </Flex>
                                    )}
                                    {periodToPeriodTrend.direction === null && periodToPeriodTrend.percent === 0 && (
                                        <Flex align="center" gap="0.25rem" style={{ flexShrink: 0 }}>
                                            <Minus className="w-5 h-5" style={{ color: 'var(--color-text-secondary)' }} />
                                            <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                                0%
                                            </Typography.Body>
                                        </Flex>
                                    )}
                                </>
                            )}
                            {!useServiceRequest && (
                                <>
                                    {stripTrend === 'up' && <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-success-status)', flexShrink: 0 }} title="Тренд вверх (вторая половина периода больше первой)" />}
                                    {stripTrend === 'down' && <TrendingDown className="w-5 h-5" style={{ color: '#ef4444', flexShrink: 0 }} title="Тренд вниз (вторая половина периода меньше первой)" />}
                                    {stripTrend === null && chartData.length >= 2 && <Minus className="w-5 h-5" style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} title="Без выраженного тренда" />}
                                </>
                            )}
                        </Flex>
                        <div style={{ marginBottom: '0.75rem', overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch' }}>
                            <Flex gap="0.5rem" style={{ flexWrap: 'nowrap', minWidth: 'min-content' }}>
                                {((useServiceRequest ? ['type', 'sender', 'receiver', 'customer'] : ['type', 'sender', 'receiver']) as const).map((tab) => (
                                    <Button
                                        key={tab}
                                        className="filter-button"
                                        style={{
                                            flexShrink: 0,
                                            padding: '0.5rem 0.75rem',
                                            background: stripTab === tab ? 'var(--color-primary-blue)' : 'var(--color-bg-hover)',
                                            color: stripTab === tab ? 'white' : 'var(--color-text-primary)',
                                            border: stripTab === tab ? '1px solid var(--color-primary-blue)' : '1px solid var(--color-border)',
                                        }}
                                        onClick={() => setStripTab(tab)}
                                    >
                                        {tab === 'type' ? 'Тип' : tab === 'sender' ? 'Отправитель' : tab === 'receiver' ? 'Получатель' : 'Заказчик'}
                                    </Button>
                                ))}
                            </Flex>
                        </div>
                        <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                            {stripTab === 'type' && stripDiagramByType.map((row, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                    <Typography.Body style={{ flexShrink: 0, width: 56 }}>{row.label}</Typography.Body>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                            <div style={{ width: `${row.percent}%`, height: '100%', background: row.color, borderRadius: 4, transition: 'width 0.3s' }} />
                                        </div>
                                    </div>
                                    {row.dynamics != null && (
                                        <Flex align="center" gap="0.2rem" style={{ flexShrink: 0, minWidth: 48 }}>
                                            {row.dynamics > 0 && <TrendingUp className="w-4 h-4" style={{ color: 'var(--color-success-status)' }} />}
                                            {row.dynamics < 0 && <TrendingDown className="w-4 h-4" style={{ color: '#ef4444' }} />}
                                            {row.dynamics === 0 && <Minus className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />}
                                            <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600, color: row.dynamics > 0 ? 'var(--color-success-status)' : row.dynamics < 0 ? '#ef4444' : 'var(--color-text-secondary)' }}>
                                                {row.dynamics > 0 ? '+' : ''}{row.dynamics}%
                                            </Typography.Body>
                                        </Flex>
                                    )}
                                    <Typography.Body
                                        component="span"
                                        style={{ flexShrink: 0, fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                                        onClick={(e) => { e.stopPropagation(); setStripShowAsPercent(p => !p); }}
                                        title={stripShowAsPercent ? 'Показать в рублях' : 'Показать в процентах'}
                                    >
                                        {stripShowAsPercent ? `${row.percent}%` : (chartType === 'money' ? formatCurrency(row.value, true) : chartType === 'paidWeight' || chartType === 'weight' ? `${Math.round(row.value).toLocaleString('ru-RU')} кг` : chartType === 'pieces' ? `${Math.round(row.value).toLocaleString('ru-RU')} шт` : `${Math.round(row.value).toLocaleString('ru-RU')} м³`)}
                                    </Typography.Body>
                                </div>
                            ))}
                            {stripTab === 'sender' && stripDiagramBySender.map((row, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                    <Typography.Body style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }} title={row.name}>{row.name}</Typography.Body>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                            <div style={{ width: `${row.percent}%`, height: '100%', background: row.color, borderRadius: 4, transition: 'width 0.3s' }} />
                                        </div>
                                    </div>
                                    {row.dynamics != null && (
                                        <Flex align="center" gap="0.2rem" style={{ flexShrink: 0, minWidth: 48 }}>
                                            {row.dynamics > 0 && <TrendingUp className="w-4 h-4" style={{ color: 'var(--color-success-status)' }} />}
                                            {row.dynamics < 0 && <TrendingDown className="w-4 h-4" style={{ color: '#ef4444' }} />}
                                            {row.dynamics === 0 && <Minus className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />}
                                            <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600, color: row.dynamics > 0 ? 'var(--color-success-status)' : row.dynamics < 0 ? '#ef4444' : 'var(--color-text-secondary)' }}>
                                                {row.dynamics > 0 ? '+' : ''}{row.dynamics}%
                                            </Typography.Body>
                                        </Flex>
                                    )}
                                    <Typography.Body
                                        component="span"
                                        style={{ flexShrink: 0, fontWeight: 600, minWidth: 36, cursor: 'pointer', userSelect: 'none' }}
                                        onClick={(e) => { e.stopPropagation(); setStripShowAsPercent(p => !p); }}
                                        title={stripShowAsPercent ? 'Показать в рублях' : 'Показать в процентах'}
                                    >
                                        {stripShowAsPercent ? `${row.percent}%` : (chartType === 'money' ? formatCurrency(row.value, true) : chartType === 'paidWeight' || chartType === 'weight' ? `${Math.round(row.value).toLocaleString('ru-RU')} кг` : chartType === 'pieces' ? `${Math.round(row.value).toLocaleString('ru-RU')} шт` : `${Math.round(row.value).toLocaleString('ru-RU')} м³`)}
                                    </Typography.Body>
                                </div>
                            ))}
                            {stripTab === 'receiver' && stripDiagramByReceiver.map((row, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                    <Typography.Body style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }} title={row.name}>{row.name}</Typography.Body>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                            <div style={{ width: `${row.percent}%`, height: '100%', background: row.color, borderRadius: 4, transition: 'width 0.3s' }} />
                                        </div>
                                    </div>
                                    {row.dynamics != null && (
                                        <Flex align="center" gap="0.2rem" style={{ flexShrink: 0, minWidth: 48 }}>
                                            {row.dynamics > 0 && <TrendingUp className="w-4 h-4" style={{ color: 'var(--color-success-status)' }} />}
                                            {row.dynamics < 0 && <TrendingDown className="w-4 h-4" style={{ color: '#ef4444' }} />}
                                            {row.dynamics === 0 && <Minus className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />}
                                            <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600, color: row.dynamics > 0 ? 'var(--color-success-status)' : row.dynamics < 0 ? '#ef4444' : 'var(--color-text-secondary)' }}>
                                                {row.dynamics > 0 ? '+' : ''}{row.dynamics}%
                                            </Typography.Body>
                                        </Flex>
                                    )}
                                    <Typography.Body
                                        component="span"
                                        style={{ flexShrink: 0, fontWeight: 600, minWidth: 36, cursor: 'pointer', userSelect: 'none' }}
                                        onClick={(e) => { e.stopPropagation(); setStripShowAsPercent(p => !p); }}
                                        title={stripShowAsPercent ? 'Показать в рублях' : 'Показать в процентах'}
                                    >
                                        {stripShowAsPercent ? `${row.percent}%` : (chartType === 'money' ? formatCurrency(row.value, true) : chartType === 'paidWeight' || chartType === 'weight' ? `${Math.round(row.value).toLocaleString('ru-RU')} кг` : chartType === 'pieces' ? `${Math.round(row.value).toLocaleString('ru-RU')} шт` : `${Math.round(row.value).toLocaleString('ru-RU')} м³`)}
                                    </Typography.Body>
                                </div>
                            ))}
                            {stripTab === 'customer' && stripDiagramByCustomer.map((row, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                    <Typography.Body style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }} title={row.name}>{row.name}</Typography.Body>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                            <div style={{ width: `${row.percent}%`, height: '100%', background: row.color, borderRadius: 4, transition: 'width 0.3s' }} />
                                        </div>
                                    </div>
                                    {row.dynamics != null && (
                                        <Flex align="center" gap="0.2rem" style={{ flexShrink: 0, minWidth: 48 }}>
                                            {row.dynamics > 0 && <TrendingUp className="w-4 h-4" style={{ color: 'var(--color-success-status)' }} />}
                                            {row.dynamics < 0 && <TrendingDown className="w-4 h-4" style={{ color: '#ef4444' }} />}
                                            {row.dynamics === 0 && <Minus className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />}
                                            <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600, color: row.dynamics > 0 ? 'var(--color-success-status)' : row.dynamics < 0 ? '#ef4444' : 'var(--color-text-secondary)' }}>
                                                {row.dynamics > 0 ? '+' : ''}{row.dynamics}%
                                            </Typography.Body>
                                        </Flex>
                                    )}
                                    <Typography.Body
                                        component="span"
                                        style={{ flexShrink: 0, fontWeight: 600, minWidth: 36, cursor: 'pointer', userSelect: 'none' }}
                                        onClick={(e) => { e.stopPropagation(); setStripShowAsPercent(p => !p); }}
                                        title={stripShowAsPercent ? 'Показать в рублях' : 'Показать в процентах'}
                                    >
                                        {stripShowAsPercent ? `${row.percent}%` : (chartType === 'money' ? formatCurrency(row.value, true) : chartType === 'paidWeight' || chartType === 'weight' ? `${Math.round(row.value).toLocaleString('ru-RU')} кг` : chartType === 'pieces' ? `${Math.round(row.value).toLocaleString('ru-RU')} шт` : `${Math.round(row.value).toLocaleString('ru-RU')} м³`)}
                                    </Typography.Body>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            </>
            )}

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
            
            {!loading && !error && showSums && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1.5rem' }}>
                    {(() => {
                        let chartDataForType: { date: string; value: number }[];
                        let title: string;
                        let color: string;
                        let formatValue: (val: number) => string;
                        
                        switch (chartType) {
                            case 'money':
                                chartDataForType = chartData.map(d => ({ date: d.date, dateKey: (d as { dateKey?: string }).dateKey, value: Math.round(d.sum) }));
                                title = "Динамика в деньгах";
                                color = "#6366f1";
                                formatValue = (val) => `${Math.round(val).toLocaleString('ru-RU')} ₽`;
                                break;
                            case 'paidWeight':
                                chartDataForType = chartData.map(d => ({ date: d.date, dateKey: (d as { dateKey?: string }).dateKey, value: Math.round(d.pw) }));
                                title = "Динамика в платном весе";
                                color = "#10b981";
                                formatValue = (val) => `${Math.round(val)} кг`;
                                break;
                            case 'weight':
                                chartDataForType = chartData.map(d => ({ date: d.date, dateKey: (d as { dateKey?: string }).dateKey, value: Math.round(d.w) }));
                                title = "Динамика по весу";
                                color = "#0d9488";
                                formatValue = (val) => `${Math.round(val)} кг`;
                                break;
                            case 'volume':
                                chartDataForType = chartData.map(d => ({ date: d.date, dateKey: (d as { dateKey?: string }).dateKey, value: d.vol }));
                                title = "Динамика по объёму";
                                color = "#f59e0b";
                                formatValue = (val) => `${val.toFixed(2)} м³`;
                                break;
                            case 'pieces':
                                chartDataForType = chartData.map(d => ({ date: d.date, dateKey: (d as { dateKey?: string }).dateKey, value: Math.round(d.mest) }));
                                title = "Динамика по местам (шт)";
                                color = "#8b5cf6";
                                formatValue = (val) => `${Math.round(val)} шт`;
                                break;
                        }
                        
                        return renderChart(chartDataForType, title, color, formatValue);
                    })()}
                </Panel>
            )}

            {/* Монитор SLA: плановые сроки авто 7 дн., паром 20 дн. (MSK-KGD); KGD-MSK 60 дн. */}
            {!loading && !error && slaStats.total > 0 && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.5rem' }}>
                    <Flex align="center" justify="space-between" style={{ marginBottom: '0.75rem' }}>
                        <Typography.Headline style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                            Монитор SLA
                        </Typography.Headline>
                        {slaTrend === 'up' && <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-success-status)' }} title="Динамика SLA улучшается" />}
                        {slaTrend === 'down' && <TrendingDown className="w-5 h-5" style={{ color: '#ef4444' }} title="Динамика SLA ухудшается" />}
                    </Flex>
                    <Flex gap="2rem" wrap="wrap" align="flex-start" style={{ marginBottom: '1rem' }}>
                        <div style={{ minWidth: 0 }}>
                            <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>В срок{'   '}</Typography.Body>
                            <Typography.Body style={{ fontWeight: 700, fontSize: '1.25rem', color: slaStats.percentOnTime >= 90 ? 'var(--color-success-status)' : slaStats.percentOnTime >= 70 ? '#f59e0b' : '#ef4444', display: 'inline' }}>
                                {slaStats.percentOnTime}%
                            </Typography.Body>
                            <Typography.Body style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'inline' }}>{'   '}{slaStats.onTime} из {slaStats.total} перевозок</Typography.Body>
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Средняя просрочка{'   '}</Typography.Body>
                            <Typography.Body style={{ fontWeight: 700, fontSize: '1.25rem', color: slaStats.avgDelay > 0 ? '#ef4444' : 'var(--color-text-primary)', display: 'inline' }}>
                                {slaStats.avgDelay} дн.
                            </Typography.Body>
                        </div>
                        {useServiceRequest && (
                            <>
                                <div style={{ minWidth: 0 }}>
                                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Мин. дней доставки{'   '}</Typography.Body>
                                    <Typography.Body style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--color-text-primary)', display: 'inline' }}>
                                        {slaStats.minDays} дн.
                                    </Typography.Body>
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Макс. дней доставки{'   '}</Typography.Body>
                                    <Typography.Body style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--color-text-primary)', display: 'inline' }}>
                                        {slaStats.maxDays} дн.
                                    </Typography.Body>
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Среднее дней доставки{'   '}</Typography.Body>
                                    <Typography.Body style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--color-text-primary)', display: 'inline' }}>
                                        {slaStats.avgDays} дн.
                                    </Typography.Body>
                                </div>
                            </>
                        )}
                    </Flex>
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setSlaDetailsOpen(!slaDetailsOpen)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSlaDetailsOpen(!slaDetailsOpen); } }}
                        style={{ cursor: 'pointer', marginBottom: slaDetailsOpen ? '0.75rem' : 0 }}
                        title={slaDetailsOpen ? 'Свернуть' : 'Подробности по типу перевозки'}
                    >
                        <div style={{ height: 12, borderRadius: 6, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                            <div
                                style={{
                                    width: `${slaStats.percentOnTime}%`,
                                    height: '100%',
                                    borderRadius: 6,
                                    background: `linear-gradient(90deg, var(--color-success-status) 0%, #f59e0b 50%, #ef4444 100%)`,
                                    transition: 'width 0.3s ease',
                                }}
                            />
                        </div>
                        <Typography.Body style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                            {slaDetailsOpen ? '▼ Подробности' : '▶ Нажмите для разбивки по типу перевозки'}
                        </Typography.Body>
                    </div>
                    {slaDetailsOpen && (
                        <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
                            <div style={{ marginBottom: '0.75rem' }}>
                                <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600 }}>Авто{'   '}</Typography.Body>
                                <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', display: 'inline' }}>
                                    {slaStatsByType.auto.percentOnTime}% ({slaStatsByType.auto.onTime}/{slaStatsByType.auto.total}), ср. {slaStatsByType.auto.avgDelay} дн.
                                </Typography.Body>
                                {useServiceRequest && outOfSlaByType.auto.length > 0 && (
                                    <div style={{ marginTop: '0.5rem', overflowX: 'auto' }}>
                                        <Typography.Body style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Перевозки вне SLA:</Typography.Body>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('number'); }} title="Сортировка">Номер{slaTableSortColumn === 'number' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('date'); }} title="Сортировка">Дата прихода{slaTableSortColumn === 'date' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('status'); }} title="Сортировка">Статус{slaTableSortColumn === 'status' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('customer'); }} title="Сортировка">Заказчик{slaTableSortColumn === 'customer' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('mest'); }} title="Сортировка">Мест{slaTableSortColumn === 'mest' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('pw'); }} title="Сортировка">Плат. вес{slaTableSortColumn === 'pw' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('sum'); }} title="Сортировка">Сумма{slaTableSortColumn === 'sum' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('days'); }} title="Сортировка">Дней{slaTableSortColumn === 'days' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('plan'); }} title="Сортировка">План{slaTableSortColumn === 'plan' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('delay'); }} title="Сортировка">Просрочка{slaTableSortColumn === 'delay' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sortedOutOfSlaAuto.map(({ item, sla }, idx) => (
                                                    <React.Fragment key={`auto-${item.Number ?? idx}`}>
                                                        <tr
                                                            style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: expandedSlaCargoNumber === (item.Number ?? '') ? 'var(--color-bg-hover)' : undefined }}
                                                            onClick={() => {
                                                                const num = item.Number ?? '';
                                                                if (expandedSlaCargoNumber === num) {
                                                                    setExpandedSlaCargoNumber(null);
                                                                    setExpandedSlaItem(null);
                                                                } else {
                                                                    setExpandedSlaCargoNumber(num);
                                                                    setExpandedSlaItem(item);
                                                                }
                                                            }}
                                                            title={expandedSlaCargoNumber === (item.Number ?? '') ? 'Свернуть статусы' : 'Показать статусы перевозки'}
                                                        >
                                                            <td style={{ padding: '0.35rem 0.3rem', color: '#ef4444' }}>{item.Number ?? '—'}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem' }}><DateText value={item.DatePrih} /></td>
                                                            <td style={{ padding: '0.35rem 0.3rem' }}>{normalizeStatus(item.State) || '—'}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stripOoo((item.Customer ?? (item as any).customer) || '')}>{stripOoo((item.Customer ?? (item as any).customer) || '') || '—'}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.Mest != null ? Math.round(Number(item.Mest)) : '—'}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.PW != null ? `${Math.round(Number(item.PW))} кг` : '—'}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.Sum != null ? formatCurrency(item.Sum as number, true) : '—'}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{sla.actualDays}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{sla.planDays}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', color: '#ef4444' }}>+{sla.delayDays} дн.</td>
                                                        </tr>
                                                        {expandedSlaCargoNumber === (item.Number ?? '') && (
                                                            <tr>
                                                                <td colSpan={10} style={{ padding: '0.5rem', borderBottom: '1px solid var(--color-border)', verticalAlign: 'top', background: 'var(--color-bg-primary)' }}>
                                                                    <Typography.Body style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.35rem' }}>Статусы перевозки</Typography.Body>
                                                                    {slaTimelineLoading && (
                                                                        <Flex align="center" gap="0.5rem" style={{ padding: '0.35rem 0' }}>
                                                                            <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--color-primary-blue)' }} />
                                                                            <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Загрузка…</Typography.Body>
                                                                        </Flex>
                                                                    )}
                                                                    {slaTimelineError && (
                                                                        <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{slaTimelineError}</Typography.Body>
                                                                    )}
                                                                    {!slaTimelineLoading && slaTimelineSteps && slaTimelineSteps.length > 0 && (() => {
                                                                        const planEndMs = item?.DatePrih ? new Date(item.DatePrih).getTime() + getPlanDays(item) * 24 * 60 * 60 * 1000 : 0;
                                                                        return (
                                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                                            <thead>
                                                                                <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Статус</th>
                                                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Дата доставки</th>
                                                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Время доставки</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {slaTimelineSteps.map((step, i) => {
                                                                                    const stepMs = step.date ? new Date(step.date).getTime() : 0;
                                                                                    const outOfSlaFromThisStep = planEndMs > 0 && stepMs > planEndMs;
                                                                                    const dateColor = outOfSlaFromThisStep ? '#ef4444' : (planEndMs > 0 && stepMs > 0 ? '#22c55e' : 'var(--color-text-secondary)');
                                                                                    return (
                                                                                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                                                        <td style={{ padding: '0.35rem 0.3rem' }}>{step.label}</td>
                                                                                        <td style={{ padding: '0.35rem 0.3rem', color: dateColor }}>{formatTimelineDate(step.date)}</td>
                                                                                        <td style={{ padding: '0.35rem 0.3rem', color: dateColor }}>{formatTimelineTime(step.date)}</td>
                                                                                    </tr>
                                                                                    );
                                                                                })}
                                                                            </tbody>
                                                                        </table>
                                                                        );
                                                                    })()}
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                            <div>
                                <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600 }}>Паром{'   '}</Typography.Body>
                                <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', display: 'inline' }}>
                                    {slaStatsByType.ferry.percentOnTime}% ({slaStatsByType.ferry.onTime}/{slaStatsByType.ferry.total}), ср. {slaStatsByType.ferry.avgDelay} дн.
                                </Typography.Body>
                                {useServiceRequest && outOfSlaByType.ferry.length > 0 && (
                                    <div style={{ marginTop: '0.5rem', overflowX: 'auto' }}>
                                        <Typography.Body style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Перевозки вне SLA:</Typography.Body>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('number'); }} title="Сортировка">Номер{slaTableSortColumn === 'number' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('date'); }} title="Сортировка">Дата прихода{slaTableSortColumn === 'date' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('status'); }} title="Сортировка">Статус{slaTableSortColumn === 'status' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('customer'); }} title="Сортировка">Заказчик{slaTableSortColumn === 'customer' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('mest'); }} title="Сортировка">Мест{slaTableSortColumn === 'mest' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('pw'); }} title="Сортировка">Плат. вес{slaTableSortColumn === 'pw' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('sum'); }} title="Сортировка">Сумма{slaTableSortColumn === 'sum' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('days'); }} title="Сортировка">Дней{slaTableSortColumn === 'days' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('plan'); }} title="Сортировка">План{slaTableSortColumn === 'plan' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('delay'); }} title="Сортировка">Просрочка{slaTableSortColumn === 'delay' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sortedOutOfSlaFerry.map(({ item, sla }, idx) => (
                                                    <tr key={`ferry-${item.Number ?? idx}`} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                        <td style={{ padding: '0.35rem 0.3rem', color: '#ef4444' }}>{item.Number ?? '—'}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem' }}><DateText value={item.DatePrih} /></td>
                                                        <td style={{ padding: '0.35rem 0.3rem' }}>{normalizeStatus(item.State) || '—'}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stripOoo((item.Customer ?? (item as any).customer) || '')}>{stripOoo((item.Customer ?? (item as any).customer) || '') || '—'}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.Mest != null ? Math.round(Number(item.Mest)) : '—'}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.PW != null ? `${Math.round(Number(item.PW))} кг` : '—'}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.Sum != null ? formatCurrency(item.Sum as number, true) : '—'}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{sla.actualDays}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{sla.planDays}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', color: '#ef4444' }}>+{sla.delayDays} дн.</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
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

// --- CUSTOMER SWITCHER (тот же список, что в «Мои компании», из БД; с прокруткой) ---

function CustomerSwitcher({
    accounts,
    activeAccountId,
    onSwitchAccount,
    onUpdateAccount,
}: {
    accounts: Account[];
    activeAccountId: string | null;
    onSwitchAccount: (accountId: string) => void;
    onUpdateAccount: (accountId: string, patch: Partial<Account>) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [companies, setCompanies] = useState<HeaderCompanyRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const activeAccount = accounts.find((acc) => acc.id === activeAccountId) || null;
    const activeLogin = activeAccount?.login?.trim().toLowerCase() ?? "";
    const activeInn = activeAccount?.activeCustomerInn ?? activeAccount?.customers?.[0]?.inn ?? "";

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.customer-switcher')) setIsOpen(false);
        };
        if (isOpen) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || accounts.length === 0) return;
        const logins = [...new Set(accounts.map((a) => a.login.trim().toLowerCase()))];
        const query = logins.map((l) => `login=${encodeURIComponent(l)}`).join('&');
        setLoading(true);
        fetch(`/api/companies?${query}`)
            .then((r) => r.json())
            .then((data) => {
                const list = Array.isArray(data?.companies) ? data.companies : [];
                setCompanies(dedupeCompaniesByName(list));
            })
            .catch(() => setCompanies([]))
            .finally(() => setLoading(false));
    }, [isOpen, accounts.map((a) => a.login).join(',')]);

    const activeCompany = companies.find(
        (c) => c.login === activeLogin && (c.inn === '' || c.inn === activeInn)
    );
    const displayName = activeCompany ? stripOoo(activeCompany.name) : stripOoo(activeAccount?.customer || activeAccount?.login || 'Компания');

    const handleSelect = (c: HeaderCompanyRow) => {
        const acc = accounts.find((a) => a.login.trim().toLowerCase() === c.login);
        if (!acc) return;
        onSwitchAccount(acc.id);
        if (c.inn !== undefined && c.inn !== null) {
            onUpdateAccount(acc.id, { activeCustomerInn: c.inn });
        }
        setIsOpen(false);
        setSearchQuery('');
    };

    const searchLower = searchQuery.trim().toLowerCase();
    const filteredCompanies = searchLower
        ? companies.filter((c) => stripOoo(c.name).toLowerCase().includes(searchLower) || (c.login || '').toLowerCase().includes(searchLower))
        : companies;

    if (!activeAccountId || !activeAccount) return null;

    return (
        <div className="customer-switcher filter-group" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Button
                className="filter-button"
                onClick={() => setIsOpen(!isOpen)}
                style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}
                title="Выбрать компанию"
            >
                <Typography.Body style={{ fontSize: '0.9rem' }}>
                    {displayName}
                </Typography.Body>
                <ChevronDown className="w-4 h-4" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </Button>
            {isOpen && (
                <div
                    className="filter-dropdown"
                    style={{
                        minWidth: '220px',
                        maxHeight: 'min(60vh, 320px)',
                        overflowY: 'auto',
                    }}
                >
                    {loading ? (
                        <div style={{ padding: '0.75rem 1rem' }}>
                            <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Загрузка…</Typography.Body>
                        </div>
                    ) : companies.length === 0 ? (
                        <div style={{ padding: '0.75rem 1rem' }}>
                            <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Нет компаний</Typography.Body>
                        </div>
                    ) : (
                        <>
                            <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--color-border)' }} onClick={(e) => e.stopPropagation()}>
                                <Input
                                    type="text"
                                    placeholder="Поиск по названию…"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    style={{ fontSize: '0.9rem', padding: '0.4rem 0.5rem' }}
                                />
                            </div>
                            {filteredCompanies.length === 0 ? (
                                <div style={{ padding: '0.75rem 1rem' }}>
                                    <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Ничего не найдено</Typography.Body>
                                </div>
                            ) : filteredCompanies.map((c) => {
                            const isActive = activeLogin === c.login && (c.inn === '' || c.inn === activeInn);
                            return (
                                <div
                                    key={`${c.login}-${c.inn}`}
                                    className={`dropdown-item ${isActive ? 'active' : ''}`}
                                    onClick={() => handleSelect(c)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        backgroundColor: isActive ? 'var(--color-bg-hover)' : 'transparent',
                                    }}
                                >
                                    <Typography.Body style={{ fontSize: '0.9rem', fontWeight: isActive ? 'bold' : 'normal' }}>
                                        {stripOoo(c.name)}
                                    </Typography.Body>
                                    {isActive && <Check className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />}
                                </div>
                            );
                        })}
                        </>
                    )}
                </div>
            )}
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
    const activeLabel = stripOoo(activeAccount?.customer || activeAccount?.login || '') || 'Не выбран';
    
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
                                    {stripOoo(account.customer || account.login)}
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
    onOpenTelegramBot,
    onOpenMaxBot
}: {
    onBack: () => void;
    auth: AuthData | null;
    accountId: string | null;
    customer: string | null;
    onOpenCargo: (cargoNumber: string) => void;
    chatId: string | null;
    onOpenTelegramBot?: () => Promise<void>;
    onOpenMaxBot?: () => Promise<void>;
}) {
    const [prefillMessage, setPrefillMessage] = useState<string | undefined>(undefined);
    const [tgLinkError, setTgLinkError] = useState<string | null>(null);
    const [chatCustomerState, setChatCustomerState] = useState<{ customer: string | null; unlinked: boolean }>({
        customer: customer ?? null,
        unlinked: false,
    });
    const chatClearRef = useRef<(() => void) | null>(null);

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
            <Flex align="center" style={{ marginBottom: '0.5rem', gap: '0.75rem', flexWrap: 'wrap' }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: '0.5rem' }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Button
                    className="filter-button"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => chatClearRef.current?.()}
                >
                    Очистить чат
                </Button>
                {onOpenTelegramBot && (
                    <img
                        src="/icons/telegram.png"
                        alt="Открыть в Telegram"
                        role="button"
                        title="Открыть в Telegram"
                        tabIndex={0}
                        onClick={async () => {
                            setTgLinkError(null);
                            try {
                                await onOpenTelegramBot();
                            } catch (e: any) {
                                setTgLinkError(e?.message || "Не удалось открыть Telegram-бота.");
                            }
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.target as HTMLImageElement).click(); } }}
                        className="chat-icon-btn"
                    />
                )}
                {onOpenMaxBot && (
                    <img
                        src="/icons/max.png"
                        alt="Открыть в MAX"
                        role="button"
                        title="Открыть в MAX"
                        tabIndex={0}
                        onClick={async () => {
                            setTgLinkError(null);
                            try {
                                await onOpenMaxBot();
                            } catch (e: any) {
                                setTgLinkError(e?.message || "Не удалось открыть MAX.");
                            }
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.target as HTMLImageElement).click(); } }}
                        className="chat-icon-btn"
                    />
                )}
            </Flex>
            <div style={{ marginBottom: '1rem', paddingLeft: '0.25rem' }}>
                <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                    Заказчик: {chatCustomerState.unlinked || !chatCustomerState.customer
                        ? 'не привязан'
                        : stripOoo(chatCustomerState.customer)}
                </Typography.Body>
            </div>
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
                        clearChatRef={chatClearRef}
                        onChatCustomerState={setChatCustomerState}
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

// --- NOTIFICATION EVENTS: Перевозки + Документы (шаблоны для Telegram: Принята, В пути, Доставлено; Счёт оплачен) ---
const NOTIF_PEREVOZKI: { id: string; label: string }[] = [
  { id: "accepted", label: "Принята" },
  { id: "in_transit", label: "В пути" },
  { id: "delivered", label: "Доставлено" },
];
const NOTIF_DOCS: { id: string; label: string }[] = [
  { id: "bill_paid", label: "Счёт оплачен" },
];

/** Общий переключатель (как в 2FA) — один компонент для Уведомлений и 2FA. */
function TapSwitch({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-checked={checked}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: checked ? "var(--color-theme-primary, #2563eb)" : "var(--color-border, #ccc)",
        position: "relative",
        cursor: "pointer",
        flexShrink: 0,
        transition: "background 0.2s",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transition: "left 0.2s",
        }}
      />
    </div>
  );
}

function NotificationsPage({
  activeAccount,
  activeAccountId,
  onBack,
  onOpenDeveloper,
  onOpenTelegramBot,
  onOpenMaxBot,
  onUpdateAccount,
}: {
  activeAccount: Account | null;
  activeAccountId: string | null;
  onBack: () => void;
  onOpenDeveloper: () => void;
  onOpenTelegramBot?: () => Promise<void>;
  onOpenMaxBot?: () => Promise<void>;
  onUpdateAccount?: (accountId: string, patch: Partial<Account>) => void;
}) {
  const [prefs, setPrefs] = useState<{ telegram: Record<string, boolean>; webpush: Record<string, boolean> }>({
    telegram: {},
    webpush: {},
  });
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [webPushLoading, setWebPushLoading] = useState(false);
  const [webPushError, setWebPushError] = useState<string | null>(null);
  const [webPushSubscribed, setWebPushSubscribed] = useState(false);
  const [tgLinkLoading, setTgLinkLoading] = useState(false);
  const [tgLinkError, setTgLinkError] = useState<string | null>(null);
  const [maxLinkLoading, setMaxLinkLoading] = useState(false);
  const [maxLinkError, setMaxLinkError] = useState<string | null>(null);
  /** Статус привязки Telegram с сервера (при открытии экрана и по «Проверить привязку»). */
  const [telegramLinkedFromApi, setTelegramLinkedFromApi] = useState<boolean | null>(null);
  const [maxLinkedFromApi, setMaxLinkedFromApi] = useState<boolean | null>(null);

  const login = activeAccount?.login?.trim().toLowerCase() || "";
  /** Telegram считается подключённым, если API вернул telegramLinked или в аккаунте уже есть флаг. */
  const telegramLinked = telegramLinkedFromApi ?? activeAccount?.twoFactorTelegramLinked ?? false;
  const maxLinked = maxLinkedFromApi ?? false;

  /** Запросить статус привязки Telegram и MAX (GET /api/2fa). */
  const checkTelegramLinked = useCallback(async () => {
    if (!login) return false;
    try {
      const res = await fetch(`/api/2fa?login=${encodeURIComponent(login)}`);
      if (!res.ok) return false;
      const data = await res.json();
      const linked = !!data?.settings?.telegramLinked;
      setTelegramLinkedFromApi(linked);
      setMaxLinkedFromApi(!!data?.settings?.maxLinked);
      if (linked && activeAccountId && onUpdateAccount) onUpdateAccount(activeAccountId, { twoFactorTelegramLinked: true });
      return linked;
    } catch {
      return false;
    }
  }, [login, activeAccountId, onUpdateAccount]);

  useEffect(() => {
    if (!login) {
      setPrefsLoading(false);
      setTelegramLinkedFromApi(null);
      setMaxLinkedFromApi(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [prefsRes, _] = await Promise.all([
          fetch(`/api/webpush-preferences?login=${encodeURIComponent(login)}`),
          checkTelegramLinked().then(() => {}),
        ]);
        if (cancelled) return;
        if (prefsRes.ok) {
          const data = await prefsRes.json();
          if (!cancelled) setPrefs({ telegram: data.telegram || {}, webpush: data.webpush || {} });
        }
      } catch {
        if (!cancelled) setPrefs({ telegram: {}, webpush: {} });
      } finally {
        if (!cancelled) setPrefsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [login, checkTelegramLinked]);

  const savePrefs = useCallback(
    async (channel: "telegram" | "webpush", eventId: string, value: boolean) => {
      const next = {
        ...prefs,
        [channel]: { ...prefs[channel], [eventId]: value },
      };
      setPrefs(next);
      if (!login) return;
      setPrefsSaving(true);
      try {
        await fetch("/api/webpush-preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ login, preferences: next }),
        });
      } catch {
        // revert on error?
      } finally {
        setPrefsSaving(false);
      }
    },
    [login, prefs]
  );

  const enableWebPush = useCallback(async () => {
    if (!login) return;
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      setWebPushError("Уведомления в браузере не поддерживаются.");
      return;
    }
    setWebPushError(null);
    setWebPushLoading(true);
    try {
      let permission = Notification.permission;
      if (permission === "default") {
        permission = await Notification.requestPermission();
      }
      if (permission !== "granted") {
        setWebPushError("Разрешение на уведомления отклонено.");
        setWebPushLoading(false);
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await reg.update();
      const res = await fetch("/api/webpush-vapid");
      if (!res.ok) throw new Error("VAPID not configured");
      const { publicKey } = await res.json();
      if (!publicKey) throw new Error("No public key");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const subRes = await fetch("/api/webpush-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, subscription: sub.toJSON() }),
      });
      if (!subRes.ok) throw new Error("Failed to save subscription");
      setWebPushSubscribed(true);
    } catch (e: any) {
      setWebPushError(e?.message || "Не удалось включить уведомления.");
    } finally {
      setWebPushLoading(false);
    }
  }, [login]);

  const webPushSupported =
    typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;

  return (
    <div className="w-full">
      <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
        <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Typography.Headline style={{ fontSize: "1.25rem" }}>Уведомления</Typography.Headline>
      </Flex>

      {!login ? (
        <Panel className="cargo-card" style={{ padding: "1rem" }}>
          <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
            Войдите в аккаунт, чтобы настроить уведомления.
          </Typography.Body>
        </Panel>
      ) : prefsLoading ? (
        <Panel className="cargo-card" style={{ padding: "1rem" }}>
          <Flex align="center" gap="0.5rem">
            <Loader2 className="w-4 h-4 animate-spin" />
            <Typography.Body style={{ fontSize: "0.9rem" }}>Загрузка…</Typography.Body>
          </Flex>
        </Panel>
      ) : (
        <>
          {/* Telegram */}
          <Typography.Body style={{ marginBottom: "0.5rem", fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
            Telegram
          </Typography.Body>
          <Panel className="cargo-card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {!telegramLinked ? (
              <>
                <Typography.Body style={{ fontSize: "0.9rem" }}>
                  Привяжите Telegram, чтобы получать уведомления в боте по образцу: «Создана Перевозка №…», «В пути», «Доставлено», «Счёт по перевозке № … оплачен».
                </Typography.Body>
                {onOpenTelegramBot && (
                  <Button
                    type="button"
                    className="button-primary"
                    disabled={tgLinkLoading}
                    onClick={async () => {
                      setTgLinkError(null);
                      setTgLinkLoading(true);
                      try {
                        await onOpenTelegramBot();
                      } catch (e: any) {
                        setTgLinkError(e?.message || "Не удалось открыть Telegram.");
                      } finally {
                        setTgLinkLoading(false);
                      }
                    }}
                  >
                    {tgLinkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Привязать Telegram"}
                  </Button>
                )}
                {tgLinkError && (
                  <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-error, #ef4444)" }}>
                    {tgLinkError}
                  </Typography.Body>
                )}
                {onOpenMaxBot && (
                  <Button
                    type="button"
                    className="button-primary"
                    disabled={maxLinkLoading}
                    onClick={async () => {
                      setMaxLinkError(null);
                      setMaxLinkLoading(true);
                      try {
                        await onOpenMaxBot();
                      } catch (e: any) {
                        setMaxLinkError(e?.message || "Не удалось открыть MAX.");
                      } finally {
                        setMaxLinkLoading(false);
                      }
                    }}
                  >
                    {maxLinkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Привязать MAX"}
                  </Button>
                )}
                {maxLinkError && (
                  <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-error, #ef4444)" }}>
                    {maxLinkError}
                  </Typography.Body>
                )}
                <Typography.Body
                  style={{ fontSize: "0.8rem", color: "var(--color-primary)", cursor: "pointer", textDecoration: "underline" }}
                  onClick={() => checkTelegramLinked()}
                >
                  Проверить привязку
                </Typography.Body>
              </>
            ) : (
              <>
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-success, #22c55e)" }}>
                  Telegram подключён.
                </Typography.Body>
                {maxLinked ? (
                  <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-success, #22c55e)" }}>
                    MAX подключён.
                  </Typography.Body>
                ) : onOpenMaxBot && (
                  <Button
                    type="button"
                    className="button-primary"
                    disabled={maxLinkLoading}
                    onClick={async () => {
                      setMaxLinkError(null);
                      setMaxLinkLoading(true);
                      try {
                        await onOpenMaxBot();
                      } catch (e: any) {
                        setMaxLinkError(e?.message || "Не удалось открыть MAX.");
                      } finally {
                        setMaxLinkLoading(false);
                      }
                    }}
                  >
                    {maxLinkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Привязать MAX"}
                  </Button>
                )}
                {maxLinkError && (
                  <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-error, #ef4444)" }}>
                    {maxLinkError}
                  </Typography.Body>
                )}
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>
                  Раздел «Перевозки»
                </Typography.Body>
                {NOTIF_PEREVOZKI.map((ev) => (
                  <Flex key={ev.id} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                    <Typography.Body style={{ fontSize: "0.9rem" }}>{ev.label}</Typography.Body>
                    <TapSwitch
                      checked={!!prefs.telegram[ev.id]}
                      onToggle={() => savePrefs("telegram", ev.id, !prefs.telegram[ev.id])}
                    />
                  </Flex>
                ))}
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "0.5rem", marginBottom: "0.25rem" }}>
                  Раздел «Документы»
                </Typography.Body>
                {NOTIF_DOCS.map((ev) => (
                  <Flex key={ev.id} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                    <Typography.Body style={{ fontSize: "0.9rem" }}>{ev.label}</Typography.Body>
                    <TapSwitch
                      checked={!!prefs.telegram[ev.id]}
                      onToggle={() => savePrefs("telegram", ev.id, !prefs.telegram[ev.id])}
                    />
                  </Flex>
                ))}
              </>
            )}
          </Panel>

          {/* Web Push */}
          <Typography.Body style={{ marginTop: "1.25rem", marginBottom: "0.5rem", fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
            Web Push (браузер)
          </Typography.Body>
          <Panel className="cargo-card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {webPushSupported && (
              <>
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                  Уведомления в браузере (Chrome, Edge, Firefox; на iOS — после добавления на экран «Домой»).
                </Typography.Body>
                {!webPushSubscribed && (
                  <Button
                    type="button"
                    className="button-primary"
                    disabled={webPushLoading}
                    onClick={enableWebPush}
                  >
                    {webPushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Включить уведомления в браузере"}
                  </Button>
                )}
                {webPushSubscribed && (
                  <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-success, #22c55e)" }}>
                    Уведомления в браузере включены.
                  </Typography.Body>
                )}
                {webPushError && (
                  <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-error, #ef4444)" }}>
                    {webPushError}
                  </Typography.Body>
                )}
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "0.25rem", marginBottom: "0.25rem" }}>
                  Раздел «Перевозки»
                </Typography.Body>
                {NOTIF_PEREVOZKI.map((ev) => (
                  <Flex key={ev.id} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                    <Typography.Body style={{ fontSize: "0.9rem" }}>{ev.label}</Typography.Body>
                    <TapSwitch
                      checked={!!prefs.webpush[ev.id]}
                      onToggle={() => savePrefs("webpush", ev.id, !prefs.webpush[ev.id])}
                    />
                  </Flex>
                ))}
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "0.5rem", marginBottom: "0.25rem" }}>
                  Раздел «Документы»
                </Typography.Body>
                {NOTIF_DOCS.map((ev) => (
                  <Flex key={ev.id} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                    <Typography.Body style={{ fontSize: "0.9rem" }}>{ev.label}</Typography.Body>
                    <TapSwitch
                      checked={!!prefs.webpush[ev.id]}
                      onToggle={() => savePrefs("webpush", ev.id, !prefs.webpush[ev.id])}
                    />
                  </Flex>
                ))}
              </>
            )}
            {!webPushSupported && (
              <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                Web Push доступен в браузерах (Chrome, Edge, Firefox). В мини‑приложении внутри соцсетей может быть недоступен.
              </Typography.Body>
            )}
          </Panel>

          <Typography.Body
            style={{ marginTop: "1.5rem", fontSize: "0.8rem", color: "var(--color-text-secondary)", cursor: "pointer", textDecoration: "underline" }}
            onClick={onOpenDeveloper}
          >
            Для разработчиков
          </Typography.Body>
        </>
      )}
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
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
    onOpenMaxBot,
    onUpdateAccount,
    onServiceModeChange
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
    onOpenMaxBot?: () => Promise<void>;
    onUpdateAccount: (accountId: string, patch: Partial<Account>) => void;
    onServiceModeChange?: () => void;
}) {
    const [currentView, setCurrentView] = useState<ProfileView>('main');
    const activeAccount = accounts.find(acc => acc.id === activeAccountId) || null;
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
    const [twoFactorMethod, setTwoFactorMethod] = useState<"google" | "telegram">("google");
    const [twoFactorTelegramLinked, setTwoFactorTelegramLinked] = useState(false);
    const [tgLinkLoading, setTgLinkLoading] = useState(false);
    const [tgLinkError, setTgLinkError] = useState<string | null>(null);
    const [tgLinkChecking, setTgLinkChecking] = useState(false);
    const [aliceCode, setAliceCode] = useState<string | null>(null);
    const [aliceExpiresAt, setAliceExpiresAt] = useState<number | null>(null);
    const [aliceLoading, setAliceLoading] = useState(false);
    const [aliceError, setAliceError] = useState<string | null>(null);
    const [aliceSuccess, setAliceSuccess] = useState<string | null>(null);
    const [googleSetupData, setGoogleSetupData] = useState<{ otpauthUrl: string; secret: string } | null>(null);
    const [googleSetupStep, setGoogleSetupStep] = useState<'idle' | 'qr' | 'verify'>('idle');
    const [googleSetupLoading, setGoogleSetupLoading] = useState(false);
    const [googleSetupError, setGoogleSetupError] = useState<string | null>(null);
    const [googleVerifyCode, setGoogleVerifyCode] = useState('');
    const [serviceModePwd, setServiceModePwd] = useState('Haulz2026!/!');
    const [serviceModeActive, setServiceModeActive] = useState(() => typeof localStorage !== 'undefined' && localStorage.getItem('haulz.serviceMode') === '1');
    const [serviceModeError, setServiceModeError] = useState<string | null>(null);

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
        { 
            id: 'roles', 
            label: 'Роли', 
            icon: <UserIcon className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('roles')
        },
        { 
            id: 'serviceMode', 
            label: 'Служебный режим', 
            icon: <Shield className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('serviceMode')
        },
        { 
            id: 'voiceAssistants', 
            label: 'Голосовые помощники', 
            icon: <Mic className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('voiceAssistants')
        },
        { 
            id: 'notifications', 
            label: 'Уведомления', 
            icon: <Bell className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('notifications')
        },
    ];

    const faqItems = [
        {
            q: "Как войти в мини‑приложение?",
            a: "Введите логин и пароль от личного кабинета HAULZ. Перед входом подтвердите согласия. Если забыли пароль, нажмите «Забыли пароль?» и восстановите доступ через сайт.",
            img: "/faq-account.svg",
            alt: "Вход в приложение"
        },
        {
            q: "Как добавить другую компанию?",
            a: "Откройте «Профиль» → «Мои компании». Выберите способ добавления: по ИНН или по логину и паролю. После добавления можно быстро переключаться между компаниями.",
            img: "/faq-account.svg",
            alt: "Управление компаниями"
        },
        {
            q: "Почему не вижу некоторые грузы?",
            a: "Проверьте выбранный аккаунт и фильтры, включая период дат. Если список пустой — расширьте диапазон дат или сбросьте фильтры. Также убедитесь, что груз действительно относится к выбранной компании.",
            img: "/faq-troubleshoot.svg",
            alt: "Поиск грузов"
        },
        {
            q: "Где найти документы по перевозке?",
            a: "Откройте карточку груза и используйте кнопку «Поделиться». Если нужного документа нет, напишите в поддержку — мы проверим доступность и пришлем ссылку.",
            img: "/faq-docs.svg",
            alt: "Документы"
        },
        {
            q: "Как работает чат поддержки?",
            a: "В разделе «Поддержка» можно задать вопрос по перевозке, оплатам или документам. AI‑помощник отвечает сразу, а при необходимости подключается оператор.",
            img: "/faq-support.svg",
            alt: "Чат поддержки"
        },
        {
            q: "Можно ли открыть чат по конкретному грузу?",
            a: "Да. В списке грузов нажмите кнопку чата рядом с нужной перевозкой — запрос автоматически подставит номер груза.",
            img: "/faq-support.svg",
            alt: "Чат по грузу"
        },
        {
            q: "Почему документы не открываются в приложении?",
            a: "Некоторые документы доступны только через чат поддержки или Telegram. Если ссылка не открывается — проверьте интернет и повторите попытку.",
            img: "/faq-docs.svg",
            alt: "Открытие документов"
        },
        {
            q: "Как быстро найти груз по номеру?",
            a: "Используйте строку поиска вверху списка грузов и введите номер перевозки полностью или частично. Результаты отфильтруются автоматически.",
            img: "/faq-troubleshoot.svg",
            alt: "Поиск по номеру"
        },
        {
            q: "Как настроить фильтры по статусу?",
            a: "Откройте фильтры на экране «Грузы» и выберите нужный статус. Чтобы вернуть всё, сбросьте фильтры или выберите «Все».",
            img: "/faq-troubleshoot.svg",
            alt: "Фильтры грузов"
        },
        {
            q: "Почему вижу ошибку сети или пустой экран?",
            a: "Проверьте подключение к интернету и перезапустите приложение. Если проблема повторяется, напишите в поддержку — укажите примерное время и что именно произошло.",
            img: "/faq-troubleshoot.svg",
            alt: "Ошибки и сеть"
        },
        {
            q: "Как сменить активный аккаунт?",
            a: "В верхней части приложения откройте переключатель аккаунтов и выберите нужную компанию. Данные по грузам обновятся автоматически.",
            img: "/faq-account.svg",
            alt: "Переключение аккаунта"
        },
        {
            q: "Где посмотреть информацию о компании?",
            a: "В профиле откройте раздел «О компании». Там размещены контакты, адреса и основные сведения о HAULZ.",
            img: "/faq-account.svg",
            alt: "Информация о компании"
        },
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
            id: 'faq', 
            label: 'FAQ', 
            icon: <MessageCircle className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('faq')
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
            onUpdateAccount={onUpdateAccount}
            onBack={() => setCurrentView('main')}
            onAddCompany={() => setCurrentView('addCompanyMethod')}
        />;
    }

    const SERVICE_MODE_PASSWORD = 'Haulz2026!/!';
    const SERVICE_MODE_STORAGE_KEY = 'haulz.serviceMode';

    if (currentView === 'serviceMode') {
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('main')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Служебный режим</Typography.Headline>
                </Flex>
                <Typography.Body style={{ marginBottom: '1.75rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                    В служебном режиме на вкладке «Грузы» можно включить запрос перевозок только по датам (без ИНН и роли).
                </Typography.Body>
                {serviceModeActive ? (
                    <Panel className="cargo-card" style={{ padding: '1rem' }}>
                        <Typography.Body style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Режим активен</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                            На вкладке «Грузы» рядом с выбором заказчика появится переключатель. Включите его для запроса по датам.
                        </Typography.Body>
                        <Button className="filter-button" onClick={() => { localStorage.removeItem(SERVICE_MODE_STORAGE_KEY); setServiceModeActive(false); onServiceModeChange?.(); }}>
                            Деактивировать
                        </Button>
                    </Panel>
                ) : (
                    <Panel className="cargo-card" style={{ padding: '1rem' }}>
                        <Typography.Body style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Пароль</Typography.Body>
                        <Input
                            type="password"
                            value={serviceModePwd}
                            onChange={(e) => { setServiceModePwd(e.target.value); setServiceModeError(null); }}
                            placeholder="Введите пароль"
                            style={{ marginBottom: '0.75rem' }}
                        />
                        {serviceModeError ? <Typography.Body style={{ color: 'var(--color-error)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>{serviceModeError}</Typography.Body> : null}
                        <Button
                            className="filter-button"
                            onClick={() => {
                                if (serviceModePwd.trim() === SERVICE_MODE_PASSWORD) {
                                    localStorage.setItem(SERVICE_MODE_STORAGE_KEY, '1');
                                    setServiceModeActive(true);
                                    setServiceModeError(null);
                                    onServiceModeChange?.();
                                } else {
                                    setServiceModeError('Неверный пароль');
                                }
                            }}
                        >
                            Активировать
                        </Button>
                    </Panel>
                )}
            </div>
        );
    }

    if (currentView === 'roles') {
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('main')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Роли</Typography.Headline>
                </Flex>
                <Typography.Body style={{ marginBottom: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                    Включите роли, если хотите видеть перевозки, где вы выступаете в качестве заказчика, отправителя или получателя.
                </Typography.Body>
                {!activeAccountId || !activeAccount ? (
                    <Panel className="cargo-card" style={{ padding: '1rem', textAlign: 'center' }}>
                        <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Сначала добавьте аккаунт в «Мои компании».</Typography.Body>
                    </Panel>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <Panel className="cargo-card" style={{ padding: '1rem' }} onClick={(e) => e.stopPropagation()}>
                            <Flex align="center" justify="space-between" style={{ marginBottom: '0.25rem' }}>
                                <Typography.Body style={{ fontWeight: 600 }}>Заказчик</Typography.Body>
                                <span className="roles-switch-wrap" onClick={(e) => e.stopPropagation()}>
                                    <TapSwitch
                                        checked={activeAccount.roleCustomer ?? true}
                                        onToggle={() => onUpdateAccount(activeAccountId, { roleCustomer: !(activeAccount.roleCustomer ?? true) })}
                                    />
                                </span>
                            </Flex>
                            <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                Включите, если хотите видеть перевозки, где вы выступаете в качестве заказчика (полные данные, включая стоимость).
                            </Typography.Body>
                        </Panel>
                        <Panel className="cargo-card" style={{ padding: '1rem' }} onClick={(e) => e.stopPropagation()}>
                            <Flex align="center" justify="space-between" style={{ marginBottom: '0.25rem' }}>
                                <Typography.Body style={{ fontWeight: 600 }}>Отправитель</Typography.Body>
                                <span className="roles-switch-wrap" onClick={(e) => e.stopPropagation()}>
                                    <TapSwitch
                                        checked={activeAccount.roleSender ?? true}
                                        onToggle={() => onUpdateAccount(activeAccountId, { roleSender: !(activeAccount.roleSender ?? true) })}
                                    />
                                </span>
                            </Flex>
                            <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                Включите, если хотите видеть перевозки, где вы выступаете в качестве отправителя (без финансовой информации).
                            </Typography.Body>
                        </Panel>
                        <Panel className="cargo-card" style={{ padding: '1rem' }} onClick={(e) => e.stopPropagation()}>
                            <Flex align="center" justify="space-between" style={{ marginBottom: '0.25rem' }}>
                                <Typography.Body style={{ fontWeight: 600 }}>Получатель</Typography.Body>
                                <span className="roles-switch-wrap" onClick={(e) => e.stopPropagation()}>
                                    <TapSwitch
                                        checked={activeAccount.roleReceiver ?? true}
                                        onToggle={() => onUpdateAccount(activeAccountId, { roleReceiver: !(activeAccount.roleReceiver ?? true) })}
                                    />
                                </span>
                            </Flex>
                            <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                Включите, если хотите видеть перевозки, где вы выступаете в качестве получателя (без финансовой информации).
                            </Typography.Body>
                        </Panel>
                    </div>
                )}
            </div>
        );
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

    if (currentView === 'voiceAssistants') {
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('main')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Голосовые помощники</Typography.Headline>
                </Flex>
                <Typography.Body style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Алиса</Typography.Body>
                <Panel
                    className="cargo-card"
                    style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
                >
                    <Typography.Body style={{ fontSize: '0.9rem' }}>
                        Скажите Алисе: «Запусти навык Холз» и назовите код ниже. После привязки Алиса подтвердит компанию. Голосом можно узнавать перевозки в пути, счета на оплату, краткий статус «что в работе», сводку за день или за период, статус по номеру перевозки; при ответе «подробнее» Алиса скажет «Написал в чат» и отправит таблицу в чат мини‑приложения (номер / дата / кол-во / плат вес / сумма). Номера перевозок произносятся по три цифры (135200 — «сто тридцать пять двести»). Если привязано несколько компаний — можно переключиться голосом или отвязать навык фразой «Отвяжи компанию».
                    </Typography.Body>
                    <Button
                        className="button-primary"
                        type="button"
                        disabled={!activeAccount?.login || !activeAccount?.password || aliceLoading}
                        onClick={async () => {
                            if (!activeAccount?.login || !activeAccount?.password) return;
                            try {
                                setAliceError(null);
                                setAliceSuccess(null);
                                setAliceLoading(true);
                                const res = await fetch("/api/alice-link", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        login: activeAccount.login,
                                        password: activeAccount.password,
                                        customer: activeAccount.customer || null,
                                        inn: activeAccount.activeCustomerInn ?? undefined,
                                    }),
                                });
                                if (!res.ok) {
                                    const err = await res.json().catch(() => ({}));
                                    throw new Error(err?.error || "Не удалось получить код");
                                }
                                const data = await res.json();
                                setAliceCode(String(data?.code || ""));
                                setAliceExpiresAt(Date.now() + (Number(data?.ttl || 0) * 1000));
                            } catch (e: any) {
                                setAliceError(e?.message || "Не удалось получить код");
                            } finally {
                                setAliceLoading(false);
                            }
                        }}
                    >
                        {aliceLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "Получить код для Алисы"}
                    </Button>
                    {aliceCode && (
                        <Typography.Body style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                            Код: {aliceCode}
                        </Typography.Body>
                    )}
                    {aliceExpiresAt && (
                        <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                            Код действует до {new Date(aliceExpiresAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        </Typography.Body>
                    )}
                    {aliceError && (
                        <Flex align="center" className="login-error">
                            <AlertTriangle className="w-4 h-4 mr-2" />
                            <Typography.Body style={{ fontSize: '0.85rem' }}>{aliceError}</Typography.Body>
                        </Flex>
                    )}
                    {aliceSuccess && (
                        <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-success, #22c55e)' }}>
                            {aliceSuccess}
                        </Typography.Body>
                    )}
                    <Typography.Body style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                        Чтобы отключить навык от аккаунта, нажмите кнопку ниже.
                    </Typography.Body>
                    <Button
                        className="filter-button"
                        type="button"
                        disabled={!activeAccount?.login}
                        onClick={async () => {
                            if (!activeAccount?.login) return;
                            try {
                                setAliceError(null);
                                setAliceSuccess(null);
                                const res = await fetch("/api/alice-unlink", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ login: activeAccount.login.trim().toLowerCase() }),
                                });
                                const data = await res.json().catch(() => ({}));
                                if (res.ok && data?.ok) {
                                    setAliceCode(null);
                                    setAliceExpiresAt(null);
                                    setAliceSuccess(data?.message || "Алиса отвязана от аккаунта.");
                                } else {
                                    setAliceError(data?.error || "Не удалось отвязать.");
                                }
                            } catch (e: any) {
                                setAliceError(e?.message || "Ошибка сети.");
                            }
                        }}
                        style={{ marginTop: '0.25rem' }}
                    >
                        Отвязать от Алисы
                    </Button>
                </Panel>

                <Typography.Body style={{ marginTop: '1.25rem', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Описание навыков</Typography.Body>
                <Panel className="cargo-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                        «Запусти навык Холз» → назовите код из приложения → Алиса подтвердит компанию. Ниже — фразы и сценарии.
                    </Typography.Body>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600 }}>Перевозки и оплаты</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Какие перевозки в пути?» — кратко номера (по три цифры). «Подробнее» — Алиса скажет «Написал в чат» и отправит таблицу в чат (номер / дата / кол-во / плат вес / сумма).</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Какие счета на оплату?» — то же: кратко, по «подробнее» — таблица в чат.</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Что в работе?» / «Что у меня в работе?» — одна фраза: в пути N перевозок, к оплате M.</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Сводка за день» / «Сводка за сегодня» / «Сводка на сегодня» — ответ принято, в пути, на доставке, доставлено, счета на оплату (кол-во и сумма).</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Сколько перевозок за сегодня?» / «на этой неделе?» / «за неделю?» — число перевозок за период.</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Статус перевозки 135702» / «Перевозка 135702» / «Груз 135702» — детали по одной перевозке.</Typography.Body>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600 }}>Управление</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Работай от имени компании [название]» / «Переключись на компанию [название]» — переключить компанию (если привязано несколько).</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Отвяжи компанию» / «Отвяжи заказчика» / «Отвяжи» — отвязать навык; новый код — в приложении.</Typography.Body>
                    </div>
                    <Typography.Body style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                        Другие вопросы (контакты, груз по номеру) Алиса передаёт в чат поддержки с контекстом вашей компании.
                    </Typography.Body>
                </Panel>
            </div>
        );
    }

    if (currentView === 'notifications') {
        return (
            <NotificationsPage
                activeAccount={activeAccount}
                activeAccountId={activeAccountId}
                onBack={() => setCurrentView('main')}
                onOpenDeveloper={() => {}}
                onOpenTelegramBot={onOpenTelegramBot}
                onOpenMaxBot={onOpenMaxBot}
                onUpdateAccount={onUpdateAccount}
            />
        );
    }

    if (currentView === 'faq') {
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('main')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>FAQ</Typography.Headline>
                </Flex>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {faqItems.map((item, idx) => (
                        <Panel
                            key={`${item.q}-${idx}`}
                            className="cargo-card"
                            style={{
                                padding: '1rem',
                                display: 'flex',
                                gap: '0.75rem',
                                alignItems: 'flex-start'
                            }}
                        >
                            <img
                                src={item.img}
                                alt={item.alt}
                                style={{ width: '44px', height: '44px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }}
                                loading="lazy"
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                <Typography.Body style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                                    {item.q}
                                </Typography.Body>
                                <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                    {item.a}
                                </Typography.Body>
                            </div>
                        </Panel>
                    ))}
                </div>
            </div>
        );
    }

    if (currentView === '2fa' && activeAccountId && activeAccount) {
        const googleSecretSet = !!activeAccount.twoFactorGoogleSecretSet;
        const showGoogleSetup = twoFactorEnabled && twoFactorMethod === 'google' && !googleSecretSet;
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('main')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Двухфакторная аутентификация (2FA)</Typography.Headline>
                </Flex>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <Panel className="cargo-card" style={{ padding: '1rem' }}>
                        <Flex align="center" justify="space-between">
                            <Typography.Body style={{ fontSize: '0.9rem' }}>Google Authenticator</Typography.Body>
                            <TapSwitch
                                checked={twoFactorEnabled && twoFactorMethod === 'google'}
                                onToggle={() => {
                                    if (twoFactorEnabled && twoFactorMethod === 'google') {
                                        setTwoFactorEnabled(false);
                                        setTwoFactorMethod('telegram');
                                        setGoogleSetupData(null);
                                        setGoogleSetupStep('idle');
                                        onUpdateAccount(activeAccountId, { twoFactorMethod: 'telegram', twoFactorEnabled: false });
                                    } else {
                                        setTwoFactorMethod('google');
                                        setTwoFactorEnabled(true);
                                        onUpdateAccount(activeAccountId, { twoFactorMethod: 'google', twoFactorEnabled: true });
                                    }
                                }}
                            />
                        </Flex>
                        {showGoogleSetup && (
                            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {googleSetupStep === 'idle' && !googleSetupData && (
                                    <>
                                        <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                            Отсканируйте QR-код в приложении Google Authenticator или введите ключ вручную.
                                        </Typography.Body>
                                        <Button
                                            className="filter-button"
                                            size="small"
                                            disabled={googleSetupLoading}
                                            onClick={async () => {
                                                if (!activeAccount?.login) return;
                                                setGoogleSetupError(null);
                                                setGoogleSetupLoading(true);
                                                try {
                                                    const res = await fetch('/api/2fa-google', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ login: activeAccount.login, action: 'setup' }),
                                                    });
                                                    const data = await res.json();
                                                    if (!res.ok) throw new Error(data?.error || 'Ошибка настройки');
                                                    setGoogleSetupData({ otpauthUrl: data.otpauthUrl, secret: data.secret });
                                                    setGoogleSetupStep('qr');
                                                } catch (e: any) {
                                                    setGoogleSetupError(e?.message || 'Не удалось начать настройку');
                                                } finally {
                                                    setGoogleSetupLoading(false);
                                                }
                                            }}
                                            style={{ fontSize: '0.85rem', alignSelf: 'flex-start' }}
                                        >
                                            {googleSetupLoading ? 'Загрузка…' : 'Настроить Google Authenticator'}
                                        </Button>
                                    </>
                                )}
                                {(googleSetupStep === 'qr' || googleSetupData) && googleSetupData && googleSetupStep !== 'verify' && (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                                            <img
                                                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(googleSetupData.otpauthUrl)}`}
                                                alt="QR для Google Authenticator"
                                                style={{ width: 200, height: 200 }}
                                            />
                                        </div>
                                        <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                            Ключ для ручного ввода: <code style={{ wordBreak: 'break-all', fontSize: '0.8rem' }}>{googleSetupData.secret}</code>
                                        </Typography.Body>
                                        <Button
                                            className="filter-button"
                                            size="small"
                                            onClick={() => { setGoogleSetupStep('verify'); setGoogleVerifyCode(''); setGoogleSetupError(null); }}
                                            style={{ fontSize: '0.85rem', alignSelf: 'flex-start' }}
                                        >
                                            Добавил в приложение
                                        </Button>
                                    </>
                                )}
                                {googleSetupStep === 'verify' && googleSetupData && (
                                    <form
                                        onSubmit={async (e) => {
                                            e.preventDefault();
                                            if (!activeAccount?.login || !googleVerifyCode.trim()) return;
                                            setGoogleSetupError(null);
                                            setGoogleSetupLoading(true);
                                            try {
                                                const res = await fetch('/api/2fa-google', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ login: activeAccount.login, action: 'verify', code: googleVerifyCode.trim() }),
                                                });
                                                const data = await res.json();
                                                if (!res.ok) throw new Error(data?.error || 'Неверный код');
                                                await fetch('/api/2fa', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ login: activeAccount.login, enabled: true, method: 'google', telegramLinked: false }),
                                                });
                                                onUpdateAccount(activeAccountId, { twoFactorEnabled: true, twoFactorMethod: 'google', twoFactorGoogleSecretSet: true });
                                                setGoogleSetupData(null);
                                                setGoogleSetupStep('idle');
                                                setGoogleVerifyCode('');
                                            } catch (err: any) {
                                                setGoogleSetupError(err?.message || 'Неверный код');
                                            } finally {
                                                setGoogleSetupLoading(false);
                                            }
                                        }}
                                        style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
                                    >
                                        <Typography.Body style={{ fontSize: '0.85rem' }}>Введите 6-значный код из приложения</Typography.Body>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            maxLength={6}
                                            placeholder="000000"
                                            value={googleVerifyCode}
                                            onChange={(e) => setGoogleVerifyCode(e.target.value.replace(/\D/g, ''))}
                                            style={{ padding: '0.5rem', fontSize: '1rem', textAlign: 'center', letterSpacing: '0.25em' }}
                                        />
                                        <Button type="submit" className="button-primary" disabled={googleVerifyCode.length !== 6 || googleSetupLoading} style={{ alignSelf: 'flex-start' }}>
                                            {googleSetupLoading ? 'Проверка…' : 'Подтвердить'}
                                        </Button>
                                        {googleSetupError && (
                                            <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-error-status)' }}>{googleSetupError}</Typography.Body>
                                        )}
                                    </form>
                                )}
                            </div>
                        )}
                        {twoFactorEnabled && twoFactorMethod === 'google' && googleSecretSet && (
                            <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-success-status)', marginTop: '0.5rem' }}>
                                Google Authenticator настроен
                            </Typography.Body>
                        )}
                    </Panel>
                    <Panel className="cargo-card" style={{ padding: '1rem' }}>
                        <Flex align="center" justify="space-between" style={{ marginBottom: twoFactorMethod === 'telegram' && !twoFactorTelegramLinked && onOpenTelegramBot ? '0.5rem' : 0 }}>
                            <Typography.Body style={{ fontSize: '0.9rem' }}>Telegram</Typography.Body>
                            <TapSwitch
                                checked={twoFactorEnabled && twoFactorMethod === 'telegram'}
                                onToggle={() => {
                                    if (twoFactorEnabled && twoFactorMethod === 'telegram') {
                                        setTwoFactorEnabled(false);
                                        setTwoFactorMethod('google');
                                        onUpdateAccount(activeAccountId, { twoFactorMethod: 'google', twoFactorEnabled: false });
                                    } else {
                                        setTwoFactorMethod('telegram');
                                        setTwoFactorEnabled(true);
                                        onUpdateAccount(activeAccountId, { twoFactorMethod: 'telegram', twoFactorEnabled: true });
                                    }
                                }}
                            />
                        </Flex>
                        {twoFactorEnabled && twoFactorMethod === 'telegram' && (
                            <>
                                {twoFactorTelegramLinked ? (
                                    <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-success-status)' }}>
                                        Telegram привязан
                                    </Typography.Body>
                                ) : onOpenTelegramBot ? (
                                    <Button
                                        className="filter-button"
                                        size="small"
                                        disabled={tgLinkChecking}
                                        onClick={async () => {
                                            setTgLinkError(null);
                                            try {
                                                await onOpenTelegramBot();
                                                void pollTelegramLink();
                                            } catch (e: any) {
                                                setTgLinkError(e?.message || 'Не удалось открыть бота.');
                                            }
                                        }}
                                        style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}
                                    >
                                        {tgLinkChecking ? 'Проверка…' : 'Привязать Telegram'}
                                    </Button>
                                ) : (
                                    <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                        Откройте бота для привязки
                                    </Typography.Body>
                                )}
                            </>
                        )}
                    </Panel>
                </div>
            </div>
        );
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* 2FA — переход на отдельную страницу */}
                    {activeAccountId && activeAccount && (
                        <Panel
                            className="cargo-card"
                            onClick={() => setCurrentView('2fa')}
                            style={{ display: 'flex', alignItems: 'center', padding: '1rem', cursor: 'pointer' }}
                        >
                            <Flex align="center" style={{ flex: 1, gap: '0.75rem' }}>
                                <div style={{ color: 'var(--color-primary)' }}>
                                    <Shield className="w-5 h-5" />
                                </div>
                                <Typography.Body style={{ fontSize: '0.9rem' }}>Двухфакторная аутентификация (2FA)</Typography.Body>
                            </Flex>
                        </Panel>
                    )}
                    {/* Уведомления — временно отключено
                    <Panel ... onClick={() => setCurrentView('notifications')} ... >
                        <Typography.Body>Уведомления</Typography.Body>
                    </Panel>
                    */}
                </div>
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

// --- COMPANIES LIST PAGE (данные из БД, единый список по названию) ---

/** Одна компания на одно название: убираем дубли от разных способов авторизации (Способ 1 — без ИНН, Способ 2 — с ИНН). Приоритет — строка с непустым ИНН. */
function dedupeCompaniesByName(rows: CompanyRow[]): CompanyRow[] {
  const byName = new Map<string, CompanyRow>();
  const normalize = (s: string) => (s || "").trim().toLowerCase();
  for (const c of rows) {
    const key = normalize(c.name);
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, c);
    } else {
      const hasInn = (c.inn || "").trim().length > 0;
      const existingHasInn = (existing.inn || "").trim().length > 0;
      if (hasInn && !existingHasInn) byName.set(key, c);
    }
  }
  return Array.from(byName.values());
}

function CompaniesListPage({
    accounts,
    activeAccountId,
    onSwitchAccount,
    onRemoveAccount,
    onUpdateAccount,
    onBack,
    onAddCompany
}: {
    accounts: Account[];
    activeAccountId: string | null;
    onSwitchAccount: (accountId: string) => void;
    onRemoveAccount: (accountId: string) => void;
    onUpdateAccount: (accountId: string, patch: Partial<Account>) => void;
    onBack: () => void;
    onAddCompany: () => void;
}) {
    const [companies, setCompanies] = React.useState<CompanyRow[]>([]);
    const [loading, setLoading] = React.useState(true);

    useEffect(() => {
        if (accounts.length === 0) {
            setCompanies([]);
            setLoading(false);
            return;
        }
        const logins = [...new Set(accounts.map((a) => a.login.trim().toLowerCase()))];
        const query = logins.map((l) => `login=${encodeURIComponent(l)}`).join("&");
        setLoading(true);
        fetch(`/api/companies?${query}`)
            .then((r) => r.json())
            .then((data) => {
                const list = Array.isArray(data?.companies) ? data.companies : [];
                setCompanies(dedupeCompaniesByName(list));
            })
            .catch(() => setCompanies([]))
            .finally(() => setLoading(false));
    }, [accounts.map((a) => a.login).join(",")]);

    const activeAccount = accounts.find((acc) => acc.id === activeAccountId) || null;
    const activeLogin = activeAccount?.login?.trim().toLowerCase() ?? "";
    const activeInn = activeAccount?.activeCustomerInn ?? activeAccount?.customers?.[0]?.inn ?? "";

    const handleSelectCompany = (c: CompanyRow) => {
        const acc = accounts.find((a) => a.login.trim().toLowerCase() === c.login);
        if (!acc) return;
        onSwitchAccount(acc.id);
        if (c.inn !== undefined && c.inn !== null) {
            onUpdateAccount(acc.id, { activeCustomerInn: c.inn });
        }
    };

    const handleRemoveByLogin = (login: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const acc = accounts.find((a) => a.login.trim().toLowerCase() === login);
        if (acc) onRemoveAccount(acc.id);
    };

    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: "1.25rem" }}>Мои компании</Typography.Headline>
            </Flex>

            {loading ? (
                <Panel className="cargo-card" style={{ padding: "1rem", textAlign: "center" }}>
                    <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                        Загрузка…
                    </Typography.Body>
                </Panel>
            ) : companies.length === 0 ? (
                <Panel className="cargo-card" style={{ padding: "1rem", textAlign: "center" }}>
                    <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                        Нет добавленных компаний
                    </Typography.Body>
                </Panel>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
                    {companies.map((c) => {
                        const isActive = activeLogin === c.login && (c.inn === "" || c.inn === activeInn);
                        return (
                            <Panel
                                key={`${c.login}-${c.inn}`}
                                className="cargo-card"
                                style={{
                                    padding: "0.75rem 1rem",
                                    cursor: "pointer",
                                    borderLeft: isActive ? "3px solid var(--color-primary)" : undefined,
                                }}
                                onClick={() => handleSelectCompany(c)}
                            >
                                <Flex align="center" justify="space-between">
                                    <Typography.Body
                                        style={{
                                            fontSize: "0.9rem",
                                            fontWeight: isActive ? 600 : "normal",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                        }}
                                    >
                                        {stripOoo(c.name)}
                                    </Typography.Body>
                                    <Flex align="center" style={{ gap: "0.5rem", flexShrink: 0 }}>
                                        {isActive && <span className="status-value success">Активна</span>}
                                        {accounts.length > 1 && (
                                            <Button
                                                className="filter-button"
                                                onClick={(e) => handleRemoveByLogin(c.login, e)}
                                                style={{
                                                    padding: "0.25rem 0.5rem",
                                                    minWidth: "auto",
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                }}
                                                title="Удалить учётную запись"
                                                aria-label="Удалить учётную запись"
                                            >
                                                <Trash2 className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
                                            </Button>
                                        )}
                                    </Flex>
                                </Flex>
                            </Panel>
                        );
                    })}
                </div>
            )}

            <Button
                className="button-primary"
                onClick={onAddCompany}
                style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    fontSize: "0.9rem",
                    padding: "0.75rem",
                }}
            >
                <Plus className="w-4 h-4" />
                Добавить компанию
            </Button>
        </div>
    );
}

// --- CARGO PAGE (LIST ONLY) ---
const PEREVOZKI_MODES: PerevozkiRole[] = ["Customer", "Sender", "Receiver"];

function CargoPage({ 
    auth, 
    searchText, 
    onOpenChat, 
    onCustomerDetected,
    contextCargoNumber,
    onClearContextCargo,
    initialStatusFilter,
    onClearQuickFilters,
    roleCustomer = true,
    roleSender = true,
    roleReceiver = true,
    useServiceRequest = false,
}: { 
    auth: AuthData; 
    searchText: string; 
    onOpenChat: (cargoNumber?: string) => void | Promise<void>; 
    onCustomerDetected?: (customer: string) => void;
    contextCargoNumber?: string | null;
    onClearContextCargo?: () => void;
    initialStatusFilter?: StatusFilter;
    onClearQuickFilters?: () => void;
    roleCustomer?: boolean;
    roleSender?: boolean;
    roleReceiver?: boolean;
    /** Служебный режим: один запрос только по датам (без INN и Mode) */
    useServiceRequest?: boolean;
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
    const [dateDropdownMode, setDateDropdownMode] = useState<'main' | 'months'>('main');
    const [selectedMonthForFilter, setSelectedMonthForFilter] = useState<{ year: number; month: number } | null>(null);
    const monthLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const monthWasLongPressRef = useRef(false);
    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
    const [senderFilter, setSenderFilter] = useState<string>('');
    const [receiverFilter, setReceiverFilter] = useState<string>('');
    const [billStatusFilter, setBillStatusFilter] = useState<BillStatusFilterKey>('all');
    const [typeFilter, setTypeFilter] = useState<'all' | 'ferry' | 'auto'>('all');
    const [routeFilter, setRouteFilter] = useState<'all' | 'MSK-KGD' | 'KGD-MSK'>('all');
    const [isSenderDropdownOpen, setIsSenderDropdownOpen] = useState(false);
    const [isReceiverDropdownOpen, setIsReceiverDropdownOpen] = useState(false);
    const [isBillStatusDropdownOpen, setIsBillStatusDropdownOpen] = useState(false);
    const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
    const [isRouteDropdownOpen, setIsRouteDropdownOpen] = useState(false);
    const [showSummary, setShowSummary] = useState(true);
    /** В служебном режиме: табличный вид с суммированием по заказчику */
    const [tableModeByCustomer, setTableModeByCustomer] = useState(false);
    /** Сортировка таблицы по заказчику: столбец и направление (а-я / я-а) */
    const [tableSortColumn, setTableSortColumn] = useState<'customer' | 'sum' | 'mest' | 'pw' | 'w' | 'vol' | 'count'>('customer');
    const [tableSortOrder, setTableSortOrder] = useState<'asc' | 'desc'>('asc');
    /** Развёрнутая строка таблицы по заказчику: показываем детальные перевозки */
    const [expandedTableCustomer, setExpandedTableCustomer] = useState<string | null>(null);
    /** Данные предыдущего периода (для динамики период к периоду в служебном режиме) */
    const [prevPeriodItems, setPrevPeriodItems] = useState<CargoItem[]>([]);
    const [prevPeriodLoading, setPrevPeriodLoading] = useState(false);
    const dateButtonRef = useRef<HTMLDivElement>(null);
    const statusButtonRef = useRef<HTMLDivElement>(null);
    const senderButtonRef = useRef<HTMLDivElement>(null);
    const receiverButtonRef = useRef<HTMLDivElement>(null);
    const billStatusButtonRef = useRef<HTMLDivElement>(null);
    const typeButtonRef = useRef<HTMLDivElement>(null);
    const routeButtonRef = useRef<HTMLDivElement>(null);
    // Sort State
    const [sortBy, setSortBy] = useState<'datePrih' | 'dateVr' | null>('datePrih');
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

    const apiDateRange = useMemo(() => {
        if (dateFilter === "период") return { dateFrom: customDateFrom, dateTo: customDateTo };
        if (dateFilter === "месяц" && selectedMonthForFilter) {
            const { year, month } = selectedMonthForFilter;
            const pad = (n: number) => String(n).padStart(2, '0');
            const lastDay = new Date(year, month, 0).getDate();
            return {
                dateFrom: `${year}-${pad(month)}-01`,
                dateTo: `${year}-${pad(month)}-${pad(lastDay)}`,
            };
        }
        return getDateRange(dateFilter);
    }, [dateFilter, customDateFrom, customDateTo, selectedMonthForFilter]);

    // Удалена функция findDeliveryDate, используем DateVr напрямую.

    const loadCargo = useCallback(async (dateFrom: string, dateTo: string) => {
        if (!auth?.login || !auth?.password) {
            setItems([]);
            setLoading(false);
            setError(null);
            return;
        }
        setLoading(true); setError(null);
        try {
            if (useServiceRequest) {
                const res = await fetch(PROXY_API_BASE_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        login: auth.login,
                        password: auth.password,
                        dateFrom,
                        dateTo,
                        serviceMode: true,
                    }),
                });
                await ensureOk(res, "Ошибка загрузки данных");
                const data = await res.json();
                const list = Array.isArray(data) ? data : data.items || [];
                const mapped = list.map((item: any) => ({
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
                    _role: "Customer" as PerevozkiRole,
                }));
                setItems(mapped);
                const customerItem = mapped.find((item: CargoItem) => item.Customer);
                if (customerItem?.Customer && onCustomerDetected) {
                    onCustomerDetected(customerItem.Customer);
                }
                return;
            }

            const modesToRequest: PerevozkiRole[] = [];
            if (roleCustomer) modesToRequest.push("Customer");
            if (roleSender) modesToRequest.push("Sender");
            if (roleReceiver) modesToRequest.push("Receiver");
            if (modesToRequest.length === 0) {
                setItems([]);
                return;
            }

            const basePayload = { login: auth.login, password: auth.password, dateFrom, dateTo, ...(auth.inn ? { inn: auth.inn } : {}) };
            const allMapped: CargoItem[] = [];
            for (const mode of modesToRequest) {
                const res = await fetch(PROXY_API_BASE_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...basePayload, mode }),
                });
                await ensureOk(res, "Ошибка загрузки данных");
                const data = await res.json();
                const list = Array.isArray(data) ? data : data.items || [];
                const mapped = list.map((item: any) => ({
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
                    _role: mode,
                }));
                allMapped.push(...mapped);
            }

            const parseDateValue = (value: any): number => {
                if (!value) return 0;
                const d = new Date(String(value));
                return isNaN(d.getTime()) ? 0 : d.getTime();
            };
            const rolePriority: Record<PerevozkiRole, number> = { Customer: 3, Sender: 2, Receiver: 1 };
            const chooseBest = (a: CargoItem, b: CargoItem): CargoItem => {
                const aDate = parseDateValue(a.DatePrih) || parseDateValue(a.DateVr);
                const bDate = parseDateValue(b.DatePrih) || parseDateValue(b.DateVr);
                if (aDate !== bDate) return aDate >= bDate ? a : b;
                return (rolePriority[(a._role as PerevozkiRole) || "Receiver"] >= rolePriority[(b._role as PerevozkiRole) || "Receiver"]) ? a : b;
            };

            const byNumber = new Map<string, CargoItem>();
            allMapped.forEach((item) => {
                const key = String(item.Number || "").trim();
                if (!key) return;
                const existing = byNumber.get(key);
                byNumber.set(key, existing ? chooseBest(existing, item) : item);
            });

            const deduped: CargoItem[] = Array.from(byNumber.values());

            setItems(deduped);

            const customerItem = allMapped.find((item: CargoItem) => item.Customer);
            if (customerItem?.Customer && onCustomerDetected) {
                onCustomerDetected(customerItem.Customer);
            }
        } catch (e: any) { setError(e.message); } finally { setLoading(false); }
    }, [auth, roleCustomer, roleSender, roleReceiver, useServiceRequest]);

    /** Загрузка предыдущего периода для динамики период к периоду (только в служебном режиме) */
    const loadPrevPeriodCargo = useCallback(async (dateFrom: string, dateTo: string) => {
        if (!auth?.login || !auth?.password || !useServiceRequest) {
            setPrevPeriodItems([]);
            return;
        }
        setPrevPeriodLoading(true);
        try {
            const res = await fetch(PROXY_API_BASE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    login: auth.login,
                    password: auth.password,
                    dateFrom,
                    dateTo,
                    serviceMode: true,
                }),
            });
            await ensureOk(res, "Ошибка загрузки данных предыдущего периода");
            const data = await res.json();
            const list = Array.isArray(data) ? data : data.items || [];
            setPrevPeriodItems(list.map((item: any) => ({
                ...item,
                Number: item.Number,
                DatePrih: item.DatePrih,
                State: item.State,
                Mest: item.Mest,
                PW: item.PW,
                W: item.W,
                Value: item.Value,
                Sum: item.Sum,
                Customer: item.Customer ?? item.customer,
            })));
        } catch (e: any) {
            setPrevPeriodItems([]);
        } finally {
            setPrevPeriodLoading(false);
        }
    }, [auth, useServiceRequest]);

    // При смене аккаунта или переключателя служебного запроса — перезапрос грузов
    useEffect(() => { loadCargo(apiDateRange.dateFrom, apiDateRange.dateTo); }, [apiDateRange, loadCargo, auth, useServiceRequest]);

    // Загрузка предыдущего периода для динамики по заказчикам (служебный режим)
    useEffect(() => {
        if (!useServiceRequest) {
            setPrevPeriodItems([]);
            return;
        }
        const prevRange = getPreviousPeriodRange(dateFilter, apiDateRange.dateFrom, apiDateRange.dateTo);
        if (!prevRange) return;
        loadPrevPeriodCargo(prevRange.dateFrom, prevRange.dateTo);
    }, [useServiceRequest, dateFilter, apiDateRange.dateFrom, apiDateRange.dateTo, loadPrevPeriodCargo]);

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

    const uniqueSenders = useMemo(() => [...new Set(items.map(i => (i.Sender ?? '').trim()).filter(Boolean))].sort(), [items]);
    const uniqueReceivers = useMemo(() => [...new Set(items.map(i => (i.Receiver ?? (i as any).receiver ?? '').trim()).filter(Boolean))].sort(), [items]);

    // Client-side filtering and sorting
    const filteredItems = useMemo(() => {
        let res = items.filter(i => !isReceivedInfoStatus(i.State));
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
        if (senderFilter) res = res.filter(i => (i.Sender ?? '').trim() === senderFilter);
        if (receiverFilter) res = res.filter(i => (i.Receiver ?? (i as any).receiver ?? '').trim() === receiverFilter);
        if (useServiceRequest && billStatusFilter !== 'all') res = res.filter(i => getPaymentFilterKey(i.StateBill) === billStatusFilter);
        if (typeFilter === 'ferry') res = res.filter(i => i?.AK === true || i?.AK === 'true' || i?.AK === '1' || i?.AK === 1);
        if (typeFilter === 'auto') res = res.filter(i => !(i?.AK === true || i?.AK === 'true' || i?.AK === '1' || i?.AK === 1));
        if (routeFilter === 'MSK-KGD') res = res.filter(i => cityToCode(i.CitySender) === 'MSK' && cityToCode(i.CityReceiver) === 'KGD');
        if (routeFilter === 'KGD-MSK') res = res.filter(i => cityToCode(i.CitySender) === 'KGD' && cityToCode(i.CityReceiver) === 'MSK');
        
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
    }, [items, statusFilter, searchText, senderFilter, receiverFilter, billStatusFilter, useServiceRequest, typeFilter, routeFilter, sortBy, sortOrder, favorites]);

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
        
        const totalW = filteredItems.reduce((acc, item) => {
            const w = typeof item.W === 'string' ? parseFloat(item.W) || 0 : (item.W || 0);
            return acc + w;
        }, 0);
        
        const totalValue = filteredItems.reduce((acc, item) => {
            const v = typeof item.Value === 'string' ? parseFloat(item.Value) || 0 : (item.Value || 0);
            return acc + v;
        }, 0);
        
        return {
            sum: totalSum,
            mest: totalMest,
            pw: totalPW,
            w: totalW,
            vol: totalValue
        };
    }, [filteredItems]);

    /** Группировка по заказчику для табличного режима (только при useServiceRequest) */
    const groupedByCustomer = useMemo(() => {
        const map = new Map<string, { customer: string; items: CargoItem[]; sum: number; mest: number; pw: number; w: number; vol: number }>();
        filteredItems.forEach(item => {
            const key = (item.Customer ?? (item as any).customer ?? '').trim() || '—';
            const existing = map.get(key);
            const sum = typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
            const mest = typeof item.Mest === 'string' ? parseFloat(item.Mest) || 0 : (item.Mest || 0);
            const pw = typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
            const w = typeof item.W === 'string' ? parseFloat(item.W) || 0 : (item.W || 0);
            const vol = typeof item.Value === 'string' ? parseFloat(item.Value) || 0 : (item.Value || 0);
            if (existing) {
                existing.items.push(item);
                existing.sum += sum;
                existing.mest += mest;
                existing.pw += pw;
                existing.w += w;
                existing.vol += vol;
            } else {
                map.set(key, { customer: key, items: [item], sum, mest, pw, w, vol });
            }
        });
        return Array.from(map.entries()).map(([, v]) => v);
    }, [filteredItems]);

    /** Отсортированные по выбранному столбцу данные для таблицы */
    const sortedGroupedByCustomer = useMemo(() => {
        const key = (row: { customer: string; sum: number; mest: number; pw: number; w: number; vol: number; items: CargoItem[] }) => {
            switch (tableSortColumn) {
                case 'customer': return (stripOoo(row.customer) || '').toLowerCase();
                case 'sum': return row.sum;
                case 'mest': return row.mest;
                case 'pw': return row.pw;
                case 'w': return row.w;
                case 'vol': return row.vol;
                case 'count': return row.items.length;
                default: return (stripOoo(row.customer) || '').toLowerCase();
            }
        };
        return [...groupedByCustomer].sort((a, b) => {
            const va = key(a);
            const vb = key(b);
            const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
            return tableSortOrder === 'asc' ? cmp : -cmp;
        });
    }, [groupedByCustomer, tableSortColumn, tableSortOrder]);

    const handleTableSort = (column: typeof tableSortColumn) => {
        if (tableSortColumn === column) {
            setTableSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        } else {
            setTableSortColumn(column);
            setTableSortOrder('asc');
        }
    };

    return (
        <div className="w-full">
            <div className="cargo-page-sticky-header">
            {/* Заголовок вкладки и переключатель «Таблица по заказчику» */}
            <Flex align="center" justify="space-between" style={{ marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <Typography.Headline style={{ fontSize: '1.25rem' }}>Грузы</Typography.Headline>
                {useServiceRequest && (
                    <Flex align="center" gap="0.5rem" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                        <Typography.Body style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Таблица по заказчику</Typography.Body>
                        <span className="roles-switch-wrap">
                            <TapSwitch
                                checked={tableModeByCustomer}
                                onToggle={() => setTableModeByCustomer(v => !v)}
                            />
                        </span>
                    </Flex>
                )}
            </Flex>
            {/* Filters */}
            <div className="filters-container filters-row-scroll">
                <div className="filter-group" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                    {/* Кнопка сортировки по датам — первая */}
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
                    <div ref={dateButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsDateDropdownOpen(!isDateDropdownOpen); setDateDropdownMode('main'); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Дата: {dateFilter === 'период' ? 'Период' : dateFilter === 'месяц' && selectedMonthForFilter ? `${MONTH_NAMES[selectedMonthForFilter.month - 1]} ${selectedMonthForFilter.year}` : dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1)} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={dateButtonRef} isOpen={isDateDropdownOpen}>
                        {dateDropdownMode === 'months' ? (
                            <>
                                <div className="dropdown-item" onClick={() => setDateDropdownMode('main')} style={{ fontWeight: 600 }}>← Назад</div>
                                {MONTH_NAMES.map((name, i) => (
                                    <div key={i} className="dropdown-item" onClick={() => {
                                        const year = new Date().getFullYear();
                                        setDateFilter('месяц');
                                        setSelectedMonthForFilter({ year, month: i + 1 });
                                        setIsDateDropdownOpen(false);
                                        setDateDropdownMode('main');
                                    }}>
                                        <Typography.Body>{name} {new Date().getFullYear()}</Typography.Body>
                                    </div>
                                ))}
                            </>
                        ) : (
                            ['сегодня', 'вчера', 'неделя', 'месяц', 'год', 'период'].map(key => {
                                const isMonth = key === 'месяц';
                                return (
                                    <div key={key} className="dropdown-item" title={isMonth ? 'Клик — текущий месяц; удерживайте — выбор месяца' : undefined}
                                        onPointerDown={isMonth ? () => { monthWasLongPressRef.current = false; monthLongPressTimerRef.current = setTimeout(() => { monthLongPressTimerRef.current = null; monthWasLongPressRef.current = true; setDateDropdownMode('months'); }, 500); } : undefined}
                                        onPointerUp={isMonth ? () => { if (monthLongPressTimerRef.current) { clearTimeout(monthLongPressTimerRef.current); monthLongPressTimerRef.current = null; } } : undefined}
                                        onPointerLeave={isMonth ? () => { if (monthLongPressTimerRef.current) { clearTimeout(monthLongPressTimerRef.current); monthLongPressTimerRef.current = null; } } : undefined}
                                        onClick={() => {
                                            if (isMonth && monthWasLongPressRef.current) { monthWasLongPressRef.current = false; return; }
                                            if (key === 'период') {
                                                let r: { dateFrom: string; dateTo: string };
                                                if (dateFilter === "период") {
                                                    r = { dateFrom: customDateFrom, dateTo: customDateTo };
                                                } else if (dateFilter === "месяц" && selectedMonthForFilter) {
                                                    const { year, month } = selectedMonthForFilter;
                                                    const pad = (n: number) => String(n).padStart(2, '0');
                                                    const lastDay = new Date(year, month, 0).getDate();
                                                    r = { dateFrom: `${year}-${pad(month)}-01`, dateTo: `${year}-${pad(month)}-${pad(lastDay)}` };
                                                } else {
                                                    r = getDateRange(dateFilter);
                                                }
                                                setCustomDateFrom(r.dateFrom);
                                                setCustomDateTo(r.dateTo);
                                            }
                                            setDateFilter(key as any);
                                            if (key === 'месяц') setSelectedMonthForFilter(null);
                                            setIsDateDropdownOpen(false);
                                            if (key === 'период') setIsCustomModalOpen(true);
                                        }}>
                                        <Typography.Body>{key === 'год' ? 'Год' : key.charAt(0).toUpperCase() + key.slice(1)}</Typography.Body>
                                    </div>
                                );
                            })
                        )}
                    </FilterDropdownPortal>
                </div>
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={statusButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsStatusDropdownOpen(!isStatusDropdownOpen); setIsDateDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Статус: {STATUS_MAP[statusFilter]} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={statusButtonRef} isOpen={isStatusDropdownOpen}>
                        {Object.keys(STATUS_MAP).map(key => (
                            <div key={key} className="dropdown-item" onClick={() => { setStatusFilter(key as any); setIsStatusDropdownOpen(false); }}>
                                <Typography.Body>{STATUS_MAP[key as StatusFilter]}</Typography.Body>
                            </div>
                        ))}
                    </FilterDropdownPortal>
                </div>
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={senderButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsSenderDropdownOpen(!isSenderDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Отправитель: {senderFilter ? stripOoo(senderFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={senderButtonRef} isOpen={isSenderDropdownOpen}>
                        <div className="dropdown-item" onClick={() => { setSenderFilter(''); setIsSenderDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        {uniqueSenders.map(s => (
                            <div key={s} className="dropdown-item" onClick={() => { setSenderFilter(s); setIsSenderDropdownOpen(false); }}><Typography.Body>{stripOoo(s)}</Typography.Body></div>
                        ))}
                    </FilterDropdownPortal>
                </div>
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={receiverButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsReceiverDropdownOpen(!isReceiverDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Получатель: {receiverFilter ? stripOoo(receiverFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={receiverButtonRef} isOpen={isReceiverDropdownOpen}>
                        <div className="dropdown-item" onClick={() => { setReceiverFilter(''); setIsReceiverDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        {uniqueReceivers.map(r => (
                            <div key={r} className="dropdown-item" onClick={() => { setReceiverFilter(r); setIsReceiverDropdownOpen(false); }}><Typography.Body>{stripOoo(r)}</Typography.Body></div>
                        ))}
                    </FilterDropdownPortal>
                </div>
                {useServiceRequest && (
                    <div className="filter-group" style={{ flexShrink: 0 }}>
                        <div ref={billStatusButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsBillStatusDropdownOpen(!isBillStatusDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                                Статус счёта: {BILL_STATUS_MAP[billStatusFilter]} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={billStatusButtonRef} isOpen={isBillStatusDropdownOpen}>
                            {(['all', 'paid', 'unpaid', 'partial', 'cancelled', 'unknown'] as const).map(key => (
                                <div key={key} className="dropdown-item" onClick={() => { setBillStatusFilter(key); setIsBillStatusDropdownOpen(false); }}>
                                    <Typography.Body>{BILL_STATUS_MAP[key]}</Typography.Body>
                                </div>
                            ))}
                        </FilterDropdownPortal>
                    </div>
                )}
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={typeButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsTypeDropdownOpen(!isTypeDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Тип: {typeFilter === 'all' ? 'Все' : typeFilter === 'ferry' ? 'Паром' : 'Авто'} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={typeButtonRef} isOpen={isTypeDropdownOpen}>
                        <div className="dropdown-item" onClick={() => { setTypeFilter('all'); setIsTypeDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        <div className="dropdown-item" onClick={() => { setTypeFilter('ferry'); setIsTypeDropdownOpen(false); }}><Typography.Body>Паром</Typography.Body></div>
                        <div className="dropdown-item" onClick={() => { setTypeFilter('auto'); setIsTypeDropdownOpen(false); }}><Typography.Body>Авто</Typography.Body></div>
                    </FilterDropdownPortal>
                </div>
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={routeButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsRouteDropdownOpen(!isRouteDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); }}>
                            Маршрут: {routeFilter === 'all' ? 'Все' : routeFilter} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={routeButtonRef} isOpen={isRouteDropdownOpen}>
                        <div className="dropdown-item" onClick={() => { setRouteFilter('all'); setIsRouteDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        <div className="dropdown-item" onClick={() => { setRouteFilter('MSK-KGD'); setIsRouteDropdownOpen(false); }}><Typography.Body>MSK – KGD</Typography.Body></div>
                        <div className="dropdown-item" onClick={() => { setRouteFilter('KGD-MSK'); setIsRouteDropdownOpen(false); }}><Typography.Body>KGD – MSK</Typography.Body></div>
                    </FilterDropdownPortal>
                </div>
            </div>

            {/* Суммирующая строка: 1 ряд если влазит, 2 в ряд только на телефонах */}
            <div className="cargo-card mb-4" style={{ padding: '0.75rem' }}>
                <div className="summary-metrics">
                    <Flex direction="column" align="center">
                        <Typography.Label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Сумма</Typography.Label>
                        <Typography.Body style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                            {formatCurrency(summary.sum, true)}
                        </Typography.Body>
                    </Flex>
                    <Flex direction="column" align="center">
                        <Typography.Label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Мест</Typography.Label>
                        <Typography.Body style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                            {Math.round(summary.mest)}
                        </Typography.Body>
                    </Flex>
                    <Flex direction="column" align="center">
                        <Typography.Label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Плат. вес</Typography.Label>
                        <Typography.Body style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                            {Math.round(summary.pw)} кг
                        </Typography.Body>
                    </Flex>
                    {useServiceRequest && (
                        <>
                            <Flex direction="column" align="center">
                                <Typography.Label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Вес</Typography.Label>
                                <Typography.Body style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                    {Math.round(summary.w)} кг
                                </Typography.Body>
                            </Flex>
                            <Flex direction="column" align="center">
                                <Typography.Label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Объём</Typography.Label>
                                <Typography.Body style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                    {Math.round(summary.vol)} м³
                                </Typography.Body>
                            </Flex>
                        </>
                    )}
                </div>
            </div>
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

            {/* Табличный режим по заказчику (служебный режим) */}
            {!loading && !error && useServiceRequest && tableModeByCustomer && groupedByCustomer.length > 0 && (
                <div className="cargo-card" style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('customer')} title="Сортировка: первый клик А–Я, второй Я–А">
                                    Заказчик {tableSortColumn === 'customer' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}
                                </th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('sum')} title="Сортировка: первый клик А–Я, второй Я–А">
                                    Сумма {tableSortColumn === 'sum' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}
                                </th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('mest')} title="Сортировка: первый клик А–Я, второй Я–А">
                                    Мест {tableSortColumn === 'mest' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}
                                </th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('pw')} title="Сортировка: первый клик А–Я, второй Я–А">
                                    Плат. вес {tableSortColumn === 'pw' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}
                                </th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('w')} title="Сортировка: первый клик А–Я, второй Я–А">
                                    Вес {tableSortColumn === 'w' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}
                                </th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('vol')} title="Сортировка: первый клик А–Я, второй Я–А">
                                    Объём {tableSortColumn === 'vol' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}
                                </th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('count')} title="Сортировка: первый клик А–Я, второй Я–А">
                                    Перевозок {tableSortColumn === 'count' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedGroupedByCustomer.map((row, i) => (
                                <React.Fragment key={i}>
                                    <tr
                                        style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: expandedTableCustomer === row.customer ? 'var(--color-bg-hover)' : undefined }}
                                        onClick={() => setExpandedTableCustomer(prev => prev === row.customer ? null : row.customer)}
                                        title={expandedTableCustomer === row.customer ? 'Свернуть детали' : 'Показать перевозки по строчно'}
                                    >
                                        <td style={{ padding: '0.5rem 0.4rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stripOoo(row.customer)}>{stripOoo(row.customer)}</td>
                                        <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(row.sum, true)}</td>
                                        <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{Math.round(row.mest)}</td>
                                        <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{Math.round(row.pw)} кг</td>
                                        <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{Math.round(row.w)} кг</td>
                                        <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{Math.round(row.vol)} м³</td>
                                        <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{row.items.length}</td>
                                    </tr>
                                    {expandedTableCustomer === row.customer && (
                                        <tr key={`${i}-detail`}>
                                            <td colSpan={7} style={{ padding: 0, borderBottom: '1px solid var(--color-border)', verticalAlign: 'top', background: 'var(--color-bg-primary)' }}>
                                                <div style={{ padding: '0.5rem', overflowX: 'auto' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                        <thead>
                                                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Номер</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Дата прихода</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Статус</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600 }}>Мест</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600 }}>Плат. вес</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600 }}>Сумма</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {row.items.map((item, j) => (
                                                                <tr
                                                                    key={item.Number || j}
                                                                    style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
                                                                    onClick={(e) => { e.stopPropagation(); setSelectedCargo(item); }}
                                                                    title="Открыть карточку перевозки"
                                                                >
                                                                    <td style={{ padding: '0.35rem 0.3rem' }}>
                                                                        <span style={{ color: (() => { const s = getSlaInfo(item); return s ? (s.onTime ? '#22c55e' : '#ef4444') : undefined; })() }}>
                                                                            {item.Number || '—'}
                                                                        </span>
                                                                    </td>
                                                                    <td style={{ padding: '0.35rem 0.3rem' }}><DateText value={item.DatePrih} /></td>
                                                                    <td style={{ padding: '0.35rem 0.3rem' }}>{normalizeStatus(item.State) || '—'}</td>
                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.Mest != null ? Math.round(Number(item.Mest)) : '—'}</td>
                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.PW != null ? `${Math.round(Number(item.PW))} кг` : '—'}</td>
                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.Sum != null ? formatCurrency(item.Sum as number, true) : '—'}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            
            {/* List (карточки) — скрываем в табличном режиме */}
            {filteredItems.length > 0 && !(useServiceRequest && tableModeByCustomer) && (
            <div className="cargo-list">
                {filteredItems.map((item: CargoItem, idx: number) => {
                    const sla = getSlaInfo(item);
                    const numberColor = sla ? (sla.onTime ? '#22c55e' : '#ef4444') : undefined;
                    return (
                        <Panel 
                            key={item.Number || idx} 
                            className="cargo-card"
                            onClick={() => setSelectedCargo(item)}
                            style={{ cursor: 'pointer', marginBottom: '0.75rem', position: 'relative' }}
                        >
                            <Flex justify="space-between" align="start" style={{ marginBottom: '0.5rem', minWidth: 0, overflow: 'hidden' }}>
                                <Flex align="center" gap="0.5rem" style={{ flexWrap: 'wrap', flex: '0 1 auto', minWidth: 0, maxWidth: '60%' }}>
                                    <Typography.Body style={{ fontWeight: 600, fontSize: '1rem', color: numberColor }}>
                                        {item.Number || '-'}
                                    </Typography.Body>
                                    {item._role && (
                                        <span className="role-badge" style={{ fontSize: '0.65rem', fontWeight: 600, padding: '0.15rem 0.4rem', borderRadius: '999px', background: 'var(--color-panel-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                                            {item._role === 'Customer' ? 'Заказчик' : item._role === 'Sender' ? 'Отправитель' : 'Получатель'}
                                        </span>
                                    )}
                                </Flex>
                                <Flex align="center" gap="0.5rem" style={{ flexShrink: 0 }}>
                                    <Flex align="center" gap="0.25rem" style={{ marginRight: '0.5cm' }}>
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
                                            const docTypesList = item._role === 'Customer'
                                                ? [{ label: "ЭР" as const, metod: DOCUMENT_METHODS["ЭР"] }, { label: "СЧЕТ" as const, metod: DOCUMENT_METHODS["СЧЕТ"] }, { label: "УПД" as const, metod: DOCUMENT_METHODS["УПД"] }, { label: "АПП" as const, metod: DOCUMENT_METHODS["АПП"] }]
                                                : [{ label: "АПП" as const, metod: DOCUMENT_METHODS["АПП"] }];
                                            const longUrls: Record<string, string> = {};
                                            for (const { label, metod } of docTypesList) {
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
                                            
                                            const shortenPromises = docTypesList.map(async ({ label, metod }) => {
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
                                                        shortUrls[label] = longUrls[label];
                                                    }
                                                } catch (error: any) {
                                                    console.error(`[share] Exception shortening ${label}:`, error?.message || error);
                                                    shortUrls[label] = longUrls[label];
                                                }
                                            });
                                            
                                            await Promise.all(shortenPromises);
                                            console.log('[share] All shorten requests completed. Short URLs:', shortUrls);

                                            const lines: string[] = [];
                                            lines.push(`Перевозка: ${item.Number}`);
                                            if (item.State) lines.push(`Статус: ${normalizeStatus(item.State)}`);
                                            if (item.DatePrih) lines.push(`Приход: ${formatDate(item.DatePrih)}`);
                                            lines.push(`Доставка: ${getFilterKeyByStatus(item.State) === 'delivered' && item.DateVr ? formatDate(item.DateVr) : '-'}`);
                                            if (item.Sender) lines.push(`Отправитель: ${stripOoo(item.Sender)}`);
                                            if (item.Customer) lines.push(`Заказчик: ${stripOoo(item.Customer)}`);
                                            lines.push(`Тип перевозки: ${item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1 ? 'Паром' : 'Авто'}`);
                                            const fromCity = cityToCode(item.CitySender);
                                            const toCity = cityToCode(item.CityReceiver);
                                            lines.push(`Место отправления: ${fromCity || '-'}`);
                                            lines.push(`Место получения: ${toCity || '-'}`);
                                            if (item.Mest !== undefined) lines.push(`Мест: ${item.Mest}`);
                                            if (item._role === 'Customer') {
                                                if (item.PW !== undefined) lines.push(`Плат. вес: ${item.PW} кг`);
                                                if (item.Sum !== undefined) lines.push(`Стоимость: ${formatCurrency(item.Sum as any)}`);
                                                if (item.StateBill) lines.push(`Статус счета: ${item.StateBill}`);
                                            }
                                            if (item.W !== undefined) lines.push(`Вес: ${item.W} кг`);
                                            if (item.Value !== undefined) lines.push(`Объем: ${item.Value} м³`);

                                            // Остальные поля (если нужно "всю информацию")
                                            Object.entries(item).forEach(([k, v]) => {
                                                if ([
                                                    "Number","State","DatePrih","DateVr","Sender","Customer","Mest","PW","W","Value","Sum","StateBill","_role"
                                                ].includes(k)) return;
                                                if (v === undefined || v === null || v === "" || (typeof v === "string" && v.trim() === "")) return;
                                                lines.push(`${k}: ${String(v)}`);
                                            });

                                            lines.push("");
                                            lines.push("Документы:");
                                            if (item._role === 'Customer') {
                                                lines.push(`ЭР: ${shortUrls["ЭР"] || "(не удалось сократить)"}`);
                                                lines.push(`Счет: ${shortUrls["СЧЕТ"] || "(не удалось сократить)"}`);
                                                lines.push(`УПД: ${shortUrls["УПД"] || "(не удалось сократить)"}`);
                                            }
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
                                    </Flex>
                                    <Calendar className="w-4 h-4 text-theme-secondary" />
                                    <Typography.Label className="text-theme-secondary" style={{ fontSize: '0.85rem' }}>
                                        <DateText value={item.DatePrih} />
                                    </Typography.Label>
                            </Flex>
                        </Flex>
                            <Flex justify="space-between" align="center" style={{ marginBottom: '0.5rem' }}>
                                <StatusBadge status={item.State} />
                                {item._role === 'Customer' && (
                                    <Typography.Body style={{ fontWeight: 600, fontSize: '1rem', color: getSumColorByPaymentStatus(item.StateBill) }}>
                                        {formatCurrency(item.Sum)}
                                    </Typography.Body>
                                )}
                            </Flex>
                            <Flex justify="space-between" align="center" style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                <Flex gap="1rem">
                                    <Typography.Label>Мест: {item.Mest || '-'}</Typography.Label>
                                    <Typography.Label>Плат. вес: {item.PW ? `${item.PW} кг` : '-'}</Typography.Label>
                                </Flex>
                                {item._role === 'Customer' && <StatusBillBadge status={item.StateBill} />}
                            </Flex>
                            <Flex align="center" gap="0.5rem" style={{ marginTop: '0.5rem' }}>
                                {(() => {
                                    const isFerry = item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1;
                                    const from = cityToCode(item.CitySender);
                                    const to = cityToCode(item.CityReceiver);
                                    const route = [from, to].filter(Boolean).join(' – ') || '-';
                                    return (
                                        <>
                                            {isFerry ? <Ship className="w-4 h-4" style={{ flexShrink: 0, color: 'var(--color-primary-blue)' }} title="Паром" /> : <Truck className="w-4 h-4" style={{ flexShrink: 0, color: 'var(--color-primary-blue)' }} title="Авто" />}
                                            <Typography.Label className="text-theme-secondary" style={{ fontSize: '0.85rem' }}>{route}</Typography.Label>
                                        </>
                                    );
                                })()}
                            </Flex>
                            {useServiceRequest && (item.Customer ?? (item as any).customer) && (
                                <Flex justify="flex-end" style={{ marginTop: '0.35rem' }}>
                                    <Typography.Label style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{stripOoo(item.Customer ?? (item as any).customer)}</Typography.Label>
                                </Flex>
                            )}
                    </Panel>
                    );
                })}
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

/** Нормализация названия этапа из API для сопоставления */
const normalizeStageKey = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** Маппинг этапов хронологии на отображаемые подписи (места подставляются из item) */
function mapTimelineStageLabel(raw: string, item: CargoItem): string {
    const key = normalizeStageKey(raw);
    const from = cityToCode(item.CitySender) || '—';
    const to = cityToCode(item.CityReceiver) || '—';
    if (/полученаинформация|получена\s*информация/.test(key)) return 'Получена информация';
    if (/полученаотзаказчика|получена\s*от\s*заказчика/.test(key)) return `Получена в ${from}`;
    if (/упакована/.test(key)) return 'Измерена';
    if (/консолидация/.test(key)) return 'Консолидация';
    if (/отправленаваэропорт|отправлена\s*в\s*аэропорт|загружена/.test(key)) return 'Загружена в ТС';
    if (/улетела/.test(key)) return 'Отправлена';
    if (/квручению|к\s*вручению/.test(key)) return `Прибыла в ${to}`;
    if (/поставленанадоставку|поставлена\s*на\s*доставку|в\s*месте\s*прибытия/.test(key)) return 'Запланирована доставка';
    if (/доставлена/.test(key)) return 'Доставлена';
    return raw;
}

function getTimelineStepColor(label: string): 'success' | 'warning' | 'danger' | 'purple' | 'default' {
    const lower = (label || '').toLowerCase();
    if (lower.includes('доставлен') || lower.includes('заверш')) return 'success';
    if (lower.includes('доставке')) return 'purple';
    if (lower.includes('пути') || lower.includes('отправлен') || lower.includes('готов')) return 'warning';
    if (lower.includes('отменен') || lower.includes('аннулирован')) return 'danger';
    return 'default';
}

/** Загрузка и сортировка статусов перевозки (общая логика для модалки и дашборда) */
async function fetchPerevozkaTimeline(auth: AuthData, number: string, item: CargoItem): Promise<PerevozkaTimelineStep[] | null> {
    const res = await fetch(PROXY_API_GETPEREVOZKA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: auth.login, password: auth.password, number }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || err?.details || `Ошибка ${res.status}`);
    }
    const data = await res.json();
    const raw = Array.isArray(data) ? data : (data?.items ?? data?.Steps ?? data?.stages ?? data?.Statuses ?? []);
    if (!Array.isArray(raw)) return null;
    const steps: PerevozkaTimelineStep[] = raw.map((el: any) => {
        const rawLabel = el?.Stage ?? el?.Name ?? el?.Status ?? el?.label ?? String(el);
        const labelStr = typeof rawLabel === 'string' ? rawLabel : String(rawLabel);
        const date = el?.Date ?? el?.date ?? el?.DatePrih ?? el?.DateVr;
        const displayLabel = mapTimelineStageLabel(labelStr, item);
        return { label: displayLabel, date, completed: true };
    });
    const fromCity = cityToCode(item.CitySender) || '—';
    const toCity = cityToCode(item.CityReceiver) || '—';
    const senderLabel = `Получена в ${fromCity}`;
    const arrivedAtDestLabel = `Прибыла в ${toCity}`;
    const orderOf = (l: string, i: number): number => {
        if (l === 'Получена информация') return 1;
        if (l === senderLabel) return 2;
        if (l === 'Измерена') return 3;
        if (l === 'Консолидация') return 4;
        if (l === 'Загружена в ТС') return 5;
        if (l === 'Отправлена') return 6;
        if (l === arrivedAtDestLabel) return 7;
        if (l === 'Запланирована доставка') return 8;
        if (l === 'Доставлена') return 9;
        return 10 + i;
    };
    const sorted = steps.map((s, i) => ({ s, key: orderOf(s.label, i) }))
        .sort((a, b) => a.key - b.key)
        .map(x => x.s);
    return sorted.length ? sorted : null;
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
    const [perevozkaTimeline, setPerevozkaTimeline] = useState<PerevozkaTimelineStep[] | null>(null);
    const [perevozkaLoading, setPerevozkaLoading] = useState(false);
    const [perevozkaError, setPerevozkaError] = useState<string | null>(null);

    // Загрузка таймлайна перевозки при открытии карточки
    useEffect(() => {
        if (!isOpen || !item?.Number || !auth?.login || !auth?.password) {
            setPerevozkaTimeline(null);
            setPerevozkaError(null);
            return;
        }
        let cancelled = false;
        setPerevozkaLoading(true);
        setPerevozkaError(null);
        fetchPerevozkaTimeline(auth, item.Number, item)
            .then((sorted) => { if (!cancelled) setPerevozkaTimeline(sorted); })
            .catch((e: any) => { if (!cancelled) setPerevozkaError(e?.message || 'Не удалось загрузить статусы'); })
            .finally(() => { if (!cancelled) setPerevozkaLoading(false); });
        return () => { cancelled = true; };
    }, [isOpen, item?.Number, auth?.login, auth?.password]);

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

    // SLA и итого время в пути: от «получена в месте отправления» (Получена в [город отправления]) до текущего МСК / до «Доставлена»
    const fromCity = cityToCode(item.CitySender) || '—';
    const receivedAtSender = perevozkaTimeline?.find(s => s.label === `Получена в ${fromCity}`);
    const deliveredStep = perevozkaTimeline?.find(s => s.label === 'Доставлена');
    const slaFromTimeline = (receivedAtSender?.date && deliveredStep?.date)
        ? (() => {
            const startMs = new Date(receivedAtSender.date).getTime();
            const endMs = new Date(deliveredStep.date).getTime();
            const actualDays = Math.round((endMs - startMs) / (24 * 60 * 60 * 1000));
            const planDays = getPlanDays(item);
            return { planDays, actualDays, onTime: actualDays <= planDays, delayDays: Math.max(0, actualDays - planDays) };
        })()
        : null;

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
            const fileNameTranslit = transliterateFilename(fileName);

            // Метод 4: object/embed - показываем встроенным просмотрщиком
            const url = URL.createObjectURL(blob);
            setPdfViewer({
                url,
                name: fileNameTranslit,
                docType,
                blob, // Сохраняем blob для скачивания
                downloadFileName: fileNameTranslit
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

    // Список явно отображаемых полей (из API примера). INN скрыт — используется для БД и проверки дублей, не показываем в карточке.
    const EXCLUDED_KEYS = ['Number', 'DatePrih', 'DateVr', 'State', 'Mest', 'PW', 'W', 'Value', 'Sum', 'StateBill', 'Sender', 'Customer', 'Receiver', 'AK', 'DateDoc', 'OG', 'TypeOfTranzit', 'TypeOfTransit', 'INN', 'Inn', 'inn', 'SenderINN', 'ReceiverINN', '_role'];
    const isCustomerRole = item._role === "Customer";
    const FIELD_LABELS: Record<string, string> = {
        CitySender: 'Место отправления',
        CityReceiver: 'Место получения',
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <Flex align="center" justify="space-between" style={{ width: '100%', minWidth: 0 }}>
                        <Flex align="center" gap="0.5rem" style={{ flexShrink: 1, minWidth: 0, maxWidth: '55%' }}>
                            {/* Иконка типа перевозки */}
                            {(() => {
                                const isFerry = item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1;
                                return isFerry ? <Ship className="modal-header-transport-icon" style={{ color: 'var(--color-primary-blue)', width: 24, height: 24, flexShrink: 0 }} title="Паром" /> : <Truck className="modal-header-transport-icon" style={{ color: 'var(--color-primary-blue)', width: 24, height: 24, flexShrink: 0 }} title="Авто" />;
                            })()}
                            {/* Бейдж роли: Заказчик / Отправитель / Получатель */}
                            {item._role && (
                                <span className="role-badge" style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '999px', background: 'var(--color-panel-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {item._role === 'Customer' ? 'Заказчик' : item._role === 'Sender' ? 'Отправитель' : 'Получатель'}
                                </span>
                            )}
                        </Flex>
                        <Flex align="center" gap="0.25rem" style={{ flexShrink: 0 }}>
                        <button
                            type="button"
                            className="modal-header-icon-btn"
                            onClick={async () => {
                                if (!item.Number) return;
                                setDownloading("share");
                                try {
                                    const baseOrigin = typeof window !== "undefined" ? window.location.origin : "";
                                    const docsForRole = item._role === 'Customer'
                                        ? [{ label: "ЭР" as const, metod: DOCUMENT_METHODS["ЭР"] }, { label: "СЧЕТ" as const, metod: DOCUMENT_METHODS["СЧЕТ"] }, { label: "УПД" as const, metod: DOCUMENT_METHODS["УПД"] }, { label: "АПП" as const, metod: DOCUMENT_METHODS["АПП"] }]
                                        : [{ label: "АПП" as const, metod: DOCUMENT_METHODS["АПП"] }];
                                    const shortUrls: Record<string, string> = {};
                                    const longUrls: Record<string, string> = {};
                                    const shortenPromises = docsForRole.map(async ({ label, metod }) => {
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
                                    lines.push(`Доставка: ${getFilterKeyByStatus(item.State) === 'delivered' && item.DateVr ? formatDate(item.DateVr) : '-'}`);
                                    if (item.Sender) lines.push(`Отправитель: ${stripOoo(item.Sender)}`);
                                    if (item.Customer) lines.push(`Заказчик: ${stripOoo(item.Customer)}`);
                                    if (item.Receiver ?? item.receiver) lines.push(`Получатель: ${stripOoo(item.Receiver ?? item.receiver)}`);
                                    lines.push(`Тип перевозки: ${item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1 ? 'Паром' : 'Авто'}`);
                                    const fromCity = cityToCode(item.CitySender);
                                    const toCity = cityToCode(item.CityReceiver);
                                    lines.push(`Место отправления: ${fromCity || '-'}`);
                                    lines.push(`Место получения: ${toCity || '-'}`);
                                    if (item.Mest !== undefined) lines.push(`Мест: ${item.Mest}`);
                                    if (item._role === 'Customer') {
                                        if (item.PW !== undefined) lines.push(`Плат. вес: ${item.PW} кг`);
                                        if (item.Sum !== undefined) lines.push(`Стоимость: ${formatCurrency(item.Sum as any)}`);
                                        if (item.StateBill) lines.push(`Статус счета: ${item.StateBill}`);
                                    }
                                    lines.push("");
                                    lines.push("Документы:");
                                    if (item._role === 'Customer') {
                                        lines.push(`ЭР: ${shortUrls["ЭР"]}`);
                                        lines.push(`Счет: ${shortUrls["СЧЕТ"]}`);
                                        lines.push(`УПД: ${shortUrls["УПД"]}`);
                                    }
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
                            {downloading === "share" ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-secondary)' }} /> : <Share2 className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />}
                        </button>
                        <Button
                            style={{
                                padding: '0.25rem',
                                minWidth: 'auto',
                                background: 'transparent',
                                border: 'none',
                                boxShadow: 'none',
                                outline: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
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
                                boxShadow: 'none',
                                outline: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            onClick={() => onToggleFavorite(item.Number)}
                            title={isFavorite(item.Number) ? "Удалить из избранного" : "Добавить в избранное"}
                        >
                            <Heart
                                className="w-4 h-4"
                                style={{
                                    fill: isFavorite(item.Number) ? '#ef4444' : 'transparent',
                                    color: isFavorite(item.Number) ? '#ef4444' : 'var(--color-text-secondary)',
                                    transition: 'all 0.2s',
                                }}
                            />
                        </Button>
                        <Button className="modal-close-button" onClick={onClose} aria-label="Закрыть" style={{ background: 'transparent', border: 'none', boxShadow: 'none', outline: 'none' }}><X size={20} style={{ color: 'var(--color-text-secondary)' }} /></Button>
                        </Flex>
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
                    <DetailItem label="Отправитель" value={stripOoo(item.Sender) || '-'} />
                    <DetailItem label="Получатель" value={stripOoo(item.Receiver ?? item.receiver) || '-'} />
                    <DetailItem label="Мест" value={renderValue(item.Mest)} icon={<Layers className="w-4 h-4 mr-1 text-theme-primary"/>} />
                    <DetailItem label="Плат. вес" value={renderValue(item.PW, 'кг')} icon={<Scale className="w-4 h-4 mr-1 text-theme-primary"/>} highlighted />
                    {isCustomerRole && (
                        <>
                            <DetailItem label="Вес" value={renderValue(item.W, 'кг')} icon={<Weight className="w-4 h-4 mr-1 text-theme-primary"/>} />
                            <DetailItem label="Объем" value={renderValue(item.Value, 'м³')} icon={<List className="w-4 h-4 mr-1 text-theme-primary"/>} />
                            <DetailItem label="Стоимость" value={formatCurrency(item.Sum)} textColor={getSumColorByPaymentStatus(item.StateBill)} />
                            <DetailItem label="Статус Счета" value={<StatusBillBadge status={item.StateBill} />} highlighted />
                        </>
                    )}
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
                            const isFerry =
                                item?.AK === true ||
                                item?.AK === "true" ||
                                item?.AK === "1" ||
                                item?.AK === 1;
                            const label = FIELD_LABELS[key] || key;
                            const value =
                                (key === 'TypeOfTranzit' || key === 'TypeOfTransit') && isFerry
                                    ? 'Паром'
                                    : (key === 'CitySender' || key === 'CityReceiver')
                                        ? (cityToCode(val) || renderValue(val))
                                        : renderValue(val);

                            return <DetailItem key={key} label={label} value={value} />;
                        })}
                </div>

                {/* Вертикальный таймлайн статусов перевозки */}
                {(perevozkaLoading || perevozkaTimeline || perevozkaError) && (
                    <div className="perevozka-timeline-wrap" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                        <Typography.Headline style={{ marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 600 }}>
                            Статусы перевозки
                        </Typography.Headline>
                        {perevozkaLoading && (
                            <Flex align="center" gap="0.5rem" style={{ padding: '0.5rem 0' }}>
                                <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-primary-blue)' }} />
                                <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Загрузка...</Typography.Body>
                            </Flex>
                        )}
                        {perevozkaError && (
                            <Typography.Body style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>{perevozkaError}</Typography.Body>
                        )}
                        {!perevozkaLoading && perevozkaTimeline && perevozkaTimeline.length > 0 && (() => {
                            // Итого время в пути: от «получена в месте получения» до текущего времени по Москве
                            const totalHours = receivedAtSender?.date
                                ? Math.max(0, Math.round((Date.now() - new Date(receivedAtSender.date).getTime()) / (1000 * 60 * 60)))
                                : null;
                            return (
                            <div>
                                <div className="perevozka-timeline">
                                    <div
                                        className="perevozka-timeline-track-fill"
                                        style={{ height: `${(perevozkaTimeline.length / Math.max(perevozkaTimeline.length, 1)) * 100}%` }}
                                    />
                                    {perevozkaTimeline.map((step, index) => {
                                        const colorKey = getTimelineStepColor(step.label);
                                        return (
                                            <div key={index} className="perevozka-timeline-item">
                                                <div className={`perevozka-timeline-dot perevozka-timeline-dot-${colorKey}`} />
                                                <div className="perevozka-timeline-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                    <Typography.Body style={{ fontWeight: 600, fontSize: '0.9rem' }}>{step.label}</Typography.Body>
                                                    {step.date && (
                                                        <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                                            <DateText value={step.date} />
                                                        </Typography.Body>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {totalHours != null && (
                                    <Typography.Body style={{ marginTop: '0.75rem', fontWeight: 600, fontSize: '0.9rem' }}>
                                        Итого время в пути — {totalHours} ч
                                    </Typography.Body>
                                )}
                            </div>
                            );
                        })()}
                    </div>
                )}

                {/* SLA: только статус В срок / Опоздание, без указания дней */}
                {(() => {
                    const sla = slaFromTimeline;
                    if (!sla) return null;
                    return (
                        <div style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                            <Typography.Body style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                {sla.onTime
                                    ? <span style={{ color: 'var(--color-success-status)' }}>В срок</span>
                                    : <span style={{ color: '#ef4444' }}>Опоздание</span>
                                }
                            </Typography.Body>
                        </div>
                    );
                })()}

                <Typography.Headline style={{marginTop: '1rem', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600}}>
                    Документы
                </Typography.Headline>
                
                {/* Умные сценарии документов */}
                {(() => {
                    const isPaid = item.StateBill?.toLowerCase().includes('оплачен') || 
                                  item.StateBill?.toLowerCase().includes('paid') ||
                                  item.StateBill === 'Оплачен';
                    
                    // Для отправителя и получателя доступен только АПП
                    const isCustomerRole = item._role === 'Customer';
                    const availableDocs = isCustomerRole ? ['ЭР', 'АПП', 'СЧЕТ', 'УПД'] : ['АПП'];
                    
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
                        <div style={{ padding: '0.5rem', background: 'var(--color-bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                            <Typography.Label style={{ fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdfViewer.name}</Typography.Label>
                            <Flex align="center" gap="0.25rem">
                                {pdfViewer.blob && (
                                    <Button size="small" onClick={() => downloadFile(pdfViewer.blob!, pdfViewer.downloadFileName || pdfViewer.name)} title="Скачать">
                                        <Download className="w-4 h-4" />
                                    </Button>
                                )}
                                <Button size="small" onClick={() => { URL.revokeObjectURL(pdfViewer.url); setPdfViewer(null); }}>
                                    <X size={16} />
                                </Button>
                            </Flex>
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
                active={active === "cargo"} 
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

/** Эмоции Грузика: под каждую можно положить gruzik-{emotion}.gif / .webm / .png в public */
export type GruzikEmotion = 'default' | 'typing' | 'thinking' | 'happy' | 'sad' | 'error' | 'wave' | 'ok' | string;

/** Аватар Грузика: приоритет GIF, затем WebM, затем PNG (или JPG). Для анимации нужен файл gruzik.gif или gruzik.webm в public/ */
function GruzikAvatar({
    size = 40,
    typing = false,
    emotion: emotionProp,
    className = '',
}: {
    size?: number;
    typing?: boolean;
    /** Эмоция/вариант анимации: default, typing, thinking, happy, sad, error, wave, ok или свой ключ — ищутся файлы /gruzik-{emotion}.gif */
    emotion?: GruzikEmotion;
    className?: string;
}) {
    const emotion = typing ? 'typing' : (emotionProp ?? 'default');
    const base = emotion === 'default' ? '' : `-${emotion}`;
    const [source, setSource] = useState<'gif' | 'webm' | 'png' | 'jpg'>('gif');
    const [currentBase, setCurrentBase] = useState(base);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        setCurrentBase(base);
        setSource('gif');
    }, [base]);

    const gifSrc = `/gruzik${currentBase || ''}.gif`;
    const webmSrc = `/gruzik${currentBase || ''}.webm`;
    const pngSrc = `/gruzik${currentBase || ''}.png`;
    const defaultGif = '/gruzik.gif';
    const defaultWebm = '/gruzik.webm';
    const defaultPng = '/gruzik.png';
    const defaultJpg = '/gruzik.jpg';

    const onGifError = () => {
        if (currentBase) {
            setCurrentBase('');
        } else {
            setSource('webm');
        }
    };
    const onWebmError = () => {
        if (currentBase) {
            setCurrentBase('');
            setSource('webm');
        } else {
            setSource('png');
        }
    };
    const onPngError = () => {
        if (currentBase) {
            setCurrentBase('');
            setSource('png');
        } else {
            setSource('jpg');
        }
    };

    useEffect(() => {
        if (source !== 'webm') return;
        const video = videoRef.current;
        if (!video) return;
        const play = () => {
            video.play().catch(() => setSource('png'));
        };
        play();
        video.addEventListener('loadeddata', play);
        video.addEventListener('canplay', play);
        return () => {
            video.removeEventListener('loadeddata', play);
            video.removeEventListener('canplay', play);
        };
    }, [source]);

    return (
        <div
            className={`gruzik-avatar ${typing ? 'typing' : ''} ${className}`.trim()}
            style={{
                width: size,
                height: size,
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-bg-primary)',
            }}
            aria-hidden
        >
            {source === 'png' || source === 'jpg' ? (
                <img
                    src={source === 'jpg' ? defaultJpg : (currentBase ? pngSrc : defaultPng)}
                    alt="Грузик"
                    width={size}
                    height={size}
                    style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
                    title="Грузик"
                    onError={source === 'jpg' ? undefined : onPngError}
                />
            ) : source === 'webm' ? (
                <video
                    ref={videoRef}
                    src={currentBase ? webmSrc : defaultWebm}
                    autoPlay
                    loop
                    muted
                    playsInline
                    width={size}
                    height={size}
                    style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
                    title="Грузик"
                    onError={onWebmError}
                />
            ) : (
                <img
                    key={currentBase || 'default'}
                    src={currentBase ? gifSrc : defaultGif}
                    alt="Грузик"
                    width={size}
                    height={size}
                    style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
                    title="Грузик"
                    onError={onGifError}
                />
            )}
        </div>
    );
}

/** По тексту ответа ассистента подбираем эмоцию Грузика (для анимации) */
function deriveEmotionFromReply(text: string): GruzikEmotion {
    if (!text || typeof text !== 'string') return 'default';
    const t = text.toLowerCase();
    if (/\b(ошибка|не удалось|не получилось|проблема|к сожалению)\b/.test(t)) return 'sad';
    if (/\b(готово|успешно|отлично|сделано|принято)\b/.test(t)) return 'happy';
    if (/\b(думаю|сейчас проверю|ищу|подождите)\b/.test(t)) return 'thinking';
    return 'default';
}

function ChatPage({ 
    prefillMessage, 
    onClearPrefill,
    auth,
    cargoItems,
    sessionOverride,
    userIdOverride,
    customerOverride,
    onOpenCargo,
    clearChatRef,
    onChatCustomerState
}: { 
    prefillMessage?: string; 
    onClearPrefill?: () => void;
    auth?: AuthData;
    cargoItems?: CargoItem[];
    sessionOverride?: string;
    userIdOverride?: string;
    customerOverride?: string;
    onOpenCargo?: (cargoNumber: string) => void;
    /** ref для вызова очистки чата из родителя (кнопка «Очистить чат») */
    clearChatRef?: React.MutableRefObject<(() => void) | null>;
    /** вызывается при смене заказчика/отвязке в чате — для отображения в шапке */
    onChatCustomerState?: (state: { customer: string | null; unlinked: boolean }) => void;
}) {
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string; emotion?: GruzikEmotion }[]>([]);
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
    const [sessionUnlinked, setSessionUnlinked] = useState(false);
    /** Отладка на экране: последний статус ответа API и текст ошибки */
    const [chatStatus, setChatStatus] = useState<{ status?: number; error?: string } | null>(null);
    /** Отдельная строка: какие запросы по API выполнялись (перевозки, чат) */
    const [apiRequestInfo, setApiRequestInfo] = useState<{ context?: string; chat?: string } | null>(null);
    const scrollRef = React.useRef<HTMLDivElement>(null);

    // После отвязки в чате не отправляем заказчика, пока пользователь снова не выберет компанию
    useEffect(() => {
        if (customerOverride) setSessionUnlinked(false);
    }, [customerOverride]);

    const effectiveCustomer = sessionUnlinked ? null : customerOverride ?? null;
    useEffect(() => {
        onChatCustomerState?.({ customer: effectiveCustomer ?? null, unlinked: sessionUnlinked });
    }, [effectiveCustomer, sessionUnlinked, onChatCustomerState]);
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
                            .map((item: any) => ({ role: item.role, content: String(item.content || ""), emotion: item.emotion }))
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
                { role: 'assistant', content: "Здравствуйте! Меня зовут Грузик, я AI-помощник HAULZ. Как я могу вам помочь?" }
            ]);
        }
    }, [hasLoadedHistory, messages.length]);

    const clearChat = useCallback(async () => {
        try {
            await fetch('/api/chat-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId }),
            });
        } catch {
            // ignore
        }
        setMessages([]);
    }, [sessionId]);

    useEffect(() => {
        if (clearChatRef) clearChatRef.current = clearChat;
        return () => { if (clearChatRef) clearChatRef.current = null; };
    }, [clearChatRef, clearChat]);

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
        setChatStatus(null);
        setApiRequestInfo(null);

        let fetchedCargo: CargoItem[] = [];
        let contextApiLabel = '';
        try {
            if (auth?.login && auth?.password) {
                const now = new Date();
                const today = now.toISOString().split("T")[0];
                const t = (messageText || '').toLowerCase();
                let dateFrom = today;
                let dateTo = today;
                if (/\b(недел|за неделю|на неделю)\b/.test(t)) {
                    const from = new Date(now);
                    from.setDate(from.getDate() - 7);
                    dateFrom = from.toISOString().split('T')[0];
                } else if (/\b(месяц|за месяц|на месяц)\b/.test(t)) {
                    const from = new Date(now);
                    from.setDate(from.getDate() - 30);
                    dateFrom = from.toISOString().split('T')[0];
                }
                const perevozkiController = new AbortController();
                const perevozkiTimeout = setTimeout(() => perevozkiController.abort(), 60000);
                const perevozkiRes = await fetch('/api/perevozki', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        login: auth.login,
                        password: auth.password,
                        dateFrom,
                        dateTo,
                        ...(customerOverride ? { customer: customerOverride } : {}),
                        ...(auth.inn ? { inn: auth.inn } : {}),
                    }),
                    signal: perevozkiController.signal,
                });
                clearTimeout(perevozkiTimeout);
                if (perevozkiRes.ok) {
                    const data = await perevozkiRes.json().catch(() => ({}));
                    const list = Array.isArray(data) ? data : (data?.items ?? []);
                    const count = Array.isArray(list) ? list.length : 0;
                    contextApiLabel = `POST /api/perevozki (${count} перевозок)`;
                    fetchedCargo = (list as any[]).slice(0, 30).map((i: any) => ({
                        Number: i.Number,
                        DatePrih: i.DatePrih,
                        DateVr: i.DateVr,
                        State: i.State,
                        StateBill: i.StateBill,
                        Mest: i.Mest,
                        PW: i.PW,
                        Sum: i.Sum,
                        Sender: i.Sender,
                        Receiver: i.Receiver,
                        Customer: i.Customer ?? i.customer,
                    }));
                } else {
                    contextApiLabel = `POST /api/perevozki (код ${perevozkiRes.status})`;
                }
            } else {
                contextApiLabel = 'POST /api/perevozki не вызывался (нет авторизации)';
            }
        } catch {
            contextApiLabel = 'POST /api/perevozki (ошибка или таймаут)';
        }
        setApiRequestInfo(prev => ({ ...prev, context: contextApiLabel || undefined }));

        const cargoForContext = fetchedCargo.length > 0 ? fetchedCargo : (cargoItems ?? []);
        const recentCargoList = cargoForContext.slice(0, 35).map(i => {
            const from = cityToCode(i.CitySender);
            const to = cityToCode(i.CityReceiver);
            const route = from === 'MSK' && to === 'KGD' ? 'MSK-KGD' : from === 'KGD' && to === 'MSK' ? 'KGD-MSK' : 'other';
            return {
                number: i.Number,
                status: normalizeStatus(i.State),
                statusKey: getFilterKeyByStatus(i.State),
                datePrih: i.DatePrih,
                dateVr: i.DateVr,
                stateBill: i.StateBill,
                paymentKey: getPaymentFilterKey(i.StateBill),
                sum: i.Sum,
                sender: i.Sender,
                receiver: i.Receiver ?? (i as any).receiver,
                customer: i.Customer ?? (i as any).customer,
                type: isFerry(i) ? 'ferry' : 'auto',
                route,
            };
        });

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const todayLabel = now.toLocaleDateString('ru-RU');
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekStartStr = weekAgo.toISOString().split('T')[0];
        const monthAgo = new Date(now);
        monthAgo.setDate(monthAgo.getDate() - 30);
        const monthStartStr = monthAgo.toISOString().split('T')[0];
        // Подготавливаем контекст: данные перевозок из API или переданный cargoItems
        const context = {
            userLogin: auth?.login,
            customer: customerOverride,
            todayDate: todayStr,
            todayLabel,
            weekStartDate: weekStartStr,
            weekEndDate: todayStr,
            monthStartDate: monthStartStr,
            monthEndDate: todayStr,
            activeCargoCount: cargoForContext.length,
            cargoList: recentCargoList,
        };

        const CHAT_DEBUG = typeof window !== 'undefined' && window.localStorage?.getItem('haulz.chatDebug') === '1';
        const CHAT_TIMEOUT_MS = 90000; // 90 сек — после этого снимаем «печатает» и показываем ошибку
        const SAFETY_TYPING_MS = 92000; // страховка: принудительно снять «печатает», если что-то пошло не так
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            if (CHAT_DEBUG) console.warn('[chat] timeout: aborting request');
            controller.abort();
        }, CHAT_TIMEOUT_MS);
        const safetyId = setTimeout(() => {
            if (CHAT_DEBUG) console.warn('[chat] safety: forcing typing off');
            setIsReady(false);
        }, SAFETY_TYPING_MS);

        try {
            if (CHAT_DEBUG) console.log('[chat] send start', { sessionId, messageLen: messageText.length });
            const effectiveCustomer = sessionUnlinked ? null : customerOverride;
            let preloadedCargo: unknown = undefined;
            if (typeof window !== "undefined") {
                try {
                    const stored = window.sessionStorage.getItem("haulz.chat.cargoPreload");
                    if (stored) {
                        preloadedCargo = JSON.parse(stored);
                        window.sessionStorage.removeItem("haulz.chat.cargoPreload");
                    }
                } catch (_) {}
            }
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    sessionId,
                    userId: userIdOverride || auth?.login,
                    message: messageText,
                    context: { ...context, customer: effectiveCustomer },
                    customer: effectiveCustomer,
                    ...(preloadedCargo != null ? { preloadedCargo } : {}),
                    auth: auth?.login && auth?.password ? { login: auth.login, password: auth.password, ...(auth.inn ? { inn: auth.inn } : {}) } : undefined
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);
            clearTimeout(safetyId);
            const data = await res.json().catch((parseErr) => {
                if (CHAT_DEBUG) console.warn('[chat] response json parse failed', parseErr);
                return {};
            });
            if (CHAT_DEBUG) console.log('[chat] response', { status: res.status, ok: res.ok, hasReply: !!data?.reply, replyLen: data?.reply?.length });
            if (!res.ok) {
                const msg = data?.reply || data?.error || data?.message || `Код ${res.status}`;
                setChatStatus({ status: res.status, error: msg });
                setApiRequestInfo(prev => ({ ...prev, chat: `POST /api/chat (${res.status})` }));
                throw new Error(msg);
            }
            setChatStatus({ status: 200 });
            setApiRequestInfo(prev => ({ ...prev, chat: 'POST /api/chat (200)' }));
            if (data?.unlinked === true) {
                setSessionUnlinked(true);
            }
            if (!sessionOverride && data?.sessionId && typeof data.sessionId === "string" && data.sessionId !== sessionId) {
                setSessionId(data.sessionId);
                if (typeof window !== "undefined") {
                    window.localStorage.setItem("haulz.chat.sessionId", data.sessionId);
                }
            }
            const replyText = typeof data?.reply === "string" ? data.reply : "";
            const emotion = typeof data?.emotion === "string" ? data.emotion : deriveEmotionFromReply(replyText);
            setMessages(prev => [...prev, { role: 'assistant', content: replyText || "(Нет ответа от сервера. Попробуйте ещё раз.)", emotion }]);
        } catch (e: any) {
            clearTimeout(timeoutId);
            clearTimeout(safetyId);
            const isAbort = e?.name === 'AbortError';
            const msg = isAbort ? 'Ответ занял слишком много времени. Попробуйте ещё раз.' : (e?.message || 'Не удалось получить ответ');
            setChatStatus({ error: msg });
            setApiRequestInfo(prev => ({ ...prev, chat: 'POST /api/chat (ошибка)' }));
            setMessages(prev => [...prev, { 
                role: 'assistant', 
                content: `Ошибка: ${msg}`,
                emotion: 'error'
            }]);
        } finally {
            setIsReady(false);
        }
    };

    return (
        <div className="chat-shell" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%' }}>
            {/* Окно сообщений — скролл сверху вниз */}
            <div 
                ref={scrollRef}
                className="chat-messages"
                style={{ 
                    flex: 1, 
                    minHeight: 0,
                    overflowY: 'auto', 
                    overflowX: 'hidden',
                    padding: '1rem', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '1rem',
                    scrollBehavior: 'smooth' 
                }}
            >
                {messages.map((msg, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: '0.5rem' }}>
                        {msg.role === 'assistant' && <GruzikAvatar size={40} emotion={msg.emotion} />}
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
                    <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-end', gap: '0.5rem' }}>
                        <GruzikAvatar size={52} typing />
                        <div className="chat-bubble chat-bubble-assistant" style={{ 
                            padding: '0.75rem 1rem', 
                            borderRadius: '1rem', 
                            backgroundColor: 'var(--color-panel-secondary)',
                            border: '1px solid var(--color-border)',
                            borderBottomLeftRadius: '0',
                            maxWidth: '85%'
                        }}>
                            <span className="chat-typing-text">печатает</span>
                            <span className="chat-typing-dots">
                                <span>.</span><span>.</span><span>.</span>
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Поле ввода — прижато к низу, без линии сверху */}
            <div className="chat-input-bar" style={{ padding: '0.75rem', background: 'var(--color-bg-primary)', width: '100%', boxSizing: 'border-box', flexShrink: 0 }}>
                <form 
                    onSubmit={(e) => { e.preventDefault(); handleSend(inputValue); }}
                    style={{ display: 'flex', gap: '0.5rem', height: '44px', width: '100%', minWidth: 0 }}
                >
                    <Input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend(inputValue);
                            }
                        }}
                        placeholder="Напишите ваш вопрос..."
                        className="chat-input"
                        style={{ flex: 1, minWidth: 0, height: '44px' }}
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
                // Для MAX не используем автоматическую тему из colorScheme; приоритет — сохранённая тема
                const savedTheme = typeof window !== "undefined" ? window.localStorage.getItem("haulz.theme") : null;
                if (savedTheme === "dark" || savedTheme === "light") {
                    setTheme(savedTheme);
                } else if (!isMaxWebApp() && typeof webApp.colorScheme === "string") {
                    setTheme(webApp.colorScheme);
                }
            } catch {
                // Игнорируем, если WebApp API частично недоступен
            }

            const themeHandler = () => {
                const savedTheme = typeof window !== "undefined" ? window.localStorage.getItem("haulz.theme") : null;
                if (savedTheme === "dark" || savedTheme === "light") {
                    setTheme(savedTheme);
                } else if (!isMaxWebApp() && typeof webApp.colorScheme === "string") {
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
    // Служебный режим: активен если введён пароль в профиле; переключатель на вкладке «Грузы» включает запрос только по датам
    const [serviceModeUnlocked, setServiceModeUnlocked] = useState(() => typeof window !== 'undefined' && window.localStorage.getItem('haulz.serviceMode') === '1');
    const [useServiceRequest, setUseServiceRequest] = useState(false);
    
    // Вычисляем текущий активный аккаунт
    const auth = useMemo(() => {
        if (!activeAccountId) return null;
        const account = accounts.find(acc => acc.id === activeAccountId);
        return account
            ? {
                login: account.login,
                password: account.password,
                ...(account.activeCustomerInn ? { inn: account.activeCustomerInn } : {}),
            }
            : null;
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
                                twoFactorTelegramLinked: !!settings.telegramLinked,
                                twoFactorGoogleSecretSet: !!settings.googleSecretSet
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
    const [theme, setTheme] = useState<'dark' | 'light'>(() => {
        if (typeof window === 'undefined') return 'dark';
        const saved = window.localStorage.getItem('haulz.theme');
        return (saved === 'dark' || saved === 'light') ? saved : 'dark';
    }); 
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
    const [pendingLogin, setPendingLogin] = useState<{ login: string; loginKey: string; password: string; customer?: string | null; customers?: CustomerOption[]; perevozkiInn?: string } | null>(null);
    
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [isOfferOpen, setIsOfferOpen] = useState(false);
    const [isPersonalConsentOpen, setIsPersonalConsentOpen] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);

    useEffect(() => {
        document.body.className = `${theme}-mode`;
        try {
            window.localStorage.setItem('haulz.theme', theme);
        } catch {
            // ignore
        }
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
                inn: activeAccount.activeCustomerInn ?? null,
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

    const openMaxBotWithAccount = async () => {
        const activeAccount = accounts.find(acc => acc.id === activeAccountId) || null;
        if (!activeAccount) {
            throw new Error("Сначала выберите компанию.");
        }
        const res = await fetch("/api/max-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                login: activeAccount.login,
                password: activeAccount.password,
                customer: activeAccount.customer || null,
                inn: activeAccount.activeCustomerInn ?? null,
                accountId: activeAccount.id,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.token) {
            throw new Error(data?.error || "Не удалось создать ссылку для MAX.");
        }
        // По доке MAX диплинк бота: https://max.ru/<botName>?start=<payload> (именно start, не startapp)
        const url = new URL(MAX_SUPPORT_BOT_URL);
        url.searchParams.set("start", `haulz_auth_${data.token}`);
        openMaxBotLink(url.toString());
    };

    const openMaxBotLink = (url: string) => {
        const webApp = getWebApp();
        const isMobile = typeof window !== "undefined" && (window.innerWidth < 768 || /Android|iPhone|iPad/i.test(navigator.userAgent || ""));
        // Сначала пробуем Bridge.openLink (в MAX может передать ссылку в приложение)
        if (webApp && typeof webApp.openLink === "function") {
            try {
                webApp.openLink(url);
            } catch (e) {
                console.warn("[openMaxBotLink] openLink failed:", e);
            }
        }
        // На телефоне openLink часто не срабатывает — через 100 мс пробуем открыть в этом же окне (уход из мини-аппа на диплинк)
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
        if (typeof window !== "undefined" && cargoNumber) {
            window.sessionStorage.setItem(
                "haulz.chat.prefill",
                `Интересует информация по перевозке номер ${cargoNumber}`
            );
            if (activeAccount?.login && activeAccount?.password) {
                fetch(PROXY_API_GETPEREVOZKA_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        login: activeAccount.login,
                        password: activeAccount.password,
                        number: cargoNumber,
                    }),
                })
                    .then((r) => r.json())
                    .then((data) => {
                        try {
                            window.sessionStorage.setItem("haulz.chat.cargoPreload", JSON.stringify(data));
                        } catch (_) {}
                    })
                    .catch(() => {});
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
            const loginKey = login.trim().toLowerCase();

            // Способ 2 авторизации: Getcustomers (GETAPI?metod=Getcustomers)
            const customersRes = await fetch(PROXY_API_GETCUSTOMERS_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login, password }),
            });
            if (customersRes.ok) {
                const customersData = await customersRes.json().catch(() => ({}));
                const rawList = Array.isArray(customersData?.customers) ? customersData.customers : Array.isArray(customersData?.Customers) ? customersData.Customers : [];
                const customers: CustomerOption[] = dedupeCustomersByInn(
                    rawList.map((c: any) => ({
                        name: String(c?.name ?? c?.Name ?? "").trim() || String(c?.Inn ?? c?.inn ?? ""),
                        inn: String(c?.inn ?? c?.INN ?? c?.Inn ?? "").trim(),
                    })).filter((c: CustomerOption) => c.inn.length > 0)
                );
                if (customers.length > 0) {
                    const existingInns = await getExistingInns(accounts.map((a) => a.login.trim().toLowerCase()));
                    const alreadyAdded = customers.find((c) => c.inn && existingInns.has(c.inn));
                    if (alreadyAdded) {
                        setError("Компания уже в списке");
                        return;
                    }
                    const twoFaRes = await fetch(`/api/2fa?login=${encodeURIComponent(loginKey)}`);
                    const twoFaJson = twoFaRes.ok ? await twoFaRes.json() : null;
                    const twoFaSettings = twoFaJson?.settings;
                    const twoFaEnabled = !!twoFaSettings?.enabled;
                    const twoFaMethod = twoFaSettings?.method === "telegram" ? "telegram" : "google";
                    const twoFaLinked = !!twoFaSettings?.telegramLinked;
                    const twoFaGoogleSecretSet = !!twoFaSettings?.googleSecretSet;
                    if (twoFaEnabled && twoFaMethod === "telegram" && twoFaLinked) {
                        const sendRes = await fetch("/api/2fa-telegram", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ login: loginKey, action: "send" }),
                        });
                        if (!sendRes.ok) {
                            const err = await readJsonOrText(sendRes);
                            throw new Error(err?.error || "Не удалось отправить код");
                        }
                        setPendingLogin({ login, password, customer: undefined, loginKey, customers, twoFaMethod: "telegram" });
                        setTwoFactorPending(true);
                        setTwoFactorCode("");
                        return;
                    }
                    if (twoFaEnabled && twoFaMethod === "google" && twoFaGoogleSecretSet) {
                        setPendingLogin({ login, password, customer: undefined, loginKey, customers, twoFaMethod: "google" });
                        setTwoFactorPending(true);
                        setTwoFactorCode("");
                        return;
                    }
                    const existingAccount = accounts.find(acc => acc.login === login);
                    const firstInn = customers[0].inn;
                    if (existingAccount) {
                        setAccounts(prev =>
                            prev.map(acc =>
                                acc.id === existingAccount.id
                                    ? { ...acc, customers, activeCustomerInn: firstInn }
                                    : acc
                            )
                        );
                        setActiveAccountId(existingAccount.id);
                    } else {
                        const accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        const newAccount: Account = { login, password, id: accountId, customers, activeCustomerInn: firstInn };
                        setAccounts(prev => [...prev, newAccount]);
                        setActiveAccountId(accountId);
                    }
                    setActiveTab((prev) => prev || "cargo");
                    // Сначала заполняем БД, потом данные берём из БД (раздел «Мои компании»)
                    fetch("/api/companies-save", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ login: loginKey, customers }),
                    })
                        .then((r) => r.json())
                        .then((data) => { if (data?.saved !== undefined && data.saved === 0 && data.warning) console.warn("companies-save:", data.warning); })
                        .catch((err) => console.warn("companies-save error:", err));
                    return;
                }
            }

            // Способ 1 авторизации: GetPerevozki (перевозки)
            const { dateFrom, dateTo } = getDateRange("все");
            const res = await fetch(PROXY_API_BASE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login, password, dateFrom, dateTo }),
            });
            await ensureOk(res, "Ошибка авторизации");
            const payload = await readJsonOrText(res);
            const detectedCustomer = extractCustomerFromPerevozki(payload);
            const detectedInn = extractInnFromPerevozki(payload);
            const existingInns = await getExistingInns(accounts.map((a) => a.login.trim().toLowerCase()));
            if (detectedInn && existingInns.has(detectedInn)) {
                setError("Компания уже в списке");
                return;
            }
            const twoFaRes = await fetch(`/api/2fa?login=${encodeURIComponent(loginKey)}`);
            const twoFaJson = twoFaRes.ok ? await twoFaRes.json() : null;
            const twoFaSettings = twoFaJson?.settings;
            const twoFaEnabled = !!twoFaSettings?.enabled;
            const twoFaMethod = twoFaSettings?.method === "telegram" ? "telegram" : "google";
            const twoFaLinked = !!twoFaSettings?.telegramLinked;
            const twoFaGoogleSecretSet = !!twoFaSettings?.googleSecretSet;

            if (twoFaEnabled && twoFaMethod === "telegram" && twoFaLinked) {
                const sendRes = await fetch("/api/2fa-telegram", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login: loginKey, action: "send" }),
                });
                if (!sendRes.ok) {
                    const err = await readJsonOrText(sendRes);
                    throw new Error(err?.error || "Не удалось отправить код");
                }
                setPendingLogin({ login, password, customer: detectedCustomer, loginKey, perevozkiInn: detectedInn ?? undefined, twoFaMethod: "telegram" });
                setTwoFactorPending(true);
                setTwoFactorCode("");
                return;
            }
            if (twoFaEnabled && twoFaMethod === "google" && twoFaGoogleSecretSet) {
                setPendingLogin({ login, password, customer: detectedCustomer, loginKey, perevozkiInn: detectedInn ?? undefined, twoFaMethod: "google" });
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
                const newAccount: Account = {
                    login,
                    password,
                    id: accountId,
                    customer: detectedCustomer || undefined,
                    ...(detectedInn ? { activeCustomerInn: detectedInn } : {}),
                };
                setAccounts(prev => [...prev, newAccount]);
                setActiveAccountId(accountId);
            }
            const companyInn = detectedInn ?? "";
            const companyName = detectedCustomer || login.trim() || "Компания";
            fetch("/api/companies-save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login: loginKey, customers: [{ name: companyName, inn: companyInn }] }),
            }).catch(() => {});

            setActiveTab((prev) => prev || "cargo");
        } catch (err: any) {
            const raw = err?.message || "Ошибка сети.";
            const message = extractErrorMessage(raw) || (typeof raw === "string" ? raw : "Ошибка сети.");
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const handleTwoFactorSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setTwoFactorError(null);
        if (!pendingLogin?.loginKey || !twoFactorCode.trim()) {
            setTwoFactorError(pendingLogin?.twoFaMethod === "google" ? "Введите код из приложения." : "Введите код из Telegram.");
            return;
        }
        try {
            setTwoFactorLoading(true);
            const isGoogle = pendingLogin.twoFaMethod === "google";
            const res = await fetch(isGoogle ? "/api/2fa-google" : "/api/2fa-telegram", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                    isGoogle
                        ? { login: pendingLogin.loginKey, action: "verify", code: twoFactorCode.trim() }
                        : { login: pendingLogin.loginKey, action: "verify", code: twoFactorCode.trim() }
                ),
            });
            if (!res.ok) {
                const err = await readJsonOrText(res);
                throw new Error(err?.error || "Неверный код");
            }

            const detectedCustomer = pendingLogin.customer;
            const customers = pendingLogin.customers;
            const firstInn = customers?.length ? customers[0].inn : undefined;
            const existingAccount = accounts.find(acc => acc.login === pendingLogin.login);
            let accountId: string;
            if (existingAccount) {
                accountId = existingAccount.id;
                setAccounts(prev =>
                    prev.map(acc =>
                        acc.id === existingAccount.id
                            ? {
                                ...acc,
                                ...(detectedCustomer && acc.customer !== detectedCustomer ? { customer: detectedCustomer } : {}),
                                ...(customers?.length ? { customers, activeCustomerInn: firstInn } : {}),
                            }
                            : acc
                    )
                );
                setActiveAccountId(accountId);
            } else {
                accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const newAccount: Account = {
                    login: pendingLogin.login,
                    password: pendingLogin.password,
                    id: accountId,
                    customer: detectedCustomer || undefined,
                    ...(customers?.length ? { customers, activeCustomerInn: firstInn } : {}),
                };
                setAccounts(prev => [...prev, newAccount]);
                setActiveAccountId(accountId);
            }
            const loginKeyToSave = pendingLogin.loginKey;
            const customersToSave = pendingLogin.customers;
            const loginDisplay = pendingLogin.login?.trim() || "";

            setActiveTab((prev) => prev || "cargo");
            setTwoFactorPending(false);
            setPendingLogin(null);
            setTwoFactorCode("");

            if (customersToSave?.length) {
                // Способ 2 (Getcustomers): сохраняем список заказчиков в БД
                fetch("/api/companies-save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login: loginKeyToSave, customers: customersToSave }),
                })
                    .then((r) => r.json())
                    .then((data) => { if (data?.saved !== undefined && data.saved === 0 && data.warning) console.warn("companies-save:", data.warning); })
                    .catch((err) => console.warn("companies-save error:", err));
            } else {
                // Способ 1 (GetPerevozki): одна компания с ИНН из ответа API
                const perevozkiInn = pendingLogin.perevozkiInn ?? "";
                fetch("/api/companies-save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login: loginKeyToSave, customers: [{ name: (detectedCustomer ?? loginDisplay) || "Компания", inn: perevozkiInn }] }),
                }).catch(() => {});
            }
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
    
    // Добавление нового аккаунта (для страницы профиля) — сначала способ 2 (Getcustomers), иначе способ 1 (GetPerevozki)
    const handleAddAccount = async (login: string, password: string) => {
        if (accounts.find(acc => acc.login === login)) {
            throw new Error("Аккаунт с таким логином уже добавлен");
        }

        const loginKey = login.trim().toLowerCase();

        // Сначала пробуем способ 2 (Getcustomers)
        const customersRes = await fetch(PROXY_API_GETCUSTOMERS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login, password }),
        });
        if (customersRes.ok) {
            const customersData = await customersRes.json().catch(() => ({}));
            const rawList = Array.isArray(customersData?.customers) ? customersData.customers : Array.isArray(customersData?.Customers) ? customersData.Customers : [];
            const customers: CustomerOption[] = dedupeCustomersByInn(
                rawList.map((c: any) => ({
                    name: String(c?.name ?? c?.Name ?? "").trim() || String(c?.Inn ?? c?.inn ?? ""),
                    inn: String(c?.inn ?? c?.INN ?? c?.Inn ?? "").trim(),
                })).filter((c: CustomerOption) => c.inn.length > 0)
            );
            if (customers.length > 0) {
                const existingInns = await getExistingInns(accounts.map((a) => a.login.trim().toLowerCase()));
                const alreadyAdded = customers.find((c) => c.inn && existingInns.has(c.inn));
                if (alreadyAdded) {
                    throw new Error("Компания уже в списке");
                }
                const accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const newAccount: Account = { login, password, id: accountId, customers, activeCustomerInn: customers[0].inn };
                setAccounts(prev => [...prev, newAccount]);
                setActiveAccountId(accountId);
                fetch("/api/companies-save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login: loginKey, customers }),
                })
                    .then((r) => r.json())
                    .then((data) => { if (data?.saved !== undefined && data.saved === 0 && data.warning) console.warn("companies-save:", data.warning); })
                    .catch((err) => console.warn("companies-save error:", err));
                return;
            }
        }

        // Способ 1 (GetPerevozki)
        const { dateFrom, dateTo } = getDateRange("все");
        const res = await fetch(PROXY_API_BASE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login, password, dateFrom, dateTo }),
        });
        if (!res.ok) {
            let message = `Ошибка авторизации`;
            try {
                const payload = await readJsonOrText(res);
                const extracted = extractErrorMessage(payload);
                if (extracted) message = extracted;
            } catch { }
            throw new Error(message);
        }
        const payload = await readJsonOrText(res);
        const detectedCustomer = extractCustomerFromPerevozki(payload);
        const detectedInn = extractInnFromPerevozki(payload);
        const existingInns = await getExistingInns(accounts.map((a) => a.login.trim().toLowerCase()));
        if (detectedInn && existingInns.has(detectedInn)) {
            throw new Error("Компания уже в списке");
        }
        const accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newAccount: Account = {
            login,
            password,
            id: accountId,
            customer: detectedCustomer || undefined,
            ...(detectedInn ? { activeCustomerInn: detectedInn } : {}),
        };
        setAccounts(prev => [...prev, newAccount]);
        setActiveAccountId(accountId);
        const companyInn = detectedInn ?? "";
        const companyName = detectedCustomer || login.trim() || "Компания";
        fetch("/api/companies-save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login: loginKey, customers: [{ name: companyName, inn: companyInn }] }),
        }).catch(() => {});
    };

    if (!auth) {
        return (
            <>
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
                                {pendingLogin?.twoFaMethod === "google" ? "Введите 6-значный код из приложения" : "Введите код из Telegram"}
                            </Typography.Body>
                            <div className="field">
                                <Input
                                    className="login-input"
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    placeholder={pendingLogin?.twoFaMethod === "google" ? "000000" : "Код подтверждения"}
                                    value={twoFactorCode}
                                    onChange={(e) => setTwoFactorCode(pendingLogin?.twoFaMethod === "google" ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value)}
                                />
                            </div>
                            <Button className="button-primary" type="submit" disabled={twoFactorLoading}>
                                {twoFactorLoading ? <Loader2 className="animate-spin w-5 h-5" /> : "Подтвердить код"}
                            </Button>
                            <Flex justify="center" style={{ marginTop: '0.75rem', gap: '0.5rem' }}>
                                {pendingLogin?.twoFaMethod === "telegram" && (
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
                                )}
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
            </>
        );
    }

    return (
        <>
            <Container className={`app-container`}>
            <header className="app-header">
                    <Flex align="center" justify="space-between" className="header-top-row">
                    <Flex align="center" className="header-auth-info" style={{ position: 'relative', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {!useServiceRequest && (
                            <CustomerSwitcher
                                accounts={accounts}
                                activeAccountId={activeAccountId}
                                onSwitchAccount={handleSwitchAccount}
                                onUpdateAccount={handleUpdateAccount}
                            />
                        )}
                        {serviceModeUnlocked && (
                            <Flex align="center" gap="0.35rem" style={{ flexShrink: 0 }}>
                                <Typography.Label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>Служ.</Typography.Label>
                                <span className="roles-switch-wrap" onClick={(e) => e.stopPropagation()}>
                                    <TapSwitch
                                        checked={useServiceRequest}
                                        onToggle={() => setUseServiceRequest(v => !v)}
                                    />
                                </span>
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
                            showSums={activeAccount?.roleCustomer ?? true}
                            useServiceRequest={useServiceRequest}
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
                            roleCustomer={activeAccount?.roleCustomer ?? true}
                            roleSender={activeAccount?.roleSender ?? true}
                            roleReceiver={activeAccount?.roleReceiver ?? true}
                            useServiceRequest={useServiceRequest}
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
                            onOpenMaxBot={openMaxBotWithAccount}
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
                            onOpenMaxBot={openMaxBotWithAccount}
                            onUpdateAccount={handleUpdateAccount}
                            onServiceModeChange={() => setServiceModeUnlocked(typeof window !== 'undefined' && window.localStorage.getItem('haulz.serviceMode') === '1')}
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
                            roleCustomer={activeAccount?.roleCustomer ?? true}
                            roleSender={activeAccount?.roleSender ?? true}
                            roleReceiver={activeAccount?.roleReceiver ?? true}
                            useServiceRequest={useServiceRequest}
                        />
                    )}
                    {!showDashboard && (activeTab === "dashboard" || activeTab === "home") && auth && (
                        <DashboardPage
                            auth={auth}
                            onClose={() => {}}
                            onOpenCargoFilters={openCargoWithFilters}
                            showSums={activeAccount?.roleCustomer ?? true}
                            useServiceRequest={useServiceRequest}
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
                            onOpenMaxBot={openMaxBotWithAccount}
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
                            onOpenMaxBot={openMaxBotWithAccount}
                            onUpdateAccount={handleUpdateAccount}
                            onServiceModeChange={() => setServiceModeUnlocked(typeof window !== 'undefined' && window.localStorage.getItem('haulz.serviceMode') === '1')}
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
        </>
    );
}
