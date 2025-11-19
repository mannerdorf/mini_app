import React, { FormEvent, useState } from "react";
import { Home, Package, FileText, User, LogIn, Loader2, Check } from 'lucide-react';

// --- КОНСТАНТЫ ПРИЛОЖЕНИЯ ---
// Акцентный цвет (Telegram Blue)
const PRIMARY_COLOR = '#2D5BFF';

/* ------------------------------------------------------
        HOOK: useLocalAuth (Имитация аутентификации)
------------------------------------------------------ */
const useLocalAuth = () => {
    // В чисто клиентском приложении "готовность" наступает сразу.
    const isReady = true; 
    // Локальная симуляция UID (оставим для внутренней логики, но не для отображения)
    const userId = "LOCAL-SIMULATED-USER-ID"; 

    return { userId, isReady };
};


/* ------------------------------------------------------
        HOOK: useTelegram (упрощено)
------------------------------------------------------ */
const useTelegram = () => {
    // Используем window.Telegram.WebApp, если доступно
    return { tg: typeof window !== 'undefined' ? window.Telegram?.WebApp : null };
};

// --- КОМПОНЕНТЫ И UI ---

/**
 * Custom Button Component
 */
const PrimaryButton = ({ children, loading, ...props }) => (
    <button
        type="submit"
        className={`w-full py-3 rounded-xl font-semibold text-white transition duration-300 flex items-center justify-center 
            ${loading ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`}
        style={{ backgroundColor: PRIMARY_COLOR, boxShadow: '0 4px 15px rgba(45, 91, 255, 0.4)' }}
        disabled={loading}
        {...props}
    >
        {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : children}
    </button>
);

/**
 * ToggleSwitch Component (Бегунок)
 */
const ToggleSwitch = ({ label, checked, onChange }) => (
    <label className="flex items-center justify-between text-gray-700 cursor-pointer">
        <span className="text-sm">{label}</span>
        <div 
            onClick={() => onChange(!checked)}
            className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-300 ${
                checked ? 'bg-[' + PRIMARY_COLOR + ']' : 'bg-gray-300'
            }`}
            style={{ backgroundColor: checked ? PRIMARY_COLOR : '#d1d5db' }}
        >
            <div 
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${
                    checked ? 'translate-x-4' : 'translate-x-0'
                }`}
            />
        </div>
    </label>
);


/**
 * TabBar (Таббар)
 */
function TabBar({ active, onChange }) {
    const items = [
        { id: "home", label: "Главная", Icon: Home },
        { id: "cargo", label: "Грузы", Icon: Package },
        { id: "docs", label: "Документы", Icon: FileText },
        { id: "profile", label: "Профиль", Icon: User },
    ];

    return (
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto flex bg-white border-t border-gray-200 shadow-2xl p-2 z-10">
            {items.map((i) => (
                <div
                    key={i.id}
                    onClick={() => onChange(i.id)}
                    className={`flex-1 text-center cursor-pointer p-1 transition-colors duration-200 
                        ${active === i.id 
                            ? 'text-[' + PRIMARY_COLOR + '] font-bold transform scale-105' 
                            : 'text-gray-500 hover:text-gray-700'}`
                    }
                >
                    <i.Icon className="h-6 w-6 mx-auto mb-1" />
                    <div className="text-xs font-medium">{i.label}</div>
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

    const [login, setLogin] = useState("");
    const [password, setPassword] = useState("");
    const [agreeOffer, setAgreeOffer] = useState(false);
    const [agreePersonal, setAgreePersonal] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Локальное состояние для хранения авторизационных данных (имитация сессии)
    const [authData, setAuthData] = useState(null); 
    const [activeTab, setActiveTab] = useState("cargo");
    
    // В чисто клиентском режиме проверка сессии не нужна
    const sessionChecked = true; 

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

            // ИМИТАЦИЯ успешной авторизации 
            await new Promise((res) => setTimeout(res, 500)); 
            
            // Сохранение данных в локальном состоянии
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
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                <div className="ml-3 text-gray-600 font-medium">Загрузка...</div>
            </div>
        );
    }

    if (!authData) {
        // --- Экран Аутентификации (Улучшенный дизайн с тумблерами) ---
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
                <div className="w-full max-w-sm bg-white p-8 rounded-3xl shadow-2xl transition duration-500">
                    <div className="text-center mb-8">
                        <LogIn className={`h-10 w-10 mx-auto mb-2`} style={{ color: PRIMARY_COLOR }} />
                        <h1 className="text-4xl font-extrabold" style={{ color: PRIMARY_COLOR }}>HAULZ</h1>
                        <p className="text-sm text-gray-500 mt-1">Вход в систему для партнеров</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <input
                            placeholder="Email"
                            type="email"
                            className="w-full p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-300 focus:border-blue-500 transition duration-200 bg-gray-50 text-gray-800 shadow-inner"
                            value={login}
                            onChange={(e) => setLogin(e.target.value)}
                        />

                        <input
                            type="password"
                            placeholder="Пароль"
                            className="w-full p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-300 focus:border-blue-500 transition duration-200 bg-gray-50 text-gray-800 shadow-inner"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />

                        <div className="space-y-4 pt-2">
                            {/* Заменен чекбокс на тумблер (бегунок) */}
                            <ToggleSwitch
                                label="Согласие с офертой"
                                checked={agreeOffer}
                                onChange={setAgreeOffer}
                            />

                            {/* Заменен чекбокс на тумблер (бегунок) */}
                            <ToggleSwitch
                                label="Обработка персональных данных"
                                checked={agreePersonal}
                                onChange={setAgreePersonal}
                            />
                        </div>

                        <PrimaryButton loading={loading}>
                            Войти
                        </PrimaryButton>
                    </form>

                    {error && (
                        <div className="mt-6 p-4 bg-red-50 border border-red-300 text-red-700 rounded-xl text-center text-sm shadow-md">
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
        const baseCardStyle = "p-6 rounded-2xl shadow-lg mt-4 transition-all duration-300 transform hover:scale-[1.01] flex flex-col items-center text-center";
        
        const cardData = {
            home: {
                title: "Главная страница",
                desc: "Здесь будет дашборд, ключевые метрики и общая информация.",
                Icon: Home,
                style: "bg-white border-b-4 border-gray-300",
            },
            cargo: {
                title: "Управление грузами",
                desc: "Рабочая область для создания, редактирования и отслеживания заказов.",
                Icon: Package,
                style: `bg-white border-b-4 border-green-500`,
            },
            docs: {
                title: "Документы",
                desc: "Электронный документооборот: счета, накладные, акты.",
                Icon: FileText,
                style: "bg-white border-b-4 border-yellow-500",
            },
            profile: {
                title: "Профиль",
                desc: `Настройки и личные данные пользователя **${authData.login}**.`,
                Icon: User,
                style: "bg-white border-b-4 border-indigo-500",
            },
        };

        const currentCard = cardData[activeTab];

        return (
            <div className={`${baseCardStyle} ${currentCard.style}`}>
                <currentCard.Icon className={`h-10 w-10 mb-3`} style={{ color: PRIMARY_COLOR }} />
                <h3 className="text-xl font-bold text-gray-800">{currentCard.title}</h3>
                <p className="text-gray-600 mt-2 text-sm">{currentCard.desc}</p>
            </div>
        );
    }
    
    return (
        <div className="p-4 sm:p-6 bg-gray-100 min-h-screen pb-24 max-w-md mx-auto">
            <header className="text-center mb-8 p-6 bg-white rounded-2xl shadow-xl">
                <div className="flex items-center justify-center text-green-600 mb-2">
                    <Check className="h-6 w-6 mr-2" />
                    <p className="font-semibold text-lg">Авторизация успешна</p>
                </div>
                <h2 className="text-2xl font-bold text-gray-800">Добро пожаловать, {authData.login}</h2>
            </header>
            
            {renderContent()}

            <div className="h-4" /> 

            <TabBar active={activeTab} onChange={setActiveTab} />
        </div>
    );
}

export default App;
