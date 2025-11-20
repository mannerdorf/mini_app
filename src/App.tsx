import { FormEvent, useEffect, useState } from "react";
// Импортируем все необходимые иконки
import { 
    LogOut, Home, Truck, FileText, MessageCircle, User, Loader2, Check, X, Moon, Sun, Eye, EyeOff, AlertTriangle, Package
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

// --- КОНСТАНТЫ ДЛЯ ОТОБРАЖЕНИЯ CURL (только для отладки) ---
const EXTERNAL_API_BASE_URL_FOR_CURL = 'https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki';
const ADMIN_AUTH_BASE64_FOR_CURL = 'YWRtaW46anVlYmZueWU='; 
const DEFAULT_LOGIN = "order@lal-auto.com";
const DEFAULT_PASSWORD = "ZakaZ656565";

// --- ФУНКЦИЯ ДЛЯ BASIC AUTH (для заголовка Authorization) ---
const getAuthHeader = (login: string, password: string): { Authorization: string } => {
    const credentials = `${login}:${password}`;
    // btoa доступен в браузере
    const encoded = btoa(credentials);
    return {
        Authorization: `Basic ${encoded}`,
    };
};

// --- ФУНКЦИЯ ДЛЯ ГЕНЕРАЦИИ ДИНАМИЧЕСКОГО CURL (для отображения) ---
const generateDynamicCurlString = (clientLogin: string, clientPassword: string): string => {
    const dateB = '2024-01-01'; 
    const dateE = '2026-01-01'; // Используем широкий диапазон для теста

    const clientBasicAuthValue = btoa(`${clientLogin}:${clientPassword}`);
    
    // В 1С заголовок клиента называется 'Auth', и он RAW-строка.
    // Но в CURL-запросе для 1С он, как правило, должен быть Base64, если API 1С его ожидает в таком виде.
    // Для нашего прокси он декодируется, но для отображения в CURL лучше показать, как он идет к 1С.
    const clientAuthHeaderForCURL = `Basic ${clientBasicAuthValue}`;
    
    return `curl -X GET '${EXTERNAL_API_BASE_URL_FOR_CURL}?DateB=${dateB}&DateE=${dateE}' \\
  -H 'Authorization: Basic ${ADMIN_AUTH_BASE64_FOR_CURL}' \\
  -H 'Auth: ${clientAuthHeaderForCURL}' \\
  -H 'Accept-Encoding: identity'`;
};


export default function App() {
    const [login, setLogin] = useState(DEFAULT_LOGIN); // Предзаполненный логин
    const [password, setPassword] = useState(DEFAULT_PASSWORD); // Предзаполненный пароль
    const [agreeOffer, setAgreeOffer] = useState(true);
    const [agreePersonal, setAgreePersonal] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false); // Для переключения видимости пароля
    const [curlRequest, setCurlRequest] = useState<string>(""); // Для отображения CURL-запроса

    const [auth, setAuth] = useState<AuthData | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>("cargo");
    const [theme, setTheme] = useState('dark'); // Состояние для темы
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
        setCurlRequest(""); // Сбрасываем CURL-запрос

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
            
            // Формируем CURL-запрос для отображения
            setCurlRequest(generateDynamicCurlString(cleanLogin, cleanPassword));

            // Параметры для тестового запроса (для проверки авторизации и прокси)
            const queryParams = new URLSearchParams({
                dateFrom: "2024-01-01", 
                dateTo: "2026-01-01", 
            }).toString();
            
            // Выполняем GET-запрос к прокси, который использует Basic Auth
            const res = await fetch(`${PROXY_API_BASE_URL}?${queryParams}`, {
                method: "GET", 
                headers: getAuthHeader(cleanLogin, cleanPassword),
            });

            if (!res.ok) {
                let message = `Ошибка авторизации: ${res.status}. Проверьте логин и пароль.`;
                if (res.status === 401) {
                    message = "Ошибка авторизации (401). Неверный логин/пароль или проблема с декодированием в прокси.";
                } else if (res.status === 405) {
                    message = "Ошибка: Метод не разрешен (405). Проверьте, что ваш прокси-файл ожидает метод GET.";
                }
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
        // Очищаем пароль и curl при выходе для безопасности/чистоты
        setPassword(DEFAULT_PASSWORD); 
        setCurlRequest(""); 
    }

    // Встраиваем стили (как в styles (1).css)
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
            
            --color-tumbler-bg-off: #6b7280; /* Серый для выключенного тумблера */
            --color-tumbler-bg-on: #3b82f6;  /* Синий для включенного тумблера */
            --color-tumbler-knob: white; 
            
            --color-error-bg: rgba(185, 28, 28, 0.1); 
            --color-error-border: #b91c1c; 
            --color-error-text: #fca5a5; 
        }
        
        .light-mode {
            --color-bg-primary: #f9fafb; /* Светло-серый фон */
            --color-bg-secondary: #ffffff; /* Белый фон для шапки */
            --color-bg-card: #ffffff; /* Белый фон карточек */
            --color-bg-hover: #f3f4f6; /* Светло-серый при наведении */
            --color-bg-input: #f3f4f6; /* Светлый фон для инпутов */
            --color-text-primary: #1f2937; /* Темный текст */
            --color-text-secondary: #6b7280; /* Серый вторичный текст */
            --color-border: #e5e7eb; /* Светлая граница */
            --color-primary-blue: #2563eb; /* Чуть темнее синий */

            --color-tumbler-bg-off: #ccc; 
            --color-tumbler-bg-on: #2563eb; 
            --color-tumbler-knob: white; 

            --color-error-bg: #fee2e2;
            --color-error-border: #fca5a5;
            --color-error-text: #b91c1c;
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

        /* --------------------------------- */
        /* --- LOGIN SCREEN --- */
        /* --------------------------------- */
        .login-form-wrapper {
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 2rem;
            width: 100%;
        }
        .login-card {
            max-width: 28rem;
            width: 100%;
            background-color: var(--color-bg-card);
            padding: 2.5rem;
            border-radius: 1rem;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
            border: 1px solid var(--color-border);
            position: relative;
        }
        .logo-text {
            font-size: 2.5rem;
            font-weight: 900;
            text-align: center;
            margin-bottom: 0.5rem;
            color: var(--color-primary-blue);
        }
        .tagline {
            text-align: center;
            margin-bottom: 2rem;
            color: var(--color-text-secondary);
            font-size: 0.9rem;
        }
        .form {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
        }
        .login-input {
            width: 100%;
            background-color: var(--color-bg-input);
            border: 1px solid var(--color-border);
            color: var(--color-text-primary);
            padding: 0.75rem;
            padding-right: 3rem; 
            border-radius: 0.75rem;
            transition: all 0.15s;
            outline: none;
        }
        .login-input::placeholder {
             color: var(--color-text-secondary);
             opacity: 0.7;
        }
        .login-input:focus {
            box-shadow: 0 0 0 2px var(--color-primary-blue);
            border-color: var(--color-primary-blue);
        }
        .password-input-container {
            position: relative;
            width: 100%;
        }
        .toggle-password-visibility {
            position: absolute;
            right: 0.75rem;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            color: var(--color-text-secondary);
            cursor: pointer;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10;
        }
        .toggle-password-visibility:hover {
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
        .tech-info {
            background-color: var(--color-bg-secondary);
            border: 1px solid var(--color-border);
            border-radius: 0.5rem;
        }
        .tech-info pre {
            white-space: pre-wrap;
            word-break: break-all;
            color: var(--color-text-secondary);
            font-size: 0.75rem;
        }

        /* --------------------------------- */
        /* --- SWITCH/TUMBLER --- */
        /* --------------------------------- */
        .checkbox-row {
            display: flex;
            align-items: center;
            font-size: 0.875rem; 
            color: var(--color-text-secondary);
            cursor: pointer;
        }
        .checkbox-row a {
            color: var(--color-primary-blue);
            text-decoration: none;
            font-weight: 600;
        }
        .switch-wrapper {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
        }
        .switch-container {
            position: relative;
            width: 2.75rem; 
            height: 1.5rem; 
            border-radius: 9999px;
            transition: background-color 0.2s ease-in-out;
            flex-shrink: 0;
            background-color: var(--color-tumbler-bg-off); 
        }
        .switch-container.checked {
            background-color: var(--color-tumbler-bg-on); 
        }
        .switch-knob {
            position: absolute;
            top: 0.125rem; 
            left: 0.125rem; 
            width: 1.25rem; 
            height: 1.25rem; 
            background-color: var(--color-tumbler-knob);
            border-radius: 9999px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            transform: translateX(0);
            transition: transform 0.2s ease-in-out;
        }
        .switch-container.checked .switch-knob {
            transform: translateX(1.25rem); 
        }

        /* --------------------------------- */
        /* --- BUTTONS & HEADER/MAIN --- */
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
            padding: 1.5rem 1rem 5.5rem 1rem; /* Увеличили нижний паддинг для таббара */
            display: flex;
            justify-content: center;
            width: 100%;
        }

        /* --------------------------------- */
        /* --- CARGO PAGE --- */
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
        }
        .cargo-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.25rem 0;
            border-bottom: 1px dashed var(--color-border);
        }
        .cargo-row:last-child {
            border-bottom: none;
        }
        .cargo-row.main {
            font-weight: 600;
            font-size: 1rem;
            padding-bottom: 0.5rem;
            margin-bottom: 0.5rem;
            border-bottom: 1px solid var(--color-primary-blue);
        }
        .cargo-label {
            color: var(--color-text-secondary);
            font-weight: 500;
        }
        .cargo-value {
            text-align: right;
            font-weight: 600;
        }
        .cargo-value-sum {
            color: var(--color-primary-blue);
            font-weight: 700;
        }
        /* Адаптивность для CargoPage */
        @media (min-width: 640px) {
            .cargo-list {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 1.5rem;
            }
        }


        /* --------------------------------- */
        /* --- TAB BAR --- */
        /* --------------------------------- */
        .tabbar-container {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            display: flex;
            justify-content: space-around;
            background-color: var(--color-bg-secondary);
            border-top: 1px solid var(--color-border);
            padding: 0.5rem 0;
            z-index: 20;
            box-shadow: 0 -4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .tab-button {
            background: none;
            border: none;
            min-width: 4rem;
            padding: 0.25rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-size: 0.75rem;
            font-weight: 500;
            transition: color 0.2s, background-color 0.2s;
            cursor: pointer;
            border-radius: 0.5rem;
        }
        .tab-button .tab-icon {
            margin-bottom: 0.25rem;
            height: 1.25rem;
            width: 1.25rem;
        }
        .tab-button.active {
            color: var(--color-primary-blue);
        }
        .tab-button:not(.active) {
            color: var(--color-text-secondary);
        }
        .tab-button:hover:not(.active) {
            background-color: var(--color-bg-hover);
        }
    `;

    // --------------- ЭКРАН АВТОРИЗАЦИИ ---------------
    if (!auth) {
        return (
            <>
            <style>{injectedStyles}</style>
            
            <div className={`app-container login-form-wrapper`}>
                <div className="login-card">
                    <div className="absolute top-4 right-4">
                        <button className="theme-toggle-button text-theme-secondary hover:bg-theme-hover-bg p-2 rounded-full" onClick={toggleTheme} title="Переключить тему">
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
                    
                    {/* --- ТЕХНИЧЕСКОЕ ПОЛЕ CURL --- */}
                    {curlRequest && (
                        <div className="mt-4 p-3 tech-info">
                            <h3 className="text-sm font-semibold text-theme-text mb-1">Итоговый CURL-запрос (для отладки прокси):</h3>
                            <pre className="whitespace-pre-wrap break-all p-2 rounded">
                                {curlRequest}
                            </pre>
                        </div>
                    )}

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

// ----------------- КОМПОНЕНТ С ГРУЗАМИ (CargoPage) -----------------

type CargoPageProps = { auth: AuthData };

function CargoPage({ auth }: CargoPageProps) {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Функция для форматирования даты (например, из "2024-01-11T00:00:00" в "11.01.2024")
    const formatDate = (dateString: string | undefined): string => {
        if (!dateString) return '-';
        try {
            // Пытаемся обработать ISO-строку
            const date = new Date(dateString);
            if (!isNaN(date.getTime())) {
                 return date.toLocaleDateString('ru-RU');
            }
        } catch (e) { /* ignore */ }
        // Если не удалось, возвращаем как есть
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


    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError(null);

            // Запрос данных за последний год
            const today = new Date();
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(today.getFullYear() - 1);

            const formatDateForApi = (date: Date): string => {
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            };
            
            const dateFrom = formatDateForApi(oneYearAgo);
            const dateTo = formatDateForApi(today);
            
            const queryParams = new URLSearchParams({
                dateFrom: dateFrom,
                dateTo: dateTo,
            }).toString();

            try {
                const url = `${PROXY_API_BASE_URL}?${queryParams}`;
                
                const res = await fetch(url, {
                    method: "GET",
                    headers: { 
                        ...getAuthHeader(auth.login, auth.password)
                    },
                });

                if (!res.ok) {
                    let message = `Ошибка загрузки грузов: ${res.status}.`;
                    try {
                        const data = (await res.json()) as ApiError;
                        if (data.error) message = data.error;
                    } catch { /* ignore */ }
                    if (!cancelled) setError(message);
                    return;
                }

                const data = await res.json();
                // Обрабатываем как массив или как объект с полем 'items'
                const list = Array.isArray(data) ? data : data.items || [];
                if (!cancelled) setItems(list);

            } catch (e: any) {
                if (!cancelled) setError(e?.message || "Ошибка сети при загрузке грузов.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();

        return () => {
            cancelled = true;
        };
    }, [auth.login, auth.password]); // Перезагружаем при смене пользователя

    return (
        <div className="w-full">
            <h2 className="title text-theme-text">Мои Грузы</h2>
            <p className="subtitle">
                Здесь отображаются все перевозки за последний год, полученные из системы 1С.
            </p>

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
                        <div className="cargo-row main">
                            <span className="cargo-label text-theme-text">№</span>
                            <span className="cargo-value text-theme-text">
                                {item.Number || item.number || "-"}
                            </span>
                        </div>

                        <div className="cargo-row">
                            <span className="cargo-label">Статус</span>
                            <span className="cargo-value text-theme-text">
                                {item.State || item.state || "-"}
                            </span>
                        </div>

                        <div className="cargo-row">
                            <span className="cargo-label">Дата прибытия</span>
                            <span className="cargo-value text-theme-text">
                                {formatDate(item.DatePrih || item.DatePr)}
                            </span>
                        </div>

                        <div className="cargo-row">
                            <span className="cargo-label">Мест</span>
                            <span className="cargo-value text-theme-text">
                                {item.Mest || item.mest || "-"}
                            </span>
                        </div>

                        <div className="cargo-row">
                            <span className="cargo-label">Вес, кг</span>
                            <span className="cargo-value text-theme-text">
                                {item.PW || item.Weight || "-"}
                            </span>
                        </div>

                        <div className="cargo-row">
                            <span className="cargo-label">Сумма</span>
                            <span className="cargo-value cargo-value-sum">
                                {formatCurrency(item.Sum || item.Total)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ----------------- ЗАГЛУШКИ ДЛЯ ДРУГИХ ВКЛАДОК -----------------

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

// ----------------- НИЖНЕЕ МЕНЮ (TabBar) -----------------

type TabBarProps = {
    active: Tab;
    onChange: (t: Tab) => void;
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
    const activeClass = active ? 'tab-btn-active' : '';
    
    return (
        <button
            type="button"
            className={`tab-button ${activeClass}`}
            onClick={onClick}
        >
            <span className="tab-icon">{icon}</span>
            <span className="tab-label">{label}</span>
        </button>
    );
}
