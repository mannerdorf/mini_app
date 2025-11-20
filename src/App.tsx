import { FormEvent, useEffect, useState } from "react";
// Импорты Firebase для создания самодостаточного файла
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

// ------------------------------------------------------
//                КОНСТАНТЫ И ПЕРЕМЕННЫЕ FIREBASE
// ------------------------------------------------------

// Глобальные переменные Canvas, необходимые для Firebase
// MANDATORY: Получение appId, firebaseConfig и initialAuthToken из глобальной области
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const appId = rawAppId.split('/')[0]; 
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Название коллекции для сохранения статуса авторизации пользователя
const SESSION_COLLECTION = 'sessions';
const SESSION_DOCUMENT = 'current_session';

// ------------------------------------------------------
//                1. HOOK: ИНИЦИАЛИЗАЦИЯ FIREBASE
// ------------------------------------------------------

/**
 * Хук для инициализации Firebase, аутентификации и получения ID пользователя.
 */
const useFirebase = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [firebaseError, setFirebaseError] = useState(null); 

  useEffect(() => {
    let app, firestore, firebaseAuth;
    
    try {
      if (!firebaseConfig || Object.keys(firebaseConfig).length === 0) {
        setFirebaseError("Firebase config is missing.");
        setIsAuthReady(true);
        return;
      }
      
      app = initializeApp(firebaseConfig);
      firestore = getFirestore(app);
      firebaseAuth = getAuth(app);
      
      setDb(firestore);
      setAuth(firebaseAuth);

      // 1. Аутентификация в Firebase
      const signIn = async () => {
        try {
          if (initialAuthToken) {
            await signInWithCustomToken(firebaseAuth, initialAuthToken);
          } else {
            // Если токен не предоставлен, используем анонимный вход
            await signInAnonymously(firebaseAuth);
          }
        } catch (e) {
          console.error("Firebase Sign-in Error:", e);
          setFirebaseError(`Firebase Sign-in Failed: ${e.message}`);
        }
      };

      // 2. Установка слушателя изменений состояния аутентификации
      const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
        if (user) {
          setUserId(user.uid);
        } else {
          setUserId(null); 
        }
        setIsAuthReady(true); // Аутентификация завершена
      });

      signIn();
      return () => unsubscribe();

    } catch (e) {
      console.error("Firebase initialization failed:", e);
      setFirebaseError(`Firebase Initialization Failed: ${e.message}`);
      setIsAuthReady(true);
    }
  }, []);

  return { db, auth, userId, isAuthReady, firebaseError };
};

// ------------------------------------------------------
//                2. HOOK: ИМИТАЦИЯ useTelegram
// ------------------------------------------------------

// Заглушка для типа Telegram WebApp
declare global {
  interface Window {
    Telegram: {
      WebApp: {
        MainButton: any;
        BackButton: any;
        HapticFeedback: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'success' | 'warning' | 'error') => void;
          selectionChanged: () => void;
        };
        ready: () => void;
        initDataUnsafe: any;
        expand: () => void;
        onEvent: (eventType: string, callback: (...args: any[]) => void) => void;
        offEvent: (eventType: string, callback: (...args: any[]) => void) => void;
        themeParams: any;
        isClosingConfirmationEnabled: boolean;
      }
    }
  }
}

const useTelegram = () => {
  // Проверка window.Telegram?.WebApp должна быть безопасной
  const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;
  return { tg };
};

// ------------------------------------------------------
//                3. КОМПОНЕНТЫ И ТИПЫ
// ------------------------------------------------------

/** @typedef {{login: string, password: string}} AuthData */
/** @typedef {"home" | "cargo" | "docs" | "support" | "profile"} Tab */
/** @typedef {"all" | "today" | "week" | "month"} DateFilter */
/** @typedef {"active" | "archive" | "attention"} CargoTab */

// --- ГЛАВНЫЙ КОМПОНЕНТ APP ---
function App() {
  const { tg } = useTelegram();
  const { db, userId, isAuthReady, firebaseError } = useFirebase();

  // Состояния для логина
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [agreeOffer, setAgreeOffer] = useState(false);
  const [agreePersonal, setAgreePersonal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [appError, setAppError] = useState(null); 

  /** @type {[AuthData | null, React.Dispatch<React.SetStateAction<AuthData | null>>]} */
  const [authData, setAuthData] = useState(null);
  /** @type {[Tab, React.Dispatch<React.SetStateAction<Tab>>]} */
  const [activeTab, setActiveTab] = useState("cargo");
  const [isSessionChecking, setIsSessionChecking] = useState(true);

  /**
   * Получает путь к документу сессии для текущего пользователя
   * @param {string} uid 
   */
  const getSessionDocRef = (uid) => {
    if (!db) return null;
    // Путь для приватных данных: /artifacts/{appId}/users/{userId}/sessions/current_session
    return doc(db, 'artifacts', appId, 'users', uid, SESSION_COLLECTION, SESSION_DOCUMENT);
  }

  // ЭФФЕКТ: ПРОВЕРКА СОХРАНЕННОЙ СЕССИИ В FIREBASE
  useEffect(() => {
    if (!isAuthReady || !db || !userId) {
      if (isAuthReady || firebaseError) setIsSessionChecking(false);
      return;
    }

    const checkSession = async () => {
      try {
        const sessionRef = getSessionDocRef(userId);
        if (!sessionRef) return; // Дополнительная проверка, хотя db должно быть инициализировано

        const sessionSnap = await getDoc(sessionRef);

        if (sessionSnap.exists() && sessionSnap.data()?.isLoggedIn) {
          const data = sessionSnap.data();
          // Примечание: Пароль не сохраняется и не извлекается по соображениям безопасности.
          setAuthData({ login: data.login, password: '***' }); 
        }
      } catch (e) {
        console.error("Ошибка при чтении сессии:", e);
        setAppError("Не удалось загрузить данные сессии.");
      } finally {
        setIsSessionChecking(false);
      }
    };

    void checkSession();
  }, [isAuthReady, db, userId, firebaseError]); 

  // Обработчик логина (сохраняет сессию в Firestore)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setAppError(null);

    const cleanLogin = login.trim();
    const cleanPassword = password.trim();

    if (!cleanLogin || !cleanPassword) {
      setAppError("Введите логин и пароль");
      tg?.HapticFeedback.notificationOccurred('error'); 
      return;
    }
    if (!agreeOffer || !agreePersonal) {
      setAppError("Подтвердите согласие с условиями");
      tg?.HapticFeedback.notificationOccurred('warning');
      return;
    }

    try {
      setLoading(true);
      
      // Имитация API-ЗАПРОСА (Успех)
      await new Promise(r => setTimeout(r, 1000));

      if (db && userId) {
        // --- Сохранение статуса сессии в Firestore ---
        const sessionRef = getSessionDocRef(userId);
        if (!sessionRef) throw new Error("Database reference is unavailable.");

        // Сохраняем только статус входа и логин (без пароля)
        await setDoc(sessionRef, {
          isLoggedIn: true,
          login: cleanLogin,
          timestamp: new Date().toISOString()
        });
        // ------------------------------------------------

        setAuthData({ login: cleanLogin, password: cleanPassword });
        setActiveTab("cargo");
        setAppError(null);
        tg?.HapticFeedback.notificationOccurred('success'); 
      } else {
        throw new Error("Не удалось подключиться к базе данных или получить ID пользователя.");
      }

    } catch (err) {
      console.error(err);
      setAppError(err?.message || "Ошибка сети");
      setAuthData(null);
      tg?.HapticFeedback.notificationOccurred('error');
    } finally {
      setLoading(false);
    }
  };

  // ЭКРАНЫ ЗАГРУЗКИ / ОШИБОК
  if (!isAuthReady || isSessionChecking) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: styles }} />
        <div className="page-center">
          <div className="loader-card">Загрузка приложения и проверка сессии...</div>
        </div>
      </>
    );
  }

  // Общая ошибка (например, Firebase config отсутствует)
  if (firebaseError) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: styles }} />
        <div className="page-center">
          <div className="login-card">
            <div className="logo-area">
              <div className="logo-text">HAULZ</div>
              <div className="tagline">Ошибка приложения</div>
            </div>
            <div className="error-banner">
              {firebaseError}
              <p className="mt-2 text-xs text-red-300">Проверьте конфигурацию Firebase или подключение к сети.</p>
            </div>
             <div className="userId-info mt-4">ID: {userId || "N/A"}</div>
          </div>
        </div>
      </>
    );
  }

  // --- ЭКРАН ЛОГИНА ---
  // Примечание: Этот экран будет виден только при первом запуске (до сохранения сессии)
  if (!authData) {
    return (
      <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div className="page-center">
        <div className="login-card">
          <div className="logo-area">
            <div className="logo-text">HAULZ</div>
            <div className="tagline">Доставка грузов в Калининград</div>
            <div className="userId-info">ID: {userId || "N/A"}</div>
          </div>

          <form onSubmit={handleSubmit} className="form-stack">
            {/* Поля ввода */}
            <div className="input-group">
              <label>Логин</label>
              <input className="tg-input" type="text" placeholder="email@example.com" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username"/>
            </div>
            <div className="input-group">
              <label>Пароль</label>
              <input className="tg-input" type="password" placeholder="••••••" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"/>
            </div>

            {/* Чекбоксы */}
            <div className="checkbox-stack">
              <label className="checkbox-row">
                <input type="checkbox" checked={agreeOffer} onChange={(e) => {setAgreeOffer(e.target.checked); tg?.HapticFeedback.selectionChanged();}}/>
                <span>Я согласен с <a href="#">офертой</a></span>
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={agreePersonal} onChange={(e) => {setAgreePersonal(e.target.checked); tg?.HapticFeedback.selectionChanged();}}/>
                <span>Обработка <a href="#">персональных данных</a></span>
              </label>
            </div>

            <button className="tg-main-button" type="submit" disabled={loading}>
              {loading ? "ВХОД..." : "ВОЙТИ"}
            </button>
          </form>

          {appError && <div className="error-banner">{appError}</div>}
        </div>
      </div>
      </>
    );
  }

  // --- АВТОРИЗОВАННОЕ ПРИЛОЖЕНИЕ ---
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div className="app-layout">
        <div className="content-area">
          {activeTab === "cargo" && <CargoPage />}
          {activeTab === "home" && <StubPage title="Главная" />}
          {activeTab === "docs" && <StubPage title="Документы" />}
          {activeTab === "support" && <StubPage title="Поддержка" />}
          {activeTab === "profile" && <StubPage title="Профиль" />}
        </div>

        <TabBar active={activeTab} onChange={setActiveTab} />
      </div>
    </>
  );
}

// ------------------------------------------------------
//                КОМПОНЕНТ ГРУЗОВ
// ------------------------------------------------------

function CargoPage() {
  const { tg } = useTelegram();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  
  /** @type {[DateFilter, React.Dispatch<React.SetStateAction<DateFilter>>]} */
  const [dateFilter, setDateFilter] = useState("all");
  /** @type {[CargoTab, React.Dispatch<React.SetStateAction<CargoTab>>]} */
  const [cargoTab, setCargoTab] = useState("active");

  // Загрузка данных (Имитация)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
        setTimeout(() => {
            if(!cancelled) {
                setItems([
                    { id: 1, Number: "CARGO-992", State: "В пути", From: "Москва", To: "Казань", DatePrih: "2023-11-01", Attention: true },
                    { id: 2, Number: "CARGO-112", State: "Создан", From: "СПБ", To: "Минск", DatePrih: "2023-11-05", Attention: false },
                    { id: 3, Number: "CARGO-777", State: "Доставлен", From: "Сочи", To: "Адлер", DatePrih: "2023-10-20", Attention: false },
                    { id: 4, Number: "CARGO-001", State: "В пути", From: "Екатеринбург", To: "Тюмень", DatePrih: "2023-11-10", Attention: false },
                ]);
                setLoading(false);
            }
        }, 1000);
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const getStateKey = (item) => {
     const s = ((item.State || item.state || "")).toLowerCase();
     if (s.includes("в пути")) return "in_transit";
     if (s.includes("достав")) return "delivered";
     if (s.includes("создан")) return "created";
     return "all"; 
  }
  const isArchive = (item) => getStateKey(item) === "delivered";

  // Фильтрация
  const filtered = items.filter(item => {
      if (cargoTab === "active" && isArchive(item)) return false;
      if (cargoTab === "archive" && !isArchive(item)) return false;
      if (cargoTab === "attention" && !item.Attention) return false; 
      return true;
  });

  return (
    <div className="cargo-container">
        {/* Header + Табы статусов */}
        <div className="sticky-header">
            <div className="segment-control">
                {/** @type {CargoTab[]} */}
                {['active', 'archive', 'attention'].map(tab => (
                    <button 
                        key={tab}
                        className={cargoTab === tab ? 'active' : ''} 
                        onClick={() => {setCargoTab(tab); tg?.HapticFeedback.selectionChanged()}}
                    >
                        {tab === 'active' && 'Активные'}
                        {tab === 'archive' && 'Архив'}
                        {tab === 'attention' && 'Внимание'}
                    </button>
                ))}
            </div>

            {/* Горизонтальные фильтры (Чипы) */}
            <div className="horizontal-scroll">
                {/** @type {DateFilter[]} */}
                {['all', 'today', 'week', 'month'].map(f => (
                    <div 
                        key={f} 
                        className={`chip ${dateFilter === f ? 'active' : ''}`}
                        onClick={() => {setDateFilter(f); tg?.HapticFeedback.selectionChanged()}}
                    >
                        {f === 'all' && 'Все даты'}
                        {f === 'today' && 'Сегодня'}
                        {f === 'week' && 'Неделя'}
                        {f === 'month' && 'Месяц'}
                    </div>
                ))}
            </div>
        </div>

        {/* Список карточек грузов */}
        <div className="cargo-list">
            {loading && <div className="loader">Загрузка...</div>}
            
            {!loading && filtered.map((item, idx) => (
                <div key={idx} className="cargo-card-modern">
                    <div className="card-top">
                        <span className="cargo-id">{item.Number}</span>
                        <span className={`status-badge ${getStateKey(item)}`}>{item.State}</span>
                    </div>
                    <div className="route-visual">
                        <div className="point">
                            <div className="dot start"></div>
                            <div className="city">{item.From}</div>
                        </div>
                        <div className="line"></div>
                        <div className="point">
                            <div className="dot end"></div>
                            <div className="city">{item.To}</div>
                        </div>
                    </div>
                    <div className="card-bottom">
                        📅 {item.DatePrih}
                    </div>
                </div>
            ))}
            {!loading && filtered.length === 0 && <div className="stub-page">Нет данных по текущим фильтрам.</div>}
        </div>

        {/* FAB кнопка для создания новой перевозки (Используем console.log вместо alert) */}
        <button className="fab-button" onClick={() => {
            console.log('Новая перевозка (заглушка)'); 
            tg?.HapticFeedback.impactOccurred('medium'); 
        }}>
            +
        </button>
    </div>
  );
}

// ------------------------------------------------------
//                КОМПОНЕНТЫ МЕНЮ И ЗАГЛУШЕК
// ------------------------------------------------------

/** @type {React.FC<{active: Tab, onChange: (t: Tab) => void}>} */
function TabBar({ active, onChange }) {
    const { tg } = useTelegram();
    const tabs = [
        { id: 'home', icon: '🏠', label: 'Главная' },
        { id: 'cargo', icon: '📦', label: 'Грузы' },
        { id: 'docs', icon: '📄', label: 'Доки' },
        { id: 'profile', icon: '👤', label: 'Профиль' },
    ];

    return (
        <div className="bottom-tabbar">
            {tabs.map(t => (
                <button 
                    key={t.id} 
                    className={`tab-item ${active === t.id ? 'active' : ''}`}
                    onClick={() => {
                        onChange(t.id);
                        tg?.HapticFeedback.selectionChanged();
                    }}
                >
                    <span className="tab-icon">{t.icon}</span>
                    <span className="tab-label">{t.label}</span>
                </button>
            ))}
        </div>
    );
}

/** @type {React.FC<{title: string}>} */
function StubPage({ title }) {
    return <div className="stub-page"><h2>{title}</h2><p>В разработке</p></div>;
}

// ------------------------------------------------------
//                ВСТРОЕННЫЕ СТИЛИ (CSS)
// ------------------------------------------------------
const styles = `
/* --- ПЕРЕМЕННЫЕ ТЕЛЕГРАМА --- */
:root {
    --tg-bg: var(--tg-theme-bg-color, #fff);
    --tg-text: var(--tg-theme-text-color, #000);
    --tg-hint: var(--tg-theme-hint-color, #999);
    --tg-link: var(--tg-theme-link-color, #2481cc);
    --tg-btn: var(--tg-theme-button-color, #3390ec);
    --tg-btn-text: var(--tg-theme-button-text-color, #fff);
    --tg-secondary: var(--tg-theme-secondary-bg-color, #f4f4f5);
}

body {
    background-color: var(--tg-secondary); 
    color: var(--tg-text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    margin: 0;
    -webkit-tap-highlight-color: transparent;
    overscroll-behavior-y: none;
    height: 100vh;
}

/* --- ЛОГИН / ЗАГРУЗКА --- */
.page-center {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
}

.loader-card {
    background: var(--tg-bg);
    padding: 20px;
    border-radius: 12px;
    color: var(--tg-hint);
    font-size: 14px;
    text-align: center;
}

.login-card {
    background: var(--tg-bg);
    width: 100%;
    max-width: 400px;
    padding: 30px;
    border-radius: 20px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
}

.logo-text {
    font-size: 32px;
    font-weight: 900;
    color: var(--tg-btn);
    text-align: center;
    margin-bottom: 5px;
}

.tagline {
    text-align: center;
    color: var(--tg-hint);
    margin-bottom: 10px;
    font-size: 14px;
}
.userId-info {
    text-align: center;
    color: var(--tg-hint);
    font-size: 10px;
    font-family: monospace;
    margin-bottom: 30px;
    word-break: break-all;
}

.tg-input {
    width: 100%;
    padding: 14px;
    border-radius: 12px;
    border: 1px solid var(--tg-secondary);
    background: var(--tg-secondary);
    color: var(--tg-text);
    font-size: 16px;
    box-sizing: border-box;
    margin-top: 5px;
    outline: none;
    transition: border-color 0.2s;
}

.tg-input:focus {
    border-color: var(--tg-btn);
}

.input-group { margin-bottom: 15px; }
.input-group label { font-size: 12px; color: var(--tg-hint); margin-left: 4px; }

.tg-main-button {
    background: var(--tg-btn);
    color: var(--tg-btn-text);
    width: 100%;
    padding: 16px;
    border: none;
    border-radius: 12px;
    font-size: 16px;
    font-weight: bold;
    margin-top: 20px;
    cursor: pointer;
    transition: background 0.2s;
}

.tg-main-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.checkbox-stack { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
.checkbox-row { display: flex; align-items: center; gap: 10px; font-size: 14px; }
.checkbox-row a { color: var(--tg-link); text-decoration: none; }
.error-banner { background: #ff000015; color: #e74c3c; padding: 10px; border-radius: 8px; margin-top: 15px; text-align: center; font-size: 14px; }

/* --- ПРИЛОЖЕНИЕ LAYOUT --- */
.app-layout {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
}

.content-area {
    flex: 1;
    overflow-y: auto;
    padding-bottom: 80px; 
}

/* --- HEADER & FILTERS --- */
.cargo-container {
    padding-bottom: 10px; /* Дополнительный отступ для контента */
}

.sticky-header {
    position: sticky;
    top: 0;
    background: var(--tg-bg);
    padding: 10px 15px;
    z-index: 10;
    box-shadow: 0 1px 0 rgba(0,0,0,0.05);
}

.segment-control {
    display: flex;
    background: var(--tg-secondary);
    padding: 4px;
    border-radius: 10px;
    margin-bottom: 10px;
}

.segment-control button {
    flex: 1;
    border: none;
    background: transparent;
    padding: 8px;
    border-radius: 8px;
    color: var(--tg-hint);
    font-size: 13px;
    font-weight: 500;
}

.segment-control button.active {
    background: var(--tg-bg);
    color: var(--tg-text);
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.horizontal-scroll {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 5px;
}

.horizontal-scroll::-webkit-scrollbar { display: none; }

.chip {
    white-space: nowrap;
    padding: 6px 14px;
    border-radius: 20px;
    background: var(--tg-secondary);
    color: var(--tg-text);
    font-size: 13px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: background-color 0.1s;
}

.chip.active {
    background: var(--tg-btn);
    color: var(--tg-btn-text);
}

/* --- CARGO CARD --- */
.cargo-list { padding: 15px; }

.cargo-card-modern {
    background: var(--tg-bg);
    border-radius: 16px;
    padding: 16px;
    margin-bottom: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.03);
}

.card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
.cargo-id { font-family: monospace; font-weight: bold; font-size: 16px; }

.status-badge {
    font-size: 11px; text-transform: uppercase; padding: 4px 8px; border-radius: 6px; font-weight: bold;
}
.status-badge.in_transit { background: #e3f2fd; color: #2196f3; } 
.status-badge.delivered { background: #e8f5e9; color: #4caf50; } 
.status-badge.created { background: #fff3e0; color: #ff9800; } 
.status-badge.all { background: var(--tg-secondary); color: var(--tg-text); }

.route-visual {
    display: flex; align-items: center; gap: 10px; margin-bottom: 15px;
}
.point { display: flex; flex-direction: column; align-items: center; min-width: 60px; }
.dot { width: 10px; height: 10px; border-radius: 50%; }
.dot.start { border: 3px solid var(--tg-btn); background: var(--tg-bg); }
.dot.end { background: var(--tg-btn); }
.city { font-size: 12px; margin-top: 5px; font-weight: 500; text-align: center; }
.line { flex: 1; height: 2px; background: var(--tg-secondary); }

.card-bottom { font-size: 12px; color: var(--tg-hint); border-top: 1px solid var(--tg-secondary); padding-top: 10px; }

/* --- FAB & TABBAR --- */
.fab-button {
    position: fixed;
    bottom: 90px;
    right: 20px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--tg-btn);
    color: var(--tg-btn-text);
    font-size: 30px;
    border: none;
    box-shadow: 0 4px 15px rgba(51, 144, 236, 0.4);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    transition: transform 0.1s;
}

.fab-button:active {
    transform: scale(0.95);
}

.bottom-tabbar {
    position: fixed;
    bottom: 0;
    left: 0; right: 0;
    background: var(--tg-bg);
    display: flex;
    justify-content: space-around;
    padding: 10px 0 25px 0; 
    border-top: 1px solid var(--tg-secondary);
    box-shadow: 0 -1px 5px rgba(0,0,0,0.05);
}

.tab-item {
    border: none;
    background: transparent;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    color: var(--tg-hint);
    cursor: pointer;
}

.tab-item.active { color: var(--tg-btn); }
.tab-icon { font-size: 20px; }
.tab-label { font-size: 10px; }

/* --- Stub --- */
.stub-page { 
    padding: 20px;
    display: flex; 
    flex-direction: column; 
    align-items: center; 
    justify-content: center; 
    padding-top: 50px; 
    color: var(--tg-hint); 
}
.stub-page h2 { font-size: 24px; color: var(--tg-text); }
.stub-page p { font-size: 14px; margin-top: 5px; }
`;

export default App;
```eof

Вы можете увидеть приложение в действии, нажав кнопку **Preview** (Предпросмотр).
