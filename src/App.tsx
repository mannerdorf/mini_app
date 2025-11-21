import { FormEvent, useEffect, useState, useCallback, useMemo } from "react";
// Импортируем все необходимые иконки
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
    SenderName?: string; // Имя отправителя
    RecipientName?: string; // Имя получателя
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

// --- УТИЛИТЫ ---

// Утилита для определения диапазона дат
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
            if (filter !== 'all') {
                dateFrom = DEFAULT_DATE_FROM;
            }
            break;
    }
    return { dateFrom, dateTo };
}

// Утилита для форматирования даты
const getFormattedDate = (dateString?: string) => {
    if (!dateString) return "-";
    try {
        const date = new Date(dateString);
        // Проверка на корректность даты (если это 1970 год, значит, дата, скорее всего, невалидна)
        if (date.getFullYear() < 2000) return dateString; 
        return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateString;
    }
}

// Утилита для получения статуса
const getStatusLabel = (state?: string) => {
    if (!state) return "Неизвестен";
    const statusMap: { [key: string]: string } = {
        'accepted': 'Принят к перевозке',
        'in_transit': 'В пути',
        'ready': 'Готов к выдаче',
        'delivering': 'На доставке',
        'delivered': 'Вручен',
    };
    return statusMap[state.toLowerCase()] || state;
}

// --- ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ ---

// Компонент переключателя (тумблер)
type SwitchProps = {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: React.ReactNode;
};

const Switch: React.FC<SwitchProps> = ({ checked, onChange, label }) => {
    const id = useMemo(() => `switch-${Math.random().toString(36).substring(2, 9)}`, []);
    return (
        <div className="checkbox-row">
            <label htmlFor={id}>
                {label}
            </label>
            <div 
                className={`switch-container ${checked ? 'checked' : ''}`} 
                onClick={() => onChange(!checked)}
            >
                <input 
                    type="checkbox" 
                    id={id}
                    checked={checked} 
                    onChange={() => onChange(!checked)}
                    className="sr-only" 
                />
                <div className="switch-knob"></div>
            </div>
        </div>
    );
};

// Компонент индикатора загрузки
const LoadingIndicator: React.FC = () => (
    <div className="flex justify-center items-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-theme-primary" />
        <span className="ml-3 text-lg font-semibold">Загрузка данных...</span>
    </div>
);

// Компонент сообщения об ошибке
const ErrorAlert: React.FC<{ message: string }> = ({ message }) => (
    <div className="login-error flex items-start">
        <AlertTriangle className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" />
        <p className="m-0 break-words">{message}</p>
    </div>
);


// --- СТРАНИЦЫ ПРИЛОЖЕНИЯ: АВТОРИЗАЦИЯ ---

type LoginScreenProps = {
    login: string;
    setLogin: (login: string) => void;
    password: string;
    setPassword: (password: string) => void;
    agreeOffer: boolean;
    setAgreeOffer: (agree: boolean) => void;
    agreePersonal: boolean;
    setAgreePersonal: (agree: boolean) => void;
    loading: boolean;
    error: string | null;
    handleSubmit: (e: FormEvent) => void;
    theme: string;
    toggleTheme: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({
    login, setLogin, password, setPassword,
    agreeOffer, setAgreeOffer, agreePersonal, setAgreePersonal,
    loading, error, handleSubmit, theme, toggleTheme
}) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div className="login-form-wrapper flex flex-col min-h-screen">
             <button
                onClick={toggleTheme}
                className="theme-toggle-button absolute top-4 right-4 p-2 rounded-full hover:bg-theme-hover-bg transition"
                aria-label="Toggle theme"
            >
                {theme === 'dark' ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
            </button>
            <div className="login-card">
                <div className="text-center mb-6">
                    <h1 className="logo-text">LAL-AUTO</h1>
                    <p className="tagline">Личный кабинет клиента</p>
                </div>
                <form onSubmit={handleSubmit} className="form">
                    <div className="field">
                        <label className="block text-sm font-medium mb-1 text-theme-secondary" htmlFor="login">
                            Логин
                        </label>
                        <input
                            id="login"
                            type="email"
                            placeholder="Ваш email"
                            value={login}
                            onChange={(e) => setLogin(e.target.value)}
                            className="login-input"
                            disabled={loading}
                            autoComplete="username"
                        />
                    </div>
                    <div className="field">
                         <label className="block text-sm font-medium mb-1 text-theme-secondary" htmlFor="password">
                            Пароль
                        </label>
                        <div className="password-input-container">
                            <input
                                id="password"
                                type={showPassword ? "text" : "password"}
                                placeholder="Ваш пароль"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="login-input"
                                disabled={loading}
                                autoComplete="current-password"
                            />
                             <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="toggle-password-visibility"
                                aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                                disabled={loading}
                            >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                    
                    <Switch 
                        checked={agreeOffer} 
                        onChange={setAgreeOffer} 
                        label={<>Согласен с условиями <a href="#" onClick={(e) => e.preventDefault()}>публичной оферты</a></>} 
                    />
                    
                    <Switch 
                        checked={agreePersonal} 
                        onChange={setAgreePersonal} 
                        label={<>Согласен на обработку <a href="#" onClick={(e) => e.preventDefault()}>персональных данных</a></>} 
                    />

                    {error && <ErrorAlert message={error} />}

                    <button
                        type="submit"
                        className="button-primary mt-4"
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


// --- СТРАНИЦЫ ПРИЛОЖЕНИЯ: ГРУЗЫ (CARGO) ---

// Компонент карточки груза
type CargoCardProps = {
    item: CargoItem;
    onClick: (item: CargoItem) => void;
};

const CargoCard: React.FC<CargoCardProps> = ({ item, onClick }) => {
    const status = getStatusLabel(item.State);
    const isSuccess = item.State?.toLowerCase() === 'delivered';
    const isPaid = item.StatusSchet?.toLowerCase() === 'оплачен';

    return (
        <div className="cargo-card" onClick={() => onClick(item)}>
            <div className="cargo-header-row">
                <span className="order-number">№ {item.Number || '—'}</span>
                <div className="date">
                    <Calendar className="w-4 h-4 mr-1 text-theme-secondary" />
                    <span>{getFormattedDate(item.DatePrih)}</span>
                </div>
            </div>

            <div className="cargo-details-grid">
                <div className="detail-item">
                    <Package className="w-5 h-5 text-theme-secondary" />
                    <span className="detail-item-value">{item.Mest || '0'}</span>
                    <span className="detail-item-label">Мест</span>
                </div>
                <div className="detail-item">
                    <Weight className="w-5 h-5 text-theme-secondary" />
                    <span className="detail-item-value">{item.Weight || '0'} кг</span>
                    <span className="detail-item-label">Вес</span>
                </div>
                <div className="detail-item">
                    <Layers className="w-5 h-5 text-theme-secondary" />
                    <span className="detail-item-value">{item.Volume || '0'} м³</span>
                    <span className="detail-item-label">Объем</span>
                </div>
            </div>

            <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-theme-secondary">Статус:</span>
                <span className={`status-value ${isSuccess ? 'success' : ''}`}>
                    {status}
                </span>
            </div>
             <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-theme-secondary">Счет:</span>
                <span className={`status-value ${isPaid ? 'success' : 'text-red-400'}`}>
                    {item.StatusSchet || 'Не выставлен'}
                </span>
            </div>

            <div className="cargo-footer">
                <div className="flex items-center">
                    <DollarSign className="w-5 h-5 mr-1 text-theme-primary" />
                    <span className="sum-label">Сумма:</span>
                </div>
                <span className="sum-value">{item.Sum ? `${(typeof item.Sum === 'number' ? item.Sum : parseFloat(item.Sum)).toLocaleString('ru-RU')} ₽` : '—'}</span>
            </div>
        </div>
    );
};

// Модальное окно деталей груза
type CargoDetailModalProps = {
    item: CargoItem | null;
    onClose: () => void;
};

const DetailItem: React.FC<{ label: string, value: string | number, icon: React.ReactNode, isHighlighted?: boolean }> = ({ label, value, icon, isHighlighted }) => (
    <div className={`details-item-modal ${isHighlighted ? 'highlighted-detail' : ''}`}>
        <div className="details-label flex items-center mb-1">
            {icon}
            <span className="ml-1">{label}</span>
        </div>
        <div className="details-value font-bold text-lg">
            {value}
        </div>
    </div>
);

const CargoDetailModal: React.FC<CargoDetailModalProps> = ({ item, onClose }) => {
    if (!item) return null;

    const status = getStatusLabel(item.State);
    const isPaid = item.StatusSchet?.toLowerCase() === 'оплачен';

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h3>Детали перевозки № {item.Number || '—'}</h3>
                    <button onClick={onClose} className="modal-close-button" aria-label="Закрыть">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                {/* Секция документов */}
                <div className="document-buttons">
                    <button className="doc-button">
                        <FileTextIcon className="w-4 h-4 mr-1" />
                        Акт
                    </button>
                    <button className="doc-button">
                        <FileTextIcon className="w-4 h-4 mr-1" />
                        Счет
                    </button>
                    <button className="doc-button">
                        <FileTextIcon className="w-4 h-4 mr-1" />
                        ТТН
                    </button>
                    <button className="doc-button">
                        <Download className="w-4 h-4 mr-1" />
                        Все
                    </button>
                </div>

                <div className="details-grid-modal">
                    <DetailItem 
                        label="Дата приема" 
                        value={getFormattedDate(item.DatePrih)} 
                        icon={<Calendar className="w-4 h-4" />}
                    />
                    <DetailItem 
                        label="Дата вручения" 
                        value={item.State?.toLowerCase() === 'delivered' ? getFormattedDate(item.DateVruch) : '—'} 
                        icon={<Calendar className="w-4 h-4" />}
                    />
                    <DetailItem 
                        label="Статус" 
                        value={status} 
                        icon={<Tag className="w-4 h-4" />}
                        isHighlighted
                    />
                    <DetailItem 
                        label="Сумма счета" 
                        value={item.Sum ? `${(typeof item.Sum === 'number' ? item.Sum : parseFloat(item.Sum)).toLocaleString('ru-RU')} ₽` : '—'} 
                        icon={<DollarSign className="w-4 h-4" />}
                    />
                     <DetailItem 
                        label="Статус счета" 
                        value={item.StatusSchet || '—'} 
                        icon={<List className="w-4 h-4" />}
                        isHighlighted={!isPaid}
                    />
                    <DetailItem 
                        label="Мест" 
                        value={item.Mest || '0'} 
                        icon={<Package className="w-4 h-4" />}
                    />
                    <DetailItem 
                        label="Платный вес (PV)" 
                        value={`${item.PV || '0'} кг`} 
                        icon={<Scale className="w-4 h-4" />}
                    />
                    <DetailItem 
                        label="Общий вес" 
                        value={`${item.Weight || '0'} кг`} 
                        icon={<Weight className="w-4 h-4" />}
                    />
                    <DetailItem 
                        label="Объем" 
                        value={`${item.Volume || '0'} м³`} 
                        icon={<Layers className="w-4 h-4" />}
                    />
                    
                </div>
                
                {/* Дополнительная информация */}
                <div className="details-item-modal">
                    <div className="details-label flex items-center mb-1">
                        <UserIcon className="w-4 h-4" />
                        <span className="ml-1">Отправитель</span>
                    </div>
                    <div className="details-value font-semibold">
                        {item.SenderName || '—'}
                    </div>
                </div>

                <div className="modal-button-container">
                    <button className="button-primary" onClick={onClose}>
                        ОК
                    </button>
                </div>
            </div>
        </div>
    );
};

// Компонент выпадающего списка фильтра
type FilterDropdownProps<T> = {
    label: string;
    icon: React.ReactNode;
    options: { value: T; label: string; }[];
    selectedValue: T;
    onChange: (value: T) => void;
};

const FilterDropdown = <T extends string>({
    label, icon, options, selectedValue, onChange
}: FilterDropdownProps<T>) => {
    const [isOpen, setIsOpen] = useState(false);
    
    const selectedOption = options.find(opt => opt.value === selectedValue);

    const handleSelect = (value: T) => {
        onChange(value);
        setIsOpen(false);
    };

    // Закрытие при клике вне
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (event.target instanceof Element && !event.target.closest('.filter-group')) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="filter-group">
            <button 
                className="filter-button" 
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
            >
                <div className="flex items-center">
                    {icon}
                    <span className="ml-2">{selectedOption?.label || label}</span>
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : 'rotate-0'}`} />
            </button>
            
            {isOpen && (
                <div className="filter-dropdown">
                    {options.map((option) => (
                        <div 
                            key={option.value} 
                            className={`dropdown-item ${option.value === selectedValue ? 'selected' : ''}`}
                            onClick={() => handleSelect(option.value)}
                        >
                            {option.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// Модальное окно для выбора произвольного периода
type DateRangeModalProps = {
    initialDateFrom: string;
    initialDateTo: string;
    onApply: (from: string, to: string) => void;
    onClose: () => void;
};

const DateRangeModal: React.FC<DateRangeModalProps> = ({ initialDateFrom, initialDateTo, onApply, onClose }) => {
    const [dateFrom, setDateFrom] = useState(initialDateFrom);
    const [dateTo, setDateTo] = useState(initialDateTo);
    const [error, setError] = useState<string | null>(null);

    const handleApply = () => {
        if (!dateFrom || !dateTo) {
            setError("Выберите обе даты.");
            return;
        }
        if (dateFrom > dateTo) {
            setError("Начальная дата не может быть позже конечной.");
            return;
        }
        setError(null);
        onApply(dateFrom, dateTo);
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content max-w-sm">
                <div className="modal-header">
                    <h3>Выбор периода</h3>
                    <button onClick={onClose} className="modal-close-button" aria-label="Закрыть">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="mb-4">
                    <label className="block text-sm font-medium mb-1 text-theme-secondary" htmlFor="dateFrom">
                        Дата С:
                    </label>
                    <input
                        id="dateFrom"
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="login-input date-input"
                    />
                </div>
                
                <div className="mb-4">
                     <label className="block text-sm font-medium mb-1 text-theme-secondary" htmlFor="dateTo">
                        Дата ПО:
                    </label>
                    <input
                        id="dateTo"
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="login-input date-input"
                    />
                </div>

                {error && <ErrorAlert message={error} />}

                <div className="modal-button-container">
                    <button className="button-primary" onClick={handleApply}>
                        Применить
                    </button>
                </div>
            </div>
        </div>
    );
};

// Страница грузов (CargoPage)
type CargoPageProps = {
    auth: AuthData;
    searchText: string;
};

const CargoPage: React.FC<CargoPageProps> = ({ auth, searchText }) => {
    const [cargoList, setCargoList] = useState<CargoItem[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [selectedCargo, setSelectedCargo] = useState<CargoItem | null>(null);
    
    // Фильтры
    const [dateFilter, setDateFilter] = useState<DateFilter>("all");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [customDateFrom, setCustomDateFrom] = useState(DEFAULT_DATE_FROM);
    const [customDateTo, setCustomDateTo] = useState(DEFAULT_DATE_TO);
    const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);
    
    const fetchCargo = useCallback(async (
        login: string, 
        password: string, 
        dateFrom: string, 
        dateTo: string
    ) => {
        setLoading(true);
        setError(null);
        
        try {
            const res = await fetch(PROXY_API_BASE_URL, {
                method: "POST", 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login, password, dateFrom, dateTo }),
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
                setCargoList(null);
                return;
            }

            const data = await res.json();
            
            if (data && Array.isArray(data.items)) {
                setCargoList(data.items as CargoItem[]);
            } else {
                 setCargoList([]);
            }
        } catch (err: any) {
            setError(err?.message || "Ошибка сети при загрузке грузов.");
            setCargoList(null);
        } finally {
            setLoading(false);
        }
    }, []);

    // Эффект для загрузки данных при монтировании и смене фильтров
    useEffect(() => {
        let dateFrom = DEFAULT_DATE_FROM;
        let dateTo = DEFAULT_DATE_TO;

        if (dateFilter === 'период') {
            dateFrom = customDateFrom;
            dateTo = customDateTo;
        } else {
            const range = getDateRange(dateFilter);
            dateFrom = range.dateFrom;
            dateTo = range.dateTo;
        }

        fetchCargo(auth.login, auth.password, dateFrom, dateTo);
    }, [auth, fetchCargo, dateFilter, customDateFrom, customDateTo]); 

    const handleOpenCustomDateModal = () => {
        setIsCustomDateModalOpen(true);
    };

    const handleApplyCustomDates = (from: string, to: string) => {
        setCustomDateFrom(from);
        setCustomDateTo(to);
        setDateFilter('период'); 
        setIsCustomDateModalOpen(false);
    };

    // Фильтрация списка грузов по статусу и поиску
    const filteredCargo = useMemo(() => {
        if (!cargoList) return null;

        let list = cargoList;

        // 1. Фильтрация по статусу
        if (statusFilter !== 'all') {
            list = list.filter(item => 
                item.State?.toLowerCase() === statusFilter
            );
        }

        // 2. Фильтрация по поиску (номер, отправитель, получатель)
        if (searchText) {
            const search = searchText.toLowerCase();
            list = list.filter(item =>
                (item.Number && item.Number.toLowerCase().includes(search)) ||
                (item.SenderName && item.SenderName.toLowerCase().includes(search)) ||
                (item.RecipientName && item.RecipientName.toLowerCase().includes(search))
            );
        }

        return list;
    }, [cargoList, statusFilter, searchText]);


    // Опции для фильтра по дате
    const dateOptions: FilterDropdownProps<DateFilter>['options'] = [
        { value: 'all', label: 'За 6 месяцев' },
        { value: 'сегодня', label: 'Сегодня' },
        { value: 'неделя', label: 'За неделю' },
        { value: 'месяц', label: 'За месяц' },
        { 
            value: 'период', 
            label: dateFilter === 'период' 
                ? `${getFormattedDate(customDateFrom)} - ${getFormattedDate(customDateTo)}` 
                : 'Выбрать период' 
        },
    ];

    // Опции для фильтра по статусу
    const statusOptions: FilterDropdownProps<StatusFilter>['options'] = [
        { value: 'all', label: 'Все статусы' },
        { value: 'accepted', label: getStatusLabel('accepted') },
        { value: 'in_transit', label: getStatusLabel('in_transit') },
        { value: 'ready', label: getStatusLabel('ready') },
        { value: 'delivering', label: getStatusLabel('delivering') },
        { value: 'delivered', label: getStatusLabel('delivered') },
    ];
    
    return (
        <div className="w-full max-w-4xl">
            <h2 className="title">Ваши перевозки</h2>
            
            {/* Контейнер фильтров */}
            <div className="filters-container">
                {/* Фильтр по дате */}
                <FilterDropdown<DateFilter>
                    label="Дата"
                    icon={<Calendar className="w-4 h-4" />}
                    options={dateOptions}
                    selectedValue={dateFilter}
                    onChange={(value) => {
                        if (value === 'период') {
                            handleOpenCustomDateModal();
                        } else {
                            setDateFilter(value);
                        }
                    }}
                />

                {/* Фильтр по статусу */}
                <FilterDropdown<StatusFilter>
                    label="Статус"
                    icon={<Tag className="w-4 h-4" />}
                    options={statusOptions}
                    selectedValue={statusFilter}
                    onChange={setStatusFilter}
                />
            </div>
            
            {loading && <LoadingIndicator />}
            {error && <ErrorAlert message={error} />}

            {!loading && !error && filteredCargo && (
                <>
                    <p className="subtitle">
                        Найдено: {filteredCargo.length} из {cargoList?.length || 0}
                    </p>
                    {filteredCargo.length > 0 ? (
                        <div className="cargo-list">
                            {filteredCargo.map((item, index) => (
                                <CargoCard key={index} item={item} onClick={setSelectedCargo} />
                            ))}
                        </div>
                    ) : (
                        <div className="empty-state-card text-theme-secondary">
                             <Filter className="w-12 h-12 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-theme-primary">
                                Грузы не найдены
                            </h3>
                            <p className="text-sm mt-2">
                                Попробуйте изменить фильтры или сбросить поиск.
                            </p>
                            <button 
                                className="text-sm mt-4 text-theme-primary hover:text-theme-text flex items-center mx-auto"
                                onClick={() => {
                                    setDateFilter('all'); 
                                    setStatusFilter('all');
                                }}
                            >
                                <X className="w-4 h-4 mr-1" />
                                Сбросить все фильтры
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Модальное окно деталей груза */}
            <CargoDetailModal item={selectedCargo} onClose={() => setSelectedCargo(null)} />
            
            {/* Модальное окно выбора периода */}
            {isCustomDateModalOpen && (
                 <DateRangeModal 
                    initialDateFrom={customDateFrom}
                    initialDateTo={customDateTo}
                    onApply={handleApplyCustomDates}
                    onClose={() => setIsCustomDateModalOpen(false)}
                 />
            )}
        </div>
    );
};

// --- СТРАНИЦЫ ПРИЛОЖЕНИЯ: ЗАГЛУШКИ ---

const HomePage: React.FC = () => (
    <div className="w-full max-w-4xl text-center p-8">
        <Home className="w-12 h-12 mx-auto mb-4 text-theme-primary" />
        <h2 className="title">Главная страница</h2>
        <p className="subtitle">Добро пожаловать в личный кабинет!</p>
        <div className="empty-state-card">
            <p className="text-theme-secondary">Здесь будет общая информация и дашборд.</p>
        </div>
    </div>
);

const DocsPage: React.FC = () => (
    <div className="w-full max-w-4xl text-center p-8">
        <FileText className="w-12 h-12 mx-auto mb-4 text-theme-primary" />
        <h2 className="title">Документы</h2>
        <p className="subtitle">Ваши счета, акты и накладные.</p>
        <div className="empty-state-card">
            <p className="text-theme-secondary">Раздел находится в разработке.</p>
        </div>
    </div>
);

const SupportPage: React.FC = () => (
    <div className="w-full max-w-4xl text-center p-8">
        <MessageCircle className="w-12 h-12 mx-auto mb-4 text-theme-primary" />
        <h2 className="title">Поддержка</h2>
        <p className="subtitle">Связаться с нами.</p>
        <div className="empty-state-card">
            <p className="text-theme-secondary">Чат с поддержкой и ответы на частые вопросы.</p>
        </div>
    </div>
);

const ProfilePage: React.FC<{ auth: AuthData, onLogout: () => void, theme: string, toggleTheme: () => void }> = ({ auth, onLogout, theme, toggleTheme }) => (
    <div className="w-full max-w-4xl p-8">
        <h2 className="title flex items-center">
            <UserIcon className="w-6 h-6 mr-2 text-theme-primary" /> Профиль
        </h2>
        <p className="subtitle">Настройки аккаунта и выход.</p>
        
        <div className="info-card">
            <div className="info-item">
                <span className="info-label">Логин:</span>
                <span className="info-value">{auth.login}</span>
            </div>
            <div className="info-item">
                <span className="info-label">Тема:</span>
                <div className="info-value flex items-center">
                    <span>{theme === 'dark' ? 'Темная' : 'Светлая'}</span>
                    <button
                        onClick={toggleTheme}
                        className="theme-toggle-button ml-4 p-1 rounded-full hover:bg-theme-hover-bg transition"
                        aria-label="Toggle theme"
                    >
                        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    </button>
                </div>
            </div>
        </div>

        <button 
            onClick={onLogout} 
            className="button-primary logout-button mt-8 flex items-center justify-center"
        >
            <LogOut className="w-5 h-5 mr-2" />
            Выйти
        </button>
    </div>
);


// --- КОМПОНЕНТЫ НАВИГАЦИИ (TAB BAR) ---

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


// --- ГЛАВНЫЙ КОМПОНЕНТ ПРИЛОЖЕНИЯ ---

export default function App() {
    // Состояния для авторизации
    const [login, setLogin] = useState(DEFAULT_LOGIN); 
    const [password, setPassword] = useState(DEFAULT_PASSWORD); 
    const [agreeOffer, setAgreeOffer] = useState(true);
    const [agreePersonal, setAgreePersonal] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [auth, setAuth] = useState<AuthData | null>(null);
    
    // Состояния для навигации и темы
    const [activeTab, setActiveTab] = useState<Tab>("cargo");
    const [theme, setTheme] = useState<'light' | 'dark'>('dark'); 
    
    // Состояние для поиска (в шапке)
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [searchText, setSearchText] = useState('');

    // Переключение темы
    const toggleTheme = useCallback(() => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    }, []);

    // Применяем класс темы к body
    useEffect(() => {
        document.body.className = `${theme}-mode`;
    }, [theme]);

    
    // Функция для применения поиска 
    const handleSearch = (text: string) => {
        setSearchText(text.toLowerCase().trim());
    }

    // Обработка отправки формы авторизации
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

            // Начальный запрос для проверки авторизации и получения данных за 6 месяцев
            const { dateFrom, dateTo } = getDateRange("all"); 
            
            // Отправляем POST-запрос
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

    // Выход из системы
    const handleLogout = () => {
        setAuth(null);
        setActiveTab("cargo");
        setError(null);
        setPassword(DEFAULT_PASSWORD); 
        setIsSearchExpanded(false); 
        setSearchText(''); 
    }
    
    // Выбор содержимого вкладки
    const renderContent = () => {
        if (!auth) {
            return (
                <LoginScreen 
                    login={login} setLogin={setLogin}
                    password={password} setPassword={setPassword}
                    agreeOffer={agreeOffer} setAgreeOffer={setAgreeOffer}
                    agreePersonal={agreePersonal} setAgreePersonal={setAgreePersonal}
                    loading={loading} error={error}
                    handleSubmit={handleSubmit}
                    theme={theme}
                    toggleTheme={toggleTheme}
                />
            );
        }

        switch (activeTab) {
            case "home":
                return <HomePage />;
            case "cargo":
                return <CargoPage auth={auth} searchText={searchText} />;
            case "docs":
                return <DocsPage />;
            case "support":
                return <SupportPage />;
            case "profile":
                return <ProfilePage auth={auth} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} />;
            default:
                return <HomePage />;
        }
    };

    // Встраиваем стили (полный блок CSS)
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
            padding: 2rem 1rem;
            align-items: center;
            justify-content: center;
            display: flex;
            flex-grow: 1;
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
        .form .field {
            margin-bottom: 1rem;
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
        .login-input.date-input {
             padding-right: 1rem; /* Сброс отступа для date input */
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
            padding: 0;
            display: flex; 
            align-items: center;
            justify-content: center;
        }
        .toggle-password-visibility:hover {
             color: var(--color-primary-blue);
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
        }
        .button-primary:hover:not(:disabled) {
            background-color: #2563eb; 
        }
        .button-primary:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            box-shadow: none;
        }
        .logout-button {
             background-color: #dc2626; /* red-600 */
        }
        .logout-button:hover:not(:disabled) {
            background-color: #b91c1c; /* red-700 */
        }
        
        .app-header {
            padding: 0.5rem 1rem;
            background-color: var(--color-bg-secondary);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            display: flex;
            flex-direction: column; 
            position: sticky;
            top: 0;
            z-index: 10;
            border-bottom: 1px solid var(--color-border);
        }
        .header-top-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            height: 40px; 
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
            padding: 1.5rem 1rem 5.5rem 1rem; 
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
            transition: max-width 0.3s ease-in-out, opacity 0.3s, height 0.3s, margin 0.3s;
            margin-top: 0.5rem;
            margin-bottom: 0.5rem;
            border-radius: 0.5rem;
            background-color: var(--color-bg-input);
        }
        .search-container.expanded {
            max-width: 100%;
            opacity: 1;
            height: 40px;
            padding: 0 0.5rem;
        }
        .search-container.collapsed {
            max-width: 0;
            opacity: 0;
            height: 0;
            padding: 0;
            margin-top: 0;
            margin-bottom: 0;
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
            gap: 1rem;
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
        /* --- CARGO LIST STYLES --- */
        /* --------------------------------- */
        .cargo-list {
            display: flex;
            flex-direction: column;
            gap: 1rem;
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
            font-size: 0.8rem;
            font-weight: 600;
        }
        .status-value:not(.success):not(.text-red-400) {
            color: var(--color-pending-status);
        }
        .status-value.success {
            color: var(--color-success-status);
        }
        .text-red-400 {
            color: #f87171; /* red-400 */
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
        @media (min-width: 640px) {
            .cargo-list {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
                gap: 1.5rem;
            }
        }
        
        /* Empty State Card */
        .empty-state-card {
            background-color: var(--color-bg-card);
            border: 1px solid var(--color-border);
            border-radius: 1rem;
            padding: 3rem;
            text-align: center;
            margin-top: 2rem;
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
        
        /* Cargo Details Specific Styles */
        .document-buttons { 
            display: flex; 
            gap: 0.5rem; 
            margin-bottom: 1.5rem; 
            flex-wrap: wrap; 
        }
        .doc-button { 
            flex: 1; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            padding: 0.5rem; 
            background-color: var(--color-primary-blue); 
            color: white; 
            border-radius: 0.5rem; 
            border: none; 
            cursor: pointer; 
            font-size: 0.8rem; 
            min-width: 80px;
            transition: opacity 0.15s;
        }
        .doc-button:hover {
            opacity: 0.9;
        }
        
        .details-grid-modal { 
            display: grid; 
            grid-template-columns: 1fr; 
            gap: 1rem; 
            margin-bottom: 1.5rem; 
        }
        @media (min-width: 400px) {
            .details-grid-modal { 
                grid-template-columns: 1fr 1fr; 
            }
        }
        .details-item-modal { 
            padding: 0.75rem 1rem; 
            background-color: var(--color-bg-hover); 
            border-radius: 0.5rem; 
            border: 1px solid transparent;
        }
        .details-item-modal.highlighted-detail {
            border-color: var(--color-primary-blue);
        }
        .details-label { 
            font-size: 0.75rem; 
            color: var(--color-text-secondary); 
            text-transform: uppercase; 
            font-weight: 600; 
            margin-bottom: 0.25rem; 
        }
        .details-value {
             font-size: 1rem;
        }
        
        .modal-button-container {
            margin-top: 1rem;
        }
        
        /* --------------------------------- */
        /* --- PROFILE PAGE STYLES --- */
        /* --------------------------------- */
        .info-card {
            background-color: var(--color-bg-card);
            border: 1px solid var(--color-border);
            border-radius: 0.75rem;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
        }
        .info-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.5rem 0;
            border-bottom: 1px dashed var(--color-border);
        }
        .info-item:last-child {
            border-bottom: none;
        }
        .info-label {
            font-weight: 600;
            color: var(--color-text-secondary);
        }
        .info-value {
            font-weight: 700;
            color: var(--color-text-primary);
        }


        /* --------------------------------- */
        /* --- TABBAR (НИЖНЕЕ МЕНЮ) --- */
        /* --------------------------------- */
        .tabbar-container {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            height: 4.5rem; /* 72px */
            display: flex;
            justify-content: space-around;
            align-items: center;
            background-color: var(--color-bg-secondary);
            box-shadow: 0 -4px 6px -1px rgba(0, 0, 0, 0.1), 0 -2px 4px -2px rgba(0, 0, 0, 0.06);
            z-index: 50;
            border-top: 1px solid var(--color-border);
        }
        .tab-button {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            background: none;
            border: none;
            cursor: pointer;
            color: var(--color-text-secondary);
            transition: color 0.15s, background-color 0.15s;
            padding: 0.5rem 0;
            min-width: 0; /* Для flex-распределения */
        }
        .tab-button:hover {
            color: var(--color-primary-blue);
        }
        .tab-button.active {
            color: var(--color-primary-blue);
        }
        .tab-label {
            font-size: 0.65rem;
            font-weight: 600;
            margin-top: 0.25rem;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .tab-icon {
            transition: transform 0.15s;
        }
        
    `;


    return (
