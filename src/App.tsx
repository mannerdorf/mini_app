import { FormEvent, useEffect, useState } from "react";

type ApiError = {
  error?: string;
  [key: string]: unknown;
};

type AuthData = {
  login: string;
  password: string;
};

type Tab = "home" | "cargo" | "docs" | "support" | "profile";

export default function App() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [agreeOffer, setAgreeOffer] = useState(false);
  const [agreePersonal, setAgreePersonal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [auth, setAuth] = useState<AuthData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("cargo"); // после логина сразу "Грузы"

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!login || !password) {
      setError("Введите логин и пароль");
      return;
    }

    if (!agreeOffer || !agreePersonal) {
      setError("Подтвердите согласие с условиями");
      return;
    }

    try {
      setLoading(true);

      // Проверяем авторизацию тестовым запросом
      const res = await fetch("/api/perevozki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });

      if (!res.ok) {
        let message = `Ошибка авторизации: ${res.status}`;
        try {
          const data = (await res.json()) as ApiError;
          if (data.error) message = data.error;
        } catch {
          // не JSON — оставляем стандартный текст
        }
        setError(message);
        setAuth(null);
        return;
      }

      // Авторизация ок
      setAuth({ login, password });
      setActiveTab("cargo");
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Ошибка сети");
      setAuth(null);
    } finally {
      setLoading(false);
    }
  };

  // --------------- ЭКРАН АВТОРИЗАЦИИ ---------------
  if (!auth) {
    return (
      <div className="page">
        <div className="card">
          <div className="logo-text">HAULZ</div>
          <div className="tagline">
            Доставка грузов в Калининград и обратно
          </div>

          <form onSubmit={handleSubmit} className="form">
            <div className="field">
              <div className="field-label">Логин (email)</div>
              <input
                className="input"
                type="text"
                placeholder="order@lal-auto.com"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                autoComplete="username"
              />
            </div>

            <div className="field">
              <div className="field-label">Пароль</div>
              <input
                className="input"
                type="password"
                placeholder="Введите пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={agreeOffer}
                onChange={(e) => setAgreeOffer(e.target.checked)}
              />
              <span>
                Согласие с{" "}
                <a href="#" target="_blank" rel="noreferrer">
                  публичной офертой
                </a>
              </span>
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={agreePersonal}
                onChange={(e) => setAgreePersonal(e.target.checked)}
              />
              <span>
                Согласие на{" "}
                <a href="#" target="_blank" rel="noreferrer">
                  обработку персональных данных
                </a>
              </span>
            </label>

            <button className="button" type="submit" disabled={loading}>
              {loading ? "Проверяем…" : "Подтвердить"}
            </button>
          </form>

          {error && <p className="error">{error}</p>}
        </div>
      </div>
    );
  }

  // --------------- АВТОРИЗОВАННАЯ ЧАСТЬ ---------------

  return (
    <div className="app-shell">
      <div className="page page-with-tabs">
        <div className="card card-content">
          {activeTab === "cargo" && <CargoPage auth={auth} />}
          {activeTab === "home" && <StubPage title="Главная" />}
          {activeTab === "docs" && <StubPage title="Документы" />}
          {activeTab === "support" && <StubPage title="Поддержка" />}
          {activeTab === "profile" && <StubPage title="Профиль" />}
        </div>
      </div>

      <TabBar active={activeTab} onChange={setActiveTab} />
    </div>
  );
}

// ----------------- КОМПОНЕНТ С ГРУЗАМИ -----------------

type CargoPageProps = { auth: AuthData };

function CargoPage({ auth }: CargoPageProps) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/perevozki", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            login: auth.login,
            password: auth.password,
          }),
        });

        if (!res.ok) {
          let message = `Ошибка загрузки: ${res.status}`;
          try {
            const data = (await res.json()) as ApiError;
            if (data.error) message = data.error;
          } catch {}
          if (!cancelled) setError(message);
          return;
        }

        const data = await res.json();
        const list = Array.isArray(data) ? data : data.items || [];
        if (!cancelled) setItems(list);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Ошибка сети");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [auth.login, auth.password]);

  return (
    <div>
      <h2 className="title">Грузы</h2>
      <p className="subtitle">
        Здесь отображаются все перевозки, полученные из системы.
      </p>

      {loading && <p>Загружаем данные…</p>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p>Перевозок не найдено за выбранный период.</p>
      )}

      <div className="cargo-list">
        {items.map((item, idx) => (
          <div className="cargo-card" key={idx}>
            <div className="cargo-row main">
              <span className="cargo-label">№</span>
              <span className="cargo-value">
                {item.Number || item.number || "-"}
              </span>
            </div>

            <div className="cargo-row">
              <span className="cargo-label">Статус</span>
              <span className="cargo-value">
                {item.State || item.state || "-"}
              </span>
            </div>

            <div className="cargo-row">
              <span className="cargo-label">Дата прибытия</span>
              <span className="cargo-value">
                {item.DatePrih || item.DatePr || "-"}
              </span>
            </div>

            <div className="cargo-row">
              <span className="cargo-label">Мест</span>
              <span className="cargo-value">
                {item.Mest || item.mest || "-"}
              </span>
            </div>

            <div className="cargo-row">
              <span className="cargo-label">Вес, кг</span>
              <span className="cargo-value">
                {item.PW || item.Weight || "-"}
              </span>
            </div>

            <div className="cargo-row">
              <span className="cargo-label">Сумма</span>
              <span className="cargo-value">
                {item.Sum || item.Total || "-"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------- ЗАГЛУШКИ ДЛЯ ДРУГИХ ВКЛАДОК -----------------

function StubPage({ title }: { title: string }) {
  return (
    <div>
      <h2 className="title">{title}</h2>
      <p className="subtitle">Этот раздел мы заполним позже.</p>
    </div>
  );
}

// ----------------- НИЖНЕЕ МЕНЮ -----------------

type TabBarProps = {
  active: Tab;
  onChange: (t: Tab) => void;
};

function TabBar({ active, onChange }: TabBarProps) {
  return (
    <div className="tabbar">
      <TabButton
        label="Главная"
        icon="🏠"
        active={active === "home"}
        onClick={() => onChange("home")}
      />
      <TabButton
        label="Грузы"
        icon="📦"
        active={active === "cargo"}
        onClick={() => onChange("cargo")}
      />
      <TabButton
        label="Документы"
        icon="📄"
        active={active === "docs"}
        onClick={() => onChange("docs")}
      />
      <TabButton
        label="Поддержка"
        icon="💬"
        active={active === "support"}
        onClick={() => onChange("support")}
      />
      <TabButton
        label="Профиль"
        icon="👤"
        active={active === "profile"}
        onClick={() => onChange("profile")}
      />
    </div>
  );
}

type TabButtonProps = {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
};

function TabButton({ label, icon, active, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      className={`tab-btn ${active ? "tab-btn-active" : ""}`}
      onClick={onClick}
    >
      <span className="tab-icon">{icon}</span>
      <span className="tab-label">{label}</span>
    </button>
  );
}
