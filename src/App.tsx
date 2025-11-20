import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, getDoc, doc, setDoc, collection, onSnapshot, query, addDoc, serverTimestamp } from 'firebase/firestore';
import { 
    Loader2, LogOut, Truck, Sun, Moon,
    MapPin, DollarSign, Calendar, Volume2, Mic, 
    LogIn, Check, X, Info
} from 'lucide-react';

// --- API CONFIGURATION ---
const API_URL = 'https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki?DateB=2024-01-01&DateE=2026-01-01';
// Базовый заголовок авторизации для API
const API_AUTH_BASIC = 'Basic YWRtaW46anVlYmZueWU='; 
const LLM_API_KEY = ""; 
const LLM_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${LLM_API_KEY}`;
const TTS_API_KEY = "";
const TTS_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${TTS_API_KEY}`;


// --- FIREBASE SETUP (Опционально) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const dummyFirebaseConfig = { apiKey: "dummy", authDomain: "dummy", projectId: "dummy" };
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : dummyFirebaseConfig;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Используем contentFetchId для доступа к загруженному PNG файлу логотипа
const LOGO_IMAGE_SRC = "uploaded:image_bf1f8b.png-1fb3a87b-ad4a-425e-8d1d-1fb9052b9d9c";


// ==========================================
// --- AUDIO & DATA UTILITIES ---
// ==========================================

// Функции для конвертации PCM аудиоданных из API в формат WAV для воспроизведения
const pcmToWav = (pcmData, sampleRate = 24000) => {
    const numChannels = 1;
    const bytesPerSample = 2; 
    const buffer = new ArrayBuffer(44 + pcmData.byteLength);
    const view = new DataView(buffer);
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmData.byteLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeString(view, 36, 'data');
    view.setUint32(40, pcmData.byteLength, true);
    const pcmArray = new Int16Array(buffer, 44);
    pcmArray.set(new Int16Array(pcmData));
    return new Blob([buffer], { type: 'audio/wav' });
};

const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
};

const base64ToArrayBuffer = (base64) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};


// ==========================================
// --- UI COMPONENTS ---
// ==========================================

const LabeledSwitch = ({ label, isChecked, onToggle, isThemeSwitch = false }) => {
    return (
        <div 
            className={`flex items-center justify-between cursor-pointer p-2 rounded transition-colors ${isThemeSwitch ? 'theme-switch-wrapper' : 'login-switch-wrapper'}`}
            onClick={onToggle}
        >
            <div className={`text-sm font-medium select-none ${isThemeSwitch ? 'text-theme-primary' : 'text-theme-text'}`}>
                {label}
            </div>
            <div className={`switch-container ${isChecked ? 'checked' : ''}`}>
                <div className="switch-knob"></div>
            </div>
        </div>
    );
};

// Компонент строки таблицы
const TableRow = ({ label, value, icon, isThemeLight }) => (
    <div className="flex items-start space-x-3 p-3 border-b border-theme-border last:border-b-0">
        <div className={`flex-shrink-0 mt-0.5 ${isThemeLight ? 'text-blue-600' : 'text-blue-400'}`}>
            {icon}
        </div>
        <div className="flex-grow min-w-0">
            <p className="text-xs font-medium text-theme-secondary uppercase">{label}</p>
            {/* Используем whitespace-nowrap для предотвращения переноса длинных значений */}
            <p className="text-sm font-semibold text-theme-text whitespace-nowrap overflow-hidden text-ellipsis">{value || 'N/A'}</p> 
        </div>
    </div>
);

const IconButton = ({ children, onClick, disabled, className = '', label = '' }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`p-2 rounded-full transition-colors relative group ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-theme-hover-bg'} ${className}`}
        aria-label={label}
    >
        {children}
    </button>
);


// ==========================================
// --- COMPONENT: TableDisplay ---
// ==========================================
const TableDisplay = ({ data, loading, summary, generateSummary, isThemeLight }) => {
    const [ttsLoading, setTtsLoading] = useState({});
    const [ttsError, setTtsError] = useState(null);

    // Функция для генерации и воспроизведения аудио сводки по перевозке
    const generateAndPlayTTS = async (item, index) => {
        setTtsLoading(prev => ({ ...prev, [index]: true }));
        setTtsError(null);
        
        const dateString = item.Date ? new Date(item.Date).toLocaleDateString() : 'Неизвестна';
        const promptText = `Перевозка ${item.Nomer || item.ID}. Маршрут ${item.FromPoint || item.AdresOtgruzki} из ${item.ToPoint || item.AdresDostavki}. Дата ${dateString}. Статус: ${item.Status}. Сумма ${item.Summa ? item.Summa.toLocaleString('ru-RU') : 'ноль'} рублей.`;

        const payload = {
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
            model: "gemini-2.5-flash-preview-tts"
        }};
        
        try {
            const response = await fetch(TTS_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`TTS Error: ${response.status}`);

            const result = await response.json();
            const audioData = result?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

            if (audioData) {
                const pcmData = base64ToArrayBuffer(audioData);
                const wavBlob = pcmToWav(pcmData);
                const url = URL.createObjectURL(wavBlob);
                const audio = new Audio(url);
                audio.play();
                // Освобождаем URL после окончания воспроизведения
                audio.onended = () => URL.revokeObjectURL(url);
            } else {
                 throw new Error("Не удалось получить аудиоданные.");
            }
        } catch (e) {
            console.error(e);
            setTtsError("Ошибка озвучивания");
        } finally {
            setTtsLoading(prev => ({ ...prev, [index]: false }));
        }
    };

    if (loading) return <div className="flex justify-center p-10"><Loader2 className={`w-8 h-8 ${isThemeLight ? 'text-blue-600' : 'text-blue-500'} animate-spin`} /></div>;
    
    if (!data || data.length === 0) return (
        <div className="empty-state-card">
            <Truck className={`w-16 h-16 mb-4 ${isThemeLight ? 'text-gray-400' : 'text-gray-500'}`} />
            <p className="text-xl font-semibold text-theme-text mb-2">Перевозки не найдены</p>
            <p className="text-theme-secondary text-sm">Проверьте, правильно ли указан диапазон дат и доступы API.</p>
        </div>
    );

    return (
        <div className="pb-20 w-full max-w-4xl mx-auto">
             {ttsError && <div className="status-message error"><Volume2 className="w-5 h-5 mr-2" /> {ttsError}</div>}
             
             {/* AI Summary Block */}
             <div className="ai-summary-card">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-bold text-theme-text flex items-center">
                        <Mic className={`w-5 h-5 mr-2 ${isThemeLight ? 'text-purple-600' : 'text-purple-400'}`} />
                        AI Аналитика
                    </h3>
                    <button 
                        onClick={generateSummary}
                        disabled={summary.loading}
                        className="button-primary-sm"
                    >
                        {summary.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Обновить анализ'}
                    </button>
                </div>
                {summary.text ? (
                    <p className="text-sm text-theme-text p-3 rounded-lg whitespace-pre-line ai-text-bg">{summary.text}</p>
                ) : (
                    <p className="text-sm text-theme-secondary p-3 rounded-lg ai-text-bg">Нажмите "Обновить анализ", чтобы получить сводку данных о перевозках с помощью AI.</p>
                )}
            </div>

            {/* List */}
            <div className="grid-container">
                {data.map((item, index) => (
                    <div key={index} className="perevozka-card">
                        <div className="card-header">
                            <span className={`font-bold ${isThemeLight ? 'text-blue-600' : 'text-blue-400'} text-lg`}>{item.Nomer || item.ID}</span>
                            <IconButton 
                                onClick={() => generateAndPlayTTS(item, index)}
                                disabled={ttsLoading[index]}
                                label="Озвучить информацию о перевозке"
                            >
                                {ttsLoading[index] ? <Loader2 className={`w-4 h-4 animate-spin ${isThemeLight ? 'text-purple-600' : 'text-purple-400'}`} /> : <Volume2 className="w-5 h-5 text-theme-secondary" />}
                            </IconButton>
                        </div>
                        <div className="card-body-details">
                            {/* Маршрут */}
                            <TableRow 
                                label="Маршрут" 
                                value={`${item.FromPoint || item.AdresOtgruzki} → ${item.ToPoint || item.AdresDostavki}`} 
                                icon={<MapPin className="w-4 h-4" />} 
                                isThemeLight={isThemeLight}
                            />
                            {/* Дата */}
                            <TableRow 
                                label="Дата" 
                                value={item.Date ? new Date(item.Date).toLocaleDateString() : 'N/A'} 
                                icon={<Calendar className="w-4 h-4" />} 
                                isThemeLight={isThemeLight}
                            />
                            {/* Сумма */}
                            <TableRow 
                                label="Сумма" 
                                value={`${item.Summa ? item.Summa.toLocaleString('ru-RU') : '0'} ₽`} 
                                icon={<DollarSign className="w-4 h-4" />} 
                                isThemeLight={isThemeLight}
                            />
                            {/* Статус */}
                            <TableRow 
                                label="Статус" 
                                value={item.Status} 
                                icon={<Check className="w-4 h-4" />} 
                                isThemeLight={isThemeLight}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};


// ==========================================
// --- MAIN COMPONENT: App ---
// ==========================================
export default function App() {
    const [loginEmail, setLoginEmail] = useState('order@lal-auto.com');
    const [loginPassword, setLoginPassword] = useState('ZakaZ656565');
    const [isOfferAccepted, setIsOfferAccepted] = useState(false);
    const [isDataProcessed, setIsDataProcessed] = useState(false);
    
    // Состояние для темы: 'dark' или 'light'
    const [theme, setTheme] = useState('dark'); 
    const isThemeLight = theme === 'light';

    const [perevozki, setPerevozki] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loginError, setLoginError] = useState(null);
    const [view, setView] = useState('login'); 
    const [summary, setSummary] = useState({ text: '', loading: false });

    const [userId, setUserId] = useState(null);
    const [db, setDb] = useState(null); 

    // Инициализация Firebase/Auth (для получения userId)
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            setDb(getFirestore(app));
            const auth = getAuth(app);
            onAuthStateChanged(auth, async (user) => {
                if (!user) {
                    if (initialAuthToken) await signInWithCustomToken(auth, initialAuthToken);
                    else await signInAnonymously(auth);
                } else {
                    setUserId(user.uid);
                }
            });
        } catch (e) { console.log('Firebase/Auth init (optional) skipped or failed'); }
    }, []);

    // --- API FETCH (Строгий режим: вход только при успешном API) ---
    const fetchPerevozki = useCallback(async () => {
        setLoading(true);
        setLoginError(null); 
        
        // Создаем заголовок авторизации из введенных данных
        const authHeaderValue = `Basic ${btoa(`${loginEmail}:${loginPassword}`)}`;
        
        try {
            let response = await fetch(API_URL, {
                method: 'GET', 
                headers: {
                    'Auth': authHeaderValue, 
                    'Authorization': API_AUTH_BASIC, // Дополнительный заголовок API
                },
            });

            // Повторная попытка с POST, если GET не разрешен
            if (response.status === 405) {
                console.warn("GET method not allowed (405), retrying with POST...");
                response = await fetch(API_URL, {
                    method: 'POST',
                    headers: {
                        'Auth': authHeaderValue,
                        'Authorization': API_AUTH_BASIC,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({})
                });
            }

            if (!response.ok) {
                 // Ошибка API (например, 401 Unauthorized)
                 let errorText = await response.text();
                 throw new Error(`Ошибка подключения: ${response.status} ${response.statusText}. Проверьте логин/пароль и доступы. Подробности: ${errorText.substring(0, 100)}...`);
            }

            const data = await response.json();
            const result = data.Perevozki || data;

            if (Array.isArray(result)) {
                setPerevozki(result);
                setView('perevozki'); // Успешный вход
            } else {
                throw new Error("Некорректный формат данных от API. Ожидался массив.");
            }
        } catch (e) {
            // При любой ошибке
            setLoginError(e.message);
            setPerevozki(null); 
            setView('login');  
        } finally {
            setLoading(false);
        }
    }, [loginEmail, loginPassword]);

    // --- AI Summary ---
    const generateSummary = async () => {
        if (!perevozki || perevozki.length === 0) return;
        setSummary({ ...summary, loading: true });
        try {
            const prompt = `Проанализируй следующие данные о перевозках и дай краткую сводку на русском языке, не более 50 слов. Выдели ключевую информацию, например, общую сумму и статусы. Данные: ${JSON.stringify(perevozki.slice(0, 5))}.`;
            const response = await fetch(LLM_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            if (!response.ok) throw new Error(`LLM API Error: ${response.status}`);

            const data = await response.json();
            setSummary({ text: data.candidates?.[0]?.content?.parts?.[0]?.text || "Не удалось сгенерировать анализ.", loading: false });
        } catch (e) {
            console.error("AI Summary Error:", e);
            setSummary({ text: "Ошибка при обращении к AI сервису.", loading: false });
        }
    };

    // --- HANDLERS ---
    const handleLogin = (e) => {
        e.preventDefault();
        setLoginError(null);
        if (!isOfferAccepted || !isDataProcessed) {
            setLoginError("Необходимо принять все условия для входа.");
            return;
        }
        fetchPerevozki(); 
    };

    const handleLogout = () => {
        setPerevozki(null);
        setSummary({ text: '', loading: false });
        setLoginError(null);
        setView('login');
    };

    const toggleTheme = () => {
        setTheme(prevTheme => (prevTheme === 'dark' ? 'light' : 'dark'));
    };

    // --- RENDER ---
    return (
        // Устанавливаем класс для темы
        <div className={`app-container ${theme}-mode`}> 
            {/* Header */}
            <header className="app-header">
                <div className="header-title">
                    <Truck className="header-icon" />
                    <h1 className="text-xl font-bold tracking-wide text-theme-text">HAULZ</h1>
                </div>
                <div className='flex items-center space-x-3'>
                    {/* Кнопка переключения темы */}
                    <IconButton onClick={toggleTheme} label="Переключить тему">
                        {isThemeLight ? <Moon className="w-5 h-5 text-gray-700" /> : <Sun className="w-5 h-5 text-yellow-400" />}
                    </IconButton>

                    {view === 'perevozki' && (
                        <IconButton onClick={handleLogout} label="Выйти">
                            <LogOut className="w-5 h-5 text-theme-secondary" />
                        </IconButton>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <main className="app-main">
                <div className="w-full max-w-5xl">
                    {view === 'login' ? (
                        <div className="login-card">
                            <div className="text-center mb-8">
                                {/* Блок для логотипа, который вы запросили */}
                                <div className="login-icon-container-logo">
                                    <img 
                                        src={LOGO_IMAGE_SRC}
                                        alt="HAULZ Logo"
                                        className="login-logo-image" 
                                        // Заглушка на случай, если файл не загрузится
                                        onError={(e) => {
                                            e.target.onerror = null;
                                            e.target.src = "https://placehold.co/100x40/3b82f6/ffffff?text=HAULZ+Logo";
                                            e.target.className = "w-24 h-10 object-contain mx-auto";
                                        }}
                                    />
                                </div>
                                <h2 className="text-2xl font-bold text-theme-text">Вход в систему</h2>
                                <p className="text-theme-secondary text-sm mt-1">Для партнеров</p>
                            </div>

                            <form onSubmit={handleLogin} className="space-y-4">
                                <div>
                                    <input 
                                        type="text" 
                                        value={loginEmail} 
                                        onChange={e => setLoginEmail(e.target.value)}
                                        className="login-input"
                                        placeholder="Email"
                                    />
                                </div>
                                <div>
                                    <input 
                                        type="password" 
                                        value={loginPassword} 
                                        onChange={e => setLoginPassword(e.target.value)}
                                        className="login-input"
                                        placeholder="Пароль"
                                    />
                                </div>

                                <div className="pt-4 space-y-4">
                                    <LabeledSwitch 
                                        label="Я согласен с Условиями оферты" 
                                        isChecked={isOfferAccepted} 
                                        onToggle={() => {
                                            setIsOfferAccepted(!isOfferAccepted);
                                            if (loginError) setLoginError(null);
                                        }} 
                                    />
                                    <LabeledSwitch 
                                        label="Я даю согласие на обработку данных" 
                                        isChecked={isDataProcessed} 
                                        onToggle={() => {
                                            setIsDataProcessed(!isDataProcessed);
                                            if (loginError) setLoginError(null);
                                        }} 
                                    />
                                </div>

                                {loginError && <div className="login-error flex items-center"><X className="w-4 h-4 mr-2" />{loginError}</div>}
                                
                                <button 
                                    type="submit" 
                                    disabled={loading || !isOfferAccepted || !isDataProcessed}
                                    className="button-primary flex justify-center items-center"
                                >
                                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Войти"}
                                </button>
                            </form>
                        </div>
                    ) : (
                        <TableDisplay 
                            data={perevozki} 
                            loading={loading} 
                            isThemeLight={isThemeLight}
                            summary={summary}
                            generateSummary={generateSummary}
                        />
                    )}
                </div>
            </main>
            {/* Футер отсутствует */}
        </div>
    );
}
