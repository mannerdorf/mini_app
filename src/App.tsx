import { FormEvent, useEffect, useState, useCallback, useMemo } from "react";
import { 
    LogOut, Home, Truck, FileText, MessageCircle, User, Loader2, Check, X, Moon, Sun, Eye, EyeOff, AlertTriangle, Package, Calendar, Tag, Layers, Weight, Filter, Search, ChevronDown, User as UserIcon, Scale, DollarSign, List, Download, FileText as FileTextIcon, Send, 
    RussianRuble, LayoutGrid, Maximize, TrendingUp, CornerUpLeft, ClipboardCheck, CreditCard, Minus 
} from 'lucide-react';
import React from "react";
import "./styles.css";

// --- CONFIGURATION ---
const PROXY_API_BASE_URL = '/api/perevozki'; 
const PROXY_API_DOWNLOAD_URL = '/api/download'; 

// --- TYPES ---
type ApiError = { error?: string; [key: string]: unknown; };
type AuthData = { login: string; password: string; };
type Tab = "home" | "cargo" | "docs" | "support" | "profile";
type DateFilter = "all" | "today" | "week" | "month" | "custom";
type StatusFilter = "all" | "accepted" | "in_transit" | "ready" | "delivering" | "delivered";

type CargoItem = {
    Number?: string; DatePrih?: string; DateVruch?: string; State?: string; Mest?: number | string; 
    PV?: number | string; Weight?: number | string; Volume?: number | string; Sum?: number | string; 
    StatusSchet?: string; [key: string]: any;
};

type CargoStat = {
    key: string; label: string; icon: React.ElementType; value: number | string; unit: string; bgColor: string;
};

type CargoListState = {
    list: CargoItem[] | null;
    isLoading: boolean;
    error: string | null;
};

// --- CONSTANTS ---
const DEFAULT_LOGIN = "order@lal-auto.com";
const DEFAULT_PASSWORD = "ZakaZ656565";

const getTodayDate = () => new Date().toISOString().split('T')[0];
const getSixMonthsAgoDate = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6); 
    return d.toISOString().split('T')[0];
};
const DEFAULT_DATE_FROM = getSixMonthsAgoDate();
const DEFAULT_DATE_TO = getTodayDate();

// --- STATS STRUCTURE (Templates) ---
// Мы используем структуру, но значения будем подставлять динамически в HomePage
const STATS_TEMPLATE_LEVEL_1: CargoStat[] = [
    { key: 'total', label: 'Всего перевозок', icon: LayoutGrid, value: 0, unit: 'шт', bgColor: 'bg-indigo-500' },
    { key: 'payments', label: 'Счета', icon: RussianRuble, value: 0, unit: '₽', bgColor: 'bg-green-500' },
    { key: 'weight', label: 'Вес', icon: TrendingUp, value: 0, unit: 'кг', bgColor: 'bg-yellow-500' },
    { key: 'volume', label: 'Объем', icon: Maximize, value: 0, unit: 'м³', bgColor: 'bg-pink-500' },
];

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
        const date = new Date(dateString.includes('T') ? dateString : dateString + 'T00:00:00');
        if (!isNaN(date.getTime())) return date.toLocaleDateString('ru-RU');
    } catch { }
    return dateString;
};

const formatCurrency = (value: number | string | undefined): string => {
    if (!value) return '-';
    const num = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
    return isNaN(num) ? String(value) : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0 }).format(num);
};

const getStatusClass = (status: string | undefined) => {
    const lower = (status || '').toLowerCase();
    if (lower.includes('доставлен') || lower.includes('заверш')) return 'status-value success';
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

// --- API FUNCTION ---
const fetchCargoListApi = async (auth: AuthData, dateFrom: string, dateTo: string) => {
    const res = await fetch(PROXY_API_BASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: auth.login, password: auth.password, dateFrom, dateTo }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ошибка: ${res.status} ${text.substring(0, 50)}`);
    }
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.items || [];
    return list.map((item: any) => ({
        Number: item.Number, DatePrih: item.DatePrih, DateVruch: item.DateVruch, State: item.State, Mest: item.Mest, 
        PV: item.PV || item.PaymentWeight, Weight: item.Weight, Volume: item.Volume, Sum: item.Sum, StatusSchet: item.StatusSchet, ...item
    }));
};

// ================== COMPONENTS ==================

// --- HOME PAGE (STATISTICS) ---
function HomePage({ cargoList, isLoading, error, auth, fetchList }: { cargoList: CargoItem[] | null, isLoading: boolean, error: string | null, auth: AuthData, fetchList: Function }) {
    const [filterLevel, setFilterLevel] = useState<1 | 2>(1);
    const [currentFilter, setCurrentFilter] = useState<string | null>(null);

    // Загружаем данные при входе на главную, если их нет
    useEffect(() => {
        if (!cargoList && !isLoading && !error) {
            fetchList(auth, DEFAULT_DATE_FROM, DEFAULT_DATE_TO);
        }
    }, [cargoList, isLoading, error, auth, fetchList]);

    // Динамический расчет статистики на основе cargoList
    const statsData = useMemo(() => {
        const list = cargoList || [];
        const totalCount = list.length;
        const totalSum = list.reduce((acc, item) => acc + (parseFloat(item.Sum) || 0), 0);
        const totalWeight = list.reduce((acc, item) => acc + (parseFloat(item.Weight) || 0), 0);
        const totalVolume = list.reduce((acc, item) => acc + (parseFloat(item.Volume) || 0), 0);

        // Уровень 1 (Главные плитки)
        const level1 = [
            { key: 'total', label: 'Всего перевозок', icon: LayoutGrid, value: totalCount, unit: 'шт', bgColor: 'bg-indigo-500' },
            { key: 'payments', label: 'Счета', icon: RussianRuble, value: formatCurrency(totalSum), unit: '₽', bgColor: 'bg-green-500' },
            { key: 'weight', label: 'Вес', icon: TrendingUp, value: Math.round(totalWeight).toLocaleString(), unit: 'кг', bgColor: 'bg-yellow-500' },
            { key: 'volume', label: 'Объем', icon: Maximize, value: totalVolume.toFixed(1), unit: 'м³', bgColor: 'bg-pink-500' },
        ];

        // Уровень 2 (Детализация)
        const level2: { [key: string]: CargoStat[] } = {
            total: [
                { key: 'total_new', label: 'В работе', icon: Truck, value: list.filter(i => !['delivered', 'completed'].includes(getFilterKeyByStatus(i.State))).length, unit: 'шт', bgColor: 'bg-blue-400' },
                { key: 'total_in_transit', label: 'В пути', icon: TrendingUp, value: list.filter(i => getFilterKeyByStatus(i.State) === 'in_transit').length, unit: 'шт', bgColor: 'bg-indigo-400' },
                { key: 'total_completed', label: 'Завершено', icon: Check, value: list.filter(i => getFilterKeyByStatus(i.State) === 'delivered').length, unit: 'шт', bgColor: 'bg-green-400' },
                { key: 'total_cancelled', label: 'Отменено', icon: X, value: 0, unit: 'шт', bgColor: 'bg-red-400' },
            ],
            payments: [
                { key: 'pay_paid', label: 'Оплачено', icon: ClipboardCheck, value: 0, unit: '₽', bgColor: 'bg-green-400' }, // Логика счетов требует доп. полей
                { key: 'pay_due', label: 'К оплате', icon: CreditCard, value: 0, unit: '₽', bgColor: 'bg-yellow-400' },
                { key: 'pay_none', label: 'Нет счета', icon: Minus, value: 0, unit: 'шт', bgColor: 'bg-gray-400' },
            ],
            weight: [
                { key: 'weight_current', label: 'Общий вес', icon: Weight, value: Math.round(totalWeight), unit: 'кг', bgColor: 'bg-red-400' },
                { key: 'weight_paid', label: 'Платный вес', icon: Scale, value: Math.round(list.reduce((acc, i) => acc + (parseFloat(i.PV) || 0), 0)), unit: 'кг', bgColor: 'bg-orange-400' },
                { key: 'weight_places', label: 'Мест', icon: Layers, value: list.reduce((acc, i) => acc + (parseFloat(i.Mest) || 0), 0), unit: 'шт', bgColor: 'bg-purple-400' },
            ],
            volume: [
                { key: 'vol_current', label: 'Объем всего', icon: Maximize, value: totalVolume.toFixed(1), unit: 'м³', bgColor: 'bg-pink-400' },
                { key: 'vol_boxes', label: 'Кол-во мест', icon: Layers, value: list.reduce((acc, i) => acc + (parseFloat(i.Mest) || 0), 0), unit: 'шт', bgColor: 'bg-teal-400' },
            ],
        };

        return { level1, level2 };
    }, [cargoList]);

    const currentStats = useMemo(() => {
        if (filterLevel === 2 && currentFilter && statsData.level2[currentFilter]) {
            return statsData.level2[currentFilter];
        }
        return statsData.level1;
    }, [filterLevel, currentFilter, statsData]);
    
    const handleStatClick = (key: string) => {
        if (filterLevel === 1 && statsData.level2[key]) { setCurrentFilter(key); setFilterLevel(2); }
        else if (filterLevel === 2) { setCurrentFilter(null); setFilterLevel(1); }
    };

    return (
        <div className="w-full max-w-lg">
            {/* Плитки статистики ТЕПЕРЬ ЗДЕСЬ */}
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
            {!isLoading && !error && !cargoList && <div className="text-center text-theme-secondary py-4">Нет данных для отображения</div>}
        </div>
    );
}


// --- CARGO PAGE (LIST ONLY) ---
function CargoPage({ auth, searchText, cargoList, isLoading, error, fetchList, setSelectedCargo }: any) {
    // Filters State
    const [dateFilter, setDateFilter] = useState<DateFilter>("all");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [customDateFrom, setCustomDateFrom] = useState(DEFAULT_DATE_FROM);
    const [customDateTo, setCustomDateTo] = useState(DEFAULT_DATE_TO);
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
    const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);

    // Load data on mount or filter change
    const apiDateRange = useMemo(() => dateFilter === "custom" ? { dateFrom: customDateFrom, dateTo: customDateTo } : getDateRange(dateFilter), [dateFilter, customDateFrom, customDateTo]);
    
    useEffect(() => {
        fetchList(auth, apiDateRange.dateFrom, apiDateRange.dateTo);
    }, [apiDateRange, auth]); // eslint-disable-line

    // Client-side filtering
    const filteredItems = useMemo(() => {
        let res = cargoList || [];
        if (statusFilter !== 'all') res = res.filter((i: any) => getFilterKeyByStatus(i.State) === statusFilter);
        if (searchText) {
            const lower = searchText.toLowerCase();
            res = res.filter((i: any) => [i.Number, i.State, formatDate(i.DatePrih), formatCurrency(i.Sum)].join(' ').toLowerCase().includes(lower));
        }
        return res;
    }, [cargoList, statusFilter, searchText]);

    return (
        <div className="w-full">
            {/* Filters */}
            <div className="filters-container">
                <div className="filter-group">
                    <button className="filter-button" onClick={() => { setIsDateDropdownOpen(!isDateDropdownOpen); setIsStatusDropdownOpen(false); }}>
                        Дата: {dateFilter === 'custom' ? 'Период' : (dateFilter === 'all' ? 'Все' : dateFilter)} <ChevronDown className="w-4 h-4"/>
                    </button>
                    {isDateDropdownOpen && <div className="filter-dropdown">
                        {['all', 'сегодня', 'неделя', 'месяц', 'custom'].map(key => <div key={key} className="dropdown-item" onClick={() => { setDateFilter(key as any); setIsDateDropdownOpen(false); if(key==='custom') setIsCustomModalOpen(true); }}>{key === 'all' ? 'Все' : key}</div>)}
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

            {/* List */}
            {isLoading && <div className="text-center py-8"><Loader2 className="animate-spin w-6 h-6 mx-auto text-theme-primary" /></div>}
            {!isLoading && error && <p className="login-error"><AlertTriangle className="w-5 h-5 mr-2" />{error}</p>}
            {!isLoading && !error && filteredItems.length === 0 && (
                <div className="empty-state-card">
                    <Package className="w-12 h-12 mx-auto mb-4 text-theme-secondary opacity-50" />
                    <p className="text-theme-secondary">Ничего не найдено</p>
                </div>
            )}
            
            <div className="cargo-list">
                {filteredItems.map((item: CargoItem, idx: number) => (
                    <div key={item.Number || idx} className="cargo-card mb-4" onClick={() => setSelectedCargo(item)}>
                        <div className="cargo-header-row"><span className="order-number">№ {item.Number}</span><span className="date"><Calendar className="w-3 h-3 mr-1"/>{formatDate(item.DatePrih)}</span></div>
                        <div className="cargo-details-grid">
                            <div className="detail-item"><Tag className="w-4 h-4 text-theme-primary"/><div className="detail-item-label">Статус</div><div className={getStatusClass(item.State)}>{item.State}</div></div>
                            <div className="detail-item"><Layers className="w-4 h-4 text-theme-primary"/><div className="detail-item-label">Мест</div><div className="detail-item-value">{item.Mest}</div></div>
                            <div className="detail-item"><Scale className="w-4 h-4 text-theme-primary"/><div className="detail-item-label">Плат. вес</div><div className="detail-item-value">{item.PV}</div></div>
                        </div>
                        <div className="cargo-footer"><span className="sum-label">Сумма</span><span className="sum-value">{formatCurrency(item.Sum)}</span></div>
                    </div>
                ))}
            </div>

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
                <div className="modal-header"><h3>Произвольный диапазон</h3><button className="modal-close-button" onClick={onClose}><X /></button></div>
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

    const renderValue = (val: any, unit = '') => (val === undefined || val === null || val === "") ? '-' : `${val}${unit ? ' ' + unit : ''}`;
    
    const handleDownload = async (docType: string) => {
        if (!item.Number) return alert("Нет номера перевозки");
        setDownloading(docType); setDownloadError(null);
        try {
            const res = await fetch(PROXY_API_DOWNLOAD_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: auth.login, password: auth.password, metod: docType, number: item.Number }) });
            if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `${docType}_${item.Number}.pdf`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
        } catch (e: any) { setDownloadError(e.message); } finally { setDownloading(null); }
    };

    const handleChat = () => { 
        // Используем API Telegram WebApp если доступно, иначе fallback
        if ((window as any).Telegram?.WebApp?.openTelegramLink) {
            (window as any).Telegram.WebApp.openTelegramLink('https://t.me/haulz_support');
        } else {
            window.open('https://t.me/haulz_support', '_blank');
        }
    };
    
    const handleShare = () => { 
        const text = `Перевозка №${item.Number}: ${item.State}, ${formatCurrency(item.Sum)}`;
        if ((window as any).Telegram?.WebApp?.shareUrl) { (window as any).Telegram.WebApp.shareUrl(window.location.origin, { text }); }
        else { navigator.clipboard.writeText(text); alert('Скопировано: ' + text); }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Перевозка №{item.Number}</h3>
                    <button className="modal-close-button" onClick={onClose}><X /></button>
                </div>
                {downloadError && <p className="login-error mb-2">{downloadError}</p>}
                <div className="document-buttons mb-4">
                    <button className="doc-button" onClick={handleChat}><MessageCircle className="w-4 h-4 mr-2"/>Чат</button>
                    <button className="doc-button" onClick={handleShare}><Send className="w-4 h-4 mr-2"/>Поделиться</button>
                </div>
                <div className="details-grid-modal">
                    <DetailItem label="Номер" value={item.Number} />
                    <DetailItem label="Статус" value={item.State} statusClass={getStatusClass(item.State)} />
                    <DetailItem label="Приход" value={formatDate(item.DatePrih)} />
                    <DetailItem label="Вручение" value={formatDate(item.DateVruch)} />
                    <DetailItem label="Мест" value={renderValue(item.Mest)} icon={<Layers className="w-4 h-4 mr-1 text-theme-primary"/>} />
                    <DetailItem label="Плат. вес" value={renderValue(item.PV, 'кг')} icon={<Scale className="w-4 h-4 mr-1 text-theme-primary"/>} highlighted />
                    <DetailItem label="Вес" value={renderValue(item.Weight, 'кг')} icon={<Weight className="w-4 h-4 mr-1 text-theme-primary"/>} />
                    <DetailItem label="Объем" value={renderValue(item.Volume, 'м³')} icon={<List className="w-4 h-4 mr-1 text-theme-primary"/>} />
                    <DetailItem label="Стоимость" value={formatCurrency(item.Sum)} icon={<RussianRuble className="w-4 h-4 mr-1 text-theme-primary"/>} />
                    <DetailItem label="Счет" value={item.StatusSchet || '-'} highlighted />
                </div>
                <h4 style={{marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600}}>Документы</h4>
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
    const [auth, setAuth] = useState<AuthData | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>("home"); // По умолчанию Home
    const [theme, setTheme] = useState('dark'); 
    const [cargoList, setCargoList] = useState<CargoItem[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedCargo, setSelectedCargo] = useState<CargoItem | null>(null);

    // Поиск (в шапке)
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [searchText, setSearchText] = useState('');

    useEffect(() => { document.body.className = `${theme}-mode`; }, [theme]);
    const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    const handleSearch = (text: string) => setSearchText(text.toLowerCase().trim());

    // Функция загрузки списка (поднята в App, чтобы данные были доступны на главной и в списке)
    const fetchList = useCallback(async (authData: AuthData, dateFrom: string, dateTo: string) => {
        setIsLoading(true); setError(null);
        try {
            const items = await fetchCargoListApi(authData, dateFrom, dateTo);
            setCargoList(items);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const handleLoginSubmit = async (e: FormEvent, {login, password}: AuthData) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const res = await fetch(PROXY_API_BASE_URL, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login, password, dateFrom: DEFAULT_DATE_FROM, dateTo: DEFAULT_DATE_TO }),
            });
            if (!res.ok) throw new Error("Ошибка авторизации");
            
            const authData = { login, password };
            setAuth(authData);
            // Сразу загружаем данные при входе
            fetchList(authData, DEFAULT_DATE_FROM, DEFAULT_DATE_TO);
            setActiveTab("home"); // На главную после входа
        } catch (err: any) {
            setError(err.message || "Ошибка сети.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = () => {
        setAuth(null); setActiveTab("home"); setError(null); 
        setIsSearchExpanded(false); setSearchText(''); setCargoList(null);
    }

    if (!auth) {
        return <LoginScreen onLogin={handleLoginSubmit} isLoading={isLoading} error={error} />;
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
                    {activeTab === "home" && (
                        <HomePage 
                            cargoList={cargoList} 
                            isLoading={isLoading} 
                            error={error} 
                            auth={auth} 
                            fetchList={fetchList} 
                        />
                    )}
                    {activeTab === "cargo" && (
                        <CargoPage 
                            auth={auth} 
                            searchText={searchText} 
                            cargoList={cargoList} 
                            isLoading={isLoading} 
                            error={error}
                            fetchList={fetchList}
                            setSelectedCargo={setSelectedCargo}
                        />
                    )}
                    {activeTab === "docs" && <StubPage title="Документы" />}
                    {activeTab === "support" && <StubPage title="Поддержка" />}
                    {activeTab === "profile" && <StubPage title="Профиль" />}
                </div>
            </div>
            
            {selectedCargo && <CargoDetailsModal item={selectedCargo} isOpen={!!selectedCargo} onClose={() => setSelectedCargo(null)} auth={auth} />}
            <TabBar active={activeTab} onChange={setActiveTab} />
        </div>
    );
}

// --- LOGIN SCREEN COMPONENT (Isolated for clarity) ---
function LoginScreen({ onLogin, isLoading, error }: { onLogin: any, isLoading: boolean, error: string | null }) {
    const [login, setLogin] = useState(DEFAULT_LOGIN);
    const [password, setPassword] = useState(DEFAULT_PASSWORD);
    const [agreeOffer, setAgreeOffer] = useState(true);
    const [agreePersonal, setAgreePersonal] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [isThemeLight, setIsThemeLight] = useState(false);

    return (
        <div className={`app-container login-form-wrapper ${isThemeLight ? 'light-mode' : ''}`}>
            <div className="login-card">
                <div className="absolute top-4 right-4">
                     <button className="theme-toggle-button-login" onClick={() => {setIsThemeLight(!isThemeLight); document.body.classList.toggle('light-mode'); }}>
                        {isThemeLight ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5 text-yellow-400" />}
                    </button>
                </div>
                <div className="flex justify-center mb-4 h-10 mt-6"><div className="logo-text">HAULZ</div></div>
                <div className="tagline">Доставка грузов в Калининград и обратно</div>
                <form onSubmit={(e) => onLogin(e, {login, password})} className="form">
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
                    <label className="checkbox-row switch-wrapper">
                        <span>Согласие с <a href="#">публичной офертой</a></span>
                        <div className={`switch-container ${agreeOffer ? 'checked' : ''}`} onClick={() => setAgreeOffer(!agreeOffer)}><div className="switch-knob"></div></div>
                    </label>
                    <label className="checkbox-row switch-wrapper">
                        <span>Согласие на <a href="#">обработку данных</a></span>
                        <div className={`switch-container ${agreePersonal ? 'checked' : ''}`} onClick={() => setAgreePersonal(!agreePersonal)}><div className="switch-knob"></div></div>
                    </label>
                    <button className="button-primary" type="submit" disabled={isLoading}>
                        {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : "Подтвердить"}
                    </button>
                </form>
                {error && <p className="login-error mt-4"><AlertTriangle className="w-5 h-5 mr-2" />{error}</p>}
            </div>
        </div>
    );
}
