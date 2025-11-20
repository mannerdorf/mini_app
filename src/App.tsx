import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { 
    Loader2, LogOut, Truck, Home, X, 
    MapPin, DollarSign, Calendar, Clock, Volume2, Mic 
} from 'lucide-react';

// --- API CONFIGURATION ---
const API_URL = 'https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki?DateB=2024-01-01&DateE=2026-01-01';
const API_AUTH_BASIC = 'Basic YWRtaW46anVlYmZueWU='; 
const LLM_API_KEY = ""; 
const LLM_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${LLM_API_KEY}`;
const TTS_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${LLM_API_KEY}`;

// --- FIREBASE CONFIGURATION ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;


// --- UI COMPONENTS ---

const EntryIcon = () => (
    <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/>
    </svg>
);

/**
 * LabeledSwitch - Исправленный компонент
 * Гарантирует одинаковый размер и выравнивание переключателей.
 */
const LabeledSwitch = ({ label, isChecked, onToggle }) => {
    return (
        <div 
            className="flex justify-between items-center w-full mb-4 cursor-pointer select-none" 
            onClick={onToggle}
        >
            {/* Текст метки */}
            <div className="flex-grow text-sm font-medium text-gray-300 pr-4">
                {label}
            </div>

            {/* Контейнер свитча:
                - flex-shrink-0: Запрещает сжатие, сохраняя размер.
                - w-12 h-6: Фиксированные размеры.
                - relative: Для позиционирования кружка.
            */}
            <div className={`relative w-12 h-6 flex-shrink-0 rounded-full transition-colors duration-300 ease-in-out ${
                isChecked ? 'bg-blue-600' : 'bg-gray-600'
            }`}>
                {/* Кружок переключателя */}
                <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full shadow transition-transform duration-300 ease-in-out ${
                    isChecked ? 'translate-x-6' : 'translate-x-0'
                }`}></div>
            </div>
        </div>
    );
};

// --- TABLE DISPLAY COMPONENTS (Встроены для надежности) ---

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

const TableDisplay = ({ data, loading, error }) => {
    if (loading) return <div className="flex justify-center p-10"><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /></div>;
    if (error) return <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">Ошибка: {error}</div>;
    if (!data || data.length === 0) return <div className="text-center text-gray-500 p-10">Нет данных</div>;

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-100">Список Перевозок ({data.length})</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {data.map((item, index) => (
                    <div key={index} className="bg-gray-800 rounded-xl shadow-xl border border-gray-700/50 overflow-hidden hover:shadow-blue-500/30 transition duration-300">
                        <div className="p-4 bg-blue-900/50 border-b border-blue-800">
                            <h4 className="text-lg font-extrabold text-blue-300">Перевозка #{item.ID || 'N/A'}</h4>
                            <p className="text-xs text-blue-400 mt-1">{item.GosNum || 'Номер не указан'}</p>
                        </div>
                        <div className="divide-y divide-gray-700/50">
                            <TableRow label="Маршрут" value={`${item.FromPoint || '?'} → ${item.ToPoint || '?'}`} icon={<MapPin className="w-5 h-5" />} />
                            <TableRow label="Дата" value={item.Date || 'N/A'} icon={<Calendar className="w-5 h-5" />} />
                            <TableRow label="Стоимость" value={item.Summa ? `${item.Summa} ₽` : 'N/A'} icon={<DollarSign className="w-5 h-5" />} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};


// --- MAIN APP COMPONENT ---

const App = () => {
    const [loginEmail, setLoginEmail] = useState('order@lal-auto.com');
    const [loginPassword, setLoginPassword] = useState('ZakaZ656565');
    const [isOfferAccepted, setIsOfferAccepted] = useState(false);
    const [isDataProcessed, setIsDataProcessed] = useState(false);
    const [perevozki, setPerevozki] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [view, setView] = useState('login');
    
    // Firebase State
    const [db, setDb] = useState(null);
    const [userId, setUserId] = useState(null);

    // Init Firebase
    useEffect(() => {
        if (!firebaseConfig) return;
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
        } catch (e) { console.error(e); }
    }, []);

    // Save Switch State
    useEffect(() => {
        if (db && userId) {
            setDoc(doc(db, 'artifacts', appId, 'users', userId, 'login_state', 'form_data'), {
                isOfferAccepted, isDataProcessed, timestamp: new Date().toISOString()
            }, { merge: true }).catch(console.error);
        }
    }, [isOfferAccepted, isDataProcessed, db, userId]);

    // Fetch Data
    const fetchPerevozki = useCallback(async () => {
        setLoading(true);
        setError(null);
        const authHeader = `Basic ${btoa(`${loginEmail}:${loginPassword}`)}`;
        
        try {
            const response = await fetch(API_URL, {
                method: 'GET',
                headers: { 'Auth': authHeader, 'Authorization': API_AUTH_BASIC }
            });

            if (!response.ok) throw new Error(`Ошибка API: ${response.status}`);
            
            const data = await response.json();
            const result = data.Perevozki || data;

            if (Array.isArray(result)) {
                setPerevozki(result);
                setView('perevozki');
            } else {
                throw new Error("Неверный формат данных");
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [loginEmail, loginPassword]);

    const handleLogin = (e) => {
        e.preventDefault();
        if (!isOfferAccepted || !isDataProcessed) {
            setError("Примите условия соглашения.");
            return;
        }
        fetchPerevozki();
    };

    const handleLogout = () => {
        setPerevozki(null);
        setView('login');
    };

    // --- RENDER ---

    if (loading && view === 'login') {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-900">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                <p className="mt-4 text-gray-300">Вход...</p>
            </div>
        );
    }

    if (view === 'login') {
        return (
            <div className="min-h-screen flex flex-col justify-center items-center bg-gray-900 p-4">
                <div className="w-full max-w-md p-8 bg-gray-800 rounded-2xl shadow-2xl border border-gray-700/50">
                    <div className="flex flex-col items-center mb-8">
                        <EntryIcon />
                        <h1 className="text-4xl font-bold text-blue-500 mt-4">HAULZ</h1>
                        <p className="text-gray-400 text-sm">Вход для партнеров</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <input
                            type="email"
                            value={loginEmail}
                            onChange={(e) => setLoginEmail(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-700 text-white border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Email"
                        />
                        <input
                            type="password"
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-700 text-white border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Пароль"
                        />

                        {/* Свитчи с фиксированным размером и выравниванием */}
                        <div className="pt-2">
                            <LabeledSwitch 
                                label={<>Я согласен с <span className="text-blue-400">Условиями оферты</span></>}
                                isChecked={isOfferAccepted}
                                onToggle={() => setIsOfferAccepted(!isOfferAccepted)}
                            />
                            <LabeledSwitch 
                                label={<>Я даю согласие на <span className="text-blue-400">обработку данных</span></>}
                                isChecked={isDataProcessed}
                                onToggle={() => setIsDataProcessed(!isDataProcessed)}
                            />
                        </div>

                        {error && <div className="p-3 text-sm text-red-300 bg-red-900/30 rounded-lg border border-red-700">{error}</div>}

                        <button
                            type="submit"
                            disabled={!isOfferAccepted || !isDataProcessed}
                            className={`w-full py-3 text-lg font-semibold rounded-lg shadow-lg transition ${
                                isOfferAccepted && isDataProcessed 
                                ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                            }`}
                        >
                            Войти
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 p-4">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-6 bg-gray-800 p-4 rounded-xl shadow-lg border border-gray-700">
                    <h2 className="text-xl font-bold">Список Перевозок</h2>
                    <button onClick={handleLogout} className="flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white transition">
                        <LogOut className="w-4 h-4 mr-2" /> Выход
                    </button>
                </div>
                <TableDisplay data={perevozki} loading={loading} error={error} />
            </div>
        </div>
    );
};

export default App;
