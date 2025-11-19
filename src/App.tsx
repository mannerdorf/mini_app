import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { getFirestore, setLogLevel } from 'firebase/firestore';
import { DatabaseIcon, UserIcon, CheckCircleIcon, XCircleIcon, KeyIcon, Loader2 } from 'lucide-react';

// Устанавливаем уровень логирования для Firebase (полезно для отладки)
setLogLevel('debug');

// *** ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ (Canvas Environment) ***
// Эти переменные предоставляются средой, в которой работает код
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Компонент для отображения критических ошибок
const ErrorBox = ({ title, message }) => (
  <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-6 rounded-xl shadow-lg m-4">
    <div className="flex items-center mb-2">
      <XCircleIcon className="h-6 w-6 mr-3 flex-shrink-0" />
      <p className="font-bold text-xl">{title}</p>
    </div>
    <p className="mt-2 text-sm">{message}</p>
    <p className="mt-4 text-xs italic opacity-80">
      Пожалуйста, проверьте консоль разработчика для получения подробностей или убедитесь, что ваш API Key не ограничен в Google Cloud Console.
    </p>
  </div>
);

// Главный компонент приложения
const App = () => {
  // Состояние для хранения экземпляров Firebase и данных пользователя
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Состояние для управления UI: загрузка и ошибки
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // 1. Инициализация Firebase и Аутентификация
  useEffect(() => {
    // 1.1 Проверка конфигурации
    if (!firebaseConfig) {
      setError("Конфигурация Firebase отсутствует. Переменная __firebase_config не найдена.");
      setIsLoading(false);
      return;
    }
    if (!firebaseConfig.apiKey) {
        setError("API Key Firebase отсутствует. Проверьте правильность настройки переменных.");
        setIsLoading(false);
        return;
    }

    try {
      // Инициализация
      const firebaseApp = initializeApp(firebaseConfig);
      const authInstance = getAuth(firebaseApp);
      const dbInstance = getFirestore(firebaseApp);
      
      setDb(dbInstance);
      setAuth(authInstance);

      // Установка персистентности (опционально)
      setPersistence(authInstance, browserSessionPersistence).catch(e => {
        console.warn("Не удалось установить персистентность сессии:", e);
      });

      // Логика попытки аутентификации
      const authenticateUser = async (auth) => {
        try {
          if (initialAuthToken) {
            // Использование предоставленного Canvas Custom Auth Token
            await signInWithCustomToken(auth, initialAuthToken);
          } else {
            // Анонимный вход (требуется включение в консоли Firebase)
            await signInAnonymously(auth);
          }
        } catch (e) {
          console.error("Ошибка при аутентификации:", e);
          setError(`Error (auth/${e.code}): ${e.message}. Проверьте, что анонимная аутентификация включена, и API Key действителен.`);
          setIsLoading(false);
        }
      };

      // Слушатель состояния аутентификации
      const unsubscribe = onAuthStateChanged(authInstance, (user) => {
        if (user) {
          setUserId(user.uid);
          setIsAuthenticated(true);
          console.log("Пользователь успешно аутентифицирован. UID:", user.uid);
        } else {
          setUserId(null);
          setIsAuthenticated(false);
          // Если пользователь не аутентифицирован, и мы еще не пытались, пробуем аутентифицироваться.
          if (isLoading) {
              authenticateUser(authInstance);
          }
        }
        // Завершаем состояние загрузки после первой проверки
        if (isLoading) setIsLoading(false);
      });

      // Очистка слушателя при размонтировании
      return () => unsubscribe();

    } catch (e) {
      console.error("Ошибка при инициализации Firebase:", e);
      setError(`Ошибка инициализации Firebase: ${e.message}`);
      setIsLoading(false);
    }
  }, []);

  // --- UI Рендеринг ---

  if (error) {
    return <ErrorBox title="Критическая ошибка Firebase" message={error} />;
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-center">
        <Loader2 className="h-8 w-8 text-blue-600 animate-spin mb-4" />
        <p className="text-xl font-semibold text-gray-700">Загрузка приложения...</p>
        <p className="text-sm text-gray-500 mt-1">Инициализация Firebase и аутентификация.</p>
      </div>
    );
  }
  
  // Если Firebase инициализирован и пользователь аутентифицирован
  if (db && userId && isAuthenticated) {
    return (
      <div className="p-8 max-w-4xl mx-auto bg-white min-h-screen font-sans">
        <div className="text-center mb-10 border-b pb-4">
          <h1 className="text-4xl font-extrabold text-blue-700 mb-2">
            HAULZ: Приложение для логистики
          </h1>
          <p className="text-gray-600">Готов к работе. Firebase инициализирован и пользователь аутентифицирован.</p>
        </div>

        <div className="p-6 border border-green-200 bg-green-50 rounded-xl shadow-lg mb-8">
          <h2 className="text-2xl font-semibold text-green-700 mb-3 flex items-center">
            <CheckCircleIcon className="h-6 w-6 mr-3" />
            Рабочий статус
          </h2>
          <p className="text-lg text-gray-700">
            <span className="font-medium text-green-800">Идентификатор Пользователя (UID):</span>
            <code className="ml-2 bg-green-200 text-green-800 p-2 rounded text-sm font-mono break-all inline-block mt-1">
              {userId}
            </code>
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Используйте этот `userId` для создания коллекций, доступных только текущему пользователю, по пути:
            <code className="bg-gray-100 p-1 rounded text-xs block mt-1 break-all">
                artifacts/{appId}/users/{userId}/[ваша_коллекция]
            </code>
          </p>
        </div>

        {/* !!! ЗДЕСЬ НАЧИНАЕТСЯ ВАШ ОСНОВНОЙ КОД ПРИЛОЖЕНИЯ !!!
            
            Вы можете создать другие компоненты (например, <ShipmentList db={db} userId={userId} />) 
            и передать им экземпляры db и userId.
        */}
        
        <div className="mt-12 p-8 border-2 border-dashed border-gray-300 rounded-xl text-center">
            <DatabaseIcon className="h-10 w-10 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-800">Область Приложения</h3>
            <p className="text-gray-600 mt-2">
                Добавьте здесь компоненты для отображения грузов, маршрутов и управления заказами.
            </p>
            <button 
                className="mt-6 px-6 py-3 bg-blue-600 text-white font-semibold rounded-full shadow-lg hover:bg-blue-700 transition duration-200"
                onClick={() => console.log('db instance:', db, 'auth instance:', auth)}
            >
                Начать Разработку
            </button>
        </div>

      </div>
    );
  }

  // Если аутентификация не удалась, но нет критической ошибки (например, проблемы с сетью)
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-center">
      <XCircleIcon className="h-10 w-10 text-red-500 mb-4" />
      <p className="text-xl font-semibold text-gray-700">Проблема с доступом</p>
      <p className="text-sm text-gray-500 mt-1">Не удалось аутентифицировать пользователя. Пожалуйста, проверьте статус анонимной аутентификации в консоли Firebase.</p>
    </div>
  );
};

export default App;
