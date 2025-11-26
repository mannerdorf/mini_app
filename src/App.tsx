import { FormEvent, useEffect, useState, useCallback, useMemo } from "react";
// Импортируем все необходимые иконки
import { 
    LogOut, Home, Truck, FileText, MessageCircle, User, Loader2, Check, X, Moon, Sun, Eye, EyeOff, AlertTriangle, Package, Calendar, Tag, Layers, Weight, Filter, Search, ChevronDown, User as UserIcon, Scale, RussianRuble, List, Download, FileText as FileTextIcon, Send, 
    LayoutGrid, Maximize, TrendingUp, CornerUpLeft, ClipboardCheck, CreditCard, Minus 
} from 'lucide-react';
import React from "react";
import "./styles.css";
// --- TELEGRAM MINI APP SUPPORT ---
import WebApp from "@twa-dev/sdk";

const isTg = () => typeof window !== "undefined" && window.Telegram?.WebApp;

import { DOCUMENT_METHODS } from "./documentMethods";


// --- CONFIGURATION ---
const PROXY_API_BASE_URL = '/api/perevozki'; 
const PROXY_API_DOWNLOAD_URL = '/api/download'; 

// --- TYPES ---
type ApiError = { error?: string; [key: string]: unknown; };
type AuthData = { login: string; password: string; };
type Tab = "home" | "cargo" | "docs" | "support" | "profile";
type DateFilter = "все" | "сегодня" | "неделя" | "месяц" | "период";
type StatusFilter = "all" | "accepted" | "in_transit" | "ready" | "delivering" | "delivered";

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

// Статистика (заглушка)
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
        case 'all': dateFrom = getSixMonthsAgoDate(); break;
        case 'today': dateFrom = getTodayDate(); break;
        case 'week': today.setDate(today.getDate() - 7); dateFrom = today.toISOString().split('T')[0]; break;
        case 'month': today.setMonth(today.getMonth() - 1); dateFrom = today.toISOString().split('T')[0]; break;
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


// ================== COMPONENTS ==================

// --- HOME PAGE (STATISTICS) ---
function HomePage({ cargoList, isLoading, error }: { cargoList: CargoItem[] | null, isLoading: boolean, error: string | null }) { // Убраны лишние пропсы auth, fetchList
    const [filterLevel, setFilterLevel] = useState<1 | 2>(1);
    const [currentFilter, setCurrentFilter] = useState<string | null>(null);

    const statsData = useMemo(() => {
        // Здесь должна быть логика расчета, пока используем заглушки
        return { level1: STATS_LEVEL_1, level2: STATS_LEVEL_2 };
    }, [cargoList]);

    const currentStats = useMemo(() => {
        if (filterLevel === 2 && currentFilter && STATS_LEVEL_2[currentFilter]) {
            return STATS_LEVEL_2[currentFilter];
        }
        return STATS_LEVEL_1;
    }, [filterLevel, currentFilter]);
    
    const handleStatClick = (key: string) => {
        if (filterLevel === 1 && STATS_LEVEL_2[key]) { setCurrentFilter(key); setFilterLevel(2); }
        else if (filterLevel === 2) { setCurrentFilter(null); setFilterLevel(1); }
    };

    return (
        <div className="w-full max-w-lg">
            <h2 className="title text-center mb-6">Статистика перевозок</h2>
            <div className="stats-grid">
                {currentStats.map((stat, idx) => (
                    <div key={stat.key} className={`stat-card ${stat.bgColor}`} onClick={() => handleStatClick(stat.key)}>
                        <div className="flex justify-between mb-1">
                            <span className="text-xs opacity-80">{stat.label}</span>
                            {filterLevel === 2 && idx === 0 && <CornerUpLeft className="w-4 h-4 opacity-90" />}
                        </div>
                        <div className="flex justify-between items-end">
                            <span className="text-xl font-bold">{stat.value} <span className="text-xs font-normal">{stat.unit}</span></span>
                            <stat.icon className="w-5 h-5 opacity-80" />
                        </div>
                    </div>
                ))}
            </div>
            
            {/* Состояние загрузки для главной */}
            {isLoading && <div className="text-center py-8"><Loader2 className="animate-spin w-6 h-6 mx-auto text-theme-primary" /><p className="text-sm text-theme-secondary">Обновление данных...</p></div>}
            {error && <div className="login-error"><AlertTriangle className="w-5 h-5 mr-2"/>{error}</div>}
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
    const [dateFilter, setDateFilter] = useState<DateFilter>("all");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [customDateFrom, setCustomDateFrom] = useState(DEFAULT_DATE_FROM);
    const [customDateTo, setCustomDateTo] = useState(DEFAULT_DATE_TO);
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
    const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);

    const apiDateRange = useMemo(() => dateFilter === "custom" ? { dateFrom: customDateFrom, dateTo: customDateTo } : getDateRange(dateFilter), [dateFilter, customDateFrom, customDateTo]);

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
                    <button className="filter-button" onClick={() => { setIsDateDropdownOpen(!isDateDropdownOpen); setIsStatusDropdownOpen(false); }}>
                        Дата: {dateFilter === 'custom' ? 'Период' : dateFilter} <ChevronDown className="w-4 h-4"/>
                    </button>
                    {isDateDropdownOpen && <div className="filter-dropdown">
                        {['all', 'today', 'week', 'month', 'custom'].map(key => <div key={key} className="dropdown-item" onClick={() => { setDateFilter(key as any); setIsDateDropdownOpen(false); if(key==='custom') setIsCustomModalOpen(true); }}>{key === 'all' ? 'Все' : key === 'today' ? 'Сегодня' : key === 'week' ? 'Неделя' : key === 'month' ? 'Месяц' : 'Период'}</div>)}
                    </div>}
                </div>
                <div className="filter-group">
                    <button className="filter-button" onClick={() => { setIsStatusDropdownOpen(!isStatusDropdownOpen); setIsDateDropdownOpen(false); }}>
                        Статус: {STATUS_MAP[statusFilter]} <ChevronDown className="w-4 h-4"/>
                    </button>
                    {isStatusDropdownOpen && <div className="filter-dropdown">
                        {Object.keys(STATUS_MAP).map(key => <div key={key} className="dropdown-item" onClick={() => { setStatusFilter(key as any); setIsStatusDropdownOpen(false); }}>{STATUS_MAP[key as StatusFilter]}</div>)}
                    </div>}
                </div>
            </div>

            <p className="text-sm text-theme-secondary mb-4 text-center">
                 Период: {formatDate(apiDateRange.dateFrom)} – {formatDate(apiDateRange.dateTo)}
            </p>

            {/* List */}
            {loading && <div className="text-center py-8"><Loader2 className="animate-spin w-6 h-6 mx-auto text-theme-primary" /></div>}
            {!loading && !error && filteredItems.length === 0 && (
                <div className="empty-state-card">
                    <Package className="w-12 h-12 mx-auto mb-4 text-theme-secondary opacity-50" />
                    <p className="text-theme-secondary">Ничего не найдено</p>
                </div>
            )}
            
            <div className="cargo-list">
                {filteredItems.map((item: CargoItem, idx: number) => (
                    <div key={item.Number || idx} className="cargo-card mb-4" onClick={() => setSelectedCargo(item)}>
                        <div className="cargo-header-row"><span className="order-number">{item.Number}</span><span className="date"><Calendar className="w-3 h-3 mr-1"/>{formatDate(item.DatePrih)}</span></div>
                        <div className="cargo-details-grid">
                            <div className="detail-item"><Tag className="w-4 h-4 text-theme-primary"/><div className="detail-item-label">Статус</div><div className={getStatusClass(item.State)}>{item.State}</div></div>
                            <div className="detail-item"><Layers className="w-4 h-4 text-theme-primary"/><div className="detail-item-label">Мест</div><div className="detail-item-value">{item.Mest || '-'}</div></div>
                            <div className="detail-item"><Scale className="w-4 h-4 text-theme-primary"/><div className="detail-item-label">Плат. вес</div><div className="detail-item-value">{item.PW || '-'}</div></div>
                        </div>
                        <div className="cargo-footer"><span className="sum-label">Сумма</span><span className="sum-value">{formatCurrency(item.Sum)}</span></div>
                    </div>
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
                <div className="modal-header"><h3>Произвольный диапазон</h3><button className="modal-close-button" onClick={onClose}><X size={20} /></button></div>
                <form onSubmit={e => { e.preventDefault(); onApply(tempFrom, tempTo); onClose(); }}>
                    <div style={{marginBottom: '1rem'}}><label className="detail-item-label">Дата начала:</label><input type="date" className="login-input date-input" value={tempFrom} onChange={e => setTempFrom(e.target.value)} required /></div>
                    <div style={{marginBottom: '1.5rem'}}><label className="detail-item-label">Дата окончания:</label><input type="date" className="login-input date-input" value={tempTo} onChange={e => setTempTo(e.target.value)} required /></div>
                    <button className="button-primary" type="submit">Применить</button>
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
        try {
            const res = await fetch(PROXY_API_DOWNLOAD_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: auth.login, password: auth.password, metod: DOCUMENT_METHODS[docType], number: item.Number }) });
            if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
            const data = await res.json();

if (!data?.data || !data.name) {
    throw new Error("Ответ от сервера не содержит файл.");
}

// Декодируем base64 в бинарный файл
const byteCharacters = atob(data.data);
const byteNumbers = new Array(byteCharacters.length).fill(0).map((_, i) => byteCharacters.charCodeAt(i));
const byteArray = new Uint8Array(byteNumbers);
const blob = new Blob([byteArray], { type: "application/pdf" });

const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = data.name || `${docType}_${item.Number}.pdf`;
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
        } catch (e: any) { setDownloadError(e.message); } finally { setDownloading(null); }
    };

    // Список явно отображаемых полей (из API примера)
    const EXCLUDED_KEYS = ['Number', 'DatePrih', 'DateVr', 'State', 'Mest', 'PW', 'W', 'Value', 'Sum', 'StateBill', 'Sender'];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    {/* Заголовок без "Перевозка" */}
                    <button className="modal-close-button" onClick={onClose}><X size={20} /></button>
                </div>
                {downloadError && <p className="login-error mb-2">{downloadError}</p>}
                
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
                
                <h4 style={{marginTop: '1rem', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600}}>Документы</h4>
                <div className="document-buttons">
                    {['ЭР', 'АПП', 'СЧЕТ', 'УПД'].map(doc => (
                        <button key={doc} className="doc-button" onClick={() => handleDownload(doc)} disabled={downloading === doc}>
                            {downloading === doc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 mr-2" />} {doc}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

const DetailItem = ({ label, value, icon, statusClass, highlighted }: any) => (
    <div className={`details-item-modal ${highlighted ? 'highlighted-detail' : ''}`}>
        <div className="detail-item-label">{label}</div>
        <div className={`detail-item-value flex items-center ${statusClass || ''}`}>{icon} {value}</div>
    </div>
);

function StubPage({ title }: { title: string }) { return <div className="w-full p-8 text-center"><h2 className="title">{title}</h2><p className="subtitle">Раздел в разработке</p></div>; }

function TabBar({ active, onChange }: { active: Tab, onChange: (t: Tab) => void }) {
    return (
        <div className="tabbar-container">
            <TabBtn label="Главная" icon={<Home />} active={active === "home"} onClick={() => onChange("home")} />
            <TabBtn label="" icon={<Truck />} active={active === "cargo"} onClick={() => onChange("cargo")} />
            <TabBtn label="Документы" icon={<FileText />} active={active === "docs"} onClick={() => onChange("docs")} />
            <TabBtn label="Поддержка" icon={<MessageCircle />} active={active === "support"} onClick={() => onChange("support")} />
            <TabBtn label="Профиль" icon={<User />} active={active === "profile"} onClick={() => onChange("profile")} />
        </div>
    );
}
const TabBtn = ({ label, icon, active, onClick }: any) => (
    <button className={`tab-button ${active ? 'active' : ''}`} onClick={onClick}>
        <span className="tab-icon">{icon}</span>{label && <span className="tab-label">{label}</span>}
    </button>
);

// ----------------- MAIN APP -----------------

export default function App() {
    // --- Telegram Init ---
    useEffect(() => {
        if (!isTg()) return;

        WebApp.ready();
        WebApp.expand();
        setTheme(WebApp.colorScheme);

        const themeHandler = () => setTheme(WebApp.colorScheme);
        WebApp.onEvent("themeChanged", themeHandler);

        return () => WebApp.offEvent("themeChanged", themeHandler);
    }, []);

    const [auth, setAuth] = useState<AuthData | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>("cargo"); 
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
            const { dateFrom, dateTo } = getDateRange("all");
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
            <div className={`app-container login-form-wrapper`}>
                <div className="login-card">
                    <div className="absolute top-4 right-4">
                        <button className="theme-toggle-button-login" onClick={toggleTheme} title={theme === 'dark' ? 'Светлый режим' : 'Темный режим'}>
                            {/* ИСПРАВЛЕНИЕ: Убран class text-yellow-400 */}
                            {theme === 'dark' 
                                ? <Sun className="w-5 h-5" /> 
                                : <Moon className="w-5 h-5" />}
                        </button>
                    </div>
                    <div className="flex justify-center mb-4 h-10 mt-6"><div className="logo-text">HAULZ</div></div>
                    <div className="tagline">Доставка грузов в Калининград и обратно</div>
                    <form onSubmit={handleLoginSubmit} className="form">
                        <div className="field">
                            <input className="login-input" type="text" placeholder="Логин (email)" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" />
                        </div>
                        <div className="field">
                            <div className="password-input-container">
                                <input className="login-input password" type={showPassword ? "text" : "password"} placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" style={{paddingRight: '3rem'}} />
                                <button type="button" className="toggle-password-visibility" onClick={() => setShowPassword(!showPassword)}>
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>
                        {/* ТУМБЛЕРЫ ВОССТАНОВЛЕНЫ */}
                        <label className="checkbox-row switch-wrapper">
                            <span>Согласие с <a href="#">публичной офертой</a></span>
                            <div className={`switch-container ${agreeOffer ? 'checked' : ''}`} onClick={() => setAgreeOffer(!agreeOffer)}><div className="switch-knob"></div></div>
                        </label>
                        <label className="checkbox-row switch-wrapper">
                            <span>Согласие на <a href="#">обработку данных</a></span>
                            <div className={`switch-container ${agreePersonal ? 'checked' : ''}`} onClick={() => setAgreePersonal(!agreePersonal)}><div className="switch-knob"></div></div>
                        </label>
                        <button className="button-primary" type="submit" disabled={loading}>
                            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : "Подтвердить"}
                        </button>
                    </form>
                    {error && <p className="login-error mt-4"><AlertTriangle className="w-5 h-5 mr-2" />{error}</p>}
                </div>
            </div>
        );
    }

    return (
        <div className={`app-container`}>
            <header className="app-header">
                <div className="header-top-row">
                    <div className="header-auth-info"><UserIcon className="w-4 h-4 mr-2" /><span>{auth.login}</span></div>
                    <div className="flex items-center space-x-3">
                        <button className="search-toggle-button" onClick={() => { setIsSearchExpanded(!isSearchExpanded); if(isSearchExpanded) { handleSearch(''); setSearchText(''); } }}>
                            {isSearchExpanded ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
                        </button>
                        <button className="search-toggle-button" onClick={handleLogout} title="Выход">
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                <div className={`search-container ${isSearchExpanded ? 'expanded' : 'collapsed'}`}>
                    <Search className="w-5 h-5 text-theme-secondary flex-shrink-0 ml-1" />
                    <input type="search" placeholder="Поиск..." className="search-input" value={searchText} onChange={(e) => { setSearchText(e.target.value); handleSearch(e.target.value); }} />
                    {searchText && <button className="search-toggle-button" onClick={() => { setSearchText(''); handleSearch(''); }}><X className="w-4 h-4" /></button>}
                </div>
            </header>
            <div className="app-main">
                <div className="w-full max-w-4xl">
                    {activeTab === "home" && <HomePage cargoList={null} isLoading={false} error={null} />}
                    {activeTab === "cargo" && <CargoPage auth={auth} searchText={searchText} />}
                    {activeTab === "docs" && <StubPage title="Документы" />}
                    {activeTab === "support" && <StubPage title="Поддержка" />}
                    {activeTab === "profile" && <StubPage title="Профиль" />}
                </div>
            </div>
            <TabBar active={activeTab} onChange={setActiveTab} />
        </div>
    );
}
