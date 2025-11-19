import React, { useState, useEffect } from "react";
import { Home, Package, FileText, User, LogIn, Loader2, Check, Moon, Sun } from 'lucide-react';

// --- КОНСТАНТЫ И ЦВЕТА ---
const PRIMARY_COLOR = '#2D5BFF';
const DANGER_COLOR = '#ef4444'; // Red
const SUCCESS_COLOR = '#10b981'; // Green

// Определение цветовых схем для светлой и темной тем
const LIGHT_THEME = {
    BACKGROUND: '#f3f4f6',      // Светло-серый фон
    CARD_BG: 'white',           // Белый фон карточек
    TEXT: '#1f2937',            // Темный текст
    SECONDARY_TEXT: '#6b7280',   // Серый вторичный текст
    BORDER: '#e5e7eb',           // Светлая граница
    SHADOW: 'rgba(0, 0, 0, 0.1)',
};

const DARK_THEME = {
    BACKGROUND: '#1f2937',      // Темный фон
    CARD_BG: '#374151',           // Темно-серый фон карточек
    TEXT: 'white',              // Белый текст
    SECONDARY_TEXT: '#9ca3af',   // Светло-серый вторичный текст
    BORDER: '#4b5563',           // Темная граница
    SHADOW: 'rgba(255, 255, 255, 0.1)',
};

/* ------------------------------------------------------
        HOOK: usePrefersColorScheme (Проверка системных настроек)
------------------------------------------------------ */
const usePrefersColorScheme = () => {
    // Проверяем, поддерживает ли браузер медиа-запросы prefers-color-scheme
    if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false; // По умолчанию светлая тема, если не можем определить
};

/* ------------------------------------------------------
        HOOK: useLocalAuth (Имитация аутентификации)
------------------------------------------------------ */
const useLocalAuth = () => {
    const isReady = true; 
    const userId = "LOCAL-SIMULATED-USER-ID"; 
    return { userId, isReady };
};


/* ------------------------------------------------------
        HOOK: useTelegram (упрощено)
------------------------------------------------------ */
const useTelegram = () => {
    return { tg: typeof window !== 'undefined' ? window.Telegram?.WebApp : null };
};

// --- КОМПОНЕНТЫ И UI ---

/**
 * Custom Button Component
 */
const PrimaryButton = ({ children, loading, ...props }) => (
    <button
        type="submit"
        style={{ 
            width: '100%', 
            padding: '12px 0', 
            borderRadius: '12px', 
            fontWeight: '600', 
            color: 'white', 
            backgroundColor: PRIMARY_COLOR, 
            transition: 'opacity 0.3s', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            boxShadow: '0 4px 15px rgba(45, 91, 255, 0.4)',
            opacity: loading ? 0.7 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
            border: 'none',
        }}
        disabled={loading}
        {...props}
    >
        {loading ? <Loader2 style={{ height: '20px', width: '20px', animation: 'spin 1s linear infinite', marginRight: '8px' }} /> : children}
    </button>
);

/**
 * ToggleSwitch Component (Изящный бегунок Солнце/Луна)
 * @param {boolean} checked - true для Dark Mode (Луна)
 * @param {function} onChange - функция переключения
 * @param {object} theme - текущая тема
 */
const ToggleSwitch = ({ checked, onChange, theme }) => {
    // Размеры иконки и тумблера
    const iconSize = '14px';
    const switchHeight = '28px';
    const switchWidth = '52px';
    const handleSize = '20px'; // Размер ручки
    const padding = '4px';

    return (
        <div 
            onClick={() => onChange(!checked)}
            style={{ 
                width: switchWidth, 
                height: switchHeight, 
                display: 'flex', 
                alignItems: 'center', 
                borderRadius: '9999px', 
                padding: padding, 
                transition: 'background-color 0.3s',
                cursor: 'pointer',
                // Цвет фона тумблера: синий в темном режиме, серый в светлом
                backgroundColor: checked ? PRIMARY_COLOR : theme.BORDER, 
                position: 'relative',
                boxShadow: `inset 0 1px 3px ${theme.SHADOW}`
            }}
        >
            {/* Иконка Солнца (Дневной режим) */}
            <Sun 
                style={{
                    position: 'absolute',
                    left: `calc(100% - ${handleSize} - 6px)`, // Справа
                    height: iconSize,
                    width: iconSize,
                    color: 'white',
                    transition: 'opacity 0.3s, transform 0.3s',
                    opacity: checked ? 0 : 1,
                    transform: checked ? 'scale(0.8)' : 'scale(1)',
                    pointerEvents: 'none',
                }}
            />

            {/* Иконка Луны (Ночной режим) */}
            <Moon 
                style={{
                    position: 'absolute',
                    left: '6px', // Слева
                    height: iconSize,
                    width: iconSize,
                    color: '#fcd34d', // Желтая луна
                    transition: 'opacity 0.3s, transform 0.3s',
                    opacity: checked ? 1 : 0,
                    transform: checked ? 'scale(1)' : 'scale(0.8)',
                    pointerEvents: 'none',
                }}
            />

            {/* Ручка (белый кружок) */}
            <div 
                style={{ 
                    backgroundColor: 'white', 
                    width: handleSize, 
                    height: handleSize, 
                    borderRadius: '9999px', 
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    // Сдвигаем ручку вправо, если checked (темный режим)
                    transform: checked ? `translateX(calc(${switchWidth} - ${handleSize} - (2 * ${padding})))` : 'translateX(0)', 
                    transition: 'transform 0.3s',
                    position: 'relative', // Для z-index
                    zIndex: 2,
                }}
            />
        </div>
    );
};


/**
 * TabBar (Таббар)
 */
function TabBar({ active, onChange, theme }) {
    const items = [
        { id: "home", label: "Главная", Icon: Home },
        { id: "cargo", label: "Грузы", Icon: Package },
        { id: "docs", label: "Документы", Icon: FileText },
        { id: "profile", label: "Профиль", Icon: User },
    ];

    return (
        <div style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            maxWidth: '448px', 
            margin: '0 auto',
            display: 'flex',
            backgroundColor: theme.CARD_BG,
            borderTop: `1px solid ${theme.BORDER}`,
            boxShadow: '0 -10px 20px rgba(0,0,0,0.1)', 
            padding: '8px',
            zIndex: 10,
        }}>
            {items.map((i) => (
                <div
                    key={i.id}
                    onClick={() => onChange(i.id)}
                    style={{
                        flex: 1,
                        textAlign: 'center',
                        cursor: 'pointer',
                        padding: '4px',
                        transition: 'color 0.2s, transform 0.2s',
                        color: active === i.id ? PRIMARY_COLOR : theme.SECONDARY_TEXT, 
                        fontWeight: active === i.id ? 'bold' : 'normal',
                        transform: active === i.id ? 'scale(1.05)' : 'scale(1)',
                    }}
                >
                    <i.Icon style={{ height: '24px', width: '24px', margin: '0 auto 4px' }} />
                    <div style={{ fontSize: '12px', fontWeight: '500' }}>{i.label}</div>
                </div>
            ))}
        </div>
    );
}

/**
 * App Component
 */
function App() {
    const { tg } = useTelegram();
    const { userId, isReady } = useLocalAuth(); 
    
    // Инициализация режима на основе системных настроек и localStorage
    const prefersDark = usePrefersColorScheme();
    const [isDarkMode, setIsDarkMode] = useState(() => {
        const savedMode = localStorage.getItem('isDarkMode');
        if (savedMode !== null) {
            return JSON.parse(savedMode);
        }
        return prefersDark;
    });
    
    // Сохраняем выбор темы в localStorage
    useEffect(() => {
        localStorage.setItem('isDarkMode', JSON.stringify(isDarkMode));
    }, [isDarkMode]);

    const theme = isDarkMode ? DARK_THEME : LIGHT_THEME;

    const [login, setLogin] = useState("order@lal-auto.com"); 
    const [password, setPassword] = useState("password"); 
    const [agreeOffer, setAgreeOffer] = useState(false);
    const [agreePersonal, setAgreePersonal] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const [authData, setAuthData] = useState(null); 
    const [activeTab, setActiveTab] = useState("cargo");
    const sessionChecked = true; 
    
    // Глобальные стили для body
    useEffect(() => {
        document.body.style.margin = '0';
        document.body.style.padding = '0';
        document.body.style.boxSizing = 'border-box';
    }, []);

    // Обработчик входа в систему (полностью локальная логика)
    const handleSubmit = async (e) => {
        e.preventDefault();

        setError(null);

        const cleanLogin = login.trim();
        const cleanPassword = password.trim();

        if (!cleanLogin || !cleanPassword) {
            setError("Введите логин и пароль");
            return;
        }

        if (!agreeOffer || !agreePersonal) {
            setError("Необходимо согласие со всеми условиями");
            return;
        }

        try {
            setLoading(true);
            await new Promise((res) => setTimeout(res, 500)); 
            
            setAuthData({ 
                isLoggedIn: true,
                login: cleanLogin, 
            }); 
            
            setActiveTab("cargo");
        } catch (err) {
            console.error("Auth process error:", err);
            setError("Ошибка авторизации. Проверьте консоль.");
        } finally {
            setLoading(false);
        }
    };


    /* ------------------------------------------------------
              Рендер: Экраны
    ------------------------------------------------------ */
    if (!isReady || !sessionChecked) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: theme.BACKGROUND }}>
                <Loader2 style={{ height: '32px', width: '32px', color: PRIMARY_COLOR, animation: 'spin 1s linear infinite' }} />
                <div style={{ marginLeft: '12px', color: theme.SECONDARY_TEXT, fontWeight: '500' }}>Загрузка...</div>
            </div>
        );
    }

    if (!authData) {
        // --- Экран Аутентификации ---
        return (
            <div style={{ 
                minHeight: '100vh', 
                backgroundColor: theme.BACKGROUND, 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center', 
                justifyContent: 'center', 
                padding: '16px',
                transition: 'background-color 0.3s',
            }}>
                <div style={{ 
                    width: '100%', 
                    maxWidth: '384px', 
                    backgroundColor: theme.CARD_BG, 
                    padding: '32px', 
                    borderRadius: '24px', 
                    boxShadow: `0 20px 25px -5px ${theme.SHADOW}`,
                    transition: 'all 0.5s',
                    color: theme.TEXT,
                    position: 'relative' // Для позиционирования тумблера
                }}>
                    
                    {/* Тумблер для переключения темы (Справа вверху) */}
                    <div style={{ position: 'absolute', top: '24px', right: '24px' }}>
                        <ToggleSwitch
                            checked={isDarkMode}
                            onChange={setIsDarkMode}
                            theme={theme}
                        />
                    </div>

                    <div style={{ textAlign: 'center', marginBottom: '32px', marginTop: '32px' }}> {/* Добавляем отступ сверху, чтобы не закрывать тумблером */}
                        <LogIn style={{ height: '40px', width: '40px', margin: '0 auto 8px', color: PRIMARY_COLOR }} />
                        <h1 style={{ fontSize: '36px', fontWeight: '800', color: PRIMARY_COLOR }}>HAULZ</h1>
                        <p style={{ fontSize: '14px', color: theme.SECONDARY_TEXT, marginTop: '4px' }}>Вход в систему для партнеров</p>
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* Поле для Email */}
                        <div>
                            <input
                                placeholder="Email"
                                type="email"
                                style={{
                                    boxSizing: 'border-box',
                                    width: '100%',
                                    padding: '16px',
                                    border: `1px solid ${theme.BORDER}`,
                                    borderRadius: '12px',
                                    transition: 'all 0.2s',
                                    backgroundColor: theme.BACKGROUND,
                                    color: theme.TEXT,
                                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)',
                                }}
                                onFocus={(e) => { e.target.style.border = `1px solid ${PRIMARY_COLOR}`; e.target.style.boxShadow = `0 0 0 3px rgba(45, 91, 255, 0.3)`; }}
                                onBlur={(e) => { e.target.style.border = `1px solid ${theme.BORDER}`; e.target.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.06)'; }}
                                value={login}
                                onChange={(e) => setLogin(e.target.value)}
                            />
                        </div>

                        {/* Поле для Пароля */}
                        <div>
                            <input
                                type="password"
                                placeholder="Пароль"
                                style={{
                                    boxSizing: 'border-box',
                                    width: '100%',
                                    padding: '16px',
                                    border: `1px solid ${theme.BORDER}`,
                                    borderRadius: '12px',
                                    transition: 'all 0.2s',
                                    backgroundColor: theme.BACKGROUND,
                                    color: theme.TEXT,
                                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)',
                                }}
                                onFocus={(e) => { e.target.style.border = `1px solid ${PRIMARY_COLOR}`; e.target.style.boxShadow = `0 0 0 3px rgba(45, 91, 255, 0.3)`; }}
                                onBlur={(e) => { e.target.style.border = `1px solid ${theme.BORDER}`; e.target.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.06)'; }}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>

                        {/* Согласия */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '8px' }}>
                            {/* Используем обычный чекбокс для согласий, т.к. ToggleSwitch без текста выглядит тут странно */}
                            <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem', color: theme.SECONDARY_TEXT, cursor: 'pointer' }}>
                                <input 
                                    type="checkbox" 
                                    checked={agreeOffer}
                                    onChange={(e) => setAgreeOffer(e.target.checked)}
                                    style={{ marginRight: '8px', accentColor: PRIMARY_COLOR, width: '16px', height: '16px' }}
                                />
                                Согласие с офертой
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem', color: theme.SECONDARY_TEXT, cursor: 'pointer' }}>
                                <input 
                                    type="checkbox" 
                                    checked={agreePersonal}
                                    onChange={(e) => setAgreePersonal(e.target.checked)}
                                    style={{ marginRight: '8px', accentColor: PRIMARY_COLOR, width: '16px', height: '16px' }}
                                />
                                Обработка персональных данных
                            </label>
                        </div>

                        <PrimaryButton loading={loading}>
                            Войти
                        </PrimaryButton>
                    </form>

                    {error && (
                        <div style={{
                            marginTop: '24px',
                            padding: '16px',
                            backgroundColor: '#fee2e2', 
                            border: `1px solid #fca5a5`, 
                            color: DANGER_COLOR, 
                            borderRadius: '12px',
                            textAlign: 'center',
                            fontSize: '14px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        }}>
                            {error}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    /* ------------------------------------------------------
              Рендер: АВТОРИЗОВАННЫЙ ИНТЕРФЕЙС
    ------------------------------------------------------ */
    
    // В зависимости от активной вкладки отображаем содержимое
    const renderContent = () => {
        const baseCardStyle = {
            padding: '24px',
            borderRadius: '16px',
            boxShadow: `0 4px 6px -1px ${theme.SHADOW}, 0 2px 4px -1px ${theme.SHADOW}`, 
            marginTop: '16px',
            transition: 'all 0.3s',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            backgroundColor: theme.CARD_BG,
        };
        
        const cardData = {
            home: {
                title: "Главная страница",
                desc: "Здесь будет дашборд, ключевые метрики и общая информация.",
                Icon: Home,
                borderColor: theme.SECONDARY_TEXT, 
            },
            cargo: {
                title: "Управление грузами",
                desc: "Рабочая область для создания, редактирования и отслеживания заказов.",
                Icon: Package,
                borderColor: SUCCESS_COLOR, 
            },
            docs: {
                title: "Документы",
                desc: "Электронный документооборот: счета, накладные, акты.",
                Icon: FileText,
                borderColor: '#f59e0b', // Желтый
            },
            profile: {
                title: "Профиль",
                desc: `Настройки и личные данные пользователя **${authData.login}**.`,
                Icon: User,
                borderColor: '#6366f1', // Индиго
            },
        };

        const currentCard = cardData[activeTab];

        return (
            <div style={{
                ...baseCardStyle, 
                borderBottom: `4px solid ${currentCard.borderColor}`,
                color: theme.TEXT,
            }}>
                <currentCard.Icon style={{ height: '40px', width: '40px', marginBottom: '12px', color: PRIMARY_COLOR }} />
                <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: theme.TEXT }}>{currentCard.title}</h3>
                <p style={{ color: theme.SECONDARY_TEXT, marginTop: '8px', fontSize: '14px' }}>{currentCard.desc}</p>
            </div>
        );
    }
    
    return (
        <div style={{ 
            padding: '16px', 
            backgroundColor: theme.BACKGROUND, 
            minHeight: '100vh', 
            paddingBottom: '96px', 
            maxWidth: '448px', 
            margin: '0 auto',
            transition: 'background-color 0.3s',
            color: theme.TEXT,
        }}>
            <header style={{ textAlign: 'center', marginBottom: '32px', padding: '24px', backgroundColor: theme.CARD_BG, borderRadius: '16px', boxShadow: `0 10px 15px -3px ${theme.SHADOW}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: SUCCESS_COLOR, marginBottom: '8px' }}>
                    <Check style={{ height: '24px', width: '24px', marginRight: '8px' }} />
                    <p style={{ fontWeight: '600', fontSize: '18px' }}>Авторизация успешна</p>
                </div>
                <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: theme.TEXT }}>Добро пожаловать, {authData.login}</h2>
            </header>
            
            {/* Тумблер для переключения темы (на авторизованном экране) */}
            <div style={{ 
                display: 'flex',
                justifyContent: 'flex-end', // Выравнивание по правому краю
                marginBottom: '16px'
            }}>
                <ToggleSwitch
                    checked={isDarkMode}
                    onChange={setIsDarkMode}
                    theme={theme}
                />
            </div>

            {renderContent()}

            <div style={{ height: '16px' }} /> 

            <TabBar active={activeTab} onChange={setActiveTab} theme={theme} />
        </div>
    );
}

export default App;
