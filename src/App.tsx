import { FormEvent, useState, useEffect } from "react"; 
import { LogOut, Loader2, Check, X, Moon, Sun, Eye, EyeOff, Home, Truck, FileText, MessageCircle, User, RefreshCw, AlertTriangle, Download } from 'lucide-react';

// --- ТИПЫ ДАННЫХ ---
type AuthData = {
    login: string;
    password: string;
};

type Tab = "home" | "cargo" | "docs" | "support" | "profile";

// --- ТИП ДАННЫХ ГРУЗА (Взято с вашего скриншота) ---
type CargoItem = {
    Number: string;
    Date: string;
    CityFrom: string;
    CityTo: string;
    Status: string;
    // Добавьте другие поля по мере необходимости
};


// --- КОНФИГУРАЦИЯ ---
const PROXY_API_BASE_URL = '/api/perevozki'; 
const FILE_PROXY_API_BASE_URL = '/api/getfile'; // <-- НОВЫЙ URL ДЛЯ ФАЙЛОВ

// --- ОСНОВНОЙ КОМПОНЕНТ APP ---
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
            
            // 1. ОСНОВНОЙ ЗАПРОС К ПРОКСИ (через fetch) для проверки авторизации
            // ЛОГИКА: POST + JSON BODY (старая рабочая конфигурация)
            const res = await fetch(PROXY_API_BASE_URL, { 
                method: "POST", 
                headers: { 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ 
                    login: cleanLogin, 
                    password: cleanPassword 
                }),
            });

            if (!res.ok) {
                let message = `Ошибка авторизации: ${res.status}. Проверьте логин и пароль.`;
                if (res.status === 401) {
                    message = "Ошибка авторизации (401). Проверьте логин и пароль.";
                } else if (res.status >= 500) {
                     message = `Ошибка сервера (5xx). Проверьте логику прокси-файла.`;
                }
                setError(message);
                setAuth(null);
                return;
            }

            // УСПЕХ: Устанавливаем данные авторизации и переключаемся на вкладку "Грузы"
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
        setError(null);
        setActiveTab("home");
    }
    
    const toggleTheme = () => {
        setTheme(prevTheme => (prevTheme === 'dark' ? 'light' : 'dark'));
    };
    
    // Выбор компонента для рендеринга
    const renderContent = () => {
        if (!auth) {
            return <LoginForm 
                login={login} setLogin={setLogin} 
                password={password} setPassword={setPassword}
                agreeOffer={agreeOffer} setAgreeOffer={setAgreeOffer}
                agreePersonal={agreePersonal} setAgreePersonal={setAgreePersonal}
                loading={loading} error={error}
                showPassword={showPassword} setShowPassword={setShowPassword}
                handleSubmit={handleSubmit}
                // Наша кнопка переключения темы осталась в App, ее тут нет,
                // но в LoginForm ее можно снова вывести
            />;
        }

        // Рендеринг страницы в зависимости от активной вкладки
        switch (activeTab) {
            case 'cargo':
                return <CargoPage auth={auth} />;
            case 'home':
            case 'docs':
            case 'support':
            case 'profile':
            default:
                return <EmptyPage title={activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} />;
        }
    };


    // --------------- РЕНДЕРИНГ ПРИЛОЖЕНИЯ ---------------
    return (
        <div className={`app-container ${theme}-mode`}>
            <GlobalStyles />
            
            {auth ? (
                <>
                    <Header auth={auth} handleLogout={handleLogout} toggleTheme={toggleTheme} isThemeLight={isThemeLight} />
                    <div className="app-main">
                        {renderContent()}
                    </div>
                    <TabBar active={activeTab} onChange={setActiveTab} />
                </>
            ) : (
                <div className="login-form-wrapper">
                    <div className="theme-toggle-container absolute top-4 right-4" style={{position: 'absolute', top: '1rem', right: '1rem', zIndex: 10}}>
                        <button className="theme-toggle-button" onClick={toggleTheme} title="Переключить тему">
                            {isThemeLight ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                        </button>
                    </div>
                    {renderContent()}
                </div>
            )}
            
        </div>
    );
}

// --------------------------------------------------------
// --- ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ (вынесены для чистоты) ---
// --------------------------------------------------------

// Компонент для экрана входа
function LoginForm({
    login, setLogin, password, setPassword,
    agreeOffer, setAgreeOffer, agreePersonal, setAgreePersonal,
    loading, error, showPassword, setShowPassword, handleSubmit
}: any) {
    
    return (
        <div className={`login-card relative`}>
            
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
                    />
                </div>

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

                {/* Переключатели */}
                <label className="checkbox-row">
                    <span>Согласие с <a href="#" target="_blank" rel="noreferrer">публичной офертой</a></span>
                    <div 
                        className={`switch-container ${agreeOffer ? 'checked' : ''}`}
                        onClick={() => setAgreeOffer(!agreeOffer)}
                    >
                        <div className="switch-knob"></div>
                    </div>
                </label>

                <label className="checkbox-row">
                    <span>Согласие на <a href="#" target="_blank" rel="noreferrer">обработку персональных данных</a></span>
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
    );
}

// Компонент для отображения списка грузов
function CargoPage({ auth }: { auth: AuthData }) {
    const [cargoList, setCargoList] = useState<CargoItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [downloading, setDownloading] = useState<string | null>(null); // State для отслеживания скачиваемого груза

    const loadCargo = async () => {
        setError(null);
        setLoading(true);

        try {
            // Запрос на получение грузов (используем ту же рабочую логику авторизации POST Body)
            const res = await fetch(PROXY_API_BASE_URL, { 
                method: "POST", 
                headers: { 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ 
                    login: auth.login, 
                    password: auth.password 
                }),
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Ошибка загрузки грузов (${res.status}): ${errorText.substring(0, 100)}...`);
            }
            
            const data = await res.json();
            
            if (data && Array.isArray(data.Perevozki)) {
                 // Здесь мы просто отображаем первые 10 элементов для теста
                setCargoList(data.Perevozki.slice(0, 10)); 
            } else {
                 setCargoList([]);
                 setError("Неверный формат ответа API.");
            }

        } catch (err: any) {
            setError(err.message || "Не удалось загрузить данные о грузах.");
        } finally {
            setLoading(false);
        }
    };

    // --- ФУНКЦИЯ СКАЧИВАНИЯ ФАЙЛА ---
    const handleDownload = async (cargoNumber: string) => {
        setDownloading(cargoNumber); // Устанавливаем статус скачивания
        setError(null);
        
        try {
            // ЛОГИКА: POST + JSON BODY для прокси-функции файла
            const res = await fetch(FILE_PROXY_API_BASE_URL, { 
                method: "POST", 
                headers: { 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ 
                    login: auth.login, 
                    password: auth.password,
                    metod: 'ЭР', // Параметр из вашего запроса
                    Number: cargoNumber, 
                }),
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Ошибка скачивания файла (${res.status}): ${errorText.substring(0, 100)}...`);
            }
            
            // Получаем заголовки Content-Disposition
            const contentDisposition = res.headers.get('content-disposition') || `attachment; filename="document.pdf"`;
            
            // Получаем бинарные данные
            const blob = await res.blob();
            
            // Создаем URL для скачивания файла
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            // Извлекаем имя файла
            const filenameMatch = contentDisposition.match(/filename="(.+?)"/);
            const filename = filenameMatch ? filenameMatch[1] : `document_${cargoNumber}.pdf`;
            
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            
        } catch (err: any) {
            setError(err.message || "Не удалось загрузить файл.");
        } finally {
            setDownloading(null);
        }
    };


    // Загрузка данных при монтировании компонента
    useEffect(() => {
        loadCargo();
    }, []);

    if (loading && cargoList.length === 0) {
        return <div className="loading-screen"><Loader2 className="animate-spin w-8 h-8 text-theme-primary" /> <p>Загрузка грузов...</p></div>;
    }

    if (error) {
        return (
            <div className="error-screen">
                <AlertTriangle className="w-8 h-8 text-red-500 mb-2" />
                <p className="text-red-500 mb-2">Ошибка при загрузке данных:</p>
                <p className="text-sm text-theme-secondary">{error}</p>
                <button className="button-secondary mt-4" onClick={loadCargo}>
                    <RefreshCw className="w-4 h-4 mr-2" /> Повторить
                </button>
            </div>
        );
    }
    
    if (cargoList.length === 0) {
        return <div className="empty-screen"><p>Нет активных грузов.</p></div>;
    }

    return (
        <div className="cargo-list-container">
             <h2 className="section-title">Активные перевозки ({cargoList.length})</h2>
            {cargoList.map((item, index) => (
                <CargoCard 
                    key={index} 
                    item={item} 
                    onDownloadClick={handleDownload} 
                    isDownloading={downloading === item.Number}
                /> 
            ))}
        </div>
    );
}

// Компонент одной карточки груза
function CargoCard({ item, onDownloadClick, isDownloading }: { item: CargoItem, onDownloadClick: (number: string) => void, isDownloading: boolean }) {
    return (
        <div className="cargo-card">
            <div className="cargo-row main">
                <span className="cargo-value">{item.Number}</span>
                <span className="cargo-value status">{item.Status}</span>
            </div>
            <div className="cargo-row">
                <span className="cargo-label">Дата:</span>
                <span className="cargo-value">{item.Date}</span>
            </div>
            <div className="cargo-row">
                <span className="cargo-label">Откуда:</span>
                <span className="cargo-value">{item.CityFrom}</span>
            </div>
            <div className="cargo-row">
                <span className="cargo-label">Куда:</span>
                <span className="cargo-value">{item.CityTo}</span>
            </div>
            {/* КНОПКА СКАЧИВАНИЯ */}
            <button 
                className="button-download" 
                onClick={() => onDownloadClick(item.Number)}
                disabled={isDownloading}
            >
                {isDownloading ? (
                    <Loader2 className="animate-spin w-4 h-4 mr-2" />
                ) : (
                    <Download className="w-4 h-4 mr-2" />
                )}
                 Скачать ЭР
            </button>
        </div>
    );
}


// Компонент заглушка для остальных вкладок
function EmptyPage({ title }: { title: string }) {
    return (
        <div className="empty-screen">
            <h2 className="text-2xl font-bold text-theme-text mb-2">{title}</h2>
            <p className="text-theme-secondary">Этот раздел будет реализован позже.</p>
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
            <TabButton label="Главная" icon={<Home className="w-5 h-5" />} active={active === "home"} onClick={() => onChange("home")} />
            <TabButton label="Грузы" icon={<Truck className="w-5 h-5" />} active={active === "cargo"} onClick={() => onChange("cargo")} />
            <TabButton label="Документы" icon={<FileText className="w-5 h-5" />} active={active === "docs"} onClick={() => onChange("docs")} />
            <TabButton label="Поддержка" icon={<MessageCircle className="w-5 h-5" />} active={active === "support"} onClick={() => onChange("support")} />
            <TabButton label="Профиль" icon={<User className="w-5 h-5" />} active={active === "profile"} onClick={() => onChange("profile")} />
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
    const activeClass = active ? 'text-theme-primary' : 'text-theme-secondary';
    const hoverClass = 'hover:bg-theme-hover-bg';
    
    return (
        <button
            className={`tab-button flex flex-col items-center justify-center p-2 rounded-lg text-sm font-medium transition-colors ${activeClass} ${hoverClass}`}
            onClick={onClick}
        >
            <span className="tab-icon mb-0.5">{icon}</span>
            <span className="text-xs">{label}</span>
        </button>
    );
}

// ----------------- ШАПКА ПРИЛОЖЕНИЯ (Header) -----------------
function Header({ auth, handleLogout, toggleTheme, isThemeLight }: any) {
    return (
        <header className="app-header">
            <h1 className="header-title">
                <span className="logo-text text-theme-primary" style={{ fontSize: '1.5rem', margin: 0 }}>HAULZ</span>
            </h1>
            <div className="flex items-center space-x-3">
                <span className="text-xs text-theme-secondary hidden sm:inline">{auth.login}</span>
                <button className="theme-toggle-button" onClick={toggleTheme} title="Переключить тему">
                    {isThemeLight ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5 text-yellow-400" />}
                </button>
                <button className="theme-toggle-button" onClick={handleLogout} title="Выйти">
                    <LogOut className="w-5 h-5 text-red-500" />
                </button>
            </div>
        </header>
    );
}


// ----------------- СТИЛИ -----------------
function GlobalStyles() {
    return (
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
                --color-primary-blue: #5b7efc; 
                --color-error-bg: rgba(185, 28, 28, 0.1);
                --color-error-border: #b91c1c;
                --color-error-text: #fca5a5;

                /* Tumbler colors */
                --color-tumbler-bg-off: #6b7280; 
                --color-tumbler-bg-on: #5b7efc;  
                --color-tumbler-knob: white;
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
                --color-error-bg: #fee2e2;
                --color-error-border: #fca5a5;
                --color-error-text: #b91c1c;

                --color-tumbler-bg-off: #ccc;
                --color-tumbler-bg-on: #2563eb;
                --color-tumbler-knob: white;
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

            /* Login screen styles */
            .login-form-wrapper {
                min-height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                padding: 2rem;
                width: 100%;
                position: relative; /* Для позиционирования кнопки темы */
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
                border-radius: 0.75rem;
                transition: all 0.15s;
                outline: none;
            }
            .password-input-container {
                position: relative;
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

            .login-error, .error-screen {
                padding: 0.75rem;
                background-color: var(--color-error-bg);
                border: 1px solid var(--color-error-border);
                color: var(--color-error-text); 
                font-size: 0.875rem;
                border-radius: 0.5rem;
                margin-top: 1rem;
                display: flex;
                align-items: center;
                text-align: left;
            }
            .error-screen {
                flex-direction: column;
                align-items: center;
                text-align: center;
                padding: 1.5rem;
                margin-top: 0;
            }

            /* Switch/Tumbler styles */
            .checkbox-row {
                display: flex;
                align-items: center;
                font-size: 0.9rem; 
                color: var(--color-text-primary); 
                cursor: pointer;
                justify-content: space-between; 
                width: 100%; 
            }
            .checkbox-row a {
                color: var(--color-primary-blue);
                text-decoration: none;
                font-weight: 600;
            }
            .switch-container {
                position: relative;
                width: 2.5rem; 
                height: 1.25rem; 
                border-radius: 9999px;
                transition: background-color 0.2s ease-in-out;
                flex-shrink: 0;
                background-color: var(--color-tumbler-bg-off); 
                cursor: pointer;
            }
            .switch-container.checked {
                background-color: var(--color-tumbler-bg-on); 
            }
            .switch-knob {
                position: absolute;
                top: 0.125rem; 
                left: 0.125rem; 
                width: 1rem; 
                height: 1rem; 
                background-color: var(--color-tumbler-knob);
                border-radius: 9999px;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                transform: translateX(0);
                transition: transform 0.2s ease-in-out;
            }
            .switch-container.checked .switch-knob {
                transform: translateX(1.25rem); 
            }

            /* Header, Main and Buttons */
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
                padding: 1.5rem 1rem 5rem; /* Дополнительный padding снизу для TabBar */
                display: flex;
                flex-direction: column;
                align-items: center;
                width: 100%;
                max-width: 500px; /* Ограничиваем контент для лучшего вида */
                margin: 0 auto;
            }
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
            }
             .button-secondary {
                background-color: var(--color-bg-input);
                color: var(--color-text-primary);
                padding: 0.5rem 1rem;
                border-radius: 0.5rem;
                font-weight: 500;
                border: 1px solid var(--color-border);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            /* TabBar Styles */
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
            }
            .tab-button {
                background: none;
                border: none;
                min-width: 4rem;
                padding: 0.25rem;
            }

            /* Cargo Page Styles */
            .loading-screen, .empty-screen {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 2rem;
                text-align: center;
                color: var(--color-text-secondary);
                font-size: 1rem;
            }
            .section-title {
                font-size: 1.5rem;
                font-weight: 700;
                color: var(--color-text-primary);
                margin-bottom: 1.5rem;
                width: 100%;
                text-align: left;
            }
            .cargo-list-container {
                width: 100%;
            }
            .cargo-card {
                background-color: var(--color-bg-card);
                border: 1px solid var(--color-border);
                border-radius: 0.75rem;
                padding: 1rem;
                margin-bottom: 1rem;
                font-size: 0.9rem;
            }
            .cargo-row {
                display: flex;
                justify-content: space-between;
                padding: 0.2rem 0;
            }
            .cargo-row.main {
                font-weight: 700;
                font-size: 1.1rem;
                margin-bottom: 0.5rem;
                border-bottom: 1px dashed var(--color-border);
                padding-bottom: 0.5rem;
            }
            .cargo-label {
                color: var(--color-text-secondary);
            }
            .cargo-value.status {
                color: var(--color-primary-blue);
            }
            .button-download {
                width: 100%;
                background-color: var(--color-bg-input);
                color: var(--color-text-primary);
                padding: 0.75rem 1rem;
                border-radius: 0.5rem;
                font-weight: 600;
                border: 1px solid var(--color-border);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-top: 1rem;
                transition: background-color 0.15s;
            }
            .button-download:hover:not(:disabled) {
                background-color: var(--color-bg-hover);
            }
            .button-download:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            `}
        </style>
    );
}
