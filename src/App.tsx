import { FormEvent, useEffect, useState, useCallback, useMemo } from "react";
// Импортируем все необходимые иконки
import { 
    LogOut, Home, Truck, FileText, MessageCircle, User, Loader2, Check, X, Moon, Sun, Eye, EyeOff, AlertTriangle, Package, Calendar, Tag, Layers, Weight, Filter, Search, ChevronDown, User as UserIcon, Scale, RussianRuble, List, Download, FileText as FileTextIcon, Send, 
    LayoutGrid, Maximize, TrendingUp, CornerUpLeft, ClipboardCheck, CreditCard, Minus 
} from 'lucide-react';
import React from "react";
import "./styles.css"; // <-- The CSS is correctly imported here

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
    PW?: number | string; V_?: number | string; Summa?: number | string;
    // Поля для детализации
    Koment?: string; AdrPod?: string; AdrDost?: string; GorodDost?: string;
    GruzPoluchTel?: string; GruzPoluch?: string;
    DocList?: DocItem[];
};

type DocItem = {
    metod: string; // "naklad" | "akt"
    Number: string; // Номер документа
    Name: string;   // Название
};

// --- UTILS ---
const formatValue = (value: number | string | undefined, unit: string = '') => {
    if (value === undefined || value === null) return '-';
    const num = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
    if (isNaN(num)) return String(value);
    
    // Форматирование числа: 1234.56 -> 1 234,56
    const formatted = num.toLocaleString('ru-RU', {
        minimumFractionDigits: unit === '₽' ? 2 : 0,
        maximumFractionDigits: unit === '₽' ? 2 : 2,
    });

    return `${formatted}${unit ? ' ' + unit : ''}`;
};

const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return 'Не указана';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            // Если формат не ISO, пытаемся парсить как DD.MM.YYYY
            const parts = dateStr.split('.');
            if (parts.length === 3) {
                const day = parts[0];
                const month = parts[1];
                const year = parts[2];
                return `${day}.${month}.${year}`;
            }
            return dateStr;
        }
        return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateStr;
    }
};

const getStateLabel = (state: string | undefined): { label: string; className: string; icon: React.ReactNode } => {
    switch (state?.toLowerCase()) {
        case 'принята':
            return { label: 'Принята', className: 'state-accepted', icon: <Check className="w-4 h-4" /> };
        case 'в пути':
            return { label: 'В пути', className: 'state-in_transit', icon: <Truck className="w-4 h-4" /> };
        case 'готова к выдаче':
            return { label: 'Готова', className: 'state-ready', icon: <Package className="w-4 h-4" /> };
        case 'доставка':
            return { label: 'Доставка', className: 'state-delivering', icon: <Send className="w-4 h-4" /> };
        case 'доставлена':
            return { label: 'Доставлена', className: 'state-delivered', icon: <ClipboardCheck className="w-4 h-4" /> };
        default:
            return { label: state || 'Неизвестно', className: 'state-default', icon: <List className="w-4 h-4" /> };
    }
};

const FilterBar = React.memo(({ filters, setFilters, cargoList }: {
    filters: { date: DateFilter; status: StatusFilter; showOnlyWithDocs: boolean; showOnlyWithoutDocs: boolean; dateFrom: string; dateTo: string; };
    setFilters: React.Dispatch<React.SetStateAction<any>>;
    cargoList: CargoItem[] | null;
}) => {
    const today = useMemo(() => new Date().toISOString().split('T')[0], []);
    
    // Calculate unique statuses for the status filter
    const uniqueStatuses = useMemo(() => {
        const statuses = new Set<string>();
        cargoList?.forEach(item => {
            if (item.State) statuses.add(item.State);
        });
        return Array.from(statuses).sort();
    }, [cargoList]);

    const handleDateFilterChange = (e: FormEvent<HTMLSelectElement>) => {
        const value = e.currentTarget.value as DateFilter;
        setFilters(prev => ({ ...prev, date: value }));
        
        if (value === 'сегодня') {
            setFilters(prev => ({ ...prev, dateFrom: today, dateTo: today }));
        } else if (value === 'неделя') {
            const start = new Date(today);
            start.setDate(start.getDate() - 7);
            setFilters(prev => ({ ...prev, dateFrom: start.toISOString().split('T')[0], dateTo: today }));
        } else if (value === 'месяц') {
            const start = new Date(today);
            start.setMonth(start.getMonth() - 1);
            setFilters(prev => ({ ...prev, dateFrom: start.toISOString().split('T')[0], dateTo: today }));
        } else if (value === 'все') {
            setFilters(prev => ({ ...prev, dateFrom: '2024-01-01', dateTo: '2026-01-01' }));
        }
    };

    return (
        <div className="filter-bar">
            <Filter className="w-5 h-5 text-theme-secondary flex-shrink-0" />
            
            {/* Date Filter */}
            <div className="filter-group">
                <Calendar className="w-4 h-4 text-theme-secondary" />
                <select value={filters.date} onChange={handleDateFilterChange}>
                    <option value="все">Все даты</option>
                    <option value="сегодня">Сегодня</option>
                    <option value="неделя">Последние 7 дней</option>
                    <option value="месяц">Последние 30 дней</option>
                    <option value="период">Выбрать период</option>
                </select>
            </div>

            {/* Date Range (only for 'период') */}
            {filters.date === 'период' && (
                <>
                    <div className="filter-group">
                        <input 
                            type="date" 
                            value={filters.dateFrom} 
                            onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))} 
                            aria-label="Дата от"
                            title="Дата от"
                        />
                    </div>
                    <div className="filter-group">
                        <input 
                            type="date" 
                            value={filters.dateTo} 
                            onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))} 
                            aria-label="Дата до"
                            title="Дата до"
                        />
                    </div>
                </>
            )}

            {/* Status Filter */}
            <div className="filter-group">
                <Tag className="w-4 h-4 text-theme-secondary" />
                <select value={filters.status} onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as StatusFilter }))}>
                    <option value="all">Все статусы</option>
                    {uniqueStatuses.map(status => (
                        <option key={status} value={status.toLowerCase()}>{getStateLabel(status).label}</option>
                    ))}
                </select>
            </div>

            {/* Tumbler Filter: Has Documents */}
            <div 
                className="tumbler-container" 
                onClick={() => setFilters(prev => ({ ...prev, showOnlyWithDocs: !prev.showOnlyWithDocs, showOnlyWithoutDocs: false }))}
                title="Показать только с документами"
            >
                <div className={`tumbler-track ${filters.showOnlyWithDocs ? 'on' : ''}`}>
                    <div className="tumbler-knob"></div>
                </div>
                <FileTextIcon className="w-4 h-4" />
            </div>

            {/* Tumbler Filter: Does not have Documents */}
            <div 
                className="tumbler-container" 
                onClick={() => setFilters(prev => ({ ...prev, showOnlyWithoutDocs: !prev.showOnlyWithoutDocs, showOnlyWithDocs: false }))}
                title="Показать только без документов"
            >
                <div className={`tumbler-track ${filters.showOnlyWithoutDocs ? 'on' : ''}`}>
                    <div className="tumbler-knob"></div>
                </div>
                <Minus className="w-4 h-4" />
            </div>
        </div>
    );
});

const CargoDetailsModal = React.memo(({ cargo, onClose, auth }: {
    cargo: CargoItem;
    onClose: () => void;
    auth: AuthData;
}) => {
    const { label: stateLabel, className: stateClass } = getStateLabel(cargo.State);
    const [downloading, setDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState<string | null>(null);

    const handleDownload = useCallback(async (doc: DocItem) => {
        setDownloading(true);
        setDownloadError(null);
        
        try {
            const payload = {
                login: auth.login,
                password: auth.password,
                metod: doc.metod,
                Number: doc.Number,
            };

            const response = await fetch(PROXY_API_DOWNLOAD_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || `Ошибка HTTP: ${response.status}`);
            }

            // Получаем имя файла из Content-Disposition заголовка
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = `${doc.Number}_${doc.metod}.pdf`;
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="(.+?)"/);
                if (match && match[1]) {
                    filename = match[1];
                }
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Download error:', error);
            setDownloadError(`Не удалось загрузить файл. ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
        } finally {
            setDownloading(false);
        }
    }, [auth.login, auth.password]);

    const DetailsItem = ({ icon, label, value }: { icon: React.ReactNode, label: string, value: string | number | undefined }) => (
        <div className="details-item-modal">
            <div className="card-detail-item">
                <span className="text-theme-secondary">{icon}</span>
                <span className="detail-label">{label}:</span>
                <span className="detail-value">{value || '-'}</span>
            </div>
        </div>
    );

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Детали перевозки №{cargo.Number}</h2>
                    <button className="modal-close-button" onClick={onClose} title="Закрыть">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                {/* Status and Dates */}
                <div className="modal-details-grid mb-4">
                    <DetailsItem 
                        icon={<Tag />} 
                        label="Статус" 
                        value={<span className={`card-state ${stateClass}`}>{stateLabel}</span>}
                    />
                    <DetailsItem 
                        icon={<Calendar />} 
                        label="Дата прихода" 
                        value={formatDate(cargo.DatePrih)}
                    />
                    <DetailsItem 
                        icon={<Calendar />} 
                        label="Дата выезда" 
                        value={formatDate(cargo.DateVr)}
                    />
                    <DetailsItem 
                        icon={<UserIcon />} 
                        label="Грузополучатель" 
                        value={cargo.GruzPoluch}
                    />
                </div>

                {/* Weights and Measures */}
                <h3 className="text-lg font-semibold text-theme-primary mt-4 mb-2">Вес и объем</h3>
                <div className="modal-details-grid">
                    <DetailsItem 
                        icon={<Layers />} 
                        label="Мест" 
                        value={formatValue(cargo.Mest)}
                    />
                    <DetailsItem 
                        icon={<Weight />} 
                        label="Вес" 
                        value={formatValue(cargo.PW, 'кг')}
                    />
                    <DetailsItem 
                        icon={<Maximize />} 
                        label="Объем" 
                        value={formatValue(cargo.V_, 'м³')}
                    />
                    <DetailsItem 
                        icon={<RussianRuble />} 
                        label="Сумма" 
                        value={formatValue(cargo.Summa, '₽')}
                    />
                </div>

                {/* Addresses */}
                <h3 className="text-lg font-semibold text-theme-primary mt-4 mb-2">Адреса</h3>
                <div className="modal-details-grid">
                    <DetailsItem 
                        icon={<CornerUpLeft />} 
                        label="Адрес подачи" 
                        value={cargo.AdrPod}
                    />
                    <DetailsItem 
                        icon={<Send />} 
                        label="Город доставки" 
                        value={cargo.GorodDost}
                    />
                    <DetailsItem 
                        icon={<Truck />} 
                        label="Адрес доставки" 
                        value={cargo.AdrDost}
                    />
                    <DetailsItem 
                        icon={<UserIcon />} 
                        label="Телефон получателя" 
                        value={cargo.GruzPoluchTel}
                    />
                </div>

                {/* Comments */}
                {cargo.Koment && (
                    <>
                        <h3 className="text-lg font-semibold text-theme-primary mt-4 mb-2">Комментарий</h3>
                        <div className="details-item-modal p-3">
                            <p className="text-sm text-theme-primary whitespace-pre-wrap">{cargo.Koment}</p>
                        </div>
                    </>
                )}

                {/* Documents */}
                <h3 className="text-lg font-semibold text-theme-primary mt-4 mb-2">Документы ({cargo.DocList?.length || 0})</h3>
                <div className="space-y-2">
                    {downloadError && (
                        <div className="error-box">
                            <AlertTriangle className="w-5 h-5" />
                            <p className="text-sm">{downloadError}</p>
                        </div>
                    )}
                    {(cargo.DocList && cargo.DocList.length > 0) ? (
                        cargo.DocList.map((doc, index) => (
                            <div key={index} className="details-item-modal flex justify-between items-center p-3">
                                <span className="flex items-center text-sm font-medium">
                                    <FileTextIcon className="w-4 h-4 mr-2 text-theme-secondary" />
                                    {doc.Name || `${doc.metod} ${doc.Number}`}
                                </span>
                                <button
                                    onClick={() => handleDownload(doc)}
                                    disabled={downloading}
                                    className="login-button py-2 px-3 flex items-center text-sm disabled:opacity-50"
                                >
                                    {downloading ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                        <Download className="w-4 h-4 mr-2" />
                                    )}
                                    Скачать
                                </button>
                            </div>
                        ))
                    ) : (
                        <p className="text-sm text-theme-secondary p-3 bg-theme-bg-hover rounded-lg">Документы не найдены.</p>
                    )}
                </div>

                <div className="modal-button-container flex justify-end">
                    <button className="login-button py-2 px-4" onClick={onClose}>
                        Закрыть
                    </button>
                </div>
            </div>
        </div>
    );
});


const CargoList = React.memo(({ cargoList, onSelectCargo, searchText }: {
    cargoList: CargoItem[];
    onSelectCargo: (cargo: CargoItem) => void;
    searchText: string;
}) => {
    // Note: Filtering by status and date is handled in CargoPage.
    // Here we only apply search filtering (Number, AdrPod, AdrDost)
    const filteredList = useMemo(() => {
        if (!searchText) return cargoList;
        const searchLower = searchText.toLowerCase();

        return cargoList.filter(item => {
            const matchesNumber = item.Number?.toLowerCase().includes(searchLower);
            const matchesAdrPod = item.AdrPod?.toLowerCase().includes(searchLower);
            const matchesAdrDost = item.AdrDost?.toLowerCase().includes(searchLower);
            return matchesNumber || matchesAdrPod || matchesAdrDost;
        });
    }, [cargoList, searchText]);

    if (filteredList.length === 0) {
        return (
            <div className="loading-message">
                <AlertTriangle className="w-10 h-10 mb-2 text-theme-secondary" />
                <p>Перевозки не найдены</p>
            </div>
        );
    }

    return (
        <div className="cargo-list">
            {filteredList.map((cargo, index) => {
                const { label: stateLabel, className: stateClass } = getStateLabel(cargo.State);
                return (
                    <div 
                        key={index} 
                        className="cargo-card" 
                        onClick={() => onSelectCargo(cargo)}
                    >
                        <div className="card-header">
                            <span className="card-number">№{cargo.Number || '-'}</span>
                            <span className={`card-state ${stateClass}`}>{stateLabel}</span>
                        </div>
                        <div className="card-details">
                            <div className="card-detail-item">
                                <Calendar className="w-4 h-4" />
                                <span className="detail-label">Дата прихода:</span>
                                <span className="detail-value">{formatDate(cargo.DatePrih)}</span>
                            </div>
                            <div className="card-detail-item">
                                <Calendar className="w-4 h-4" />
                                <span className="detail-label">Дата выезда:</span>
                                <span className="detail-value">{formatDate(cargo.DateVr)}</span>
                            </div>
                            <div className="card-detail-item">
                                <CornerUpLeft className="w-4 h-4" />
                                <span className="detail-label">Подача:</span>
                                <span className="detail-value truncate" title={cargo.AdrPod}>{cargo.AdrPod || '-'}</span>
                            </div>
                            <div className="card-detail-item">
                                <Truck className="w-4 h-4" />
                                <span className="detail-label">Доставка:</span>
                                <span className="detail-value truncate" title={cargo.AdrDost}>{cargo.AdrDost || '-'}</span>
                            </div>
                            <div className="card-detail-item">
                                <Weight className="w-4 h-4" />
                                <span className="detail-label">Вес:</span>
                                <span className="detail-value">{formatValue(cargo.PW, 'кг')}</span>
                            </div>
                            <div className="card-detail-item">
                                <RussianRuble className="w-4 h-4" />
                                <span className="detail-label">Сумма:</span>
                                <span className="detail-value">{formatValue(cargo.Summa, '₽')}</span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
});


const CargoPage = ({ auth, searchText }: { auth: AuthData; searchText: string }) => {
    const [cargoList, setCargoList] = useState<CargoItem[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<ApiError | null>(null);
    const [selectedCargo, setSelectedCargo] = useState<CargoItem | null>(null);
    const [filters, setFilters] = useState({
        date: 'все' as DateFilter,
        status: 'all' as StatusFilter,
        showOnlyWithDocs: false,
        showOnlyWithoutDocs: false,
        dateFrom: '2024-01-01', // Default wide range
        dateTo: '2026-01-01',   // Default wide range
    });

    const fetchData = useCallback(async (currentFilters: typeof filters) => {
        setIsLoading(true);
        setError(null);
        setCargoList(null);

        try {
            const payload = {
                login: auth.login,
                password: auth.password,
                dateFrom: currentFilters.dateFrom,
                dateTo: currentFilters.dateTo,
            };

            const response = await fetch(PROXY_API_BASE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData: ApiError = await response.json();
                setError(errorData);
                return;
            }

            const data = await response.json();
            setCargoList(data.Perevozki || []);
        } catch (err) {
            console.error('Fetch error:', err);
            setError({ error: 'Ошибка сети или обработки данных.' });
        } finally {
            setIsLoading(false);
        }
    }, [auth.login, auth.password]);

    // Fetch data whenever date filters change
    useEffect(() => {
        // Prevent fetching if auth is not ready or dates are not set
        if (!auth.login || !auth.password || !filters.dateFrom || !filters.dateTo) return;

        // Debounce fetching slightly to avoid too many requests when rapidly changing dates
        const handler = setTimeout(() => {
            fetchData(filters);
        }, 300);

        return () => clearTimeout(handler);
    }, [auth.login, auth.password, filters.dateFrom, filters.dateTo, fetchData]);

    const filteredCargoList = useMemo(() => {
        if (!cargoList) return null;

        return cargoList.filter(item => {
            // Status Filter
            const matchesStatus = filters.status === 'all' || 
                                  (item.State && getStateLabel(item.State).label.toLowerCase() === filters.status);

            // Document Filters
            const hasDocs = (item.DocList?.length || 0) > 0;
            const matchesDocs = 
                (filters.showOnlyWithDocs && hasDocs) ||
                (filters.showOnlyWithoutDocs && !hasDocs) ||
                (!filters.showOnlyWithDocs && !filters.showOnlyWithoutDocs); // If both are false, show all

            return matchesStatus && matchesDocs;
        });
    }, [cargoList, filters.status, filters.showOnlyWithDocs, filters.showOnlyWithoutDocs]);

    return (
        <div className="cargo-page">
            <h1 className="title">Перевозки</h1>
            
            <FilterBar filters={filters} setFilters={setFilters} cargoList={cargoList} />

            {error && (
                <div className="error-box">
                    <AlertTriangle className="w-5 h-5" />
                    <p className="text-sm">
                        Ошибка при загрузке данных: {error.error || 'Неизвестная ошибка.'}
                    </p>
                </div>
            )}
            
            {isLoading && (
                <div className="loading-message">
                    <Loader2 className="w-10 h-10 animate-spin mb-2 text-theme-secondary" />
                    <p>Загрузка данных...</p>
                </div>
            )}

            {!isLoading && filteredCargoList && (
                <>
                    <p className="subtitle text-left mb-4">
                        Показано {filteredCargoList.length} из {cargoList?.length || 0} перевозок.
                    </p>
                    <CargoList 
                        cargoList={filteredCargoList} 
                        onSelectCargo={setSelectedCargo} 
                        searchText={searchText}
                    />
                </>
            )}

            {selectedCargo && (
                <CargoDetailsModal 
                    cargo={selectedCargo} 
                    onClose={() => setSelectedCargo(null)} 
                    auth={auth} 
                />
            )}
        </div>
    );
};


// --- STUB PAGES ---
const StubPage = ({ title }: { title: string }) => (
    <div className="loading-message">
        <h1 className="title">{title}</h1>
        <p className="text-theme-secondary">Этот раздел находится в разработке.</p>
    </div>
);


// --- HOME PAGE ---
const HomePage = ({ cargoList, isLoading, error }: {
    cargoList: CargoItem[] | null;
    isLoading: boolean;
    error: ApiError | null;
}) => {
    // Basic hardcoded statistics for demonstration until full data is available in the home context
    const stats = [
        { title: "Всего перевозок", value: "24", icon: <LayoutGrid className="w-5 h-5" /> },
        { title: "Активные", value: "8", icon: <Truck className="w-5 h-5" /> },
        { title: "За месяц", value: "15", icon: <TrendingUp className="w-5 h-5" /> },
        { title: "Документов", value: "48", icon: <FileText className="w-5 h-5" /> },
    ];

    return (
        <div className="home-page-content">
            <h1 className="title">Обзор</h1>
            <div className="stats-grid">
                {stats.map((stat, index) => (
                    <div key={index} className="stat-card">
                        <div className="stat-header">
                            <span>{stat.title}</span>
                            <span className="text-theme-primary">{stat.icon}</span>
                        </div>
                        <div className="stat-value">{stat.value}</div>
                        <div className="stat-description">
                           {index < 2 ? 'В работе' : 'За последний месяц'}
                        </div>
                    </div>
                ))}
            </div>
            <div className="p-4 bg-theme-bg-card rounded-xl border border-theme-border">
                <h2 className="text-lg font-semibold text-theme-primary mb-2 flex items-center">
                    <MessageCircle className="w-5 h-5 mr-2 text-theme-primary-blue" />
                    Важное сообщение
                </h2>
                <p className="text-sm text-theme-text-secondary">
                    Уважаемые клиенты! Напоминаем о необходимости подтверждения всех новых заявок в течение 24 часов.
                </p>
            </div>
            
            {/* Placeholder for recent cargo list - it should fetch data here eventually */}
            <h2 className="text-xl font-bold text-theme-primary mt-6 mb-4">Последние перевозки</h2>
            {/* This could link to the CargoPage */}
            <div className="loading-message min-h-[100px] py-4 border border-dashed border-theme-border rounded-lg">
                <List className="w-8 h-8 mb-1 text-theme-secondary" />
                <p>Список последних перевозок доступен на вкладке "Перевозки".</p>
            </div>
        </div>
    );
};


// --- TAB BAR COMPONENT ---
const TabBar = React.memo(({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) => {
    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = useMemo(() => [
        { id: 'home', label: 'Обзор', icon: <Home className="tab-icon w-5 h-5" /> },
        { id: 'cargo', label: 'Перевозки', icon: <Truck className="tab-icon w-5 h-5" /> },
        { id: 'docs', label: 'Документы', icon: <FileText className="tab-icon w-5 h-5" /> },
        { id: 'profile', label: 'Профиль', icon: <User className="tab-icon w-5 h-5" /> },
    ], []);

    return (
        <div className="tabbar-container">
            {tabs.map(tab => (
                <button 
                    key={tab.id} 
                    className={`tab-button ${active === tab.id ? 'active' : ''}`}
                    onClick={() => onChange(tab.id)}
                    aria-current={active === tab.id ? 'page' : undefined}
                >
                    {tab.icon}
                    <span className="tab-label">{tab.label}</span>
                </button>
            ))}
        </div>
    );
});


// --- LOGIN COMPONENT ---
const Login = ({ setAuth, initialAuth }: { setAuth: (data: AuthData) => void; initialAuth: AuthData | null }) => {
    const [login, setLogin] = useState(initialAuth?.login || '');
    const [password, setPassword] = useState(initialAuth?.password || '');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loginError, setLoginError] = useState<string | null>(null);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!login || !password) {
            setLoginError("Пожалуйста, введите логин и пароль.");
            return;
        }

        setIsSubmitting(true);
        setLoginError(null);

        // --- Mock Login Check (You should replace this with a real check against your API) ---
        // We will make a dummy fetch to the API to confirm credentials work
        try {
            const payload = { login, password, dateFrom: '2024-01-01', dateTo: '2024-01-02' }; // Small date range for fast check
            const response = await fetch(PROXY_API_BASE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                // Login successful (API returned 200/ok)
                setAuth({ login, password });
                // Save credentials (optional, use secure storage in production)
                localStorage.setItem('auth', JSON.stringify({ login, password }));
            } else {
                // Login failed
                const errorData: ApiError = await response.json();
                const errorMessage = errorData.error || response.statusText || 'Неверный логин или пароль.';
                setLoginError(errorMessage);
            }
        } catch (err) {
            console.error('Login fetch error:', err);
            setLoginError('Ошибка сети. Не удалось подключиться к серверу.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <h1 className="title">Авторизация</h1>
                <form onSubmit={handleSubmit} className="login-form">
                    <div className="login-input-group">
                        <label htmlFor="login" className="login-label">Логин</label>
                        <div className="login-input">
                            <UserIcon className="w-5 h-5 input-icon" />
                            <input
                                id="login"
                                type="text"
                                value={login}
                                onChange={(e) => setLogin(e.target.value)}
                                placeholder="Введите ваш логин"
                                disabled={isSubmitting}
                                required
                            />
                        </div>
                    </div>
                    <div className="login-input-group">
                        <label htmlFor="password" className="login-label">Пароль</label>
                        <div className="login-input">
                            <CreditCard className="w-5 h-5 input-icon" />
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Введите ваш пароль"
                                disabled={isSubmitting}
                                required
                            />
                            <button 
                                type="button" 
                                onClick={() => setShowPassword(prev => !prev)} 
                                className="password-toggle-button"
                                title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                            >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                    
                    {loginError && (
                        <div className="error-box">
                            <AlertTriangle className="w-5 h-5" />
                            <p className="text-sm">{loginError}</p>
                        </div>
                    )}

                    <button type="submit" className="login-button" disabled={isSubmitting}>
                        {isSubmitting ? (
                            <div className="flex items-center justify-center">
                                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                Вход...
                            </div>
                        ) : 'Войти'}
                    </button>
                </form>
            </div>
        </div>
    );
};


// --- MAIN APP COMPONENT ---
export default function App() {
    const [auth, setAuth] = useState<AuthData | null>(() => {
        try {
            const saved = localStorage.getItem('auth');
            return saved ? JSON.parse(saved) : null;
        } catch {
            return null;
        }
    });
    const [activeTab, setActiveTab] = useState<Tab>("cargo");
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [searchText, setSearchText] = useState('');

    const handleLogout = useCallback(() => {
        setAuth(null);
        localStorage.removeItem('auth');
        setSearchText('');
    }, []);

    const handleSearch = useCallback((text: string) => {
        // This is handled by passing searchText to CargoList/CargoPage, no local state update needed here
        // The search input updates searchText state directly
    }, []);

    const toggleSearch = useCallback(() => {
        if (isSearchExpanded && searchText) {
            // Keep expanded if there is text, or clear/collapse
            setSearchText('');
        }
        setIsSearchExpanded(prev => !prev);
    }, [isSearchExpanded, searchText]);

    // If not authenticated, show the login screen
    if (!auth) {
        return <Login setAuth={setAuth} initialAuth={auth} />;
    }

    return (
        <div className="app-container">
            <header>
                <div className="header-content">
                    <div className="header-left">
                        <Truck className="w-6 h-6 text-theme-primary" />
                        <h1 className="header-title">Cargo Client</h1>
                    </div>
                    <div className="header-actions">
                        <button className="search-toggle-button" onClick={toggleSearch} title="Поиск">
                            {isSearchExpanded ? <ChevronDown className="w-5 h-5" /> : <Search className="w-5 h-5" />}
                        </button>
                        <button className="search-toggle-button" onClick={handleLogout} title="Выход">
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                <div className={`search-container ${isSearchExpanded ? 'expanded' : 'collapsed'}`}>
                    <Search className="w-5 h-5 text-theme-secondary flex-shrink-0 ml-1" />
                    <input 
                        type="search" 
                        placeholder="Поиск по номеру или адресу..." 
                        className="search-input" 
                        value={searchText} 
                        onChange={(e) => { 
                            setSearchText(e.target.value); 
                            handleSearch(e.target.value); 
                        }} 
                    />
                    {searchText && <button className="search-toggle-button" onClick={() => { setSearchText(''); handleSearch(''); }}><X className="w-4 h-4" /></button>}
                </div>
            </header>
            <div className="app-main">
                <div className="w-full max-w-4xl">
                    {/* Placeholder for Home Page logic if needed - currently fetches nothing */}
                    {activeTab === "home" && <HomePage cargoList={null} isLoading={false} error={null} />}
                    
                    {/* Main Cargo Tracking Page */}
                    {activeTab === "cargo" && <CargoPage auth={auth} searchText={searchText} />}
                    
                    {/* Stub pages */}
                    {activeTab === "docs" && <StubPage title="Документы" />}
                    {activeTab === "profile" && <StubPage title="Профиль" />}
                </div>
            </div>
            {/* The TabBar is fixed at the bottom of the viewport */}
            <TabBar active={activeTab} onChange={setActiveTab} />
        </div>
    );
}
