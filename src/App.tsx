import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    signInAnonymously, 
    onAuthStateChanged, 
    signInWithCustomToken 
} from 'firebase/auth';
import { 
    getFirestore, 
    doc, 
    setDoc, 
    serverTimestamp,
    setLogLevel
} from 'firebase/firestore';
import { Truck, Package, User, CheckCircle, XCircle, Loader2, Route } from 'lucide-react';

// Устанавливаем уровень логирования для Firebase (полезно для отладки)
setLogLevel('debug');

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ СРЕДЫ CANVAS (ОБЯЗАТЕЛЬНЫЕ) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const firebaseConfig = typeof __firebase_config !== 'undefined' 
    ? JSON.parse(__firebase_config) 
    : null; // null, если конфигурация не найдена

// --- КОНСТАНТЫ ПРИЛОЖЕНИЯ ---
const SHIPMENTS_COLLECTION = 'shipments'; // Коллекция для хранения данных о грузах
const PATH_PREFIX = `/artifacts/${appId}/users`; // Путь для приватных данных пользователя

// Компонент для отображения критических ошибок
const ErrorBox = ({ title, message }) => (
    <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-6 rounded-xl shadow-lg m-4">
        <div className="flex items-center mb-2">
            <XCircleIcon className="h-6 w-6 mr-3 flex-shrink-0" />
            <p className="font-bold text-xl">{title}</p>
        </div>
        <p className="mt-2 text-sm">{message}</p>
        <p className="mt-4 text-xs italic opacity-80">
            Для работы приложения необходимо, чтобы в консоли Firebase был включен Анонимный вход.
        </p>
    </div>
);

// Компонент для отображения статуса инициализации
const StatusPill = ({ status }) => {
    let style = '';
    let text = '';
    let Icon = null;

    if (status === 'ready') {
        style = 'bg-green-100 text-green-700 border-green-300';
        text = 'Готов к работе';
        Icon = CheckCircle;
    } else if (status === 'loading') {
        style = 'bg-blue-100 text-blue-700 border-blue-300';
        text = 'Загрузка...';
        Icon = Loader2;
    } else {
        style = 'bg-red-100 text-red-700 border-red-300';
        text = 'Ошибка';
        Icon = XCircle;
    }

    return (
        <span className={`inline-flex items-center px-3 py-1 text-sm font-semibold rounded-full border ${style}`}>
            {Icon && <Icon className={`h-4 w-4 mr-2 ${status === 'loading' ? 'animate-spin' : ''}`} />}
            {text}
        </span>
    );
};

// --- ГЛАВНЫЙ КОМПОНЕНТ ПРИЛОЖЕНИЯ ---
const App = () => {
    // Состояние для Firebase
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    
    // Состояние для UI
    const [authStatus, setAuthStatus] = useState('loading');
    const [error, setError] = useState(null);
    const [shipments, setShipments] = useState([]); // Для данных приложения HAULZ

    // 1. Инициализация Firebase и Аутентификация
    useEffect(() => {
        if (!firebaseConfig) {
            setError("Критическая ошибка: Конфигурация Firebase не найдена.");
            setAuthStatus('error');
            return;
        }

        try {
            const firebaseApp = initializeApp(firebaseConfig);
            const authInstance = getAuth(firebaseApp);
            const dbInstance = getFirestore(firebaseApp);
            
            setDb(dbInstance);
            setAuth(authInstance);

            // Аутентификация: попытка входа с токеном или анонимно
            const authenticateUser = async () => {
                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(authInstance, initialAuthToken);
                    } else {
                        await signInAnonymously(authInstance);
                    }
                } catch (e) {
                    setError(`Ошибка аутентификации Firebase (${e.code}): ${e.message}`);
                    setAuthStatus('error');
                }
            };

            // Слушатель состояния аутентификации
            const unsubscribe = onAuthStateChanged(authInstance, (user) => {
                if (user) {
                    setUserId(user.uid);
                    setAuthStatus('ready');
                } else {
                    setUserId(null);
                    setAuthStatus('loading');
                    // Если пользователь вышел, пытаемся войти снова
                    authenticateUser();
                }
            });

            return () => unsubscribe(); // Очистка слушателя

        } catch (e) {
            console.error("Ошибка при инициализации Firebase:", e);
            setError(`Ошибка инициализации Firebase: ${e.message}`);
            setAuthStatus('error');
        }
    }, []);

    // 2. Логика приложения: добавление тестового груза (пример)
    const addTestShipment = async () => {
        if (!db || !userId) {
            console.error("Firebase не готов.");
            return;
        }

        const newShipment = {
            id: Date.now().toString(),
            from: "Москва",
            to: "Санкт-Петербург",
            status: "Pending",
            weight: Math.floor(Math.random() * 500) + 50,
            timestamp: serverTimestamp(),
            driver: `Driver-${userId.substring(0, 4)}`,
        };

        const docRef = doc(db, PATH_PREFIX, userId, SHIPMENTS_COLLECTION, newShipment.id);
        
        try {
            await setDoc(docRef, newShipment);
            console.log("Тестовый груз добавлен:", newShipment.id);
            // В реальном приложении вы бы использовали onSnapshot для обновления списка
            setShipments(prev => [...prev, newShipment]);
        } catch (e) {
            console.error("Ошибка при добавлении груза:", e);
            // Замена alert() на консольное сообщение, как того требуют инструкции
            console.warn(`Не удалось добавить груз: ${e.message}. Проверьте правила безопасности Firestore.`);
        }
    };

    // --- РЕНДЕРИНГ UI ---

    if (error) {
        return <ErrorBox title="Ошибка Инициализации/Аутентификации" message={error} />;
    }

    const isReady = authStatus === 'ready' && db !== null;

    return (
        <div className="p-4 sm:p-8 max-w-5xl mx-auto bg-gray-50 min-h-screen font-sans">
            <header className="text-center mb-8 border-b pb-4 bg-white p-4 rounded-xl shadow-md">
                <div className="flex justify-center items-center mb-2">
                    <Truck className="h-8 w-8 text-blue-600 mr-3" />
                    <h1 className="text-3xl font-extrabold text-gray-900">
                        HAULZ - Система Управления Грузами
                    </h1>
                </div>
                <p className="text-gray-600">Основа на React и Firebase/Firestore</p>
            </header>

            {/* БЛОК СТАТУСА */}
            <div className="mb-8 p-5 border border-indigo-200 bg-indigo-50 rounded-xl shadow-lg">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-indigo-700 flex items-center">
                        <User className="h-5 w-5 mr-2" />
                        Статус Пользователя
                    </h2>
                    <StatusPill status={authStatus} />
                </div>
                <p className="mt-3 text-sm text-gray-700 break-all">
                    <span className="font-semibold">UID:</span> 
                    <code className="ml-2 bg-indigo-100 text-indigo-800 p-1 rounded font-mono">
                        {userId || 'Аутентификация...'}
                    </code>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                    Это ваш уникальный идентификатор в системе Firebase.
                </p>
            </div>
            
            {/* БЛОК ПРИЛОЖЕНИЯ */}
            <div className="p-6 bg-white rounded-xl shadow-2xl">
                <h2 className="text-2xl font-bold text-gray-800 border-b pb-2 mb-4 flex items-center">
                    <Route className="h-6 w-6 mr-3 text-blue-600" />
                    Управление Грузами (Прототип)
                </h2>
                
                <div className="flex justify-center mb-6">
                    <button 
                        className={`flex items-center px-6 py-3 rounded-full font-bold transition duration-300 shadow-lg ${isReady ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-300 text-gray-600 cursor-not-allowed'}`}
                        onClick={addTestShipment}
                        disabled={!isReady}
                    >
                        {isReady ? (
                            <><Package className="h-5 w-5 mr-2" /> Добавить Тестовый Груз</>
                        ) : (
                            <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Ожидание Firebase...</>
                        )}
                    </button>
                </div>

                {/* Список тестовых грузов */}
                <h3 className="text-xl font-semibold text-gray-700 mt-8 mb-3">
                    Тестовые Грузы ({shipments.length})
                </h3>
                
                {shipments.length === 0 && isReady ? (
                    <div className="text-center p-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                        <Package className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-500">Грузы не добавлены. Нажмите кнопку выше, чтобы добавить первый тестовый груз.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {shipments.map((shipment, index) => (
                            <div key={shipment.id} className="p-4 border border-gray-200 rounded-lg bg-white hover:shadow-sm transition duration-150">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-lg font-semibold text-gray-900">
                                            {shipment.from} → {shipment.to}
                                        </p>
                                        <p className="text-sm text-gray-500">
                                            Водитель: {shipment.driver} | Вес: {shipment.weight} кг
                                        </p>
                                    </div>
                                    <span className="px-3 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                                        {shipment.status}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                
            </div>
            
        </div>
    );
};

export default App;
