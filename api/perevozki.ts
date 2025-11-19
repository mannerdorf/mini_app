import React, { useState, useEffect } from "react";
// Добавляем иконку для отображения статуса в списке
import { Home, Package, FileText, User, LogIn, Loader2, Check, Moon, Sun, Clock, Truck, XCircle } from 'lucide-react';

// --- КОНСТАНТЫ И ЦВЕТА (Сохраняем чистые цвета) ---
const PRIMARY_COLOR = '#3B82F6'; // Синий акцент
const DANGER_COLOR = '#ef4444'; // Red
const SUCCESS_COLOR = '#10b981'; // Green
const WARNING_COLOR = '#f59e0b'; // Amber/Yellow
const INFO_COLOR = '#6366f1'; // Indigo/Purple

// Определение цветовых схем для светлой и темной тем
const LIGHT_THEME = {
    BACKGROUND: '#f9fafb',      
    CARD_BG: 'white',           
    TEXT: '#1f2937',            
    SECONDARY_TEXT: '#6b7280',   
    BORDER: '#e5e7eb',           
    SHADOW: 'rgba(0, 0, 0, 0.05)', 
};

const DARK_THEME = {
    BACKGROUND: '#111827',      
    CARD_BG: '#1f2937',           
    TEXT: 'white',              
    SECONDARY_TEXT: '#9ca3af',   
    BORDER: '#374151',           
    SHADOW: 'rgba(255, 255, 255, 0.05)',
};

// --- API КОНСТАНТЫ ---
// URL для имитации API (в реальном приложении это будет адрес вашего сервера 1С/TS)
const CARGO_API_URL = 'https://api.haulz.com/v1/perevozki/ts/shipments';

// --- ОСНОВНЫЕ СТИЛИ (Применяем шрифт Inter) ---
const globalAppStyle = {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
    transition: 'background-color 0.3s, color 0.3s',
};

/* ------------------------------------------------------
        HOOK: usePrefersColorScheme (Проверка системных настроек)
------------------------------------------------------ */
const usePrefersColorScheme = () => {
    if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
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
            padding: '14px 0', 
            borderRadius: '12px', 
            fontWeight: '600', 
            color: 'white', 
            backgroundColor: PRIMARY_COLOR, 
            transition: 'opacity 0.3s, transform 0.1s', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            boxShadow: '0 6px 15px rgba(59, 130, 246, 0.3)', 
            opacity: loading ? 0.8 : 1,
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
 * LabeledSwitch Component (Бегунок для полей с текстом, например, согласия)
 */
const LabeledSwitch = ({ label, checked, onChange, theme }) => {
    const switchHeight = '24px';
    const switchWidth = '44px';
    const handleSize = '16px';
    const padding = '4px';

    return (
        <label 
            style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                cursor: 'pointer',
                width: '100%', 
                fontSize: '0.9rem', 
                fontWeight: checked ? '500' : '400',
                color: checked ? PRIMARY_COLOR : theme.SECONDARY_TEXT, 
                transition: 'color 0.3s'
            }}
        >
            <span style={{ display: 'flex', alignItems: 'center' }}>
                {label}
            </span>
            
            <div 
                onClick={(e) => { e.preventDefault(); onChange(!checked); }}
                style={{ 
                    width: switchWidth, 
                    height: switchHeight, 
                    display: 'flex', 
                    alignItems: 'center', 
                    borderRadius: '9999px', 
                    padding: padding, 
                    transition: 'background-color 0.3s',
                    backgroundColor: checked ? PRIMARY_COLOR : theme.BORDER, 
                    flexShrink: 0,
                    boxShadow: checked ? 'none' : `inset 0 1px 2px ${theme.SHADOW}`,
                }}
            >
                <div 
                    style={{ 
                        backgroundColor: 'white', 
                        width: handleSize, 
                        height: handleSize, 
                        borderRadius: '9999px', 
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        transform: checked ? `translateX(calc(${switchWidth} - ${handleSize} - (2 * ${padding})))` : 'translateX(0)', 
                        transition: 'transform 0.3s',
                    }}
                />
            </div>
        </label>
    );
};


/**
 * ThemeToggle Component (Изящный бегунок Солнце/Луна для темы)
 */
const ThemeToggle = ({ checked, onChange, theme }) => {
    const iconSize = '14px';
    const switchHeight = '28px';
    const switchWidth = '52px';
    const handleSize = '20px';
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
                backgroundColor: checked ? PRIMARY_COLOR : theme.BORDER, 
                position: 'relative',
                boxShadow: `inset 0 1px 3px ${theme.SHADOW}`
            }}
        >
            <Sun 
                style={{
                    position: 'absolute',
                    left: `calc(100% - ${handleSize} - 6px)`,
                    height: iconSize,
                    width: iconSize,
                    color: 'white',
                    transition: 'opacity 0.3s, transform 0.3s',
                    opacity: checked ? 0 : 1,
                    transform: checked ? 'scale(0.8)' : 'scale(1)',
                    pointerEvents: 'none',
                }}
            />

            <Moon 
                style={{
                    position: 'absolute',
                    left: '6px', 
                    height: iconSize,
                    width: iconSize,
                    color: '#fcd34d', 
                    transition: 'opacity 0.3s, transform 0.3s',
                    opacity: checked ? 1 : 0,
                    transform: checked ? 'scale(1)' : 'scale(0.8)',
                    pointerEvents: 'none',
                }}
            />

            <div 
                style={{ 
                    backgroundColor: 'white', 
                    width: handleSize, 
                    height: handleSize, 
                    borderRadius: '9999px', 
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    transform: checked ? `translateX(calc(${switchWidth} - ${handleSize} - (2 * ${padding})))` : 'translateX(0)', 
                    transition: 'transform 0.3s',
                    position: 'relative', 
                    zIndex: 2,
                }}
            />
        </div>
    );
};


/**
 * TabBar (Таббар) - Использует линейные иконки lucide-react
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
            boxShadow: `0 -4px 10px ${theme.SHADOW}`, 
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
                        fontWeight: active === i.id ? '600' : '400',
                        transform: active === i.id ? 'scale(1.05)' : 'scale(1)',
                    }}
                >
                    <i.Icon style={{ height: '24px', width: '24px', margin: '0 auto 4px', strokeWidth: active === i.id ? 2.5 : 2 }} />
                    <div style={{ fontSize: '11px', fontWeight: '500' }}>{i.label}</div>
                </div>
            ))}
        </div>
    );
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ДАННЫХ ---

const getStatusIcon = (status, color) => {
    const defaultStyle = { height: '18px', width: '18px', marginRight: '8px', strokeWidth: 2.5 };
    switch (status) {
        case 'in_transit':
            return <Truck style={{ ...defaultStyle, color }} />;
        case 'delivered':
            return <Check style={{ ...defaultStyle, color }} />;
        case 'pending':
            return <Clock style={{ ...defaultStyle, color }} />;
        case 'cancelled':
            return <XCircle style={{ ...defaultStyle, color }} />;
        default:
            return <Package style={{ ...defaultStyle, color }} />;
    }
};

/**
 * Маппинг статусов из API-формата (например, 1С) в формат UI
 */
const mapStatus = (apiStatus) => {
    switch (apiStatus) {
        case 'IN_TRANSIT':
            return { status: 'in_transit', statusText: 'В пути', statusColor: INFO_COLOR };
        case 'DELIVERED':
            return { status: 'delivered', statusText: 'Доставлен', statusColor: SUCCESS_COLOR };
        case 'PENDING':
            return { status: 'pending', statusText: 'Ожидает отправки', statusColor: WARNING_COLOR };
        case 'CANCELLED':
            return { status: 'cancelled', statusText: 'Отменен', statusColor: DANGER_COLOR };
        default:
            return { status: 'unknown', statusText: 'Неизвестно', statusColor: '#94a3b8' }; // Серый
    }
};

/**
 * Преобразование ответа API в объект, пригодный для отображения в списке
 */
const mapApiToCargo = (shipment) => {
    const statusInfo = mapStatus(shipment.current_status);
    return {
        id: shipment.order_id,
        ...statusInfo,
        route: `${shipment.origin} — ${shipment.destination}`,
        date: shipment.shipment_date,
        weight: shipment.load_weight,
    };
};

// --- КОМПОНЕНТЫ СПИСКА ГРУЗОВ ---

const CargoListItem = ({ cargo, theme }) => {
    return (
        <div style={{
            backgroundColor: theme.CARD_BG,
            padding: '16px',
            borderRadius: '12px',
            border: `1px solid ${theme.BORDER}`,
            marginBottom: '12px',
            boxShadow: `0 1px 3px ${theme.SHADOW}`,
            cursor: 'pointer',
            transition: 'transform 0.1s, box-shadow 0.1s',
            // Имитация эффекта наведения/нажатия
            ':hover': { transform: 'translateY(-2px)', boxShadow: `0 4px 6px ${theme.SHADOW}` },
        }}>
            {/* Заголовок и статус */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: cargo.statusColor }}>
                    Заказ #{cargo.id}
                </h4>
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    fontSize: '0.8rem', 
                    fontWeight: '600',
                    color: cargo.statusColor,
                    backgroundColor: `${cargo.statusColor}20`, 
                    padding: '4px 8px',
                    borderRadius: '8px',
                    border: `1px solid ${cargo.statusColor}50`
                }}>
                    {getStatusIcon(cargo.status, cargo.statusColor)}
                    {cargo.statusText}
                </div>
            </div>

            {/* Маршрут */}
            <div style={{ display: 'flex', alignItems: 'center', color: theme.TEXT, marginBottom: '8px', fontWeight: '500' }}>
                <Package style={{ height: '16px', width: '16px', marginRight: '8px', color: PRIMARY_COLOR, strokeWidth: 1.5 }} />
                <span style={{ fontSize: '0.9rem' }}>{cargo.route}</span>
            </div>

            {/* Дата и вес */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: theme.SECONDARY_TEXT, paddingTop: '4px', borderTop: `1px dashed ${theme.BORDER}` }}>
                <span>Дата: **{cargo.date}**</span>
                <span>Вес: **{cargo.weight}**</span>
            </div>
        </div>
    );
};

// --- ГЛАВНЫЙ КОМПОНЕНТ: CargoScreen (Экран грузов) ---

const CargoScreen = ({ theme }) => {
    const [cargoData, setCargoData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    // Имитация данных, которые придут от API
    const getSimulatedApiResponse = () => ({
        shipments: [
            { order_id: 'A7893', current_status: 'IN_TRANSIT', origin: 'Москва', destination: 'Санкт-Петербург', shipment_date: '20.11.2025', load_weight: '2.5 т' },
            { order_id: 'B1011', current_status: 'DELIVERED', origin: 'Казань', destination: 'Самара', shipment_date: '18.11.2025', load_weight: '0.8 т' },
            { order_id: 'C1213', current_status: 'PENDING', origin: 'Екатеринбург', destination: 'Пермь', shipment_date: '21.11.2025', load_weight: '5.1 т' },
            { order_id: 'D1415', current_status: 'CANCELLED', origin: 'Сочи', destination: 'Краснодар', shipment_date: '15.11.2025', load_weight: '1.2 т' },
            { order_id: 'E1516', current_status: 'IN_TRANSIT', origin: 'Уфа', destination: 'Тюмень', shipment_date: '22.11.2025', load_weight: '1.9 т' },
        ]
    });

    const fetchCargo = async (retryCount = 0) => {
        setLoading(true);
        setError(null);
        
        try {
            // В реальном приложении: const response = await fetch(CARGO_API_URL, { headers: { 'Authorization': 'Bearer ' + userToken } });
            
            // --- ИМИТАЦИЯ ЗАПРОСА С ЭКСПОНЕНЦИАЛЬНЫМ ОТКАТОМ ---
            await new Promise(resolve => setTimeout(resolve, 500)); // Имитация задержки сети
            
            // Имитация успешного ответа
            const data = getSimulatedApiResponse();

            // Проверка и маппинг данных
            if (data && Array.isArray(data.shipments)) {
                const mappedData = data.shipments.map(mapApiToCargo);
                setCargoData(mappedData);
            } else {
                throw new Error("Неверный формат данных от API");
            }
        } catch (err) {
            console.error("Ошибка API (Перевозки):", err.message);
            
            if (retryCount < 3) {
                const delay = Math.pow(2, retryCount) * 1000;
                console.log(`Повторная попытка через ${delay / 1000}с...`);
                // Используем экспоненциальный откат
                await new Promise(resolve => setTimeout(resolve, delay));
                await fetchCargo(retryCount + 1); // Рекурсивный вызов с увеличением счетчика
            } else {
                setError("Не удалось загрузить данные о перевозках после нескольких попыток.");
            }
        } finally {
            if (retryCount === 0) { // Устанавливаем false только после первой попытки (или последнего ретрая)
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        fetchCargo();
    }, []); // Запускаем загрузку при монтировании

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '40px', color: PRIMARY_COLOR }}>
                <Loader2 style={{ height: '32px', width: '32px', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                <p style={{ fontWeight: '500' }}>Загрузка данных о перевозках из API...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ textAlign: 'center', padding: '40px', color: DANGER_COLOR }}>
                <XCircle style={{ height: '32px', width: '32px', margin: '0 auto 12px' }} />
                <p style={{ fontWeight: '500' }}>{error}</p>
                <button 
                    onClick={() => fetchCargo()}
                    style={{
                        padding: '8px 16px',
                        marginTop: '12px',
                        backgroundColor: PRIMARY_COLOR,
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: '600'
                    }}
                >
                    Повторить загрузку
                </button>
            </div>
        );
    }
    
    // Сортировка данных: сначала активные (В пути, Ожидает), затем завершенные/отмененные по дате
    const sortedCargo = [...cargoData].sort((a, b) => {
        const statusOrder = { 'in_transit': 1, 'pending': 2, 'delivered': 3, 'cancelled': 4 };
        if (statusOrder[a.status] !== statusOrder[b.status]) {
            return statusOrder[a.status] - statusOrder[b.status];
        }
        // Сортировка по дате (обратная: новые вверху)
        const dateA = new Date(a.date.split('.').reverse().join('-'));
        const dateB = new Date(b.date.split('.').reverse().join('-'));
        return dateB - dateA;
    });


    return (
        <div style={{ padding: '0 16px', marginTop: '24px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: theme.TEXT, marginBottom: '20px' }}>
                Активные Грузы <span style={{ color: PRIMARY_COLOR }}>({sortedCargo.filter(c => c.status === 'in_transit' || c.status === 'pending').length})</span>
            </h2>

            {sortedCargo.length === 0 ? (
                 <div style={{ textAlign: 'center', padding: '40px', color: theme.SECONDARY_TEXT }}>
                    <Package style={{ height: '32px', width: '32px', margin: '0 auto 12px' }} />
                    <p style={{ fontWeight: '500' }}>На данный момент нет активных перевозок.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {sortedCargo.map(cargo => (
                        <CargoListItem key={cargo.id} cargo={cargo} theme={theme} />
                    ))}
                </div>
            )}
        </div>
    );
};

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
        document.body.style.backgroundColor = theme.BACKGROUND; 
        document.body.style.fontFamily = globalAppStyle.fontFamily; 
    }, [theme.BACKGROUND, theme.TEXT]);

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
            <div style={{ ...globalAppStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: theme.BACKGROUND }}>
                <Loader2 style={{ height: '32px', width: '32px', color: PRIMARY_COLOR, animation: 'spin 1s linear infinite' }} />
                <div style={{ marginLeft: '12px', color: theme.SECONDARY_TEXT, fontWeight: '500' }}>Загрузка...</div>
            </div>
        );
    }

    if (!authData) {
        // --- Экран Аутентификации (без изменений) ---
        return (
            <div style={{ 
                ...globalAppStyle,
                minHeight: '100vh', 
                backgroundColor: theme.BACKGROUND, 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center', 
                justifyContent: 'center', 
                padding: '16px',
            }}>
                <div style={{ 
                    width: '100%', 
                    maxWidth: '384px', 
                    backgroundColor: theme.CARD_BG, 
                    padding: '32px', 
                    borderRadius: '24px', 
                    boxShadow: `0 10px 15px -3px ${theme.SHADOW}, 0 4px 6px -2px ${theme.SHADOW}`,
                    transition: 'all 0.5s',
                    color: theme.TEXT,
                    position: 'relative'
                }}>
                    
                    <div style={{ position: 'absolute', top: '24px', right: '24px' }}>
                        <ThemeToggle
                            checked={isDarkMode}
                            onChange={setIsDarkMode}
                            theme={theme}
                        />
                    </div>

                    <div style={{ textAlign: 'center', marginBottom: '32px', marginTop: '32px' }}>
                        <LogIn style={{ height: '40px', width: '40px', margin: '0 auto 8px', color: PRIMARY_COLOR, strokeWidth: 2 }} /> 
                        <h1 style={{ fontSize: '36px', fontWeight: '800', color: theme.TEXT }}>HAULZ</h1>
                        <p style={{ fontSize: '14px', color: theme.SECONDARY_TEXT, marginTop: '4px' }}>Вход в систему для партнеров</p>
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
                                    fontWeight: '500',
                                }}
                                onFocus={(e) => { e.target.style.border = `1px solid ${PRIMARY_COLOR}`; e.target.style.boxShadow = `0 0 0 3px rgba(59, 130, 246, 0.2)`; }}
                                onBlur={(e) => { e.target.style.border = `1px solid ${theme.BORDER}`; e.target.style.boxShadow = 'none'; }}
                                value={login}
                                onChange={(e) => setLogin(e.target.value)}
                            />
                        </div>

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
                                    fontWeight: '500',
                                }}
                                onFocus={(e) => { e.target.style.border = `1px solid ${PRIMARY_COLOR}`; e.target.style.boxShadow = `0 0 0 3px rgba(59, 130, 246, 0.2)`; }}
                                onBlur={(e) => { e.target.style.border = `1px solid ${theme.BORDER}`; e.target.style.boxShadow = 'none'; }}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '8px', color: theme.SECONDARY_TEXT }}>
                            <LabeledSwitch
                                label="Согласие с офертой"
                                checked={agreeOffer}
                                onChange={setAgreeOffer}
                                theme={theme}
                            />

                            <LabeledSwitch
                                label="Обработка персональных данных"
                                checked={agreePersonal}
                                onChange={setAgreePersonal}
                                theme={theme}
                            />
                        </div>

                        <PrimaryButton loading={loading}>
                            Войти
                        </PrimaryButton>
                    </form>

                    {error && (
                        <div style={{
                            marginTop: '24px',
                            padding: '16px',
                            backgroundColor: isDarkMode ? '#fee2e220' : '#fee2e2', 
                            border: `1px solid #fca5a5`, 
                            color: DANGER_COLOR, 
                            borderRadius: '12px',
                            textAlign: 'center',
                            fontSize: '14px',
                            fontWeight: '500',
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
    
    const renderContent = () => {
        if (activeTab === 'cargo') {
            return <CargoScreen theme={theme} />;
        }
        
        const baseCardStyle = {
            padding: '24px',
            borderRadius: '16px',
            border: `1px solid ${theme.BORDER}`, 
            boxShadow: `0 1px 3px ${theme.SHADOW}`, 
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
                accentColor: theme.SECONDARY_TEXT, 
            },
            docs: {
                title: "Документы",
                desc: "Электронный документооборот: счета, накладные, акты.",
                Icon: FileText,
                accentColor: WARNING_COLOR, 
            },
            profile: {
                title: "Профиль",
                desc: `Настройки и личные данные пользователя **${authData.login}**.`,
                Icon: User,
                accentColor: INFO_COLOR, 
            },
        };

        const currentCard = cardData[activeTab];

        return (
            <div style={{
                ...baseCardStyle, 
                borderLeft: `4px solid ${currentCard.accentColor}`, 
                color: theme.TEXT,
                margin: '0 16px', 
            }}>
                <currentCard.Icon style={{ height: '40px', width: '40px', marginBottom: '12px', color: currentCard.accentColor, strokeWidth: 2 }} />
                <h3 style={{ fontSize: '20px', fontWeight: '600', color: theme.TEXT }}>{currentCard.title}</h3>
                <p style={{ color: theme.SECONDARY_TEXT, marginTop: '8px', fontSize: '14px', fontWeight: '400' }}>{currentCard.desc}</p>
            </div>
        );
    }
    
    return (
        <div style={{ 
            ...globalAppStyle,
            backgroundColor: theme.BACKGROUND, 
            minHeight: '100vh', 
            paddingBottom: '96px', 
            maxWidth: '448px', 
            margin: '0 auto',
            color: theme.TEXT,
        }}>
            <header style={{ 
                textAlign: 'center', 
                marginBottom: '32px', 
                padding: '24px', 
                backgroundColor: theme.CARD_BG, 
                borderRadius: '0 0 16px 16px', 
                borderBottom: `1px solid ${theme.BORDER}`, 
                boxShadow: `0 4px 6px ${theme.SHADOW}` 
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: SUCCESS_COLOR, marginBottom: '8px' }}>
                    <Check style={{ height: '24px', width: '24px', marginRight: '8px', strokeWidth: 2 }} />
                    <p style={{ fontWeight: '600', fontSize: '18px' }}>Авторизация успешна</p>
                </div>
                <h2 style={{ fontSize: '24px', fontWeight: '700', color: theme.TEXT }}>Добро пожаловать, {authData.login}</h2>
            </header>
            
            <div style={{ 
                display: 'flex',
                justifyContent: 'flex-end',
                marginBottom: '16px',
                paddingRight: '16px', 
            }}>
                <ThemeToggle
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
