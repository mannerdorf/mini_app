import { FormEvent, useState, useEffect } from "react"; 
import { LogOut, Home, Truck, FileText, MessageCircle, User, Loader2, Check, X, Moon, Sun, Eye, EyeOff } from 'lucide-react';

// --- ТИПЫ ДАННЫХ ---
type AuthData = {
    login: string;
    password: string;
};

type Tab = "home" | "cargo" | "docs" | "support" | "profile";

// --- КОНФИГУРАЦИЯ ---
// Точка входа для запросов на ваш прокси-сервер Vercel
const PROXY_API_BASE_URL = '/api/perevozki'; 

// --- ФУНКЦИЯ ДЛЯ BASIC AUTH ---
// Фронтенд всегда должен кодировать логин:пароль, отправляя его в прокси
const getAuthHeader = (login: string, password: string): { Authorization: string } => {
    const credentials = `${login}:${password}`;
    // btoa доступен в браузере
    const encoded = btoa(credentials); 
    return {
        Authorization: `Basic ${encoded}`,
    };
};

export default function App() {
    const [login, setLogin] = useState("order@lal-auto.com"); 
    const [password, setPassword] = useState("ZakaZ656565"); 
    const [agreeOffer, setAgreeOffer] = useState(true);
    const [agreePersonal, setAgreePersonal] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    
    const [auth, setAuth] = useState<AuthData | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>("cargo"); 
    const [theme, setTheme] = useState('dark');
    const isThemeLight = theme === 'light';

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
            
            // 1. Формируем заголовок для отправки на прокси Vercel
            const authHeader = getAuthHeader(cleanLogin, cleanPassword); 

            // 2. ОСНОВНОЙ ЗАПРОС К ПРОКСИ (через fetch)
            // Прокси-функция (api/perevozki.ts) пока использует ЖЕСТКИЙ URL/даты.
            const res = await fetch(`${PROXY_API_BASE_URL}`, { 
                method: "GET", 
                headers: { 
                    ...authHeader 
                },
            });

            if (!res.ok) {
                let message = `Ошибка авторизации: ${res.status}. Проверьте логин и пароль.`;
                if (res.status === 401) {
                    message = "Ошибка авторизации (401). Проверьте логин и пароль.";
                } else if (res.status === 500) {
                     message = "Ошибка сервера (500). Проверьте логин и пароль.";
                }
                setError(message);
                setAuth(null);
                return;
            }

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
    }
    
    const toggleTheme = () => {
        setTheme(prevTheme => (prevTheme === 'dark' ? 'light' : 'dark'));
    };


    // --------------- ЭКРАН АВТОРИЗАЦИИ ---------------
    if (!auth) {
        return (
            <>
            {/* Ваши стили */}
            <style>
                {`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
                
                * {
                    box-sizing: border-box;
                }
                body {
                    margin: 0;
                    background-color: var(--color-bg-primary); 
                    font-family: 'Inter', sans-serif;
                }
                
                :root {
                    /* Dark Mode Defaults */
                    --color-bg-primary: #1f2937;
                    --color-bg-secondary: #374151;
                    --color-bg-card: #374151;
                    --color-bg-hover: #4b5563;
                    --color-bg-input: #4b5563;
                    --color-text-primary: #e5e7eb;
                    --color-text-secondary: #9ca3af;
                    --color-border: #4b5563;
                    --color-ai-bg: rgba(75, 85, 99, 0.5);
                    --color-primary-blue: #3b82f6;
                    --color-error-bg: rgba(185, 28, 28, 0.1);
                    --color-error-border: #b91c1c;
                    --color-error-text: #fca5a5;
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
                    --color-ai-bg: #f3f4f6;
                    --color-primary-blue: #2563eb;
                    --color-error-bg: #fee2e2;
                    --color-error-border: #fca5a5;
                    --color-error-text: #b91c1c;
                }

                .app-container {
                    min-height: 100vh;
                    background-color: var(--color-bg-primary);
                    color: var(--color-text-primary);
                    font-family: 'Inter', sans-serif;
                    display: flex;
                    flex-direction: column;
                    transition: background-color 0.3s, color 0.3s;
                }
                
                /* Custom utility classes */
                .text-theme-text { color: var(--color-text-primary); }
                .text-theme-secondary { color: var(--color-text-secondary); }
                .text-theme-primary { color: var(--color-primary-blue); }
                .border-theme-border { border-color: var(--color-border); }
                .hover\\:bg-theme-hover-bg:hover { background-color: var(--color-bg-hover); }

                /* Login screen styles */
                .login-form-wrapper {
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 2rem;
                }
                .login-card {
                    max-width: 28rem;
                    width: 100%;
                    margin: 0 auto;
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
                /* .field-label - УДАЛЕНЫ */
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

                /* Switch/Tumbler styles */
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
                    background-color: var(--color-text-secondary);
                }
                .switch-container.checked {
                    background-color: var(--color-primary-blue);
                }
                .switch-knob {
                    position: absolute;
                    top: 0.125rem; 
                    left: 0.125rem; 
                    width: 1.25rem; 
                    height: 1.25rem; 
                    background-color: white;
                    border-radius: 9999px;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                    transform: translateX(0);
                    transition: transform 0.2s ease-in-out;
                }
                .switch-container.checked .switch-knob {
                    transform: translateX(1.25rem); 
                }

                /* Other styles (header, cards, etc.) */
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
                    padding: 1.5rem 1rem 4rem 1rem;
                    display: flex;
                    justify-content: center;
                    align-items: flex-start;
                }
                .ai-summary-card {
                    background-color: var(--color-bg-card);
                    border-radius: 0.75rem;
                    padding: 1rem;
                    border: 1px solid var(--color-border);
                    margin-bottom: 1.5rem;
                }
                .empty-state-card {
                    background-color: var(--color-bg-card);
                    border: 1px solid var(--color-border);
                    border-radius: 1rem;
                    padding: 3rem;
                    text-align: center;
                    margin-top: 5rem;
                }
                .grid-container {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 1rem;
                }
                @media (min-width: 768px) {
                    .grid-container {
                        grid-template-columns: 1fr 1fr;
                    }
                }
                .perevozka-card {
                    background-color: var(--color-bg-card);
                    border-radius: 0.75rem;
                    border: 1px solid var(--color-border);
                    overflow: hidden;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    transition: box-shadow 0.3s, border-color 0.3s;
                }
                .card-header {
                    padding: 0.75rem;
                    background-color: var(--color-bg-secondary);
                    border-bottom: 1px solid var(--color-border);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .fixed { position: fixed; }
                .bottom-0 { bottom: 0; }
                .left-0 { left: 0; }
                .right-0 { right: 0; }
                .z-50 { z-index: 50; }
                .shadow-lg { box-shadow: 0 -4px 6px -1px rgba(0, 0, 0, 0.1), 0 -2px 4px -2px rgba(0, 0, 0, 0.06); }
                .button-primary {
                    background-color: var(--color-primary-blue);
                    color: white;
                    padding: 0.75rem 1.5rem;
                    border-radius: 0.75rem;
                    font-weight: 600;
                    transition: background-color 0.15s;
                    border: none;
                    cursor: pointer;
                }
                .button-primary:hover:not(:disabled) {
                    background-color: #2563eb;
                }
                .button-primary:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                .theme-toggle-button {
                    background: none;
                    border: none;
                    color: var(--color-text-secondary);
                    cursor: pointer;
                    padding: 0.5rem;
                    border-radius: 50%;
                    transition: background-color 0.15s;
                }
                .theme-toggle-button:hover {
                    background-color: var(--color-bg-hover);
                }

                `}
            </style>
            
            <div className={`app-container ${theme}-mode login-form-wrapper`}>
                <div className={`login-card relative`}>
                    <div className="theme-toggle-container absolute top-4 right-4">
                        <button className="theme-toggle-button" onClick={toggleTheme}>
                            {isThemeLight ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
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
                                placeholder="order@lal-auto.com"
                                value={login}
                                onChange={(e) => setLogin(e.target.value)}
                                autoComplete="username"
                                style={{paddingRight: '0.75rem'}} 
                            />
                        </div>

                        {/* Поле для пароля с переключением видимости */}
                        <div className="field">
                            <div className="password-input-container">
                                <input
                                    className="login-input"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Введите пароль"
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

                        {/* Тумблер для согласия с офертой */}
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

                        {/* Тумблер для согласия на обработку данных */}
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

                    {error && <p className="login-error mt-4"><X className="w-5 h-5 mr-2" />{error}</p>}
                </div>
            </div>
            </>
        );
    }

    // --------------- АВТОРИЗОВАННАЯ ЧАСТЬ ---------------

    return (
        <div className={`app-container ${theme}-mode`}>
            
            <header className="app-header">
                <h1 className="header-title">
                    <span className="logo-text text-theme-primary" style={{ fontSize: '1.5rem', margin: 0 }}>HAULZ</span>
                </h1>
                <div className="flex items-center space-x-3">
                    <button className="theme-toggle-button" onClick={handleLogout} title="Выйти">
                        <LogOut className="w-5 h-5 text-red-500" />
                    </button>
                    <button className="theme-toggle-button" onClick={toggleTheme} title="
