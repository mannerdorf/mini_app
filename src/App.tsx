import { FormEvent, useEffect, useState, useMemo } from "react";
// Импорт SDK Telegram
import WebApp from '@twa-dev/sdk';
import { 
    LogOut, Home, Truck, FileText, MessageCircle, User, Loader2, Check, X, Moon, Sun, Eye, EyeOff, AlertTriangle, Package, Calendar, Tag, Layers, Weight, Filter, Search, ChevronDown, User as UserIcon, Scale, RussianRuble, List, Download, FileText as FileTextIcon, Send, 
    LayoutGrid, Maximize, TrendingUp, CornerUpLeft, ClipboardCheck, CreditCard, Minus, Lock
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

type CargoItem = {
    Number?: string; DatePrih?: string; DateVr?: string; State?: string; Mest?: number | string; 
    PW?: number | string; W?: number | string; Volume?: number | string; Cost?: number | string; 
    Debt?: number | string; Sender?: string; Receiver?: string;
    [key: string]: any; 
};

// Заглушки статистики
const STATS_LEVEL_1 = [
    { id: 'in_transit', label: 'В пути', value: 12, color: 'text-blue-400', icon: Truck },
    { id: 'ready', label: 'Готов к выдаче', value: 4, color: 'text-green-400', icon: Package },
    { id: 'debt', label: 'Долг', value: '45 000 ₽', color: 'text-red-400', icon: AlertTriangle },
];
const STATS_LEVEL_2 = [
    { label: 'Вес в пути', value: '1 240 кг', icon: Weight },
    { label: 'Объем в пути', value: '12.5 м³', icon: Layers },
    { label: 'Ожидаемая дата', value: '24.06.2024', icon: Calendar },
];

// --- MAIN APP COMPONENT ---
export default function App() {
    const [auth, setAuth] = useState<AuthData | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>("home");
    const [isLoading, setIsLoading] = useState(false);
    const [cargoList, setCargoList] = useState<CargoItem[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [searchText, setSearchText] = useState("");
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);

    // 1. Инициализация Telegram Mini App
    useEffect(() => {
        if (typeof window !== 'undefined') {
            WebApp.ready(); 
            WebApp.expand(); 
            
            // Настраиваем цвета шапки под тему Telegram
            WebApp.setHeaderColor(WebApp.themeParams.bg_color || '#1f2937'); 
            WebApp.setBackgroundColor(WebApp.themeParams.bg_color || '#1f2937');
        }

        // Авто-логин: проверяем localStorage
        const savedAuth = localStorage.getItem('app_auth');
        if (savedAuth) {
            try {
                const parsed = JSON.parse(savedAuth);
                if (parsed.login && parsed.password) {
                    setAuth(parsed);
                }
            } catch (e) {
                console.error("Ошибка чтения сохраненных данных");
            }
        }
    }, []);

    // 2. Управление нативной кнопкой "Назад"
    useEffect(() => {
        if (activeTab !== 'home') {
            WebApp.BackButton.show();
            const handleBack = () => setActiveTab('home');
            WebApp.BackButton.onClick(handleBack);
            return () => WebApp.BackButton.offClick(handleBack);
        } else {
            WebApp.BackButton.hide();
        }
    }, [activeTab]);

    const handleLogin = (data: AuthData) => {
        setAuth(data);
        localStorage.setItem('app_auth', JSON.stringify(data));
    };

    const handleLogout = () => {
        WebApp.showConfirm("Вы точно хотите выйти?", (confirm) => {
            if (confirm) {
                setAuth(null);
                setCargoList(null);
                localStorage.removeItem('app_auth');
            }
        });
    };

    // Загрузка данных
    useEffect(() => {
        if (!auth) return;

        const fetchData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const res = await fetch(PROXY_API_BASE_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        login: auth.login,
                        password: auth.password,
                        metod: "Текущие", 
                    }),
                });

                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error || `Ошибка ${res.status}`);
                }

                const data = await res.json();
                if (Array.isArray(data)) {
                    setCargoList(data);
                } else if (data && Array.isArray(data.data)) {
                    setCargoList(data.data); 
                } else {
                    setCargoList([]);
                }

            } catch (err: any) {
                console.error(err);
                setError(err.message || "Ошибка загрузки");
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [auth]);

    const handleSearch = (text: string) => {
        // Логика фильтрации передается в CargoPage через пропсы
    };

    // Если не авторизован — показываем форму входа
    if (!auth) {
        return <LoginForm onLogin={handleLogin} isLoading={false} error={null} />;
    }

    return (
        <div className="app-container fade-in min-h-screen flex flex-col bg-gray-900 text-white">
            {/* Header */}
            <header className="app-header sticky top-0 z-30 bg-gray-800 border-b border-gray-700 shadow-md px-4 py-3">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-lg font-bold text-white leading-tight">Транспортная Компания</h1>
                        <p className="text-xs text-gray-400">Личный кабинет</p>
                    </div>
                    <div className="flex gap-3 items-center">
                        <button 
                            className="p-2 rounded-full hover:bg-gray-700 transition-colors" 
                            onClick={() => setIsSearchExpanded(!isSearchExpanded)}
                        >
                            {isSearchExpanded ? <X className="w-5 h-5 text-gray-300" /> : <Search className="w-5 h-5 text-gray-300" />}
                        </button>
                        <button 
                            className="p-2 rounded-full hover:bg-gray-700 transition-colors" 
                            onClick={handleLogout} 
                            title="Выход"
                        >
                            <LogOut className="w-5 h-5 text-red-400" />
                        </button>
                    </div>
                </div>
                
                {/* Search Bar Expandable */}
                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isSearchExpanded ? 'max-h-16 mt-3 opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input 
                            type="search" 
                            placeholder="Поиск по номеру..." 
                            className="w-full bg-gray-700 text-white pl-9 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={searchText} 
                            onChange={(e) => { setSearchText(e.target.value); handleSearch(e.target.value); }} 
                        />
                        {searchText && (
                            <button 
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1" 
                                onClick={() => { setSearchText(''); handleSearch(''); }}
                            >
                                <X className="w-4 h-4 text-gray-400" />
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <div className="flex-1 w-full max-w-md mx-auto pb-24 px-4 pt-4">
                {activeTab === "home" && (
                    <HomePage cargoList={cargoList} isLoading={isLoading} error={error} />
                )}
                {activeTab === "cargo" && (
                    <CargoPage auth={auth} searchText={searchText} preloadedData={cargoList} />
                )}
                {activeTab === "docs" && <StubPage title="Документы" />}
                {activeTab === "support" && <StubPage title="Поддержка" />}
                {activeTab === "profile" && <StubPage title="Профиль" />}
            </div>

            {/* TabBar */}
            <TabBar active={activeTab} onChange={setActiveTab} />
        </div>
    );
}

// --- LOGIN FORM COMPONENT (NEW STYLE) ---
function LoginForm({ onLogin, isLoading, error }: { onLogin: (data: AuthData) => void; isLoading: boolean; error: string | null }) {
    const [login, setLogin] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (login && password) {
            onLogin({ login, password });
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-gray-900 to-gray-800">
            <div className="w-full max-w-sm bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-700 fade-in">
                {/* Header / Logo Area */}
                <div className="pt-8 pb-6 px-8 text-center bg-gray-800">
                    <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Truck className="w-8 h-8 text-blue-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-1">Вход в систему</h2>
                    <p className="text-gray-400 text-sm">Транспортная компания</p>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mx-6 mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3 animate-pulse">
                        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-red-400 leading-tight">{error}</p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="px-8 pb-8 flex flex-col gap-4">
                    {/* Login Field */}
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Логин</label>
                        <div className="relative group">
                            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-blue-500 transition-colors" />
                            <input
                                type="text"
                                value={login}
                                onChange={(e) => setLogin(e.target.value)}
                                className="w-full bg-gray-700 text-white pl-10 pr-4 py-3 rounded-xl border border-gray-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all placeholder-gray-500"
                                placeholder="Введите логин"
                                required
                            />
                        </div>
                    </div>

                    {/* Password Field */}
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Пароль</label>
                        <div className="relative group">
                            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                                <Lock className="w-5 h-5 text-gray-500 group-focus-within:text-blue-500 transition-colors" /> 
                            </div>
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-gray-700 text-white pl-10 pr-12 py-3 rounded-xl border border-gray-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all placeholder-gray-500"
                                placeholder="Введите пароль"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 text-gray-500 hover:text-gray-300 transition-colors"
                            >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="mt-4 w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-all transform active:scale-[0.98] shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span>Вход...</span>
                            </>
                        ) : (
                            <span>Войти</span>
                        )}
                    </button>
                </form>
                
                {/* Footer Info */}
                <div className="bg-gray-900/50 py-3 text-center border-t border-gray-700">
                     <p className="text-xs text-gray-500">Для доступа обратитесь к менеджеру</p>
                </div>
            </div>
        </div>
    );
}

// --- HOME PAGE COMPONENT ---
function HomePage({ cargoList, isLoading, error }: { cargoList: CargoItem[] | null, isLoading: boolean, error: string | null }) {
    return (
        <div className="space-y-6 fade-in">
            {/* Stats Grid Level 1 */}
            <div className="grid grid-cols-3 gap-2">
                {STATS_LEVEL_1.map((stat) => (
                    <div key={stat.id} className="bg-gray-800 p-3 rounded-xl border border-gray-700 flex flex-col items-center justify-center text-center shadow-sm">
                        <stat.icon className={`w-6 h-6 mb-2 ${stat.color}`} />
                        <span className="text-xs text-gray-400">{stat.label}</span>
                        <span className="text-lg font-bold text-white">{stat.value}</span>
                    </div>
                ))}
            </div>

            {/* Stats Grid Level 2 */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">Сводка по грузам</h3>
                <div className="space-y-3">
                    {STATS_LEVEL_2.map((stat, idx) => (
                        <div key={idx} className="flex justify-between items-center border-b border-gray-700 pb-2 last:border-0 last:pb-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-gray-700 rounded-lg">
                                    <stat.icon className="w-4 h-4 text-blue-400" />
                                </div>
                                <span className="text-sm text-gray-300">{stat.label}</span>
                            </div>
                            <span className="font-semibold text-white">{stat.value}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Recent Cargo List Preview */}
            <div>
                <div className="flex justify-between items-end mb-3">
                    <h3 className="text-lg font-bold text-white">Последние грузы</h3>
                    <button className="text-xs text-blue-400 hover:text-blue-300">Все грузы &rarr;</button>
                </div>
                
                {isLoading && (
                    <div className="flex justify-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                )}
                
                {error && (
                    <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-xl text-red-400 text-sm text-center">
                        {error}
                    </div>
                )}

                {!isLoading && !error && cargoList && cargoList.length === 0 && (
                     <div className="p-8 text-center text-gray-500 bg-gray-800 rounded-xl border border-gray-700">
                        <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>Список грузов пуст</p>
                     </div>
                )}

                {!isLoading && !error && cargoList && cargoList.slice(0, 3).map((cargo, idx) => (
                    <div key={idx} className="mb-3 bg-gray-800 p-4 rounded-xl border border-gray-700 flex justify-between items-center">
                        <div>
                            <div className="text-sm font-bold text-white">{cargo.Number || "Без номера"}</div>
                            <div className="text-xs text-gray-400">{cargo.DatePrih || "Дата не указана"}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-sm font-semibold text-blue-400">{cargo.State || "Статус"}</div>
                            <div className="text-xs text-gray-500">{cargo.Mest} мест | {cargo.W} кг</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// --- CARGO PAGE COMPONENT ---
function CargoPage({ auth, searchText, preloadedData }: { auth: AuthData, searchText: string, preloadedData: CargoItem[] | null }) {
    const dataToDisplay = useMemo(() => {
        if (!preloadedData) return [];
        if (!searchText) return preloadedData;
        const lower = searchText.toLowerCase();
        return preloadedData.filter(item => 
            (item.Number && item.Number.toLowerCase().includes(lower)) ||
            (item.State && item.State.toLowerCase().includes(lower))
        );
    }, [preloadedData, searchText]);

    return (
        <div className="fade-in pb-4">
             <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">Мои грузы</h2>
                <span className="text-xs bg-gray-700 px-2 py-1 rounded-full text-gray-300">{dataToDisplay.length}</span>
            </div>
            
            <div className="space-y-3">
                {dataToDisplay.length === 0 ? (
                    <div className="text-center py-10 text-gray-500">
                        Нет данных для отображения
                    </div>
                ) : (
                    dataToDisplay.map((cargo, idx) => (
                        <div key={idx} className="bg-gray-800 p-4 rounded-xl border border-gray-700 hover:border-gray-600 transition-colors">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <span className="px-2 py-1 bg-blue-900/30 text-blue-400 text-xs rounded-md font-medium border border-blue-900/50">
                                        {cargo.State || "В работе"}
                                    </span>
                                    <h4 className="mt-2 text-lg font-bold text-white">{cargo.Number}</h4>
                                </div>
                                <div className="text-right">
                                    <span className="text-lg font-bold text-white block">{cargo.Cost} ₽</span>
                                    {cargo.Debt && parseFloat(String(cargo.Debt)) > 0 && (
                                        <span className="text-xs text-red-400 flex items-center justify-end gap-1">
                                            <AlertTriangle className="w-3 h-3" /> Долг: {cargo.Debt}
                                        </span>
                                    )}
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 text-sm text-gray-400 mb-3">
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4 opacity-50" />
                                    <span>{cargo.DatePrih}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Weight className="w-4 h-4 opacity-50" />
                                    <span>{cargo.W} кг / {cargo.Volume} м³</span>
                                </div>
                            </div>

                            <div className="pt-3 border-t border-gray-700 flex justify-between items-center">
                                <span className="text-xs text-gray-500">{cargo.Sender} &rarr; {cargo.Receiver}</span>
                                <button className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors">
                                    <FileTextIcon className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// --- STUB PAGE COMPONENT ---
function StubPage({ title }: { title: string }) {
    return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-center text-gray-500 fade-in">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
            <p className="text-sm max-w-xs">Этот раздел находится в разработке и скоро станет доступен.</p>
        </div>
    );
}

// --- TAB BAR COMPONENT ---
function TabBar({ active, onChange }: { active: Tab, onChange: (t: Tab) => void }) {
    const tabs: { id: Tab; label: string; icon: any }[] = [
        { id: "home", label: "Главная", icon: Home },
        { id: "cargo", label: "Грузы", icon: Package }, // Package looks better for cargo
        { id: "docs", label: "Доки", icon: FileText },
        { id: "support", label: "Чат", icon: MessageCircle },
        { id: "profile", label: "Профиль", icon: User },
    ];

    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 pb-safe z-40">
            <div className="flex justify-around items-center px-2 py-2">
                {tabs.map((tab) => {
                    const isActive = active === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => onChange(tab.id)}
                            className={`flex flex-col items-center justify-center w-full py-1 transition-all duration-200 ${isActive ? "text-blue-500" : "text-gray-500 hover:text-gray-400"}`}
                        >
                            <div className={`relative p-1.5 rounded-xl transition-all ${isActive ? "bg-blue-500/10 translate-y-[-2px]" : ""}`}>
                                <tab.icon className={`w-6 h-6 ${isActive ? "stroke-[2.5px]" : "stroke-[2px]"}`} />
                            </div>
                            <span className="text-[10px] mt-1 font-medium">{tab.label}</span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
