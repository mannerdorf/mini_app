import { FormEvent, useEffect, useState, useMemo } from "react";
// Tailwind CSS не используется в этом файле, но классы используются для адаптивности
// и чистой структуры, поэтому я добавляю минимальные встроенные стили (CSS)
// для реализации внешнего вида Telegram.

// --- 1. HOOK: ИМИТАЦИЯ useTelegram (Встроено) ---
// Этот код имитирует работу с Telegram WebApp API и предоставляет заглушки
const useTelegram = () => {
  const tg = window.Telegram?.WebApp;
  const isReady = !!tg;

  if (isReady) {
    // В реальном приложении:
    // tg.ready(); 
    // tg.expand(); 
  }

  return {
    tg,
    isReady,
    initData: tg?.initDataUnsafe || {},
    user: tg?.initDataUnsafe?.user,
    queryId: tg?.initDataUnsafe?.query_id,
  };
};

// --- 2. ТИПЫ ---
/** @typedef {{login: string, password: string}} AuthData */
/** @typedef {"home" | "cargo" | "docs" | "support" | "profile"} Tab */
/** @typedef {"all" | "today" | "week" | "month"} DateFilter */
/** @typedef {"all" | "created" | "accepted" | "in_transit" | "ready" | "delivered"} StatusFilter */
/** @typedef {"active" | "archive" | "attention"} CargoTab */


// --- 3. ГЛАВНЫЙ КОМПОНЕНТ APP ---
/** @type {React.FC} */
function App() {
  const { tg } = useTelegram();
  
  // Состояния для аутентификации
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [agreeOffer, setAgreeOffer] = useState(false);
  const [agreePersonal, setAgreePersonal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /** @type {[AuthData | null, React.Dispatch<React.SetStateAction<AuthData | null>>]} */
  const [auth, setAuth] = useState(null);
  /** @type {[Tab, React.Dispatch<React.SetStateAction<Tab>>]} */
  const [activeTab, setActiveTab] = useState("cargo");

  // Обработчик логина
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const cleanLogin = login.trim();
    const cleanPassword = password.trim();

    if (!cleanLogin || !cleanPassword) {
      setError("Введите логин и пароль");
      tg?.HapticFeedback.notificationOccurred('error'); 
      return;
    }

    if (!agreeOffer || !agreePersonal) {
      setError("Подтвердите согласие с условиями");
      tg?.HapticFeedback.notificationOccurred('warning');
      return;
    }

    try {
      setLoading(true);
      
      // Имитация API-ЗАПРОСА
      await new Promise(r => setTimeout(r, 1000));

      setAuth({ login: cleanLogin, password: cleanPassword });
      setActiveTab("cargo");
      setError(null);
      tg?.HapticFeedback.notificationOccurred('success'); 

    } catch (err) {
      setError(err?.message || "Ошибка сети");
      setAuth(null);
      tg?.HapticFeedback.notificationOccurred('error');
    } finally {
      setLoading(false);
    }
  };

  // --- ЭКРАН ЛОГИНА (Улучшенный стиль) ---
  if (!auth) {
    return (
      <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div className="page-center">
        <div className="login-card">
          <div className="logo-area">
            <div className="logo-text">HAULZ</div>
            <div className="tagline">Доставка грузов в Калининград</div>
          </div>

          <form onSubmit={handleSubmit} className="form-stack">
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
                <span>Я согласен с <a href="#">офертой</a></span>
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
                <span>Обработка <a href="#">персональных данных</a></span>
              </label>
            </div>

            <button className="tg-main-button" type="submit" disabled={loading}>
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
          {activeTab === "cargo" && <CargoPage auth={auth} />}
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

/** @type {React.FC<{auth: AuthData}>} */
function CargoPage({ auth }) {
  const { tg } = useTelegram();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  
  /** @type {[DateFilter, React.Dispatch<React.SetStateAction<DateFilter>>]} */
  const [dateFilter, setDateFilter] = useState("all");
  /** @type {[StatusFilter, React.Dispatch<React.SetStateAction<StatusFilter>>]} */
  const [statusFilter, setStatusFilter] = useState("all");
  /** @type {[CargoTab, React.Dispatch<React.SetStateAction<CargoTab>>]} */
  const [cargoTab, setCargoTab] = useState("active");

  // Загрузка данных (Имитация)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
        // Демонстрационные данные:
        setTimeout(() => {
            if(!cancelled) {
                setItems([
                    { id: 1, Number: "CARGO-992", State: "В пути", From: "Москва", To: "Казань", DatePrih: "2023-11-01" },
                    { id: 2, Number: "CARGO-112", State: "Создан", From: "СПБ", To: "Минск", DatePrih: "2023-11-05" },
                    { id: 3, Number: "CARGO-777", State: "Доставлен", From: "Сочи", To: "Адлер", DatePrih: "2023-10-20" },
                ]);
                setLoading(false);
            }
        }, 1000);
    };
    load();
    return () => { cancelled = true; };
  }, [auth]);

  // Вспомогательная функция 
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
      // Логика фильтров по дате и статусу здесь:
      // if (dateFilter !== 'all') { /* ... */ }
      // if (statusFilter !== 'all' && getStateKey(item) !== statusFilter) return false;
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
                        onClick={() => setDateFilter(f)}
                    >
                        {f === 'all' ? 'Все даты' : f}
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

        {/* FAB кнопка для создания новой перевозки */}
        <button className="fab-button" onClick={() => {
            // Замена alert() на кастомный Modal в реальном приложении
            alert('Новая перевозка (заглушка)');
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
    /* Переменные Telegram WebApp, по умолчанию белая тема */
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
}

/* --- ЛОГИН --- */
.page-center {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
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
    margin-bottom: 30px;
    font-size: 14px;
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
    padding-bottom: 80px; /* Место под таббар */
}

/* --- HEADER & FILTERS --- */
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
