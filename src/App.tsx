import { FormEvent, useEffect, useState, useMemo } from "react";
import { db, auth } from "./firebase";
import {
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";

// ------------------------------------------------------
//                КОНСТАНТЫ И ПЕРЕМЕННЫЕ FIREBASE
// ------------------------------------------------------

// Глобальные переменные Canvas, необходимые для Firebase
const rawAppId =
  typeof __app_id !== "undefined" ? __app_id : "default-app-id";
// FIX: Нормализация appId: берем только первую часть, чтобы избежать включения путей файлов,
// которые могут нарушить структуру пути Firestore (C/D/C/D...)
const appId = rawAppId.split("/")[0];
const initialAuthToken =
  typeof __initial_auth_token !== "undefined" ? __initial_auth_token : null;

// Название коллекции для сохранения статуса авторизации пользователя
const SESSION_COLLECTION = "sessions";
const SESSION_DOCUMENT = "current_session";

// ------------------------------------------------------
//                1. HOOK: ИНИЦИАЛИЗАЦИЯ FIREBASE
// ------------------------------------------------------

/**
 * Хук для работы с уже инициализированным Firebase (db, auth из ./firebase),
 * авторизации и получения ID пользователя.
 */
const useFirebase = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    // Если по какой-то причине auth не инициализирован в ./firebase
    if (!auth) {
      console.error("Firebase auth is missing or not initialized.");
      setIsAuthReady(true);
      return;
    }

    const signIn = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Firebase sign-in failed:", e);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        setUserId(null);
      }
      setIsAuthReady(true); // Аутентификация завершена
    });

    void signIn();

    return () => {
      unsubscribe();
    };
  }, []);

  return { db, auth, userId, isAuthReady };
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
          impactOccurred: (
            style: "light" | "medium" | "heavy" | "rigid" | "soft"
          ) => void;
          notificationOccurred: (type: "success" | "warning" | "error") => void;
          selectionChanged: () => void;
        };
        ready: () => void;
        initDataUnsafe: any;
        expand: () => void;
        onEvent: (eventType: string, callback: (...args: any[]) => void) => void;
        offEvent: (
          eventType: string,
          callback: (...args: any[]) => void
        ) => void;
        themeParams: any;
        isClosingConfirmationEnabled: boolean;
      };
    };
  }
}

const useTelegram = () => {
  const tg = window.Telegram?.WebApp;
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
/** @type {React.FC} */
function App() {
  const { tg } = useTelegram();
  const { db, userId, isAuthReady } = useFirebase();

  // Состояния для логина
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [agreeOffer, setAgreeOffer] = useState(false);
  const [agreePersonal, setAgreePersonal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** @type {[AuthData | null, React.Dispatch<React.SetStateAction<AuthData | null>>]} */
  const [authData, setAuthData] = useState<AuthData | null>(null);
  /** @type {[Tab, React.Dispatch<React.SetStateAction<Tab>>]} */
  const [activeTab, setActiveTab] = useState<Tab>("cargo");
  const [isSessionChecking, setIsSessionChecking] = useState(true);

  /**
   * Получает путь к документу сессии для текущего пользователя
   * @param {string} uid
   */
  const getSessionDocRef = (uid: string) =>
    doc(
      db,
      "artifacts",
      appId,
      "users",
      uid,
      SESSION_COLLECTION,
      SESSION_DOCUMENT
    );

  // ЭФФЕКТ: ПРОВЕРКА СОХРАНЕННОЙ СЕССИИ В FIREBASE
  useEffect(() => {
    if (!isAuthReady || !db || !userId) {
      // Ждем инициализации Firebase и получения userId
      if (isAuthReady) setIsSessionChecking(false);
      return;
    }

    const checkSession = async () => {
      try {
        const sessionRef = getSessionDocRef(userId);
        const sessionSnap = await getDoc(sessionRef);

        if (sessionSnap.exists() && sessionSnap.data()?.isLoggedIn) {
          // Сессия найдена, пропускаем экран логина
          const data = sessionSnap.data() as any;
          setAuthData({ login: data.login, password: "***" }); // Пароль не храним
        }
      } catch (e) {
        console.error("Ошибка при чтении сессии:", e);
      } finally {
        setIsSessionChecking(false);
      }
    };

    void checkSession();
  }, [isAuthReady, db, userId]);

  // Обработчик логина (Теперь сохраняет сессию в Firestore)
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanLogin = login.trim();
    const cleanPassword = password.trim();

    // Проверки (остаются прежними)
    if (!cleanLogin || !cleanPassword) {
      setError("Введите логин и пароль");
      tg?.HapticFeedback.notificationOccurred("error");
      return;
    }
    if (!agreeOffer || !agreePersonal) {
      setError("Подтвердите согласие с условиями");
      tg?.HapticFeedback.notificationOccurred("warning");
      return;
    }

    try {
      setLoading(true);

      // Имитация API-ЗАПРОСА (Успех)
      await new Promise((r) => setTimeout(r, 1000));

      if (db && userId) {
        // --- 2. Сохранение статуса сессии в Firestore ---
        const sessionRef = getSessionDocRef(userId);
        await setDoc(sessionRef, {
          isLoggedIn: true,
          login: cleanLogin,
          timestamp: new Date().toISOString(),
        });
        // ------------------------------------------------

        setAuthData({ login: cleanLogin, password: cleanPassword });
        setActiveTab("cargo");
        setError(null);
        tg?.HapticFeedback.notificationOccurred("success");
      } else {
        throw new Error("Не удалось подключиться к базе данных.");
      }
    } catch (err: any) {
      setError(err?.message || "Ошибка сети");
      setAuthData(null);
      tg?.HapticFeedback.notificationOccurred("error");
    } finally {
      setLoading(false);
    }
  };

  // ЭКРАНЫ ЗАГРУЗКИ
  if (!isAuthReady || isSessionChecking) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: styles }} />
        <div className="page-center">
          <div className="loader-card">
            Загрузка приложения и проверка сессии...
          </div>
        </div>
      </>
    );
  }

  // --- ЭКРАН ЛОГИНА ---
  if (!authData) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: styles }} />
        <div className="page-center">
          <div className="login-card">
            <div className="logo-area">
              <div className="logo-text">HAULZ</div>
              <div className="tagline">Доставка грузов в Калининград</div>
              <div className="userId-info">ID: {userId}</div>
            </div>

            <form onSubmit={handleSubmit} className="form-stack">
              {/* Поля ввода */}
              <div className="input-group">
                <label>Логин</label>
                <input
                  className="tg-input"
                  type="text"
                  placeholder="email@example.com"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  autoComplete="username"
                />
              </div>
              <div className="input-group">
                <label>Пароль</label>
                <input
                  className="tg-input"
                  type="password"
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              {/* Чекбоксы */}
              <div className="checkbox-stack">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={agreeOffer}
                    onChange={(e) => {
                      setAgreeOffer(e.target.checked);
                      tg?.HapticFeedback.selectionChanged();
                    }}
                  />
                  <span>
                    Я согласен с <a href="#">офертой</a>
                  </span>
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={agreePersonal}
                    onChange={(e) => {
                      setAgreePersonal(e.target.checked);
                      tg?.HapticFeedback.selectionChanged();
                    }}
                  />
                  <span>
                    Обработка <a href="#">персональных данных</a>
                  </span>
                </label>
              </div>

              <button
                className="tg-main-button"
                type="submit"
                disabled={loading}
              >
                {loading ? "ВХОД..." : "ВОЙТИ"}
              </button>
            </form>

            {error && <div className="error-banner">{error}</div>}
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

/** @type {React.FC} */
function CargoPage() {
  const { tg } = useTelegram();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  /** @type {[DateFilter, React.Dispatch<React.SetStateAction<DateFilter>>]} */
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  /** @type {[CargoTab, React.Dispatch<React.SetStateAction<CargoTab>>]} */
  const [cargoTab, setCargoTab] = useState<CargoTab>("active");

  // Загрузка данных (Имитация)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setTimeout(() => {
        if (!cancelled) {
          setItems([
            {
              id: 1,
              Number: "CARGO-992",
              State: "В пути",
              From: "Москва",
              To: "Казань",
              DatePrih: "2023-11-01",
            },
            {
              id: 2,
              Number: "CARGO-112",
              State: "Создан",
              From: "СПБ",
              To: "Минск",
              DatePrih: "2023-11-05",
            },
            {
              id: 3,
              Number: "CARGO-777",
              State: "Доставлен",
              From: "Сочи",
              To: "Адлер",
              DatePrih: "2023-10-20",
            },
          ]);
          setLoading(false);
        }
      }, 1000);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const getStateKey = (item: any) => {
    const s = ((item.State || item.state || "") as string).toLowerCase();
    if (s.includes("в пути")) return "in_transit";
    if (s.includes("достав")) return "delivered";
    if (s.includes("создан")) return "created";
    return "all";
  };

  const isArchive = (item: any) => getStateKey(item) === "delivered";

  const filtered = items.filter((item) => {
    if (cargoTab === "active" && isArchive(item)) return false;
    if (cargoTab === "archive" && !isArchive(item)) return false;
    return true;
  });

  return (
    <div className="cargo-container">
      {/* Header + Табы статусов */}
      <div className="sticky-header">
        <div className="segment-control">
          {(["active", "archive", "attention"] as CargoTab[]).map((tab) => (
            <button
              key={tab}
              className={cargoTab === tab ? "active" : ""}
              onClick={() => {
                setCargoTab(tab);
                tg?.HapticFeedback.selectionChanged();
              }}
            >
              {tab === "active" && "Активные"}
              {tab === "archive" && "Архив"}
              {tab === "attention" && "Внимание"}
            </button>
          ))}
        </div>

        {/* Горизонтальные фильтры (Чипы) */}
        <div className="horizontal-scroll">
          {(["all", "today", "week", "month"] as DateFilter[]).map((f) => (
            <div
              key={f}
              className={`chip ${dateFilter === f ? "active" : ""}`}
              onClick={() => setDateFilter(f)}
            >
              {f === "all" ? "Все даты" : f}
            </div>
          ))}
        </div>
      </div>

      {/* Список карточек грузов */}
      <div className="cargo-list">
        {loading && <div className="loader">Загрузка...</div>}

        {!loading &&
          filtered.map((item, idx) => (
            <div key={idx} className="cargo-card-modern">
              <div className="card-top">
                <span className="cargo-id">{item.Number}</span>
                <span
                  className={`status-badge ${
                    getStateKey(item) as
                      | "in_transit"
                      | "delivered"
                      | "created"
                      | "all"
                  }`}
                >
                  {item.State}
                </span>
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
              <div className="card-bottom">📅 {item.DatePrih}</div>
            </div>
          ))}
        {!loading && filtered.length === 0 && (
          <div className="stub-page">Нет данных по текущим фильтрам.</div>
        )}
      </div>

      {/* FAB кнопка для создания новой перевозки */}
      <button
        className="fab-button"
        onClick={() => {
          alert("Новая перевозка (заглушка)");
          tg?.HapticFeedback.impactOccurred("medium");
        }}
      >
        +
      </button>
    </div>
  );
}

// ------------------------------------------------------
//                КОМПОНЕНТЫ МЕНЮ И ЗАГЛУШЕК
// ------------------------------------------------------

/** @type {React.FC<{active: Tab, onChange: (t: Tab) => void}>} */
function TabBar({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  const { tg } = useTelegram();
  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: "home", icon: "🏠", label: "Главная" },
    { id: "cargo", icon: "📦", label: "Грузы" },
    { id: "docs", icon: "📄", label: "Доки" },
    { id: "profile", icon: "👤", label: "Профиль" },
  ];

  return (
    <div className="bottom-tabbar">
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`tab-item ${active === t.id ? "active" : ""}`}
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
function StubPage({ title }: { title: string }) {
  return (
    <div className="stub-page">
      <h2>{title}</h2>
      <p>В разработке</p>
    </div>
  );
}

// ------------------------------------------------------
//                ВСТРОЕННЫЕ СТИЛИ (CSS)
// ------------------------------------------------------
const styles = `
... твой CSS без изменений ...
`;

export default App;
