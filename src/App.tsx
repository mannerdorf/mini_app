import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, onSnapshot, query, addDoc, serverTimestamp } from 'firebase/firestore';
import { 
    Loader2, LogOut, Truck, 
    MapPin, DollarSign, Calendar, Volume2, Mic, 
    LogIn, // <-- ЭТО БЫЛО ДОБАВЛЕНО/ИСПРАВЛЕНО
    Check
} from 'lucide-react';

// --- API CONFIGURATION ---
// Полный диапазон дат, как в запросе Postman
const API_URL = 'https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki?DateB=2024-01-01&DateE=2026-01-01';
const API_AUTH_BASIC = 'Basic YWRtaW46anVlYmZueWU='; 
const LLM_API_KEY = ""; 
const LLM_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${LLM_API_KEY}`;
const TTS_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${LLM_API_KEY}`;

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
        FromPoint: "Москва, склад №1",
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
        FromPoint: "Казань",
        ToPoint: "Самара",
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
        FromPoint: "Екатеринбург",
        ToPoint: "Тюмень",
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
// --- UI COMPONENTS (Styles matched to image) ---
// ==========================================

// Стильный переключатель (Свитч)
const LabeledSwitch = ({ label, isChecked, onToggle }) => {
    return (
        <div 
            className="flex justify-between items-center py-3 cursor-pointer group" 
            onClick={onToggle}
        >
            {/* Текст метки */}
            <div className="text-sm text-gray-300 font-medium mr-4 select-none group-hover:text-white transition-colors">
                {label}
            </div>

            {/* Сам переключатель */}
            <div className={`relative w-11 h-6 rounded-full transition-colors duration-200 ease-in-out flex-shrink-0 ${
                isChecked ? 'bg-blue-600' : 'bg-gray-600'
            }`}>
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform duration-200 ease-in-out ${
                    isChecked ? 'translate-x-5' : 'translate-x-0'
                }`}></div>
            </div>
        </div>
    );
};

const TableRow = ({ label, value, icon }) => (
    <div className="flex items-center space-x-3 p-3 border-b border-gray-700 last:border-b-0">
        <div className="flex-shrink-0 text-blue-400">
            {icon}
        </div>
        <div className="flex-grow">
            <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
            <p className="text-sm font-semibold text-gray-200 break-words">{value || 'N/A'}</p>
        </div>
    </div>
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
        setTtsAudioUrl(null);

        const promptText = `Перевозка ${item.ID}. Маршрут ${item.FromPoint} - ${item.ToPoint}. Дата ${item.Date}. Сумма ${item.Summa}.`;

        const payload = {
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
            model: "gemini-2.5-flash-preview-tts"
        };
        
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
                setTtsAudioUrl(url);
                const audio = new Audio(url);
                audio.play();
            }
        } catch (e) {
            console.error(e);
            setTtsError("Ошибка озвучивания");
        } finally {
            setTtsLoading(prev => ({ ...prev, [index]: false }));
        }
    };

    if (loading) return <div className="flex justify-center p-10"><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /></div>;
    
    // Если данные моковые, показываем предупреждение, но не блокирующую ошибку
    const errorMessage = error ? (
        <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm mb-4">
            Ошибка API: {error}. Показаны демонстрационные данные.
        </div>
    ) : null;

    if (!data || data.length === 0) return <div className="text-center text-gray-500 p-10">Нет данных</div>;

    return (
        <div className="pb-20 w-full max-w-4xl mx-auto">
             {errorMessage}
             
             {/* AI Summary Block */}
             <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 mb-6">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-bold text-white flex items-center">
                        <Mic className="w-5 h-5 mr-2 text-purple-400" />
                        AI Аналитика
                    </h3>
                    <button 
                        onClick={generateSummary}
                        disabled={summary.loading}
                        className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-md transition disabled:opacity-50"
                    >
                        {summary.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Обновить'}
                    </button>
                </div>
                {summary.text && <p className="text-sm text-gray-300 bg-gray-900/50 p-2 rounded">{summary.text}</p>}
            </div>

            {/* List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.map((item, index) => (
                    <div key={index} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-md hover:shadow-blue-500/20 transition duration-300">
                        <div className="p-3 bg-gray-750 border-b border-gray-700 flex justify-between items-center">
                            <span className="font-bold text-blue-400 text-lg">#{item.Nomer || item.ID}</span>
                            <button 
                                onClick={() => generateAndPlayTTS(item, index)}
                                disabled={ttsLoading[index]}
                                className="p-2 text-gray-400 hover:text-white transition"
                            >
                                {ttsLoading[index] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-5 h-5" />}
                            </button>
                        </div>
                        <div className="divide-y divide-gray-700/50">
                            <TableRow label="Маршрут" value={`${item.FromPoint || item.AdresOtgruzki} → ${item.ToPoint || item.AdresDostavki}`} icon={<MapPin className="w-4 h-4" />} />
                            <TableRow label="Дата" value={item.Date || item.DataOtgruzki} icon={<Calendar className="w-4 h-4" />} />
                            <TableRow label="Сумма" value={`${item.Summa} ₽`} icon={<DollarSign className="w-4 h-4" />} />
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
                 throw new Error(`Ошибка API: ${response.status}`);
            }

            const data = await response.json();
            const result = data.Perevozki || data;

            if (Array.isArray(result)) {
                setPerevozki(result);
                setView('perevozki');
            } else {
                throw new Error("Некорректный формат данных");
            }
        } catch (e) {
            // --- FALLBACK MECHANISM ---
            console.error("API Request Failed:", e);
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
            const prompt = `Проанализируй: ${JSON.stringify(perevozki.slice(0, 5))}. Кратко на русском.`;
            const response = await fetch(LLM_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await response.json();
            setSummary({ text: data.candidates?.[0]?.content?.parts?.[0]?.text || "Ошибка", loading: false });
        } catch (e) {
            setSummary({ text: "Ошибка анализа", loading: false });
        }
    };

    // --- HANDLERS ---
    const handleLogin = (e) => {
        e.preventDefault();
        if (!isOfferAccepted || !isDataProcessed) {
            setError("Необходимо принять условия.");
            return;
        }
        fetchPerevozki();
    };

    const handleLogout = () => {
        setPerevozki(null);
        setView('login');
        setError(null);
    };

    // --- RENDER ---
    return (
        // Используем стандартный CSS (Tailwind) для гарантированного отображения в Web
        <div className="min-h-screen bg-gray-900 text-gray-100 font-sans flex flex-col">
            {/* Header */}
            <header className="p-4 bg-gray-800 shadow-md flex justify-between items-center sticky top-0 z-10 border-b border-gray-700">
                <div className="flex items-center">
                    <Truck className="w-6 h-6 text-blue-500 mr-2" />
                    <h1 className="text-xl font-bold tracking-wide text-white">HAULZ</h1>
                </div>
                {view === 'perevozki' && (
                    <button onClick={handleLogout} className="text-gray-400 hover:text-red-500 transition p-2 rounded-full hover:bg-gray-700">
                        <LogOut className="w-5 h-5" />
                    </button>
                )}
            </header>

            {/* Content */}
            <main className="flex-grow p-4 flex justify-center items-start pt-10">
                <div className="w-full max-w-4xl">
                    {view === 'login' ? (
                        <div className="max-w-md mx-auto bg-gray-800 p-8 rounded-2xl shadow-2xl border border-gray-700">
                            <div className="text-center mb-8">
                                <div className="mx-auto w-12 h-12 mb-4 flex items-center justify-center rounded-full bg-gray-700/50">
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
                                        className="w-full bg-gray-700 border border-gray-600 text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition placeholder-gray-400"
                                        placeholder="Email"
                                    />
                                </div>
                                <div>
                                    <input 
                                        type="password" 
                                        value={loginPassword} 
                                        onChange={e => setLoginPassword(e.target.value)}
                                        className="w-full bg-gray-700 border border-gray-600 text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition placeholder-gray-400"
                                        placeholder="Пароль"
                                    />
                                </div>

                                <div className="pt-2 space-y-2">
                                    <LabeledSwitch 
                                        label="Я согласен с Условиями оферты" 
                                        isChecked={isOfferAccepted} 
                                        onToggle={() => setIsOfferAccepted(!isOfferAccepted)} 
                                    />
                                    <LabeledSwitch 
                                        label="Я даю согласие на обработку данных" 
                                        isChecked={isDataProcessed} 
                                        onToggle={() => setIsDataProcessed(!isDataProcessed)} 
                                    />
                                </div>

                                {error && !isMockData && <div className="p-3 bg-red-900/50 border border-red-700 text-red-200 text-sm rounded-lg">{error}</div>}

                                <button 
                                    type="submit" 
                                    disabled={loading}
                                    className="w-full py-3 mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-900/50 transition transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
                                >
                                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Войти"}
                                </button>
                            </form>
                        </div>
                    ) : (
                        <TableDisplay 
                            data={perevozki} 
                            loading={loading} 
                            error={error} // Передаем ошибку в TableDisplay, чтобы он мог показать предупреждение о мок-данных
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
