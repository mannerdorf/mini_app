import { FormEvent, useEffect, useState, useCallback, useMemo } from "react";
// Импортируем все необходимые иконки из lucide-react
import { 
    LogOut, Home, Truck, FileText, MessageCircle, User, Loader2, Moon, Sun, Eye, EyeOff, AlertTriangle, Package, Calendar, Tag, Layers, Weight, Filter, X, Search, ChevronDown, User as UserIcon, Scale, DollarSign, List, Download, FileText as FileTextIcon
} from 'lucide-react';
import React from "react";

// --- ТИПЫ ДАННЫХ ---
type ApiError = {
    error?: string;
    [key: string]: unknown;
};

type AuthData = {
    login: string;
    password: string;
};

type Tab = "home" | "cargo" | "docs" | "support" | "profile";

type DateFilter = "all" | "сегодня" | "неделя" | "месяц" | "период";
type StatusFilter = "all" | "accepted" | "in_transit" | "ready" | "delivering" | "delivered";

// Тип для данных о перевозке (для ясности)
type CargoItem = {
    Number?: string; // Номер перевозки
    DatePrih?: string; // Дата прихода
    DateVruch?: string; // Дата вручения (если есть)
    State?: string; // Статус
    Mest?: number | string; // Кол-во мест
    PV?: number | string; // Платный вес (Payment Weight)
    Weight?: number | string; // Общий вес
    Volume?: number | string; // Объем
    Sum?: number | string; // Стоимость
    StatusSchet?: string; // Статус счета
    [key: string]: any; // Дополнительные поля
};


// --- КОНФИГУРАЦИЯ ---
const PROXY_API_BASE_URL = '/api/perevozki'; 

// --- КОНСТАНТЫ ---
const DEFAULT_LOGIN = "order@lal-auto.com";
const DEFAULT_PASSWORD = "ZakaZ656565";

// Получаем текущую дату в формате YYYY-MM-DD
const getTodayDate = () => new Date().toISOString().split('T')[0];

// Получаем дату, отстоящую на ШЕСТЬ МЕСЯЦЕВ назад
const getSixMonthsAgoDate = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6); 
    return d.toISOString().split('T')[0];
};

const DEFAULT_DATE_FROM = getSixMonthsAgoDate(); // 6 месяцев назад
const DEFAULT_DATE_TO = getTodayDate(); // Сегодня

// --- УТИЛИТЫ ДЛЯ ДАТ ---

const getDateRange = (filter: DateFilter) => {
    const today = new Date();
    const dateTo = getTodayDate();
    let dateFrom = getTodayDate();

    switch (filter) {
        case 'all': // 6 месяцев по умолчанию
            dateFrom = getSixMonthsAgoDate();
            break;
        case 'сегодня':
            dateFrom = getTodayDate();
            break;
        case 'неделя':
            today.setDate(today.getDate() - 7);
            dateFrom = today.toISOString().split('T')[0];
            break;
        case 'месяц':
            today.setMonth(today.getMonth() - 1);
            dateFrom = today.toISOString().split('T')[0];
            break;
        case 'период':
        default:
            break;
    }
    return { dateFrom, dateTo };
}

const formatCurrency = (value: number | string | undefined) => {
    if (value === undefined || value === null || value === "") return "—";
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return "—";
    return num.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('₽', '').trim() + ' ₽';
};

const getStatusSchetClass = (status: string | undefined) => {
    if (!status) return '';
    const lowerStatus = (status || '').toLowerCase();
    if (lowerStatus.includes('оплачен') || lowerStatus.includes('закрыт')) {
        return 'status-value success';
    } else if (lowerStatus.includes('частично') || lowerStatus.includes('выставлен') || lowerStatus.includes('в работе')) {
        return 'status-value pending';
    }
    return 'status-value';
};

const getCargoStateClass = (state: string | undefined) => {
    if (!state) return '';
    const lowerState = state.toLowerCase();
    if (lowerState.includes('вручен') || lowerState.includes('доставлен')) {
        return 'status-value success';
    } else if (lowerState.includes('в пути') || lowerState.includes('готовится') || lowerState.includes('принят')) {
        return 'status-value pending';
    }
    return 'status-value';
};

// Функция для маппинга русского статуса в ключ для фильтрации
const mapRussianStatusToKey = (status: string): StatusFilter => {
    const s = status.toLowerCase();
    if (s.includes('вручен') || s.includes('доставлен')) return 'delivered';
    if (s.includes('доставляется')) return 'delivering';
    if (s.includes('готовится') || s.includes('на складе')) return 'ready';
    if (s.includes('в пути')) return 'in_transit';
    if (s.includes('принят')) return 'accepted';
    return 'all';
};

// --- КОМПОНЕНТЫ ---

// 1. Switch
const Switch = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <div 
        className={`switch-container ${checked ? 'checked' : ''}`} 
        onClick={onChange}
    >
        <div className="switch-knob"></div>
    </div>
);

// 2. Loader
const Loader = () => (
    <div className="flex justify-center items-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-theme-primary" />
    </div>
);

// 3. TabButton (для TabBar)
type TabButtonProps = {
    label: string;
    icon: React.ReactNode;
    active: boolean;
    onClick: () => void;
};

function TabButton({ label, icon, active, onClick }: TabButtonProps) {
    return (
        <button
            type="button"
            className={`tab-button ${active ? 'active' : ''}`}
            onClick={onClick}
        >
            <span className="tab-icon">{icon}</span>
            <span className="tab-label">{label}</span>
        </button>
    );
}

// 4. TabBar
type TabBarProps = {
    active: Tab;
    onChange: (tab: Tab) => void;
};

function TabBar({ active, onChange }: TabBarProps) {
    return (
        <div className="tabbar-container">
            <TabButton
                label="Главная"
                icon={<Home className="w-5 h-5" />}
                active={active === "home"}
                onClick={() => onChange("home")}
            />
            <TabButton
                label="Грузы"
                icon={<Truck className="w-5 h-5" />}
                active={active === "cargo"}
                onClick={() => onChange("cargo")}
            />
            <TabButton
                label="Документы"
                icon={<FileText className="w-5 h-5" />}
                active={active === "docs"}
                onClick={() => onChange("docs")}
            />
            <TabButton
                label="Поддержка"
                icon={<MessageCircle className="w-5 h-5" />}
                active={active === "support"}
                onClick={() => onChange("support")}
            />
            <TabButton
                label="Профиль"
                icon={<User className="w-5 h-5" />}
                active={active === "profile"}
                onClick={() => onChange("profile")}
            />
        </div>
    );
}

// 5. Cargo Detail Modal
type CargoDetailModalProps = {
    item: CargoItem;
    onClose: () => void;
};

const CargoDetailModal = ({ item, onClose }: CargoDetailModalProps) => {
    
    // Функция для форматирования даты 
    const formatDate = (dateString: string | undefined) => {
        if (!dateString) return "—";
        try {
            return new Date(dateString).toLocaleDateString('ru-RU', { 
                year: 'numeric', month: 'short', day: 'numeric' 
            });
        } catch {
            return dateString;
        }
    };

    const details = [
        { label: "Номер", value: item.Number, icon: List },
        { label: "Дата прихода", value: formatDate(item.DatePrih), icon: Calendar },
        { label: "Дата вручения", value: formatDate(item.DateVruch), icon: Calendar },
        { label: "Статус", value: item.State, icon: Tag, class: getCargoStateClass(item.State) },
        { label: "Кол-во мест", value: item.Mest, icon: Layers },
        { label: "Общий вес", value: `${item.Weight || '—'} кг`, icon: Weight },
        { label: "Объем", value: `${item.Volume || '—'} м³`, icon: Package },
        { label: "Сумма", value: formatCurrency(item.Sum), icon: DollarSign },
        { label: "Платный вес", value: `${item.PV || '—'} кг`, icon: Scale, highlight: true },
        { label: "Статус счета", value: item.StatusSchet, icon: FileTextIcon, class: getStatusSchetClass(item.StatusSchet), highlight: true },
    ].filter(d => d.value !== undefined);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Детали груза: {item.Number}</h3>
                    <button className="modal-close-button" onClick={onClose} aria-label="Закрыть">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="details-grid">
                    {details.map((detail, index) => (
                        <div 
                            key={index} 
                            className={`details-item ${detail.highlight ? 'highlighted-detail' : ''}`}
                        >
                            <div className="details-label">{detail.label}</div>
                            <div className={`details-value ${detail.class || ''}`}>
                                {detail.value}
                            </div>
                        </div>
                    ))}
                </div>

                <button className="button-primary" onClick={() => alert("Функционал загрузки документов еще не реализован")}>
                    <Download className="w-4 h-4 mr-2" />
                    Скачать документы
                </button>
            </div>
        </div>
    );
};

// 6. Date Filter Modal
type DateFilterModalProps = {
    onClose: () => void;
    currentFilter: DateFilter;
    dateFrom: string;
    dateTo: string;
    onApply: (filter: DateFilter, from: string, to: string) => void;
};

const dateFilterOptions: { key: DateFilter; label: string; }[] = [
    { key: "all", label: "Все (6 мес.)" },
    { key: "сегодня", label: "Сегодня" },
    { key: "неделя", label: "Последняя неделя" },
    { key: "месяц", label: "Последний месяц" },
    { key: "период", label: "Выбрать период" },
];

const DateFilterModal = ({ onClose, currentFilter, dateFrom: initialDateFrom, dateTo: initialDateTo, onApply }: DateFilterModalProps) => {
    const [selectedFilter, setSelectedFilter] = useState<DateFilter>(currentFilter);
    const [dateFrom, setDateFrom] = useState(initialDateFrom);
    const [dateTo, setDateTo] = useState(initialDateTo);

    const handleApply = () => {
        onApply(selectedFilter, dateFrom, dateTo);
        onClose();
    };

    // При изменении фильтра, устанавливаем дефолтные даты
    useEffect(() => {
        const today = getTodayDate();
        let from = dateFrom;
        let to = dateTo;

        switch (selectedFilter) {
            case 'сегодня':
                from = today;
                to = today;
                break;
            case 'неделя':
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                from = weekAgo.toISOString().split('T')[0];
                to = today;
                break;
            case 'месяц':
                const monthAgo = new Date();
                monthAgo.setMonth(monthAgo.getMonth() - 1);
                from = monthAgo.toISOString().split('T')[0];
                to = today;
                break;
            case 'all':
                from = getSixMonthsAgoDate();
                to = today;
                break;
            case 'период':
                // оставляем текущие даты
                return;
        }
        setDateFrom(from);
        setDateTo(to);
    }, [selectedFilter]);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Фильтр по дате</h3>
                    <button className="modal-close-button" onClick={onClose} aria-label="Закрыть">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="list-group">
                    {dateFilterOptions.map(option => (
                        <div 
                            key={option.key} 
                            className={`dropdown-item ${selectedFilter === option.key ? 'selected' : ''}`}
                            onClick={() => setSelectedFilter(option.key)}
                        >
                            {option.label}
                        </div>
                    ))}
                </div>
                
                {selectedFilter === 'период' && (
                    <div className="custom-date-inputs">
                        <div className="field" style={{marginTop: '1rem'}}>
                            <label className="field-label">Дата С:</label>
                            <input 
                                type="date" 
                                className="login-input date-input" 
                                value={dateFrom} 
                                onChange={(e) => setDateFrom(e.target.value)} 
                            />
                        </div>
                        <div className="field">
                            <label className="field-label">Дата ПО:</label>
                            <input 
                                type="date" 
                                className="login-input date-input" 
                                value={dateTo} 
                                onChange={(e) => setDateTo(e.target.value)} 
                            />
                        </div>
                    </div>
                )}
                
                <div className="modal-button-container">
                    <button className="button-primary" onClick={handleApply}>
                        Применить фильтр
                    </button>
                </div>
            </div>
        </div>
    );
};

// 7. Status Filter Dropdown
type StatusFilterDropdownProps = {
    currentStatus: StatusFilter;
    onSelect: (status: StatusFilter) => void;
    onClose: () => void;
    visible: boolean;
};

const statusMap: { [key in StatusFilter]: string } = {
    "all": "Все статусы",
    "accepted": "Принят",
    "in_transit": "В пути",
    "ready": "Готовится к выдаче",
    "delivering": "Доставляется",
    "delivered": "Вручен/Доставлен",
};

const StatusFilterDropdown = ({ currentStatus, onSelect, onClose, visible }: StatusFilterDropdownProps) => {
    if (!visible) return null;

    return (
        <div className="filter-dropdown">
            {Object.entries(statusMap).map(([key, label]) => (
                <div
                    key={key}
                    className={`dropdown-item ${currentStatus === key ? 'selected' : ''}`}
                    onClick={() => {
                        onSelect(key as StatusFilter);
                        onClose();
                    }}
                >
                    {label}
                </div>
            ))}
        </div>
    );
};


// 8. Cargo Card
type CargoCardProps = {
    item: CargoItem;
    onClick: (item: CargoItem) => void;
};

const CargoCard = ({ item, onClick }: CargoCardProps) => {
    
    // Иконка для даты (вручения или прихода)
    const DateIcon = item.DateVruch ? Calendar : Calendar; 
    const displayDate = item.DateVruch || item.DatePrih || 'Дата неизвестна';
    
    // Функция для форматирования даты (упрощенная)
    const formatDate = (dateString: string | undefined) => {
        if (!dateString) return "—";
        try {
            return new Date(dateString).toLocaleDateString('ru-RU', { 
                day: '2-digit', month: '2-digit', year: '2-digit' 
            });
        } catch {
            return dateString;
        }
    };
    
    return (
        <div className="cargo-card" onClick={() => onClick(item)}>
            <div className="cargo-header-row">
                <span className="order-number">
                    № {item.Number || '—'}
                </span>
                <span className="date">
                    <DateIcon className="w-4 h-4 mr-1 text-theme-secondary" />
                    {formatDate(displayDate)}
                </span>
            </div>
            
            <div className="cargo-details-grid">
                <div className="detail-item">
                    <Tag className="w-5 h-5 text-theme-secondary" />
                    <div className="detail-item-value">{item.Mest || '—'}</div>
                    <div className="detail-item-label">Места</div>
                </div>
                <div className="detail-item">
                    <Weight className="w-5 h-5 text-theme-secondary" />
                    <div className="detail-item-value">{item.Weight || '—'} кг</div>
                    <div className="detail-item-label">Общ. вес</div>
                </div>
                <div className="detail-item">
                    <Scale className="w-5 h-5 text-theme-secondary" />
                    <div className="detail-item-value text-theme-primary">{item.PV || '—'} кг</div>
                    <div className="detail-item-label">Плат. вес</div>
                </div>
            </div>
            
            <div className="cargo-state-row" style={{ marginBottom: '1rem' }}>
                 <div className="details-item" style={{ background: 'none', padding: '0', alignItems: 'flex-start' }}>
                    <div className="details-label" style={{ marginBottom: '0.2rem', textTransform: 'uppercase' }}>Статус</div>
                    <div className={`details-value ${getCargoStateClass(item.State)}`} style={{fontSize: '0.9rem'}}>
                        {item.State || '—'}
                    </div>
                </div>
            </div>
            
            <div className="cargo-footer">
                <div className="sum-label">Сумма:</div>
                <div className="sum-value">{formatCurrency(item.Sum)}</div>
            </div>
        </div>
    );
};

// 9. Cargo Page
type CargoPageProps = {
    auth: AuthData;
    searchText: string;
    onLogout: () => void;
};


const CargoPage = ({ auth, searchText, onLogout }: CargoPageProps) => {
    const [cargoList, setCargoList] = useState<CargoItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedCargo, setSelectedCargo] = useState<CargoItem | null>(null);
    
    // Filter states
    const [dateFilter, setDateFilter] = useState<DateFilter>('all');
    const [dateFrom, setDateFrom] = useState(DEFAULT_DATE_FROM);
    const [dateTo, setDateTo] = useState(DEFAULT_DATE_TO);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    
    // UI states for filters
    const [isStatusDropdownVisible, setIsStatusDropdownVisible] = useState(false);
    const [isDateModalVisible, setIsDateModalVisible] = useState(false);

    const fetchCargo = useCallback(async (from: string, to: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(PROXY_API_BASE_URL, {
                method: "POST", 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    login: auth.login, 
                    password: auth.password,
                    dateFrom: from, 
                    dateTo: to 
                }),
            });
            
            if (!res.ok) {
                let message = `Ошибка загрузки данных: ${res.status}.`;
                try {
                    const errorData = await res.json() as ApiError;
                    if (errorData.error) {
                         message = errorData.error;
                    }
                } catch { /* ignore */ }
                setError(message);
                setCargoList([]);
                return;
            }

            const data = await res.json() as CargoItem[] | { perevozki: CargoItem[] };

            // API может вернуть массив или объект с полем 'perevozki'
            let list: CargoItem[] = Array.isArray(data) ? data : (data.perevozki || []);
            
            // Если массив пустой или не массив, сбросим его
            if (!Array.isArray(list)) {
                list = [];
            }
            
            setCargoList(list);

        } catch (err: any) {
            setError(err?.message || "Ошибка сети при загрузке грузов.");
            setCargoList([]);
        } finally {
            setLoading(false);
        }
    }, [auth.login, auth.password]);
    
    // Initial fetch and on date filter change
    useEffect(() => {
        fetchCargo(dateFrom, dateTo);
    }, [dateFrom, dateTo, fetchCargo]);
    
    // Filter application
    const filteredCargo = useMemo(() => {
        let list = cargoList;
        
        // 1. Filter by Status
        if (statusFilter !== 'all') {
            list = list.filter(item => mapRussianStatusToKey(item.State || '') === statusFilter);
        }
        
        // 2. Filter by Search Text (Number or State)
        if (searchText) {
            list = list.filter(item => 
                (item.Number?.toLowerCase().includes(searchText) || 
                 item.State?.toLowerCase().includes(searchText))
            );
        }
        
        return list;
    }, [cargoList, statusFilter, searchText]);

    const handleDateApply = (filter: DateFilter, from: string, to: string) => {
        setDateFilter(filter);
        setDateFrom(from);
        setDateTo(to);
        // fetchCargo will be triggered by useEffect
    };
    
    const dateLabel = useMemo(() => {
        if (dateFilter === 'период') {
            return `${dateFrom} — ${dateTo}`;
        }
        return dateFilterOptions.find(o => o.key === dateFilter)?.label || 'Дата';
    }, [dateFilter, dateFrom, dateTo]);
    
    const statusLabel = useMemo(() => {
        return statusMap[statusFilter];
    }, [statusFilter]);
    
    const totalCargoCount = cargoList.length;
    const filteredCount = filteredCargo.length;


    return (
        <div className="max-w-7xl w-full">
            <div className="title">Ваши перевозки</div>
            <div className="subtitle">Актуальные данные о движении ваших грузов и статусах счетов.</div>
            
            {error && (
                <div className="login-error mb-4">
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    {error}
                </div>
            )}
            
            {/* Filters */}
            <div className="filters-container">
                
                {/* Date Filter */}
                <div className="filter-group">
                    <button className="filter-button" onClick={() => setIsDateModalVisible(true)}>
                        <Calendar className="w-4 h-4 mr-2" />
                        {dateLabel}
                        <ChevronDown className="w-4 h-4 ml-2" />
                    </button>
                </div>
                
                {/* Status Filter */}
                <div className="filter-group">
                    <button className="filter-button" onClick={() => setIsStatusDropdownVisible(prev => !prev)}>
                        <Filter className="w-4 h-4 mr-2" />
                        {statusLabel}
                        <ChevronDown className="w-4 h-4 ml-2" />
                    </button>
                    {isStatusDropdownVisible && (
                        <StatusFilterDropdown
                            currentStatus={statusFilter}
                            onSelect={(s) => {
                                setStatusFilter(s);
                                setIsStatusDropdownVisible(false);
                            }}
                            onClose={() => setIsStatusDropdownVisible(false)}
                            visible={true}
                        />
                    )}
                </div>
                
                {/* Clear Filters Button */}
                {(dateFilter !== 'all' || statusFilter !== 'all') && (
                    <button 
                        className="search-toggle-button text-theme-secondary hover:text-red-500"
                        onClick={() => {
                            setDateFilter('all');
                            const { dateFrom: df, dateTo: dt } = getDateRange('all');
                            setDateFrom(df);
                            setDateTo(dt);
                            setStatusFilter('all');
                            setIsStatusDropdownVisible(false);
                        }}
                        aria-label="Сбросить фильтры"
                    >
                        <X className="w-5 h-5" />
                    </button>
                )}
            </div>
            
            <div className="mb-4 text-theme-secondary text-sm">
                Показано: <span className="text-theme-primary font-bold">{filteredCount}</span> из {totalCargoCount} грузов.
            </div>

            {loading ? (
                <Loader />
            ) : filteredCargo.length === 0 ? (
                <div className="empty-state-card">
                    <Truck className="w-12 h-12 mx-auto mb-4 text-theme-secondary" />
                    <h4 className="title">Грузов не найдено</h4>
                    <p className="text-theme-secondary">
                        Попробуйте изменить период или сбросить фильтры.
                    </p>
                </div>
            ) : (
                <div className="cargo-list">
                    {filteredCargo.map((item, index) => (
                        <CargoCard 
                            key={item.Number || item.DatePrih || index} // Fallback key
                            item={item} 
                            onClick={setSelectedCargo} 
                        />
                    ))}
                </div>
            )}
            
            {selectedCargo && (
                <CargoDetailModal 
                    item={selectedCargo} 
                    onClose={() => setSelectedCargo(null)} 
                />
            )}
            
            {isDateModalVisible && (
                <DateFilterModal
                    onClose={() => setIsDateModalVisible(false)}
                    currentFilter={dateFilter}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    onApply={handleDateApply}
                />
            )}
        </div>
    );
};

// 10. Placeholder Page
type PlaceholderPageProps = {
    title: string;
    icon: React.ReactNode;
    subtitle: string;
};

const PlaceholderPage = ({ title, icon, subtitle }: PlaceholderPageProps) => (
    <div className="max-w-xl w-full text-center mt-12">
        <div className="text-theme-primary mx-auto mb-4" style={{ width: '3rem' }}>
            {React.cloneElement(icon as React.ReactElement, { className: "w-12 h-12 mx-auto" })}
        </div>
        <h2 className="title">{title}</h2>
        <p className="subtitle">{subtitle}</p>
        <div className="p-4 bg-theme-secondary border-theme-border border rounded-lg text-sm text-theme-secondary">
            <p>Этот раздел находится в разработке. Скоро здесь появится актуальная информация и полезные инструменты.</p>
        </div>
    </div>
);


// 11. Login Page
type LoginPageProps = {
    login: string;
    setLogin: (l: string) => void;
    password: string;
    setPassword: (p: string) => void;
    agreeOffer: boolean;
    setAgreeOffer: (a: boolean) => void;
    agreePersonal: boolean;
    setAgreePersonal: (a: boolean) => void;
    handleSubmit: (e: FormEvent) => Promise<void>;
    loading: boolean;
    error: string | null;
    showPassword: boolean;
    setShowPassword: (s: boolean) => void;
    theme: string;
    setTheme: (t: string) => void;
}

const LoginPage = ({
    login, setLogin, password, setPassword, 
    agreeOffer, setAgreeOffer, agreePersonal, setAgreePersonal, 
    handleSubmit, loading, error, 
    showPassword, setShowPassword,
    theme, setTheme
}: LoginPageProps) => {

    const toggleTheme = () => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    };

    return (
        <div className="login-form-wrapper">
            <div className="login-card">
                <div className="theme-toggle-container">
                    <button 
                        className="theme-toggle-button" 
                        onClick={toggleTheme}
                        aria-label="Переключить тему"
                        disabled={loading}
                    >
                        {theme === 'dark' ? <Sun /> : <Moon />}
                    </button>
                </div>
                
                <h1 className="logo-text text-center mt-8">CARGO</h1>
                <p className="tagline">Панель клиента</p>

                <form onSubmit={handleSubmit} className="form">
                    <div className="field">
                        <label htmlFor="login" className="field-label">Логин (E-mail)</label>
                        <input
                            id="login"
                            type="email"
                            className="login-input"
                            value={login}
                            onChange={(e) => setLogin(e.target.value)}
                            disabled={loading}
                            required
                        />
                    </div>
                    
                    <div className="field">
                        <label htmlFor="password" className="field-label">Пароль</label>
                        <div className="password-input-container">
                            <input
                                id="password"
                                type={showPassword ? "text" : "password"}
                                className="login-input password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={loading}
                                required
                            />
                            <button 
                                type="button" 
                                className="toggle-password-visibility" 
                                onClick={() => setShowPassword(!showPassword)}
                                aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                            >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                    
                    <div className="checkbox-row">
                        <label>
                             Я согласен с условиями <a href="#" target="_blank">договора-оферты</a>
                        </label>
                        <Switch checked={agreeOffer} onChange={() => setAgreeOffer(!agreeOffer)} />
                    </div>
                    <div className="checkbox-row">
                        <label>
                             Согласие на <a href="#" target="_blank">обработку данных</a>
                        </label>
                        <Switch checked={agreePersonal} onChange={() => setAgreePersonal(!agreePersonal)} />
                    </div>

                    {error && (
                        <div className="login-error">
                            <AlertTriangle className="w-5 h-5 mr-2" />
                            {error}
                        </div>
                    )}
                    
                    <button 
                        type="submit" 
                        className="button-primary"
                        disabled={loading || !agreeOffer || !agreePersonal}
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                        ) : (
                            "Войти"
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}


// 12. App Header
type AppHeaderProps = {
    auth: AuthData;
    onLogout: () => void;
    theme: string;
    setTheme: (t: string) => void;
    isSearchExpanded: boolean;
    setIsSearchExpanded: (e: boolean) => void;
    searchText: string;
    setSearchText: (t: string) => void;
    loading: boolean;
};

const AppHeader = ({ 
    auth, 
    onLogout, 
    theme, 
    setTheme, 
    isSearchExpanded, 
    setIsSearchExpanded, 
    searchText, 
    setSearchText,
    loading
}: AppHeaderProps) => {
    
    const toggleTheme = () => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    };
    
    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchText(e.target.value);
    };
    
    const handleToggleSearch = () => {
        if (isSearchExpanded && searchText) {
            setSearchText(''); // Clear on collapse if text is present
        }
        setIsSearchExpanded(!isSearchExpanded);
    };

    return (
        <header className="app-header">
            <div className="header-top-row">
                <div className="header-title">
                    <h1 className="logo-text" style={{ fontSize: '1.25rem', margin: '0' }}>CARGO</h1>
                </div>

                <div className="flex items-center space-x-2">
                    <div className="header-auth-info hidden sm:flex">
                        <UserIcon className="w-4 h-4 mr-2 user-icon" />
                        {auth.login}
                    </div>

                    <button 
                        className="search-toggle-button"
                        onClick={handleToggleSearch}
                        aria-label={isSearchExpanded ? "Скрыть поиск" : "Поиск"}
                    >
                        {isSearchExpanded ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
                    </button>
                    
                    <button 
                        className="search-toggle-button" 
                        onClick={toggleTheme}
                        aria-label="Переключить тему"
                        disabled={loading}
                    >
                        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    </button>
                    
                    <button 
                        className="search-toggle-button" 
                        onClick={onLogout}
                        aria-label="Выйти"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </div>
            
            <div className={`search-container ${isSearchExpanded ? 'expanded' : 'collapsed'}`}>
                <Search className="w-4 h-4 ml-2 text-theme-secondary flex-shrink-0" />
                <input
                    type="text"
                    placeholder="Поиск по номеру груза или статусу..."
                    className="search-input"
                    value={searchText}
                    onChange={handleSearchChange}
                    onBlur={() => { 
                         // Collapse only if search text is empty
                        if (!searchText) {
                            setIsSearchExpanded(false);
                        }
                    }}
                />
            </div>
        </header>
    );
}

// 13. App Layout
type AppLayoutProps = {
    auth: AuthData;
    activeTab: Tab;
    setActiveTab: (tab: Tab) => void;
    onLogout: () => void;
    theme: string;
    setTheme: (t: string) => void;
    isSearchExpanded: boolean;
    setIsSearchExpanded: (e: boolean) => void;
    searchText: string;
    setSearchText: (t: string) => void;
    loading: boolean;
};

const AppLayout = ({ 
    auth, 
    activeTab, 
    setActiveTab, 
    onLogout, 
    theme, 
    setTheme,
    isSearchExpanded,
    setIsSearchExpanded,
    searchText,
    setSearchText,
    loading
}: AppLayoutProps) => {

    const renderContent = () => {
        switch (activeTab) {
            case "cargo":
                return <CargoPage auth={auth} searchText={searchText} onLogout={onLogout} />;
            case "home":
                return <PlaceholderPage 
                            title="Главная" 
                            icon={<Home />}
                            subtitle="Ваш персональный дашборд и ключевые показатели."
                        />;
            case "docs":
                return <PlaceholderPage 
                            title="Документы" 
                            icon={<FileText />}
                            subtitle="Все ваши документы и акты в одном месте."
                        />;
            case "support":
                return <PlaceholderPage 
                            title="Поддержка" 
                            icon={<MessageCircle />}
                            subtitle="Связь с менеджером и ответы на часто задаваемые вопросы."
                        />;
            case "profile":
                return <PlaceholderPage 
                            title="Профиль" 
                            icon={<User />}
                            subtitle={`Личная информация пользователя: ${auth.login}.`}
                        />;
            default:
                return null;
        }
    };

    return (
        <>
            <AppHeader 
                auth={auth} 
                onLogout={onLogout}
                theme={theme}
                setTheme={setTheme}
                isSearchExpanded={isSearchExpanded}
                setIsSearchExpanded={setIsSearchExpanded}
                searchText={searchText}
                setSearchText={setSearchText}
                loading={loading}
            />
            <main className="app-main">
                {renderContent()}
            </main>
            <TabBar active={activeTab} onChange={setActiveTab} />
        </>
    );
};


// 14. Главный компонент App
export default function App() {
    const [login, setLogin] = useState(DEFAULT_LOGIN); 
    const [password, setPassword] = useState(DEFAULT_PASSWORD); 
    const [agreeOffer, setAgreeOffer] = useState(true);
    const [agreePersonal, setAgreePersonal] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false); 

    const [auth, setAuth] = useState<AuthData | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>("cargo");
    const [theme, setTheme] = useState('dark'); 
    
    // Состояние для поиска (в шапке)
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [searchText, setSearchText] = useState('');

    // Применяем класс темы к body
    useEffect(() => {
        document.body.className = `${theme}-mode`;
    }, [theme]);

    
    // Функция для применения поиска (передаем в CargoPage)
    const handleSearch = (text: string) => {
        setSearchText(text.toLowerCase().trim());
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);

        const cleanLogin = login.trim();
        const cleanPassword = password.trim();

        if (!cleanLogin || !cleanPassword) {
            setError("Введите логин и пароль");
            return;
        }

        if (!agreeOffer || !agreePersonal) {
            setError("Подтвердите согласие с условиями");
            return;
        }

        try {
            setLoading(true);

            const { dateFrom, dateTo } = getDateRange("all"); // Начальный запрос на 6 месяцев
            
            // Отправляем POST-запрос с логином/паролем в теле (для проверки авторизации)
            const res = await fetch(PROXY_API_BASE_URL, {
                method: "POST", 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    login: cleanLogin, 
                    password: cleanPassword,
                    dateFrom: dateFrom, 
                    dateTo: dateTo 
                }),
            });

            if (!res.ok) {
                let message = `Ошибка авторизации: ${res.status}. Проверьте логин и пароль.`;
                if (res.status === 401) {
                    message = "Ошибка авторизации (401). Неверный логин/пароль.";
                } else if (res.status === 405) {
                    message = "Ошибка: Метод не разрешен (405). Проверьте, что ваш прокси-файл ожидает метод POST.";
                }
                
                try {
                    const errorData = await res.json() as ApiError;
                    if (errorData.error) {
                         message = errorData.error;
                    }
                } catch { /* ignore */ }
                
                setError(message);
                setAuth(null);
                return;
            }

            // Авторизация ок
            setAuth({ login: cleanLogin, password: cleanPassword });
            setActiveTab("cargo");
            setError(null);
        } catch (err: any) {
            setError(err?.message || "Ошибка сети. Проверьте адрес прокси.");
            setAuth(null);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        setAuth(null);
        setActiveTab("cargo");
        setError(null);
        setPassword(DEFAULT_PASSWORD); 
        setIsSearchExpanded(false); // Сброс
        setSearchText(''); // Сброс
    }

    // Встраиваем стили
    const injectedStyles = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
                
        * {
            box-sizing: border-box;
        }
        body {
            margin: 0;
            background-color: var(--color-bg-primary); 
            font-family: 'Inter', sans-serif;
            transition: background-color 0.3s, color 0.3s;
        }
        
        /* --------------------------------- */
        /* --- THEME VARIABLES --- */
        /* --------------------------------- */
        
        :root {
            /* Dark Mode Defaults */
            --color-bg-primary: #1f2937; /* gray-900 - Фон страницы */
            --color-bg-secondary: #374151; /* gray-800 - Фон шапки/таббара */
            --color-bg-card: #374151; /* gray-800 - Фон карточек/модалов */
            --color-bg-hover: #4b5563; /* gray-600 */
            --color-bg-input: #4b5563; /* gray-600 */
            --color-text-primary: #e5e7eb; /* gray-100 */
            --color-text-secondary: #9ca3af; /* gray-400 */
            --color-border: #4b5563; /* gray-600 */
            --color-primary-blue: #3b82f6; /* blue-500 */
            
            --color-tumbler-bg-off: #6b7280; 
            --color-tumbler-bg-on: #3b82f6; 
            --color-tumbler-knob: white; 
            
            --color-error-bg: rgba(185, 28, 28, 0.1); 
            --color-error-border: #b91c1c; 
            --color-error-text: #fca5a5; 
            
            --color-success-status: #34d399; 
            --color-pending-status: #facc15; 

            --color-modal-bg: rgba(31, 41, 55, 0.9); /* Полупрозрачный фон модала (темный), более плотный */
            
            /* Новые цвета для фильтров */
            --color-filter-bg: var(--color-bg-input);
            --color-filter-border: var(--color-border);
            --color-filter-text: var(--color-text-primary);
        }
        
        .light-mode {
            --color-bg-primary: #f9fafb; 
            --color-bg-secondary: #ffffff; 
            --color-bg-card: #ffffff; 
            --color-bg-hover: #f3f4f6; 
            --color-bg-input: #f3f4f6; 
            --color-text-primary: #1f2937; 
            --color-text-secondary: #6b7280; 
            --color-border: #e5e7eb; 
            --color-primary-blue: #2563eb; 

            --color-tumbler-bg-off: #ccc; 
            --color-tumbler-bg-on: #2563eb; 
            --color-tumbler-knob: white; 

            --color-error-bg: #fee2e2;
            --color-error-border: #fca5a5;
            --color-error-text: #b91c1c;
            
            --color-success-status: #10b981; 
            --color-pending-status: #f59e0b; 

            --color-modal-bg: rgba(249, 250, 251, 0.9); /* Полупрозрачный фон модала (светлый), более плотный */

            --color-filter-bg: #ffffff;
            --color-filter-border: #e5e7eb;
            --color-filter-text: #1f2937;
        }

        /* --------------------------------- */
        /* --- GENERAL & UTILS --- */
        /* --------------------------------- */
        .app-container {
            min-height: 100vh;
            color: var(--color-text-primary);
            font-family: 'Inter', sans-serif;
            display: flex;
            flex-direction: column;
        }
        .text-theme-text { color: var(--color-text-primary); }
        .text-theme-secondary { color: var(--color-text-secondary); }
        .text-theme-primary { color: var(--color-primary-blue); }
        .border-theme-border { border-color: var(--color-border); }
        .hover\\:bg-theme-hover-bg:hover { background-color: var(--color-bg-hover); }
        .title {
            font-size: 1.5rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
        }
        .subtitle {
            font-size: 0.9rem;
            color: var(--color-text-secondary);
            margin-bottom: 1.5rem;
        }
        .login-error {
            padding: 0.75rem;
            background-color: var(--color-error-bg);
            border: 1px solid var(--color-error-border);
            color: var(--color-error-text); 
            font-size: 0.875rem;
            border-radius: 0.5rem;
            margin-top: 1rem;
            display: flex;
            align-items: center;
        }
        
        /* --------------------------------- */
        /* --- LOGIN PAGE STYLES --- */
        /* --------------------------------- */
        .login-form-wrapper {
            display: flex;
            padding: 2rem 1rem;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            width: 100%;
        }
        .login-card {
            width: 100%;
            max-width: 400px;
            padding: 1.5rem;
            background-color: var(--color-bg-card);
            border-radius: 1rem;
            box-shadow: 0 10px 15px rgba(0, 0, 0, 0.2);
            position: relative;
            border: 1px solid var(--color-border);
        }
        .logo-text {
            font-size: 2rem;
            font-weight: 900;
            letter-spacing: 0.1em;
            color: var(--color-primary-blue);
        }
        .tagline {
            font-size: 1rem;
            color: var(--color-text-secondary);
            margin-bottom: 1.5rem;
            text-align: center;
        }
        .form {
            display: flex;
            flex-direction: column;
        }
        .form .field {
            margin-bottom: 1rem;
        }
        .field-label {
            font-size: 0.875rem;
            font-weight: 600;
            color: var(--color-text-primary);
            margin-bottom: 0.3rem;
            display: block;
        }
        
        /* --------------------------------- */
        /* --- PASSWORD INPUT FIX --- */
        /* --------------------------------- */
        .password-input-container {
            position: relative; 
            width: 100%;
        }
        .login-input {
            width: 100%;
            padding: 0.75rem 1rem;
            padding-right: 3rem; /* Отступ справа для иконки */
            border-radius: 0.75rem;
            border: 1px solid var(--color-border);
            background-color: var(--color-bg-input);
            color: var(--color-text-primary);
            outline: none;
            transition: border-color 0.15s;
        }
        .login-input:focus {
            border-color: var(--color-primary-blue);
        }
        .toggle-password-visibility {
            position: absolute;
            right: 0.75rem;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            cursor: pointer;
            color: var(--color-text-secondary);
            padding: 0.25rem;
            display: flex; 
            align-items: center;
            justify-content: center;
        }
        .toggle-password-visibility:hover {
             color: var(--color-primary-blue);
        }
        .theme-toggle-container {
            position: absolute;
            top: 1rem;
            right: 1rem;
        }
        .theme-toggle-button {
            background-color: transparent; 
            border: none;
            padding: 0.5rem;
            cursor: pointer;
            transition: color 0.2s;
            color: var(--color-text-secondary);
        }
        .theme-toggle-button:hover {
            color: var(--color-primary-blue);
        }
        .theme-toggle-button svg {
            width: 1.25rem;
            height: 1.25rem;
        }
        
        /* --------------------------------- */
        /* --- SWITCH (Tumbler) STYLES --- */
        /* --------------------------------- */
        .checkbox-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.875rem;
            color: var(--color-text-secondary);
            margin-bottom: 0.75rem;
        }
        .checkbox-row a {
            color: var(--color-primary-blue);
            text-decoration: none;
            font-weight: 600;
        }
        .switch-container {
            width: 40px;
            height: 22px;
            background-color: var(--color-tumbler-bg-off);
            border-radius: 11px;
            position: relative;
            cursor: pointer;
            transition: background-color 0.3s;
            flex-shrink: 0;
        }
        .switch-container.checked {
            background-color: var(--color-tumbler-bg-on);
        }
        .switch-knob {
            width: 18px;
            height: 18px;
            background-color: var(--color-tumbler-knob);
            border-radius: 50%;
            position: absolute;
            top: 2px;
            left: 2px;
            transition: transform 0.3s, background-color 0.3s;
        }
        .switch-container.checked .switch-knob {
            transform: translateX(18px);
        }

        /* --------------------------------- */
        /* --- BUTTONS & HEADER --- */
        /* --------------------------------- */
        .button-primary {
            background-color: var(--color-primary-blue);
            color: white;
            padding: 0.75rem 1.5rem;
            border-radius: 0.75rem;
            font-weight: 600;
            transition: background-color 0.15s;
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            width: 100%;
            margin-top: 0.5rem;
        }
        .button-primary:hover:not(:disabled) {
            background-color: #2563eb; 
        }
        .button-primary:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            box-shadow: none;
        }
        .app-header {
            padding: 0.5rem 1rem;
            background-color: var(--color-bg-secondary);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            display: flex;
            flex-direction: column; /* Поиск под шапкой */
            position: sticky;
            top: 0;
            z-index: 10;
            border-bottom: 1px solid var(--color-border);
        }
        .header-top-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            height: 40px; /* Фиксированная высота для верхнего ряда */
        }
        .header-auth-info {
            display: flex;
            align-items: center;
            font-weight: 600;
            font-size: 0.9rem;
            color: var(--color-text-primary);
        }
        .header-auth-info .user-icon {
            color: var(--color-primary-blue);
            margin-right: 0.5rem;
        }
        .app-main {
            flex-grow: 1;
            padding: 1.5rem 1rem 5.5rem 1rem; /* Добавлено место для таббара */
            display: flex;
            justify-content: center;
            width: 100%;
        }

        /* --------------------------------- */
        /* --- SEARCH BAR --- */
        /* --------------------------------- */
        .search-container {
            display: flex;
            align-items: center;
            overflow: hidden;
            transition: max-height 0.3s ease-in-out, opacity 0.3s;
            margin-bottom: 0.5rem;
            border-radius: 0.5rem;
            background-color: var(--color-bg-input);
        }
        .search-container.expanded {
            max-height: 40px;
            opacity: 1;
            padding: 0 0.5rem;
            margin-top: 0.5rem;
        }
        .search-container.collapsed {
            max-height: 0;
            opacity: 0;
            padding: 0;
            margin: 0;
        }
        .search-input {
            flex-grow: 1;
            border: none;
            background: none;
            outline: none;
            padding: 0.5rem 0.5rem;
            color: var(--color-text-primary);
            font-size: 0.9rem;
        }
        .search-input::placeholder {
            color: var(--color-text-secondary);
        }
        .search-toggle-button {
            background: none;
            border: none;
            color: var(--color-text-secondary);
            cursor: pointer;
            padding: 0.5rem;
        }
        .search-toggle-button:hover {
            color: var(--color-primary-blue);
        }
        
        /* --------------------------------- */
        /* --- CARGO PAGE FILTERS --- */
        /* --------------------------------- */
        .filters-container {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 1.5rem;
            flex-wrap: wrap; 
        }
        .filter-group {
            position: relative;
            flex-grow: 1;
            min-width: 120px;
        }
        .filter-button {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            background-color: var(--color-filter-bg);
            color: var(--color-filter-text);
            border: 1px solid var(--color-filter-border);
            padding: 0.75rem 1rem;
            border-radius: 0.75rem;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.15s, border-color 0.15s;
            font-size: 0.875rem;
        }
        .filter-button:hover {
             border-color: var(--color-primary-blue);
        }
        .filter-dropdown {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background-color: var(--color-bg-card);
            border: 1px solid var(--color-border);
            border-radius: 0.5rem;
            margin-top: 0.25rem;
            z-index: 30;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            overflow: hidden;
        }
        .dropdown-item {
            padding: 0.75rem 1rem;
            cursor: pointer;
            transition: background-color 0.15s;
            font-size: 0.875rem;
            color: var(--color-text-primary);
        }
        .dropdown-item:hover {
            background-color: var(--color-bg-hover);
        }
        .dropdown-item.selected {
            background-color: var(--color-primary-blue);
            color: white;
            font-weight: 700;
        }
        
        /* --------------------------------- */
        /* --- CARGO LIST & CARD --- */
        /* --------------------------------- */
        .cargo-list {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }
        @media (min-width: 640px) {
            .cargo-list {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
                gap: 1.5rem;
            }
        }
        .cargo-card {
            background-color: var(--color-bg-card);
            border-radius: 0.75rem;
            border: 1px solid var(--color-border);
            padding: 1rem;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            font-size: 0.875rem;
            cursor: pointer; 
            transition: transform 0.15s, box-shadow 0.15s;
        }
        .cargo-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 10px rgba(59, 130, 246, 0.2); 
        }
        .cargo-header-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: 700;
            margin-bottom: 0.75rem;
            padding-bottom: 0.5rem;
            border-bottom: 1px solid var(--color-border);
        }
        .cargo-header-row .order-number {
            font-size: 1rem;
            color: var(--color-primary-blue);
        }
        .cargo-header-row .date {
            display: flex;
            align-items: center;
            font-size: 0.9rem;
            color: var(--color-text-secondary);
        }
        .cargo-details-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 0.5rem;
            margin-bottom: 1rem;
        }
        .detail-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            padding: 0.5rem 0;
            border-radius: 0.5rem;
            background-color: var(--color-bg-hover);
        }
        .detail-item-label {
            font-size: 0.65rem;
            text-transform: uppercase;
            color: var(--color-text-secondary);
            font-weight: 600;
            margin-top: 0.25rem;
        }
        .detail-item-value {
            font-size: 0.875rem;
            font-weight: 700;
        }
        .status-value {
            color: var(--color-pending-status);
            font-size: 0.8rem;
            font-weight: 700;
        }
        .status-value.success {
            color: var(--color-success-status);
        }
        .cargo-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-top: 0.75rem;
            border-top: 1px dashed var(--color-border);
        }
        .cargo-footer .sum-label {
            font-weight: 600;
            color: var(--color-text-primary);
        }
        .cargo-footer .sum-value {
            font-size: 1.1rem;
            font-weight: 900;
            color: var(--color-primary-blue);
        }
        
        /* Empty State Card */
        .empty-state-card {
            background-color: var(--color-bg-card);
            border: 1px solid var(--color-border);
            border-radius: 1rem;
            padding: 3rem;
            text-align: center;
            margin-top: 3rem;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        
        /* --------------------------------- */
        /* --- MODAL STYLES (GENERAL & CARGO) --- */
        /* --------------------------------- */
        .modal-overlay { 
            position: fixed; 
            top: 0; 
            left: 0; 
            right: 0; 
            bottom: 0; 
            background-color: var(--color-modal-bg); 
            display: flex; 
            justify-content: center; 
            align-items: flex-start; 
            padding-top: 5vh; 
            z-index: 50; 
            overflow-y: auto; 
            padding-bottom: 2rem;
        }
        .modal-content { 
            background-color: var(--color-bg-card); 
            border-radius: 1rem; 
            padding: 1.5rem; 
            width: 90%; 
            max-width: 500px; 
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5); 
            border: 1px solid var(--color-border); 
            animation: fadeIn 0.3s; 
            margin-bottom: 2rem; 
            margin-top: 2rem;
        }
        @keyframes fadeIn { 
            from { opacity: 0; transform: translateY(-20px); } 
            to { opacity: 1; transform: translateY(0); } 
        }
        .modal-header { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            margin-bottom: 1.5rem; 
        }
        .modal-header h3 { 
            margin: 0; 
            font-size: 1.25rem; 
            font-weight: 700; 
        }
        .modal-close-button { 
            background: none; 
            border: none; 
            color: var(--color-text-secondary); 
            cursor: pointer; 
            padding: 0; 
        }
        .modal-close-button:hover { 
            color: var(--color-text-primary); 
        }
        .details-grid { 
            display: grid; 
            grid-template-columns: 1fr; 
            gap: 1rem; 
            margin-bottom: 1.5rem; 
        }
        @media (min-width: 400px) { 
            .details-grid { grid-template-columns: 1fr 1fr; } 
        }
        .details-item { 
            padding: 0.75rem 1rem; 
            background-color: var(--color-bg-hover); 
            border-radius: 0.5rem; 
        }
        .details-label { 
            font-size: 0.75rem; 
            color: var(--color-text-secondary); 
            text-transform: uppercase; 
            font-weight: 600; 
            margin-bottom: 0.25rem; 
        }
        .details-value { 
            color: var(--color-text-primary); 
            font-weight: 700; 
            font-size: 0.9rem;
        }
        .highlighted-detail {
            border: 1px solid var(--color-primary-blue);
        }
        .modal-button-container {
            margin-top: 1.5rem;
        }
        .login-input.date-input {
            margin-bottom: 0;
        }
        .custom-date-inputs {
            border-top: 1px solid var(--color-border);
            padding-top: 1rem;
            margin-top: 1rem;
        }

        /* --------------------------------- */
        /* --- TABBAR (НИЖНЕЕ МЕНЮ) --- */
        /* --------------------------------- */
        .tabbar-container { 
            position: fixed; 
            bottom: 0; 
            left: 0; 
            right: 0; 
            z-index: 50; 
            background-color: var(--color-bg-secondary); 
            box-shadow: 0 -4px 6px -1px rgba(0, 0, 0, 0.1), 0 -2px 4px -2px rgba(0, 0, 0, 0.06);
            display: flex;
            justify-content: space-around;
            padding: 0.5rem 0;
            border-top: 1px solid var(--color-border);
        }
        .tab-button {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 0.25rem 0.5rem;
            border: none;
            background: none;
            cursor: pointer;
            color: var(--color-text-secondary);
            transition: color 0.2s;
            flex-grow: 1;
            max-width: 20%;
        }
        .tab-button:hover {
            color: var(--color-primary-blue);
        }
        .tab-button.active {
            color: var(--color-primary-blue);
        }
        .tab-icon {
            margin-bottom: 0.1rem;
            width: 1.25rem;
            height: 1.25rem;
        }
        .tab-label {
            font-size: 0.65rem;
            font-weight: 600;
        }
    `;

    return (
        <>
            <style>{injectedStyles}</style>
            <div className="app-container">
                {auth ? (
                    <AppLayout 
                        auth={auth} 
                        activeTab={activeTab} 
                        setActiveTab={setActiveTab} 
                        onLogout={handleLogout}
                        theme={theme}
                        setTheme={setTheme}
                        isSearchExpanded={isSearchExpanded}
                        setIsSearchExpanded={setIsSearchExpanded}
                        searchText={searchText}
                        setSearchText={handleSearch}
                        loading={loading}
                    />
                ) : (
                    <LoginPage
                        login={login}
                        setLogin={setLogin}
                        password={password}
                        setPassword={setPassword}
                        agreeOffer={agreeOffer}
                        setAgreeOffer={setAgreeOffer}
                        agreePersonal={agreePersonal}
                        setAgreePersonal={setAgreePersonal}
                        handleSubmit={handleSubmit}
                        loading={loading}
                        error={error}
                        showPassword={showPassword}
                        setShowPassword={setShowPassword}
                        theme={theme}
                        setTheme={setTheme}
                    />
                )}
            </div>
        </>
    );
}
