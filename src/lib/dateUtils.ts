import type { DateFilter } from "../types";

export const getTodayDate = () => new Date().toISOString().split('T')[0];

export const isDateToday = (dateStr: string | undefined): boolean => {
    if (!dateStr) return false;
    const d = dateStr.split('T')[0];
    return d === getTodayDate();
};

export const isDateInRange = (dateStr: string | undefined, from: string, to: string): boolean => {
    if (!dateStr) return false;
    const d = dateStr.split('T')[0];
    return d >= from && d <= to;
};

export const getSixMonthsAgoDate = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().split('T')[0];
};

export const DEFAULT_DATE_FROM = getSixMonthsAgoDate();
export const DEFAULT_DATE_TO = getTodayDate();
export const DATE_FILTER_STORAGE_KEY = 'haulz.dateFilterState';

export type DateFilterState = {
    dateFilter: DateFilter;
    customDateFrom: string;
    customDateTo: string;
    selectedMonthForFilter: { year: number; month: number } | null;
    selectedYearForFilter: number | null;
    selectedWeekForFilter: string | null;
};

export const loadDateFilterState = (): Partial<DateFilterState> | null => {
    try {
        const s = typeof localStorage !== 'undefined' && localStorage.getItem(DATE_FILTER_STORAGE_KEY);
        if (s) return JSON.parse(s) as Partial<DateFilterState>;
    } catch {}
    return null;
};

export const saveDateFilterState = (state: DateFilterState) => {
    try {
        typeof localStorage !== 'undefined' && localStorage.setItem(DATE_FILTER_STORAGE_KEY, JSON.stringify(state));
    } catch {}
};

export const getDateRange = (filter: DateFilter) => {
    const today = new Date();
    let dateTo = getTodayDate();
    let dateFrom = getTodayDate();
    switch (filter) {
        case 'все': dateFrom = getSixMonthsAgoDate(); break;
        case 'сегодня': dateFrom = getTodayDate(); break;
        case 'вчера': (() => { const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); const d = yesterday.toISOString().split('T')[0]; dateFrom = d; dateTo = d; })(); break;
        case 'неделя': {
            const d = new Date();
            d.setDate(d.getDate() - 6);
            dateFrom = d.toISOString().split('T')[0];
            dateTo = getTodayDate();
            break;
        }
        case 'месяц': today.setMonth(today.getMonth() - 1); dateFrom = today.toISOString().split('T')[0]; break;
        case 'год': today.setDate(today.getDate() - 365); dateFrom = today.toISOString().split('T')[0]; break;
        default: break;
    }
    return { dateFrom, dateTo };
};

export const getPreviousPeriodRange = (filter: DateFilter, currentFrom: string, currentTo: string): { dateFrom: string; dateTo: string } | null => {
    const today = new Date();
    let dateTo: string;
    let dateFrom: string;

    switch (filter) {
        case 'неделя': {
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
            const currentFromDate = new Date(currentFrom + 'T00:00:00');
            const prevMonthEnd = new Date(currentFromDate);
            prevMonthEnd.setDate(0);
            const prevMonthStart = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), 1);
            dateFrom = prevMonthStart.toISOString().split('T')[0];
            dateTo = prevMonthEnd.toISOString().split('T')[0];
            break;
        }
        case 'год': {
            const currentFromDate = new Date(currentFrom + 'T00:00:00');
            const currentToDate = new Date(currentTo + 'T00:00:00');
            const daysDiff = Math.ceil((currentToDate.getTime() - currentFromDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysDiff >= 350 && daysDiff <= 366) {
                const prevPeriodEnd = new Date(currentFromDate);
                prevPeriodEnd.setDate(prevPeriodEnd.getDate() - 1);
                const prevPeriodStart = new Date(prevPeriodEnd);
                prevPeriodStart.setDate(prevPeriodStart.getDate() - daysDiff);
                dateFrom = prevPeriodStart.toISOString().split('T')[0];
                dateTo = prevPeriodEnd.toISOString().split('T')[0];
            } else {
                const currentYear = currentFromDate.getFullYear();
                const prevYear = currentYear - 1;
                dateFrom = `${prevYear}-01-01`;
                dateTo = `${prevYear}-12-31`;
            }
            break;
        }
        case 'период': {
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
            return null;
    }

    return { dateFrom, dateTo };
};

export const WEEKDAY_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'] as const;
export const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'] as const;
export const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'] as const;

export const getWeekRange = (mondayIso: string) => {
    const mon = new Date(mondayIso + 'T00:00:00');
    const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
        dateFrom: `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`,
        dateTo: `${sun.getFullYear()}-${pad(sun.getMonth() + 1)}-${pad(sun.getDate())}`,
    };
};

export const getWeeksList = (count: number) => {
    const weeks: { monday: string; label: string }[] = [];
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    for (let i = 0; i < count; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i * 7);
        const day = d.getDay();
        const daysToMonday = (day + 6) % 7;
        d.setDate(d.getDate() - daysToMonday);
        const monday = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const sun = new Date(d); sun.setDate(sun.getDate() + 6);
        const label = `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} – ${sun.getDate()} ${MONTH_SHORT[sun.getMonth()]} ${sun.getFullYear()}`;
        weeks.push({ monday, label });
    }
    return weeks;
};

export const getYearsList = (count: number) => {
    const y = new Date().getFullYear();
    return Array.from({ length: count }, (_, i) => y - i);
};

export const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return '-';
    try {
        const cleanDateString = dateString.split('T')[0];
        const date = new Date(cleanDateString);
        if (!isNaN(date.getTime())) {
            const dayShort = WEEKDAY_SHORT[date.getDay()] ?? '';
            return dayShort ? `${dayShort}, ${date.toLocaleDateString('ru-RU')}` : date.toLocaleDateString('ru-RU');
        }
    } catch {}
    return dateString;
};

export const formatDateTime = (dateString: string | undefined, withPlus?: boolean): string => {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
            const dayShort = WEEKDAY_SHORT[date.getDay()] ?? '';
            const d = dayShort ? `${dayShort}, ${date.toLocaleDateString('ru-RU')}` : date.toLocaleDateString('ru-RU');
            const t = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: undefined });
            return withPlus ? `${d}, +${t}` : `${d}, ${t}`;
        }
    } catch {}
    return dateString;
};

export const formatTimelineDate = (dateString: string | undefined): string => {
    if (!dateString) return '—';
    try {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
            const dayShort = WEEKDAY_SHORT[date.getDay()] ?? '';
            return dayShort ? `${dayShort}, ${date.toLocaleDateString('ru-RU')}` : date.toLocaleDateString('ru-RU');
        }
    } catch {}
    return dateString;
};

export const formatTimelineTime = (dateString: string | undefined, withPlus?: boolean): string => {
    if (!dateString) return '—';
    try {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
            const t = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: undefined });
            return withPlus ? `+${t}` : t;
        }
    } catch {}
    return '—';
};

const HOLIDAYS_MM_DD = new Set([
    "01-01", "01-02", "01-03", "01-04", "01-05", "01-06", "01-07", "01-08",
    "02-23", "03-08", "05-01", "05-09", "06-12", "11-04",
]);

export const parseDateOnly = (dateString: string | undefined): Date | null => {
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

/** Плановая дата доставки PayTill: DateDoc + 6 дней. Возвращает YYYY-MM-DD для DateText или undefined. */
export const getPayTillDate = (dateDoc: string | undefined): string | undefined => {
    const date = parseDateOnly(dateDoc);
    if (!date) return undefined;
    date.setDate(date.getDate() + 6);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
};

/** Цвет для даты «Оплата до»: зелёный если счёт оплачен, красный если в прошлом, жёлтый если сегодня. */
export const getPayTillDateColor = (payTill: string | undefined, isPaid?: boolean): string | undefined => {
    if (!payTill) return undefined;
    if (isPaid) return "#22c55e";
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    if (payTill < todayStr) return "#ef4444";
    if (payTill === todayStr) return "#eab308";
    return undefined;
};

export const getDateInfo = (dateString: string | undefined) => {
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

export const getDateTextColor = (dateString: string | undefined) => {
    const info = getDateInfo(dateString);
    return info.isHoliday || info.isWeekend ? "#ef4444" : "var(--color-text-secondary)";
};
