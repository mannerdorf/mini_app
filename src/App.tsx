import { FormEvent, useEffect, useState, useCallback, useMemo } from "react";
// Импортируем все необходимые иконки
import { 
    LogOut, Truck, Loader2, Check, X, Moon, Sun, Eye, EyeOff, AlertTriangle, Package, Calendar, Tag, Layers, Weight, Filter, Search, ChevronDown, User as UserIcon, Scale, RussianRuble, List, Download, Maximize,
    Home, FileText, MessageCircle, User, LayoutGrid, TrendingUp, CornerUpLeft, ClipboardCheck, CreditCard, Minus 
    // Все остальные импорты сохранены на случай использования в Cargo/Details
} from 'lucide-react';
import React from "react";
import { Button, Container, Flex, Grid, Input, Panel, Switch, Typography } from "@maxhub/max-ui";
import "./styles.css";
// --- TELEGRAM MINI APP SUPPORT ---
const getWebApp = () => {
    if (typeof window === "undefined") return undefined;
    return (
        window.Telegram?.WebApp ||
        (window as any).MAX?.WebApp ||
        (window as any).max?.WebApp ||
        (window as any).Max?.WebApp
    );
};

import { DOCUMENT_METHODS } from "./documentMethods";


// --- CONFIGURATION ---
const PROXY_API_BASE_URL = '/api/perevozki'; 
const PROXY_API_DOWNLOAD_URL = '/api/download'; 

// --- TYPES ---
type ApiError = { error?: string; [key: string]: unknown; };
type AuthData = { login: string; password: string; };
// УДАЛЕНО: type Tab = "home" | "cargo" | "docs" | "support" | "profile";
type Tab = "cargo"; // Оставлена только "cargo"
type DateFilter = "все" | "сегодня" | "неделя" | "месяц" | "период";
type StatusFilter = "all" | "accepted" | "in_transit" | "ready" | "delivering" | "delivered";
type HomePeriodFilter = "today" | "week" | "month" | "year" | "custom"; // Оставлено, так как это может использоваться в Home, который пока остается в коде ниже

// --- ИСПОЛЬЗУЕМ ТОЛЬКО ПЕРЕМЕННЫЕ ИЗ API ---
type CargoItem = {
    Number?: string; DatePrih?: string; DateVr?: string; State?: string; Mest?: number | string; 
    PW?: number | string; W?: number | string; Value?: number | string; Sum?: number | string; 
    StateBill?: string; Sender?: string; [key: string]: any; // Для всех остальных полей
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

const formatCurrency = (value: number | string | undefined): string => {
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === "")) return '-';
    const num = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
    return isNaN(num) ? String(value) : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 2 }).format(num);
};

const getStatusClass = (status: string | undefined) => {
    const lower = (status || '').toLowerCase();
    if (lower.includes('доставлен') || lower.includes('заверш')) return 'status-value success';
    if (lower.includes('пути') || lower.includes('отправлен')) return 'status-value transit';
    if (lower.includes('принят') || lower.includes('оформлен')) return 'status-value accepted';
    if (lower.includes('готов')) return 'status-value ready';
    return 'status-value';
};

const getFilterKeyByStatus = (s: string | undefined): StatusFilter => { 
    if (!s) return 'all'; 
    const l = s.toLowerCase(); 
    if (l.includes('доставлен') || l.includes('заверш')) return 'delivered'; 
    if (l.includes('пути') || l.includes('отправлен')) return 'in_transit';
    if (l.includes('принят') || l.includes('оформлен')) return 'accepted';
    if (l.includes('готов')) return 'ready';
    if (l.includes('доставке')) return 'delivering';
    return 'all'; 
}

const STATUS_MAP: Record<StatusFilter, string> = { "all": "Все", "accepted": "Принят", "in_transit": "В пути", "ready": "Готов", "delivering": "На доставке", "delivered": "Доставлено" };

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
            if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
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

// --- CARGO PAGE (LIST ONLY) ---
function CargoPage({ auth, searchText }: { auth: AuthData, searchText: string }) {
    const [items, setItems] = useState<CargoItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedCargo, setSelectedCargo] = useState<CargoItem | null>(null);
    
    // Filters State
    const [dateFilter, setDateFilter] = useState<DateFilter>("все"); // ИСПРАВЛЕНО: 'all' на 'все'
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [customDateFrom, setCustomDateFrom] = useState(DEFAULT_DATE_FROM);
    const [customDateTo, setCustomDateTo] = useState(DEFAULT_DATE_TO);
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
    const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);

    const apiDateRange = useMemo(() => dateFilter === "период" ? { dateFrom: customDateFrom, dateTo: customDateTo } : getDateRange(dateFilter), [dateFilter, customDateFrom, customDateTo]); // ИСПРАВЛЕНО: 'custom' на 'период'

    // Удалена функция findDeliveryDate, используем DateVr напрямую.

    const loadCargo = useCallback(async (dateFrom: string, dateTo: string) => {
        setLoading(true); setError(null);
        try {
            const res = await fetch(PROXY_API_BASE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: auth.login, password: auth.password, dateFrom, dateTo }) });
            if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
            const data = await res.json();
            const list = Array.isArray(data) ? data : data.items || [];
            
            // МАППИНГ ДАННЫХ: используем только указанные поля API
            setItems(list.map((item: any) => ({
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
            })));
        } catch (e: any) { setError(e.message); } finally { setLoading(false); }
    }, [auth]);

    useEffect(() => { loadCargo(apiDateRange.dateFrom, apiDateRange.dateTo); }, [apiDateRange, loadCargo]);

    // Client-side filtering
    const filteredItems = useMemo(() => {
        let res = items;
        if (statusFilter !== 'all') res = res.filter(i => getFilterKeyByStatus(i.State) === statusFilter);
        if (searchText) {
            const lower = searchText.toLowerCase();
            // Обновлены поля поиска: PW вместо PV, добавлен Sender
            res = res.filter(i => [i.Number, i.State, i.Sender, formatDate(i.DatePrih), formatCurrency(i.Sum), String(i.PW), String(i.Mest)].join(' ').toLowerCase().includes(lower));
        }
        return res;
    }, [items, statusFilter, searchText]);


    return (
        <div className="w-full">
            {/* Filters */}
            <div className="filters-container">
                <div className="filter-group">
                    <Button className="filter-button" onClick={() => { setIsDateDropdownOpen(!isDateDropdownOpen); setIsStatusDropdownOpen(false); }}>
                        Дата: {dateFilter === 'период' ? 'Период' : dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1)} <ChevronDown className="w-4 h-4"/>
                    </Button>
                    {isDateDropdownOpen && <div className="filter-dropdown">
                        {['все', 'сегодня', 'неделя', 'месяц', 'период'].map(key => (
                            <div key={key} className="dropdown-item" onClick={() => { setDateFilter(key as any); setIsDateDropdownOpen(false); if(key==='период') setIsCustomModalOpen(true); }}>
                                <Typography.Body>{key.charAt(0).toUpperCase() + key.slice(1)}</Typography.Body>
                            </div>
                        ))}
                    </div>}
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
                Период: {formatDate(apiDateRange.dateFrom)} – {formatDate(apiDateRange.dateTo)}
            </Typography.Body>

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
                    </Flex>
                </Panel>
            )}
            
            <div className="cargo-list">
                {filteredItems.map((item: CargoItem, idx: number) => (
                    <Panel key={item.Number || idx} className="cargo-card mb-4" onClick={() => setSelectedCargo(item)}>
                        <Flex justify="space-between" align="center" className="cargo-header-row">
                            <Typography.Title className="order-number">{item.Number}</Typography.Title>
                        <Flex align="center" className="date">
                                <Calendar className="w-3 h-3 mr-1" />
                            <Typography.Label>{formatDate(item.DatePrih)}</Typography.Label>
                            </Flex>
                        </Flex>
                        <div className="cargo-details-grid">
                            <div className="detail-item">
                                <Tag className="w-4 h-4 text-theme-primary"/>
                                <Typography.Label className="detail-item-label">Статус</Typography.Label>
                                <Typography.Body className={getStatusClass(item.State)}>{item.State}</Typography.Body>
                            </div>
                            <div className="detail-item">
                                <Layers className="w-4 h-4 text-theme-primary"/>
                                <Typography.Label className="detail-item-label">Мест</Typography.Label>
                                <Typography.Body className="detail-item-value">{item.Mest || '-'}</Typography.Body>
                            </div>
                            <div className="detail-item">
                                <Scale className="w-4 h-4 text-theme-primary"/>
                                <Typography.Label className="detail-item-label">Плат. вес</Typography.Label>
                                <Typography.Body className="detail-item-value">{item.PW || '-'}</Typography.Body>
                            </div>
                        </div>
                        <Flex justify="space-between" align="center" className="cargo-footer">
                            <Typography.Label className="sum-label">Сумма</Typography.Label>
                            <Typography.Title className="sum-value">{formatCurrency(item.Sum)}</Typography.Title>
                        </Flex>
                    </Panel>
                ))}
            </div>

            {selectedCargo && <CargoDetailsModal item={selectedCargo} isOpen={!!selectedCargo} onClose={() => setSelectedCargo(null)} auth={auth} />}
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

function CargoDetailsModal({ item, isOpen, onClose, auth }: { item: CargoItem, isOpen: boolean, onClose: () => void, auth: AuthData }) {
    const [downloading, setDownloading] = useState<string | null>(null);
    const [downloadError, setDownloadError] = useState<string | null>(null);
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
    
    const handleDownload = async (docType: string) => {
        if (!item.Number) return alert("Нет номера перевозки");
        setDownloading(docType); setDownloadError(null);
        const debug = typeof window !== "undefined" ? (window as any).__debugLog : undefined;
        debug?.("download.start", { docType, number: item.Number });
        try {
            const webApp = getWebApp();
            const metod = DOCUMENT_METHODS[docType];
            const origin = typeof window !== "undefined" ? window.location.origin : "";
            const directUrl = `${origin}${PROXY_API_DOWNLOAD_URL}?login=${encodeURIComponent(auth.login)}&password=${encodeURIComponent(auth.password)}&metod=${encodeURIComponent(metod)}&number=${encodeURIComponent(item.Number)}`;

            if (webApp) {
                debug?.("download.openLink", { url: directUrl });
                if (typeof webApp.openLink === "function") {
                    webApp.openLink(directUrl, { try_instant_view: false } as any);
                } else {
                    window.location.href = directUrl;
                }
                return;
            }

            const res = await fetch(PROXY_API_DOWNLOAD_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: auth.login, password: auth.password, metod, number: item.Number }) });
            debug?.("download.response", { status: res.status, ok: res.ok, contentType: res.headers.get("content-type") });
            if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
            const contentType = res.headers.get("content-type") || "";
            const contentDisposition = res.headers.get("content-disposition");
            const fallbackName = `${docType}_${item.Number}.pdf`;

            if (contentType.includes("application/json")) {
                const data = await res.json();
                debug?.("download.json", { hasData: Boolean(data?.data), name: data?.name });
                if (!data?.data) {
                    throw new Error("Ответ от сервера не содержит файл.");
                }
                const dataUrl = `data:application/pdf;base64,${data.data}`;
                window.open(dataUrl, "_blank", "noopener,noreferrer");
                return;
            }

            const blob = await res.blob();
            debug?.("download.blob", { size: blob.size, type: blob.type });
            const url = URL.createObjectURL(blob);
            window.open(url, "_blank", "noopener,noreferrer");
            URL.revokeObjectURL(url);
        } catch (e: any) {
            debug?.("download.error", e?.message || e);
            setDownloadError(e.message);
        } finally {
            setDownloading(null);
        }
    };

    // Список явно отображаемых полей (из API примера)
    const EXCLUDED_KEYS = ['Number', 'DatePrih', 'DateVr', 'State', 'Mest', 'PW', 'W', 'Value', 'Sum', 'StateBill', 'Sender'];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    {/* Заголовок без "Перевозка" */}
                    <Button className="modal-close-button" onClick={onClose} aria-label="Закрыть"><X size={20} /></Button>
                </div>
                {downloadError && <Typography.Body className="login-error mb-2">{downloadError}</Typography.Body>}
                
                {/* Явно отображаемые поля (из API примера) */}
                <div className="details-grid-modal">
                    <DetailItem label="Номер" value={item.Number} />
                    <DetailItem label="Статус" value={item.State} statusClass={getStatusClass(item.State)} />
                    <DetailItem label="Приход" value={formatDate(item.DatePrih)} />
                    <DetailItem label="Доставка" value={formatDate(item.DateVr)} /> {/* Используем DateVr */}
                    <DetailItem label="Отправитель" value={item.Sender || '-'} /> {/* Добавляем Sender */}
                    <DetailItem label="Мест" value={renderValue(item.Mest)} icon={<Layers className="w-4 h-4 mr-1 text-theme-primary"/>} />
                    <DetailItem label="Плат. вес" value={renderValue(item.PW, 'кг')} icon={<Scale className="w-4 h-4 mr-1 text-theme-primary"/>} highlighted /> {/* Используем PW */}
                    <DetailItem label="Вес" value={renderValue(item.W, 'кг')} icon={<Weight className="w-4 h-4 mr-1 text-theme-primary"/>} /> {/* Используем W */}
                    <DetailItem label="Объем" value={renderValue(item.Value, 'м³')} icon={<List className="w-4 h-4 mr-1 text-theme-primary"/>} /> {/* Используем Value */}
                    <DetailItem label="Стоимость" value={formatCurrency(item.Sum)} icon={<RussianRuble className="w-4 h-4 mr-1 text-theme-primary"/>} />
                    <DetailItem label="Статус Счета" value={item.StateBill || '-'} highlighted /> {/* Используем StateBill */}
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
                <div className="document-buttons">
                    {['ЭР', 'АПП', 'СЧЕТ', 'УПД'].map(doc => (
                        <Button key={doc} className="doc-button" onClick={() => handleDownload(doc)} disabled={downloading === doc}>
                            {downloading === doc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 mr-2" />} {doc}
                        </Button>
                    ))}
                </div>
            </div>
        </div>
    );
}

const DetailItem = ({ label, value, icon, statusClass, highlighted }: any) => (
    <div className={`details-item-modal ${highlighted ? 'highlighted-detail' : ''}`}>
        <Typography.Label className="detail-item-label">{label}</Typography.Label>
        <Flex align="center" className={`detail-item-value ${statusClass || ''}`}>
            {icon}
            <Typography.Body>{value}</Typography.Body>
        </Flex>
    </div>
);

// УДАЛЕНО: function StubPage({ title }: { title: string }) { return <div className="w-full p-8 text-center"><h2 className="title">{title}</h2><p className="subtitle">Раздел в разработке</p></div>; }

function TabBar({ active, onChange }: { active: Tab, onChange: (t: Tab) => void }) {
    return (
        <div className="tabbar-container">
            {/* ОСТАВЛЕНА ТОЛЬКО КНОПКА "Грузы" */}
            <TabBtn label="Грузы" icon={<Truck />} active={active === "cargo"} onClick={() => onChange("cargo")} />
        </div>
    );
}
const TabBtn = ({ label, icon, active, onClick }: any) => (
    <Button className={`tab-button ${active ? 'active' : ''}`} onClick={onClick}>
        <Flex align="center">
            <div className="tab-icon">{icon}</div>
            {label && <Typography.Label className="tab-label">{label}</Typography.Label>}
        </Flex>
    </Button>
);

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
                if (typeof webApp.expand === "function") {
                    webApp.expand();
                }
                if (typeof webApp.colorScheme === "string") {
                    setTheme(webApp.colorScheme);
                }
            } catch {
                // Игнорируем, если WebApp API частично недоступен
            }

            const themeHandler = () => {
                if (typeof webApp.colorScheme === "string") {
                    setTheme(webApp.colorScheme);
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

    const [auth, setAuth] = useState<AuthData | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>("cargo"); // ИЗМЕНЕНО: По умолчанию только "cargo"
    const [theme, setTheme] = useState('dark'); 
    
    // ИНИЦИАЛИЗАЦИЯ ПУСТЫМИ СТРОКАМИ (данные берутся с фронта)
    const [login, setLogin] = useState(""); 
    const [password, setPassword] = useState(""); 
    
    const [agreeOffer, setAgreeOffer] = useState(true);
    const [agreePersonal, setAgreePersonal] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false); 
    
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [searchText, setSearchText] = useState('');

    useEffect(() => { document.body.className = `${theme}-mode`; }, [theme]);
    const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    const handleSearch = (text: string) => setSearchText(text.toLowerCase().trim());

    const handleLoginSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
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

            if (!res.ok) {
                let message = `Ошибка авторизации: ${res.status}`;
                try {
                    const errorData = await res.json() as ApiError;
                    if (errorData.error) message = errorData.error;
                } catch { }
                setError(message);
                return;
            }
            setAuth({ login, password });
            setActiveTab("cargo"); 
        } catch (err: any) {
            setError("Ошибка сети.");
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        setAuth(null);
        setActiveTab("cargo");
        setPassword(""); 
        setIsSearchExpanded(false); setSearchText('');
    }

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
                                Согласие с <a href="#">публичной офертой</a>
                            </Typography.Body>
                            <Switch
                                checked={agreeOffer}
                                onCheckedChange={(value) => setAgreeOffer(resolveChecked(value))}
                                onChange={(event) => setAgreeOffer(resolveChecked(event))}
                            />
                        </label>
                        <label className="checkbox-row switch-wrapper">
                            <Typography.Body>
                                Согласие на <a href="#">обработку данных</a>
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
                    </form>
                    {error && (
                        <Flex align="center" className="login-error mt-4">
                            <AlertTriangle className="w-5 h-5 mr-2" />
                            <Typography.Body>{error}</Typography.Body>
                        </Flex>
                    )}
                </Panel>
            </Container>
        );
    }

    return (
        <Container className={`app-container`}>
            <header className="app-header">
                <Flex align="center" justify="space-between" className="header-top-row">
                    <Flex align="center" className="header-auth-info">
                        <UserIcon className="w-4 h-4 mr-2" />
                        <Typography.Body>{auth.login}</Typography.Body>
                    </Flex>
                    <Flex align="center" className="space-x-3">
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
                    {/* УДАЛЕНЫ УСЛОВНЫЕ РЕНДЕРЫ ДЛЯ home, docs, support, profile */}
                    {activeTab === "cargo" && <CargoPage auth={auth} searchText={searchText} />}
                </div>
            </div>
            <TabBar active={activeTab} onChange={setActiveTab} />
        </Container>
    );
}
