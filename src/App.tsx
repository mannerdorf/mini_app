import { FormEvent, useEffect, useState } from "react";
import { LogOut, Home, Truck, FileText, MessageCircle, User, Loader2, Check, X } from 'lucide-react';

type AuthData = {
    login: string;
    password: string;
};

type Tab = "home" | "cargo" | "docs" | "support" | "profile";

// --- КОНФИГУРАЦИЯ ---
const PROXY_API_URL = '/api/perevozki';
// Используем одну из ранее загруженных картинок для логотипа, если она существует
const LOGO_IMAGE_SRC = "uploaded:image_bf1f8b.png-1fb3a87b-ad4a-425e-8d1d-1fb9052b9d9c";


export default function App() {
    // Используем тестовые данные для удобства, как в предыдущих версиях
    const [login, setLogin] = useState("order@lal-auto.com");
    const [password, setPassword] = useState("ZakaZ656565");
    const [agreeOffer, setAgreeOffer] = useState(false);
    const [agreePersonal, setAgreePersonal] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

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

            // КОРРЕКЦИЯ: Убедимся, что тело запроса соответствует ожидаемому прокси-функцией
            const res = await fetch(PROXY_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login: cleanLogin, password: cleanPassword }),
            });

            if (!res.ok) {
                let message = `Ошибка авторизации: ${res.status}`;
                try {
                    const text = await res.text();
                    // Добавляем детали ошибки от прокси (если есть)
                    if (text && text.length < 200) { 
                        message += ` — ${text}`;
                    } else if (text) {
                        message += ` — ${text.substring(0, 50)}...`;
                    }
                } catch {
                    // ignore
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
    }
    
    const toggleTheme = () => {
        setTheme(prevTheme => (prevTheme === 'dark' ? 'light' : 'dark'));
    };


    // --------------- ЭКРАН АВТОРИЗАЦИИ ---------------
    if (!auth) {
        return (
            <>
            <style jsx="true">{`
                /* Font Inter */
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
                
                body {
                    margin: 0;
                    font-family: 'Inter', sans-serif;
                    transition: background-color 0.3s;
                }
                .dark-mode {
                    --bg-page: #1e293b;
                    --bg-card: #334155;
                    --text-primary: #f1f5f9;
                    --text-secondary: #94a3b8;
                    --border-color: #475569;
                    --color-primary: #3b82f6; /* Blue 500 */
                    --bg-input: #475569;
                    --bg-hover: #475569;
                    --bg-error: #450a0a;
                    --text-error: #fca5a5;
                }
                .light-mode {
                    --bg-page: #f4f7fa;
                    --bg-card: #ffffff;
                    --text-primary: #1e293b;
                    --text-secondary: #64748b;
                    --border-color: #e2e8f0;
                    --color-primary: #1d4ed8; /* Blue 700 */
                    --bg-input: #f8fafc;
                    --bg-hover: #f1f5f9;
                    --bg-error: #fee2e2;
                    --text-error: #b91c1c;
                }
                
                .page {
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 2rem;
                    background-color: var(--bg-page);
                }
                
                .card {
                    background-color: var(--bg-card);
                    padding: 2.5rem 2rem;
                    border-radius: 12px;
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
                    width: 100%;
                    max-width: 400px;
                    transition: all 0.3s ease;
                    border: 1px solid var(--border-color);
                }
                .logo-text {
                    font-size: 2.5rem;
                    font-weight: 900;
                    text-align: center;
                    margin-bottom: 0.5rem;
                    color: var(--color-primary);
                }
                .tagline {
                    text-align: center;
                    margin-bottom: 2rem;
                    color: var(--text-secondary);
                    font-size: 0.9rem;
                }
                .form {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }
                .field-label {
                    font-size: 0.875rem;
                    font-weight: 600;
                    color: var(--text-primary);
                    margin-bottom: 0.3rem;
                }
                .input {
                    width: 100%;
                    padding: 0.75rem 1rem;
                    border-radius: 8px;
                    border: 1px solid var(--border-color);
                    background-color: var(--bg-input);
                    color: var(--text-primary);
                    transition: border-color 0.2s;
                }
                .input:focus {
                    border-color: var(--color-primary);
                    outline: none;
                    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
                }
                .checkbox-row {
                    display: flex;
                    align-items: center;
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                }
                .checkbox-row input[type="checkbox"] {
                    margin-right: 0.6rem;
                    accent-color: var(--color-primary);
                    width: 1rem;
                    height: 1rem;
                }
                .checkbox-row a {
                    color: var(--color-primary);
                    text-decoration: none;
                    font-weight: 600;
                }
                .checkbox-row a:hover {
                    text-decoration: underline;
                }
                .button {
                    padding: 0.8rem 1.5rem;
                    background-color: var(--color-primary);
                    color: white;
                    border-radius: 8px;
                    font-weight: 700;
                    transition: background-color 0.2s;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    border: none;
                    cursor: pointer;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                .button:hover:not(:disabled) {
                    background-color: ${isThemeLight ? '#1e40af' : '#2563eb'};
                }
                .button:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                .error {
                    padding: 0.75rem;
                    background-color: var(--bg-error);
                    color: var(--text-error);
                    border-radius: 8px;
                    font-size: 0.875rem;
                    border: 1px solid ${isThemeLight ? '#fca5a5' : '#7f1d1d'};
                    margin-top: 1rem;
                }
                
                .theme-toggle-container {
                    position: absolute;
                    top: 1rem;
                    right: 1rem;
                }

                .theme-toggle-button {
                    background-color: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 50%;
                    padding: 0.5rem;
                    cursor: pointer;
                    transition: background-color 0.2s;
                }
                .theme-toggle-button:hover {
                    background-color: var(--bg-hover);
                }
                .theme-toggle-button svg {
                    width: 1.25rem;
                    height: 1.25rem;
                    color: var(--text-primary);
                }
            `}</style>
            
            <div className={`page ${theme}-mode`}>
                <div className="theme-toggle-container">
                    <button className="theme-toggle-button" onClick={toggleTheme}>
                        {isThemeLight ? <Moon /> : <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>}
                    </button>
                </div>

                <div className="card">
                    {/* <div className="logo-text">HAULZ</div> */}
                    <div className="flex justify-center mb-4 h-10">
                        <img 
                            src={LOGO_IMAGE_SRC} 
                            alt="HAULZ Logo"
                            className="max-h-full object-contain"
                            onError={(e) => {
                                // Fallback to text if image fails
                                e.currentTarget.onerror = null;
                                e.currentTarget.src = "";
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.parentElement!.innerHTML = '<div class="logo-text">HAULZ</div>';
                            }}
                        />
                    </div>
                    <div className="tagline">
                        Доставка грузов в Калининград и обратно
                    </div>

                    <form onSubmit={handleSubmit} className="form">
                        <div className="field">
                            <div className="field-label">Логин (email)</div>
                            <input
                                className="input"
                                type="text"
                                placeholder="order@lal-auto.com"
                                value={login}
                                onChange={(e) => setLogin(e.target.value)}
                                autoComplete="username"
                            />
                        </div>

                        <div className="field">
                            <div className="field-label">Пароль</div>
                            <input
                                className="input"
                                type="password"
                                placeholder="Введите пароль"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                            />
                        </div>

                        <label className="checkbox-row">
                            <input
                                type="checkbox"
                                checked={agreeOffer}
                                onChange={(e) => setAgreeOffer(e.target.checked)}
                            />
                            <span>
                                Согласие с{" "}
                                <a href="#" target="_blank" rel="noreferrer">
                                    публичной офертой
                                </a>
                            </span>
                        </label>

                        <label className="checkbox-row">
                            <input
                                type="checkbox"
                                checked={agreePersonal}
                                onChange={(e) => setAgreePersonal(e.target.checked)}
                            />
                            <span>
                                Согласие на{" "}
                                <a href="#" target="_blank" rel="noreferrer">
                                    обработку персональных данных
                                </a>
                            </span>
                        </label>

                        <button className="button mt-4" type="submit" disabled={loading}>
                            {loading ? (
                                <Loader2 className="animate-spin w-5 h-5" />
                            ) : (
                                "Подтвердить"
                            )}
                        </button>
                    </form>

                    {error && <p className="error">{error}</p>}
                </div>
            </div>
            </>
        );
    }

    // --------------- АВТОРИЗОВАННАЯ ЧАСТЬ ---------------

    return (
        <div className={`app-shell ${theme}-mode`}>
            <style jsx="true">{`
                /* Общие стили для авторизованной части */
                .app-shell {
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                    width: 100%;
                    max-width: 100vw;
                    background-color: var(--bg-page);
                    position: relative;
                }
                .page-with-tabs {
                    flex-grow: 1;
                    padding: 1rem 1rem 5rem 1rem; /* Отступ для таббара */
                    width: 100%;
                    max-width: 100%;
                    background-color: var(--bg-page);
                }
                .card-content {
                    padding: 1.5rem;
                    max-width: 900px;
                    margin: 0 auto;
                    width: 100%;
                    min-height: calc(100vh - 7rem); /* Учет шапки и таббара */
                }
                .title {
                    font-size: 1.75rem;
                    font-weight: 700;
                    color: var(--text-primary);
                    margin-bottom: 0.5rem;
                }
                .subtitle {
                    font-size: 0.9rem;
                    color: var(--text-secondary);
                    margin-bottom: 1.5rem;
                    border-bottom: 1px solid var(--border-color);
                    padding-bottom: 1rem;
                }

                /* Стили для TabBar */
                .tabbar {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    display: flex;
                    justify-content: space-around;
                    background-color: var(--bg-card);
                    border-top: 1px solid var(--border-color);
                    box-shadow: 0 -4px 10px rgba(0, 0, 0, 0.1);
                    padding: 0.5rem 0;
                    z-index: 50;
                }
                .tab-btn {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 0.4rem 0.2rem;
                    background: none;
                    border: none;
                    cursor: pointer;
                    transition: color 0.2s, background-color 0.2s;
                    color: var(--text-secondary);
                    font-size: 0.7rem;
                    font-weight: 600;
                    border-radius: 8px;
                    margin: 0 0.2rem;
                    max-width: 80px;
                }
                .tab-btn:hover {
                    background-color: var(--bg-hover);
                }
                .tab-btn-active {
                    color: var(--color-primary);
                }
                .tab-icon {
                    font-size: 1.25rem;
                    margin-bottom: 0.1rem;
                }

                /* Стили для CargoPage */
                .cargo-list {
                    display: grid;
                    gap: 1.5rem;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                }
                .cargo-card {
                    background-color: var(--bg-input); /* Светлее, чем основной фон */
                    border-radius: 12px;
                    padding: 1rem;
                    border: 1px solid var(--border-color);
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
                    transition: transform 0.2s;
                }
                .cargo-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                }
                .cargo-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 0.4rem 0;
                    border-bottom: 1px dashed var(--border-color);
                    font-size: 0.9rem;
                }
                .cargo-row:last-child {
                    border-bottom: none;
                }
                .cargo-label {
                    color: var(--text-secondary);
                    font-weight: 400;
                    flex-shrink: 0;
                    padding-right: 1rem;
                }
                .cargo-value {
                    color: var(--text-primary);
                    font-weight: 600;
                    text-align: right;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .cargo-row.main .cargo-value {
                    font-size: 1.1rem;
                    font-weight: 700;
                    color: var(--color-primary);
                }
                
                /* Дополнительные стили для мобильных устройств */
                @media (max-width: 640px) {
                    .tabbar {
                        padding: 0.3rem 0;
                    }
                    .tab-btn {
                        font-size: 0.65rem;
                    }
                    .page-with-tabs {
                        padding: 1rem 0.5rem 5rem 0.5rem;
                    }
                    .card-content {
                        padding: 1rem;
                    }
                }

            `}</style>
            
            <header className="flex justify-between items-center bg-zinc-800 p-4 border-b border-zinc-700 sticky top-0 z-20">
                <h1 className="text-xl font-bold text-white">
                    <span className="text-blue-400">HAULZ</span>
                </h1>
                <div className="flex items-center space-x-3">
                    <button className="text-white p-2 rounded-full hover:bg-zinc-700" onClick={handleLogout} title="Выйти">
                        <LogOut className="w-5 h-5 text-red-400" />
                    </button>
                    <button className="text-white p-2 rounded-full hover:bg-zinc-700" onClick={toggleTheme} title="Переключить тему">
                        {isThemeLight ? <Moon className="w-5 h-5 text-gray-700" /> : <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-sun w-5 h-5 text-yellow-400"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>}
                    </button>
                </div>
            </header>

            <div className="page page-with-tabs">
                <div className="card card-content">
                    {activeTab === "cargo" && <CargoPage auth={auth} isThemeLight={isThemeLight} />}
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

// ----------------- КОМПОНЕНТ С ГРУЗАМИ -----------------

type CargoPageProps = { 
    auth: AuthData; 
    isThemeLight: boolean;
};

function CargoPage({ auth, isThemeLight }: CargoPageProps) {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Функция для форматирования даты из формата YYYY-MM-DD (если доступно)
    const formatDate = (dateString: string | undefined): string => {
        if (!dateString) return '-';
        try {
            // Предполагаем, что API возвращает дату в формате YYYY-MM-DD
            const [year, month, day] = dateString.split('-');
            if (year && month && day) {
                return `${day}.${month}.${year}`;
            }
            // Попытка парсинга стандартными средствами
            const date = new Date(dateString);
            if (!isNaN(date.getTime())) {
                 return date.toLocaleDateString('ru-RU');
            }
        } catch (e) {
            return dateString; // Вернуть как есть, если не удалось распарсить
        }
        return dateString;
    };
    
    // Функция для форматирования суммы
    const formatCurrency = (value: number | string | undefined): string => {
        if (value === undefined || value === null || value === "") return '-';
        const num = typeof value === 'string' ? parseFloat(value) : value;
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

            try {
                // ПОВТОРНЫЙ ВЫЗОВ ПРОКСИ-ФУНКЦИИ
                const res = await fetch(PROXY_API_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        login: auth.login.trim(),
                        password: auth.password.trim(),
                        // Можно добавить dateFrom и dateTo здесь, если нужно фильтровать
                    }),
                });

                if (!res.ok) {
                    let message = `Ошибка загрузки: ${res.status}`;
                    try {
                        const text = await res.text();
                        if (text && text.length < 200) { 
                            message += ` — ${text}`;
                        } else if (text) {
                            message += ` — ${text.substring(0, 50)}...`;
                        }
                    } catch {}
                    if (!cancelled) setError(message);
                    return;
                }

                const data = await res.json();
                
                // Проверяем, в каком виде пришли данные: массив или объект с ключом
                const list = Array.isArray(data) ? data : data.Perevozki || data.items || [];
                
                if (!cancelled) setItems(list);

            } catch (e: any) {
                if (!cancelled) setError(e?.message || "Ошибка сети при загрузке данных.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();

        return () => {
            cancelled = true;
        };
    }, [auth.login, auth.password]);

    // Иконки для CargoPage
    const getIcon = (tab: keyof any) => {
        switch (tab) {
            case 'Number': return <span className="text-xl">#</span>;
            case 'State': return <Check className="w-4 h-4" />;
            case 'DatePr': return <Truck className="w-4 h-4" />;
            case 'Mest': return <FileText className="w-4 h-4" />;
            case 'PW': return <span className="text-sm font-extrabold">W</span>;
            case 'Sum': return <span className="text-sm font-extrabold">₽</span>;
            default: return null;
        }
    }


    return (
        <div>
            <h2 className="title text-3xl">Мои перевозки</h2>
            <p className="subtitle">
                Здесь отображаются все перевозки, полученные из системы.
            </p>

            {loading && <p className="flex items-center text-lg text-yellow-500"><Loader2 className="animate-spin mr-2 w-5 h-5" /> Загружаем данные...</p>}
            
            {error && <p className="error flex items-center"><X className="w-5 h-5 mr-2" />{error}</p>}

            {!loading && !error && items.length === 0 && (
                <div className="p-8 bg-gray-600/50 rounded-lg text-center text-white/70">
                    <Truck className="w-12 h-12 mx-auto mb-3" />
                    <p className="text-lg font-semibold">Перевозок не найдено</p>
                    <p className="text-sm">Попробуйте проверить логин/пароль или изменить период (если доступен).</p>
                </div>
            )}

            <div className="cargo-list">
                {items.map((item, idx) => {
                    // Используем разные ключи, чтобы быть гибкими к формату API
                    const number = item.Nomer || item.Number || item.number || "-";
                    const status = item.Status || item.State || item.state || "-";
                    const date = formatDate(item.DatePrih || item.DatePr || item.datePr);
                    const mest = item.Mest || item.mest || "-";
                    const weight = item.PW || item.Weight || "-";
                    const sum = formatCurrency(item.Sum || item.Total);

                    return (
                        <div className="cargo-card" key={idx}>
                            <div className="cargo-row main">
                                <span className="cargo-label">№</span>
                                <span className="cargo-value">{number}</span>
                            </div>

                            <div className="cargo-row">
                                <span className="cargo-label flex items-center"><Check className="w-4 h-4 mr-1 text-green-400" /> Статус</span>
                                <span className="cargo-value">{status}</span>
                            </div>

                            <div className="cargo-row">
                                <span className="cargo-label flex items-center"><Truck className="w-4 h-4 mr-1 text-blue-400" /> Дата прибытия</span>
                                <span className="cargo-value">{date}</span>
                            </div>
                            
                            {/* <div className="cargo-row">
                                <span className="cargo-label">Мест</span>
                                <span className="cargo-value">{mest}</span>
                            </div> */}

                            <div className="cargo-row">
                                <span className="cargo-label flex items-center"><span className="text-sm font-extrabold mr-1">W</span> Вес, кг</span>
                                <span className="cargo-value">{weight}</span>
                            </div>

                            <div className="cargo-row">
                                <span className="cargo-label flex items-center"><span className="text-sm font-extrabold mr-1">₽</span> Сумма</span>
                                <span className="cargo-value font-bold text-lg text-yellow-400">{sum}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ----------------- ЗАГЛУШКИ ДЛЯ ДРУГИХ ВКЛАДОК -----------------

function StubPage({ title }: { title: string }) {
    return (
        <div>
            <h2 className="title text-3xl">{title}</h2>
            <p className="subtitle">Этот раздел мы заполним позже.</p>
            <div className="p-8 bg-gray-600/50 rounded-lg text-center text-white/70">
                <FileText className="w-12 h-12 mx-auto mb-3" />
                <p className="text-lg font-semibold">В разработке</p>
                <p className="text-sm">Возвращайтесь позже, чтобы увидеть {title.toLowerCase()}.</p>
            </div>
        </div>
    );
}

// ----------------- НИЖНЕЕ МЕНЮ -----------------

type TabBarProps = {
    active: Tab;
    onChange: (t: Tab) => void;
};

function TabBar({ active, onChange }: TabBarProps) {
    return (
        <div className="tabbar">
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
            className={`tab-btn ${active ? "tab-btn-active" : ""}`}
            onClick={onClick}
        >
            <span className="tab-icon">{icon}</span>
            <span className="tab-label">{label}</span>
        </button>
    );
}
