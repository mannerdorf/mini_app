import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, getDoc, doc, setDoc, collection, onSnapshot, query, addDoc, serverTimestamp } from 'firebase/firestore';
import { 
    Loader2, LogOut, Truck, 
    MapPin, DollarSign, Calendar, Volume2, Mic, 
    LogIn, Check, X, Info
} from 'lucide-react';

// --- API CONFIGURATION ---
const API_URL = 'https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki?DateB=2024-01-01&DateE=2026-01-01';
const API_AUTH_BASIC = 'Basic YWRtaW46anVlYmZueWU='; 
const LLM_API_KEY = ""; 
const LLM_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${LLM_API_KEY}`;
const TTS_API_KEY = "";
const TTS_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${TTS_API_KEY}`;


// --- FIREBASE SETUP (Опционально для получения уникального ID пользователя) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const dummyFirebaseConfig = { apiKey: "dummy", authDomain: "dummy", projectId: "dummy" };
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : dummyFirebaseConfig;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- FALLBACK DATA (На случай ошибки 500) ---
const MOCK_PEREVOZKI = [
    {
        ID: "000003872",
        Nomer: "ЗК-003872",
        Date: "20.11.2025 14:30:00",
        Status: "В пути",
        FromPoint: "Москва, склад №1 (ОТГР-1)",
        ToPoint: "Санкт-Петербург, ул. Ленина 10",
        Summa: 45000,
        GosNum: "А 123 АА 777",
        Voditel: "Иванов И.И.",
        Time: "8 ч 30 мин"
    },
    {
        ID: "000003875",
        Nomer: "ЗК-003875",
        Date: "21.11.2025 09:00:00",
        Status: "Создан",
        FromPoint: "Казань, ПВЗ (ОТГР-2)",
        ToPoint: "Самара, пр. Победы 5",
        Summa: 12000,
        GosNum: "В 456 ВВ 116",
        Voditel: "Петров П.П.",
        Time: "4 ч 15 мин"
    },
    {
        ID: "000003880",
        Nomer: "ЗК-003880",
        Date: "22.11.2025 18:00:00",
        Status: "Доставлен",
        FromPoint: "Екатеринбург, ДЭК (ОТГР-3)",
        ToPoint: "Тюмень, ул. Мира 23",
        Summa: 25000,
        GosNum: "С 789 СС 66",
        Voditel: "Сидоров С.С.",
        Time: "5 ч 00 мин"
    }
];

// ==========================================
// --- AUDIO & DATA UTILITIES ---
// ==========================================

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
// Используются CSS-классы, которые должны быть определены в styles.css
// ==========================================

const LabeledSwitch = ({ label, isChecked, onToggle }) => {
    return (
        <div 
            className="flex items-center space-x-3 cursor-pointer p-2 rounded hover:bg-gray-700/50 transition-colors"
            onClick={onToggle}
        >
            <div className={`switch-container ${isChecked ? 'checked' : ''}`}>
                <div className="switch-knob"></div>
            </div>
            <div className="text-sm text-gray-300 font-medium select-none">
                {label}
            </div>
        </div>
    );
};

const TableRow = ({ label, value, icon }) => (
    <div className="flex items-start space-x-3 p-3 border-b border-gray-700 last:border-b-0">
        <div className="flex-shrink-0 text-blue-400 mt-0.5">
            {icon}
        </div>
        <div className="flex-grow min-w-0">
            <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
            <p className="text-sm font-semibold text-gray-200 break-words">{value || 'N/A'}</p>
        </div>
    </div>
);

const IconButton = ({ children, onClick, disabled, className = '', label = '' }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`p-2 rounded-full transition-colors relative group ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-700'} ${className}`}
        aria-label={label}
    >
        {children}
    </button>
);


// ==========================================
// --- COMPONENT: TableDisplay ---
// ==========================================
const TableDisplay = ({ data, loading, error, summary, generateSummary, isMockData }) => {
    const [ttsLoading, setTtsLoading] = useState({});
    const [ttsAudioUrl, setTtsAudioUrl] = useState(null);
    const [ttsError, setTtsError] = useState(null);

    const generateAndPlayTTS = async (item, index) => {
        setTtsLoading(prev => ({ ...prev, [index]: true }));
        setTtsError(null);
        
        const promptText = `Перевозка ${item.Nomer || item.ID}. Маршрут ${item.FromPoint || item.AdresOtgruzki} - ${item.ToPoint || item.AdresDostavki}. Дата ${item.Date || item.DataOtgruzki}. Статус: ${item.Status}.`;

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
                setTtsAudioUrl(url); // Сохраняем URL для возможной очистки
                const audio = new Audio(url);
                audio.play();
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

    if (loading) return <div className="flex justify-center p-10"><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /></div>;
    
    // Предупреждение о моковых данных/ошибке
    const statusMessage = isMockData ? (
        <div className="status-message error"><Info className="w-5 h-5 mr-2" /> Ошибка API. Показаны демонстрационные данные.</div>
    ) : error ? (
        <div className="status-message error"><X className="w-5 h-5 mr-2" /> Ошибка API: {error}</div>
    ) : null;

    if (!data || data.length === 0) return <div className="text-center text-gray-500 p-10">Нет данных о перевозках</div>;

    return (
        <div className="pb-20 w-full max-w-4xl mx-auto">
             {statusMessage}
             
             {/* AI Summary Block */}
             <div className="ai-summary-card">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-bold text-white flex items-center">
                        <Mic className="w-5 h-5 mr-2 text-purple-400" />
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
                    <p className="text-sm text-gray-300 bg-gray-900/50 p-3 rounded-lg whitespace-pre-line">{summary.text}</p>
                ) : (
                    <p className="text-sm text-gray-500 p-3 bg-gray-900/50 rounded-lg">Нажмите "Обновить анализ", чтобы получить сводку данных о перевозках с помощью AI.</p>
                )}
            </div>

            {/* List */}
            <div className="grid-container">
                {data.map((item, index) => (
                    <div key={index} className="perevozka-card">
                        <div className="card-header">
                            <span className="font-bold text-blue-400 text-lg">{item.Nomer || item.ID}</span>
                            <IconButton 
                                onClick={() => generateAndPlayTTS(item, index)}
                                disabled={ttsLoading[index]}
                                label="Озвучить информацию о перевозке"
                            >
                                {ttsLoading[index] ? <Loader2 className="w-4 h-4 animate-spin text-purple-400" /> : <Volume2 className="w-5 h-5 text-gray-400" />}
                            </IconButton>
                        </div>
                        <div className="card-body-details">
                            <TableRow label="Маршрут" value={`${item.FromPoint || item.AdresOtgruzki} → ${item.ToPoint || item.AdresDostavki}`} icon={<MapPin className="w-4 h-4" />} />
                            <TableRow label="Дата" value={item.Date ? new Date(item.Date).toLocaleDateString() : 'N/A'} icon={<Calendar className="w-4 h-4" />} />
                            <TableRow label="Сумма" value={`${item.Summa ? item.Summa.toLocaleString('ru-RU') : '0'} ₽`} icon={<DollarSign className="w-4 h-4" />} />
                            <TableRow label="Статус" value={item.Status} icon={<Check className="w-4 h-4" />} />
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
    const [showLoginError, setShowLoginError] = useState(false);

    const [perevozki, setPerevozki] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [view, setView] = useState('login'); 
    const [summary, setSummary] = useState({ text: '', loading: false });
    const [isMockData, setIsMockData] = useState(false);

    const [userId, setUserId] = useState(null);
    const [db, setDb] = useState(null); 

    // Init Auth (Optional but good for user ID)
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

    // --- API FETCH ---
    const fetchPerevozki = useCallback(async () => {
        setLoading(true);
        setError(null);
        setIsMockData(false);
        
        const authHeaderValue = `Basic ${btoa(`${loginEmail}:${loginPassword}`)}`;
        
        try {
            // Попытка 1: GET (как просили последний раз)
            let response = await fetch(API_URL, {
                method: 'GET', 
                headers: {
                    'Auth': authHeaderValue, 
                    'Authorization': API_AUTH_BASIC, 
                },
            });

            // Попытка 2: Если 405, пробуем POST (как в Postman иногда требуется)
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
                 // Если API все еще падает (например 500), мы выбрасываем ошибку,
                 // но в блоке catch переключаемся на демо-данные.
                 throw new Error(`Ошибка API: ${response.status} (${response.statusText})`);
            }

            const data = await response.json();
            const result = data.Perevozki || data;

            if (Array.isArray(result)) {
                setPerevozki(result);
                setView('perevozki');
            } else {
                throw new Error("Некорректный формат данных от API");
            }
        } catch (e) {
            // --- FALLBACK MECHANISM ---
            console.error("API Request Failed. Using Mock Data:", e);
            setError(e.message);
            // В случае ошибки сервера показываем демо-данные, чтобы интерфейс работал
            setPerevozki(MOCK_PEREVOZKI);
            setIsMockData(true);
            setView('perevozki');
        } finally {
            setLoading(false);
        }
    }, [loginEmail, loginPassword]);

    // --- AI Summary ---
    const generateSummary = async () => {
        if (!perevozki) return;
        setSummary({ ...summary, loading: true });
        try {
            // Берем первые 5 элементов для краткого анализа
            const prompt = `Проанализируй следующие данные о перевозках и дай краткую сводку на русском языке, не более 50 слов. Выдели ключевую информацию, например, общую сумму и статусы: ${JSON.stringify(perevozki.slice(0, 5))}.`;
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
        setShowLoginError(false);
        if (!isOfferAccepted || !isDataProcessed) {
            setShowLoginError(true);
            return;
        }
        fetchPerevozki();
    };

    const handleLogout = () => {
        setPerevozki(null);
        setSummary({ text: '', loading: false });
        setError(null);
        setView('login');
    };

    // --- RENDER ---
    return (
        // Используются классы из styles.css
        <div className="app-container">
            {/* Header */}
            <header className="app-header">
                <div className="header-title">
                    <Truck className="header-icon" />
                    <h1 className="text-xl font-bold tracking-wide text-white">HAULZ</h1>
                </div>
                {view === 'perevozki' && (
                    <IconButton onClick={handleLogout} label="Выйти">
                        <LogOut className="w-5 h-5 text-gray-400" />
                    </IconButton>
                )}
            </header>

            {/* Content */}
            <main className="app-main">
                <div className="w-full max-w-5xl">
                    {view === 'login' ? (
                        <div className="login-card">
                            <div className="text-center mb-8">
                                <div className="login-icon-container">
                                    <LogIn className="w-6 h-6 text-blue-500" />
                                </div>
                                <h2 className="text-2xl font-bold text-white">Вход в систему</h2>
                                <p className="text-gray-400 text-sm mt-1">Для партнеров</p>
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

                                <div className="pt-2 space-y-2">
                                    <LabeledSwitch 
                                        label="Я согласен с Условиями оферты" 
                                        isChecked={isOfferAccepted} 
                                        onToggle={() => {
                                            setIsOfferAccepted(!isOfferAccepted);
                                            if (showLoginError) setShowLoginError(false);
                                        }} 
                                    />
                                    <LabeledSwitch 
                                        label="Я даю согласие на обработку данных" 
                                        isChecked={isDataProcessed} 
                                        onToggle={() => {
                                            setIsDataProcessed(!isDataProcessed);
                                            if (showLoginError) setShowLoginError(false);
                                        }} 
                                    />
                                </div>

                                {showLoginError && <div className="login-error">Необходимо принять все условия для входа.</div>}
                                
                                <button 
                                    type="submit" 
                                    disabled={loading}
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
                            error={error} 
                            isMockData={isMockData}
                            summary={summary}
                            generateSummary={generateSummary}
                        />
                    )}
                </div>
            </main>
        </div>
    );
}
