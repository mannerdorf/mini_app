import { FormEvent, useEffect, useState, useCallback } from "react";
// Импортируем все необходимые иконки
import { 
    LogOut, Home, Truck, FileText, MessageCircle, User, Loader2, Moon, Sun, Eye, EyeOff, AlertTriangle, Package, Calendar, Tag, Layers, Weight, Filter, X
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

// --- КОНФИГУРАЦИЯ ---
const PROXY_API_BASE_URL = '/api/perevozki'; 

// --- КОНСТАНТЫ ---
const DEFAULT_LOGIN = "order@lal-auto.com";
const DEFAULT_PASSWORD = "ZakaZ656565";

// Получаем текущую дату в формате YYYY-MM-DD
const getTodayDate = () => new Date().toISOString().split('T')[0];

// Получаем дату, отстоящую на ШЕСТЬ МЕСЯЦЕВ назад (ИСПРАВЛЕНО)
const getSixMonthsAgoDate = () => {
    const d = new Date();
    // Устанавливаем месяц 6 месяцев назад
    d.setMonth(d.getMonth() - 6); 
    return d.toISOString().split('T')[0];
};

const DEFAULT_DATE_FROM = getSixMonthsAgoDate(); // 6 месяцев назад
const DEFAULT_DATE_TO = getTodayDate(); // Сегодня


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
    const isThemeLight = theme === 'light';

    // Применяем класс темы к body
    useEffect(() => {
        document.body.className = `${theme}-mode`;
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prevTheme => (prevTheme === 'dark' ? 'light' : 'dark'));
    };
    
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

            // Отправляем POST-запрос с логином/паролем в теле (для проверки авторизации)
            // Используем корректные даты по умолчанию (6 месяцев назад - сегодня)
            const res = await fetch(PROXY_API_BASE_URL, {
                method: "POST", 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    login: cleanLogin, 
                    password: cleanPassword,
                    dateFrom: DEFAULT_DATE_FROM, 
                    dateTo: DEFAULT_DATE_TO 
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

            --color-modal-bg: rgba(31, 41, 55, 0.8); /* Полупрозрачный фон модала (темный) */
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

            --color-modal-bg: rgba(249, 250, 251, 0.8); /* Полупрозрачный фон модала (светлый) */
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
        .theme-toggle-button-login {
            background: none; 
            border: none;
            color: var(--color-text-secondary);
            cursor: pointer;
            padding: 0; 
            transition: color 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .theme-toggle-button-login:hover {
            color: var(--color-primary-blue);
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
        /* --- LOGIN/SWITCH/BUTTONS/HEADER (пропущены для краткости, они остались прежними) --- */

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
        .app-header {
            padding: 1rem;
            background-color: var(--color-bg-secondary);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: sticky;
            top: 0;
            z-index: 10;
            border-bottom: 1px solid var(--color-border);
        }
        .app-main {
            flex-grow: 1;
            padding: 1.5rem 1rem 5.5rem 1rem; 
            display: flex;
            justify-content: center;
            width: 100%;
        }

        /* --------------------------------- */
        /* --- CARGO PAGE --- */
        /* --------------------------------- */
        .cargo-header-row-buttons {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 1rem;
        }
        .cargo-header-row-buttons .filter-button {
            display: flex;
            align-items: center;
            background-color: var(--color-bg-card);
            color: var(--color-text-primary);
            border: 1px solid var(--color-border);
            padding: 0.5rem 1rem;
            border-radius: 0.75rem;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.15s;
        }
        .cargo-header-row-buttons .filter-button:hover {
            background-color: var(--color-bg-hover);
        }
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
        @media (min-width: 640px) {
            .cargo-list {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
                gap: 1.5rem;
            }
        }
        /* --------------------------------- */
        /* --- FILTER DIALOG / MODAL --- */
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
        }
        .modal-content {
            background-color: var(--color-bg-card);
            border-radius: 1rem;
            padding: 1.5rem;
            width: 90%;
            max-width: 400px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
            border: 1px solid var(--color-border);
            animation: fadeIn 0.3s;
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
        .modal-form-group {
            margin-bottom: 1rem;
        }
        .modal-form-group label {
            display: block;
            margin-bottom: 0.5rem;
            font-size: 0.875rem;
            color: var(--color-text-secondary);
        }
        .modal-form-group input {
            width: 100%;
            padding: 0.75rem;
            border-radius: 0.5rem;
            border: 1px solid var(--color-border);
            background-color: var(--color-bg-input);
            color: var(--color-text-primary);
            outline: none;
            transition: border-color 0.15s;
        }
        .modal-form-group input:focus {
            border-color: var(--color-primary-blue);
            box-shadow: 0 0 0 1px var(--color-primary-blue);
        }
        .modal-button-container {
            margin-top: 1.5rem;
        }
    `;

    // --------------- ЭКРАН АВТОРИЗАЦИИ (пропущен для краткости) ---------------
    if (!auth) {
        return (
            <>
            <style>{injectedStyles}</style>
            
            <div className={`app-container login-form-wrapper`}>
                <div className="login-card">
                    <div className="absolute top-4 right-4">
                        <button className="theme-toggle-button-login" onClick={toggleTheme} title="Переключить тему">
                            {isThemeLight ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5 text-yellow-400" />}
                        </button>
                    </div>

                    <div className="flex justify-center mb-4 h-10 mt-6">
                        <div className="logo-text">HAULZ</div>
                    </div>
                    <div className="tagline">
                        Доставка грузов в Калининград и обратно
                    </div>

                    <form onSubmit={handleSubmit} className="form">
                        <div className="field">
                            <input
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
                                <input
                                    className="login-input"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Пароль"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                />
                                <button 
                                    type="button" 
                                    className="toggle-password-visibility" 
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        <label className="checkbox-row switch-wrapper">
                            <span>
                                Согласие с{" "}
                                <a href="#" target="_blank" rel="noreferrer">
                                    публичной офертой
                                </a>
                            </span>
                            <div 
                                className={`switch-container ${agreeOffer ? 'checked' : ''}`}
                                onClick={() => setAgreeOffer(!agreeOffer)}
                            >
                                <div className="switch-knob"></div>
                            </div>
                        </label>

                        <label className="checkbox-row switch-wrapper">
                            <span>
                                Согласие на{" "}
                                <a href="#" target="_blank" rel="noreferrer">
                                    обработку персональных данных
                                </a>
                            </span>
                            <div 
                                className={`switch-container ${agreePersonal ? 'checked' : ''}`}
                                onClick={() => setAgreePersonal(!agreePersonal)}
                            >
                                <div className="switch-knob"></div>
                            </div>
                        </label>

                        <button className="button-primary mt-4 flex justify-center items-center" type="submit" disabled={loading}>
                            {loading ? (
                                <Loader2 className="animate-spin w-5 h-5" />
                            ) : (
                                "Подтвердить"
                            )}
                        </button>
                    </form>

                    {error && <p className="login-error mt-4"><AlertTriangle className="w-5 h-5 mr-2" />{error}</p>}
                </div>
            </div>
            </>
        );
    }

    // --------------- АВТОРИЗОВАННАЯ ЧАСТЬ ---------------

    return (
        <div className={`app-container`}>
            <style>{injectedStyles}</style>

            <header className="app-header">
                <h1 className="header-title">
                    <span className="logo-text text-theme-primary" style={{ fontSize: '1.5rem', margin: 0 }}>HAULZ</span>
                </h1>
                <div className="flex items-center space-x-3">
                    <button className="text-theme-secondary hover:bg-theme-hover-bg p-2 rounded-full" onClick={handleLogout} title="Выйти">
                        <LogOut className="w-5 h-5 text-red-500" />
                    </button>
                    <button className="text-theme-secondary hover:bg-theme-hover-bg p-2 rounded-full" onClick={toggleTheme} title="Переключить тему">
                        {isThemeLight ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5 text-yellow-400" />}
                    </button>
                </div>
            </header>

            <div className="app-main">
                <div className="w-full max-w-4xl">
                    {activeTab === "cargo" && <CargoPage auth={auth} />}
                    {activeTab === "home" && <StubPage title="Главная" />}
                    {activeTab === "docs" && <StubPage title="Документы" />}
                    {activeTab === "support" && <StubPage title="Поддержка" />}
                    {activeTab === "profile" && <StubPage title="Профиль" />}
                </div>
            </div>

            <TabBar active={activeTab} onChange={setActiveTab} />
        </div>
    );
}

// ----------------- КОМПОНЕНТ ФИЛЬТРАЦИИ (FilterDialog) -----------------

type FilterDialogProps = {
    isOpen: boolean;
    onClose: () => void;
    dateFrom: string;
    dateTo: string;
    onApply: (dateFrom: string, dateTo: string) => void;
};

function FilterDialog({ isOpen, onClose, dateFrom, dateTo, onApply }: FilterDialogProps) {
    const [tempDateFrom, setTempDateFrom] = useState(dateFrom);
    const [tempDateTo, setTempDateTo] = useState(dateTo);

    useEffect(() => {
        // Синхронизация при открытии модала
        if (isOpen) {
            setTempDateFrom(dateFrom);
            setTempDateTo(dateTo);
        }
    }, [isOpen, dateFrom, dateTo]);

    if (!isOpen) return null;

    const handleApply = (e: FormEvent) => {
        e.preventDefault();
        onApply(tempDateFrom, tempDateTo);
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Фильтр по датам</h3>
                    <button className="modal-close-button" onClick={onClose}>
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <form onSubmit={handleApply}>
                    <div className="modal-form-group">
                        <label htmlFor="dateFrom">Дата начала:</label>
                        <input
                            id="dateFrom"
                            type="date"
                            value={tempDateFrom}
                            onChange={(e) => setTempDateFrom(e.target.value)}
                            required
                        />
                    </div>
                    <div className="modal-form-group">
                        <label htmlFor="dateTo">Дата окончания:</label>
                        <input
                            id="dateTo"
                            type="date"
                            value={tempDateTo}
                            onChange={(e) => setTempDateTo(e.target.value)}
                            required
                        />
                    </div>
                    <div className="modal-button-container">
                        <button className="button-primary" type="submit">
                            Применить фильтр
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}


// ----------------- КОМПОНЕНТ С ГРУЗАМИ (CargoPage - ОБНОВЛЕНО) -----------------

type CargoPageProps = { auth: AuthData };

function CargoPage({ auth }: CargoPageProps) {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // НОВОЕ СОСТОЯНИЕ ДЛЯ ФИЛЬТРА (Использует константы 6 месяцев)
    const [filterDateFrom, setFilterDateFrom] = useState(DEFAULT_DATE_FROM);
    const [filterDateTo, setFilterDateTo] = useState(DEFAULT_DATE_TO);
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // Функция для форматирования даты (например, из "2024-01-11T00:00:00" в "11.01.2024")
    const formatDate = (dateString: string | undefined): string => {
        if (!dateString) return '-';
        try {
            // Убедимся, что дата в UTC, чтобы не было смещения
            const date = new Date(dateString.includes('T') ? dateString : dateString + 'T00:00:00');
            if (!isNaN(date.getTime())) {
                 return date.toLocaleDateString('ru-RU');
            }
        } catch (e) { /* ignore */ }
        return dateString;
    };
    
    // Функция для форматирования валюты
    const formatCurrency = (value: number | string | undefined): string => {
        if (value === undefined || value === null || value === "") return '-';
        const num = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
        if (isNaN(num)) return String(value);

        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            minimumFractionDigits: 0, 
            maximumFractionDigits: 0
        }).format(num);
    };
    
    // Определяет класс статуса
    const getStatusClass = (status: string | undefined) => {
        const lowerStatus = (status || '').toLowerCase();
        if (lowerStatus.includes('доставлен') || lowerStatus.includes('заверш')) {
            return 'status-value success';
        }
        return 'status-value';
    };

    // ФУНКЦИЯ ЗАГРУЗКИ ДАННЫХ (ИСПОЛЬЗУЕТСЯ useCallback)
    const loadCargo = useCallback(async (dateFrom: string, dateTo: string) => {
        setLoading(true);
        setError(null);

        try {
            // Отправляем POST-запрос с логином/паролем и ДАТАМИ ФИЛЬТРА в теле
            const res = await fetch(PROXY_API_BASE_URL, {
                method: "POST", 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    login: auth.login, 
                    password: auth.password,
                    dateFrom: dateFrom,
                    dateTo: dateTo,
                }),
            });

            if (!res.ok) {
                let message = `Ошибка загрузки грузов: ${res.status}.`;
                try {
                    const data = (await res.json()) as ApiError;
                    if (data.error) message = data.error;
                } catch { /* ignore */ }
                setError(message);
                return;
            }

            const data = await res.json();
            const list = Array.isArray(data) ? data : data.items || [];
            setItems(list);

        } catch (e: any) {
            setError(e?.message || "Ошибка сети при загрузке грузов.");
        } finally {
            setLoading(false);
        }
    }, [auth.login, auth.password]); // Зависимости для useCallback

    // ЭФФЕКТ, ЗАПУСКАЮЩИЙ ЗАГРУЗКУ ПРИ СМЕНЕ ФИЛЬТРА
    useEffect(() => {
        // Здесь filterDateFrom и filterDateTo уже в формате YYYY-MM-DD
        loadCargo(filterDateFrom, filterDateTo);

    }, [filterDateFrom, filterDateTo, loadCargo]); // Срабатывает при изменении дат

    const handleApplyFilter = (newDateFrom: string, newDateTo: string) => {
        setFilterDateFrom(newDateFrom);
        setFilterDateTo(newDateTo);
        // loadCargo будет вызван в useEffect
    };
    
    const formattedDateRange = `${formatDate(filterDateFrom)} – ${formatDate(filterDateTo)}`;


    return (
        <div className="w-full">
            <h2 className="title text-theme-text">Мои Грузы</h2>
            
            {/* КНОПКА ФИЛЬТРА И ТЕКУЩИЙ ДИАПАЗОН */}
            <div className="cargo-header-row-buttons">
                <button 
                    className="filter-button" 
                    onClick={() => setIsFilterOpen(true)}
                    title="Изменить диапазон дат"
                >
                    <Filter className="w-4 h-4 mr-2" />
                    <span>{formattedDateRange}</span>
                </button>
            </div>

            {loading && (
                <div className="flex justify-center items-center py-8 text-theme-secondary">
                    <Loader2 className="animate-spin w-6 h-6 mr-2" />
                    <p>Загружаем данные...</p>
                </div>
            )}
            
            {error && (
                 <p className="login-error mt-4"><AlertTriangle className="w-5 h-5 mr-2" />{error}</p>
            )}

            {!loading && !error && items.length === 0 && (
                 <div className="p-8 my-8 text-center bg-[var(--color-bg-card)] border border-theme-border rounded-xl">
                    <Package className="w-12 h-12 mx-auto mb-4 text-theme-secondary opacity-50" />
                    <p className="text-theme-secondary">Перевозок не найдено за выбранный период.</p>
                 </div>
            )}

            <div className="cargo-list">
                {items.map((item, idx) => (
                    <div className="cargo-card" key={idx}>
                        
                        {/* 1. ЗАГОЛОВОК: № заказа и Дата прибытия */}
                        <div className="cargo-header-row">
                            <span className="order-number">
                                № {item.Number || item.number || "-"}
                            </span>
                            <span className="date">
                                <Calendar className="w-4 h-4 mr-1" />
                                {formatDate(item.DatePrih || item.DatePr)}
                            </span>
                        </div>

                        {/* 2. СЕТКА ДЕТАЛЕЙ: Статус, Мест, Вес */}
                        <div className="cargo-details-grid">
                            <div className="detail-item">
                                <Tag className="w-5 h-5 text-theme-primary" />
                                <div className={getStatusClass(item.State || item.state)}>
                                    {item.State || item.state || "Неизвестно"}
                                </div>
                                <div className="detail-item-label">Статус</div>
                            </div>
                            <div className="detail-item">
                                <Layers className="w-5 h-5 text-theme-primary" />
                                <div className="detail-item-value">
                                    {item.Mest || item.mest || "-"}
                                </div>
                                <div className="detail-item-label">Мест</div>
                            </div>
                            <div className="detail-item">
                                <Weight className="w-5 h-5 text-theme-primary" />
                                <div className="detail-item-value">
                                    {item.PW || item.Weight || "-"} кг
                                </div>
                                <div className="detail-item-label">Вес</div>
                            </div>
                        </div>

                        {/* 3. ФУТЕР: Сумма */}
                        <div className="cargo-footer">
                            <span className="sum-label">Общая сумма</span>
                            <span className="sum-value">
                                {formatCurrency(item.Sum || item.Total)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            <FilterDialog 
                isOpen={isFilterOpen}
                onClose={() => setIsFilterOpen(false)}
                dateFrom={filterDateFrom}
                dateTo={filterDateTo}
                onApply={handleApplyFilter}
            />
        </div>
    );
}

// ----------------- ЗАГЛУШКИ ДЛЯ ДРУГИХ ВКЛАДОК (пропущены для краткости) -----------------

function StubPage({ title }: { title: string }) {
    return (
        <div className="w-full">
            <h2 className="title text-theme-text">{title}</h2>
            <p className="subtitle">Этот раздел мы заполним позже.</p>
            <div className="p-8 my-8 text-center bg-[var(--color-bg-card)] border border-theme-border rounded-xl">
                <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-theme-secondary opacity-50" />
                <p className="text-theme-secondary">Контент в разработке.</p>
            </div>
        </div>
    );
}

// ----------------- НИЖНЕЕ МЕНЮ (TabBar - пропущено для краткости) -----------------

type TabBarProps = {
    active: Tab;
    onChange: (t: Tab) => void;
};

function TabBar({ active, onChange }: TabBarProps) {
    return (
        <div className="tabbar-container">
            <TabButton
                label="Главная"
                icon={<Home />}
                active={active === "home"}
                onClick={() => onChange("home")}
            />
            <TabButton
                label="Грузы"
                icon={<Truck />}
                active={active === "cargo"}
                onClick={() => onChange("cargo")}
            />
            <TabButton
                label="Документы"
                icon={<FileText />}
                active={active === "docs"}
                onClick={() => onChange("docs")}
            />
            <TabButton
                label="Поддержка"
                icon={<MessageCircle />}
                active={active === "support"}
                onClick={() => onChange("support")}
            />
            <TabButton
                label="Профиль"
                icon={<User />}
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
