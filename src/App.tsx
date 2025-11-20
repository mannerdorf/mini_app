import { FormEvent, useEffect, useState } from "react";

type AuthData = {
  login: string;
  password: string;
};

type Tab = "home" | "cargo" | "docs" | "support" | "profile";

function App() {
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

    const cleanLogin = login.trim();
    const cleanPassword = password.trim();

    if (!cleanLogin || !cleanPassword) {
      setError("Введите логин и пароль");
      return;
    }

    if (!agreeOffer || !agreePersonal) {
      setError("Подтвердите согласие с условиями");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch("/api/perevozki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: cleanLogin, password: cleanPassword }),
      });

      if (!res.ok) {
        let message = `Ошибка авторизации: ${res.status}`;
        try {
          const text = await res.text();
          if (text) message += ` — ${text}`;
        } catch {}
        setError(message);
        setAuth(null);
        return;
      }

      setAuth({ login: cleanLogin, password: cleanPassword });
      setActiveTab("cargo");
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Ошибка сети");
      setAuth(null);
    } finally {
      setLoading(false);
    }
  };

  // ---------- экран логина ----------
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

  // ---------- авторизованная часть ----------
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

// ------------------------------------------------------
//                ЭКРАН «ГРУЗЫ»
// ------------------------------------------------------

type CargoPageProps = { auth: AuthData };

type DateFilter = "all" | "today" | "week" | "month";
type StatusFilter = "all" | "created" | "accepted" | "in_transit" | "ready" | "delivered";
type CargoTab = "active" | "archive" | "attention";

function CargoPage({ auth }: CargoPageProps) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [cargoTab, setCargoTab] = useState<CargoTab>("active");

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
            login: auth.login.trim(),
            password: auth.password.trim(),
          }),
        });

        if (!res.ok) {
          let message = `Ошибка загрузки: ${res.status}`;
          try {
            const text = await res.text();
            if (text) message += ` — ${text}`;
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

  const getStateKey = (item: any): StatusFilter => {
    const s = ((item.State || item.state || "") as string).toLowerCase();
    if (!s) return "all";
    if (s.includes("создан")) return "created";
    if (s.includes("принят")) return "accepted";
    if (s.includes("в пути")) return "in_transit";
    if (s.includes("готов") || s.includes("выдаче")) return "ready";
    if (s.includes("достав")) return "delivered";
    return "all";
  };

  const isArchive = (item: any) => getStateKey(item) === "delivered";

  const isAttention = (item: any) => {
    const s = ((item.State || item.state || "") as string).toLowerCase();
    return s.includes("требует") || s.includes("ожид");
  };

  const getDate = (item: any): Date | null => {
    const raw =
      (item.DatePrih as string) ||
      (item.DatePr as string) ||
      (item.DateVr as string);
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  };

  const matchesDateFilter = (item: any) => {
    if (dateFilter === "all") return true;
    const d = getDate(item);
    if (!d) return true;

    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const diffDays = (startOfDay.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);

    switch (dateFilter) {
      case "today":
        return diffDays >= 0 && diffDays < 1;
      case "week":
        return diffDays >= 0 && diffDays < 7;
      case "month":
        return diffDays >= 0 && diffDays < 31;
      default:
        return true;
    }
  };

  const matchesStatusFilter = (item: any) => {
    if (statusFilter === "all") return true;
    return getStateKey(item) === statusFilter;
  };

  const matchesTab = (item: any) => {
    if (cargoTab === "active") return !isArchive(item);
    if (cargoTab === "archive") return isArchive(item);
    if (cargoTab === "attention") return isAttention(item);
    return true;
  };

  const filtered = items.filter(
    (it) => matchesDateFilter(it) && matchesStatusFilter(it) && matchesTab(it)
  );

  return (
    <div className="cargo-page">
      <div className="cargo-filters">
        <div className="filter-block">
          <div className="filter-title">Дата</div>
          <div className="filter-chip-row">
            <FilterChip
              label="Все"
              active={dateFilter === "all"}
              onClick={() => setDateFilter("all")}
            />
            <FilterChip
              label="Сегодня"
              active={dateFilter === "today"}
              onClick={() => setDateFilter("today")}
            />
            <FilterChip
              label="Неделя"
              active={dateFilter === "week"}
              onClick={() => setDateFilter("week")}
            />
            <FilterChip
              label="Месяц"
              active={dateFilter === "month"}
              onClick={() => setDateFilter("month")}
            />
          </div>
        </div>

        <div className="filter-block">
          <div className="filter-title">Статус</div>
          <div className="filter-chip-row">
            <FilterChip
              label="Все"
              active={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
            />
            <FilterChip
              label="Создана"
              active={statusFilter === "created"}
              onClick={() => setStatusFilter("created")}
            />
            <FilterChip
              label="Принят"
              active={statusFilter === "accepted"}
              onClick={() => setStatusFilter("accepted")}
            />
            <FilterChip
              label="В пути"
              active={statusFilter === "in_transit"}
              onClick={() => setStatusFilter("in_transit")}
            />
            <FilterChip
              label="Готов к выдаче"
              active={statusFilter === "ready"}
              onClick={() => setStatusFilter("ready")}
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        className="cargo-new-btn"
        onClick={() => alert("Новая перевозка (пока заглушка)")}
      >
        <span className="cargo-new-plus">+</span>
        <span>Новая перевозка</span>
      </button>

      <div className="cargo-tabs">
        <CargoTabButton
          label="Активные"
          active={cargoTab === "active"}
          onClick={() => setCargoTab("active")}
        />
        <CargoTabButton
          label="Архив"
          active={cargoTab === "archive"}
          onClick={() => setCargoTab("archive")}
        />
        <CargoTabButton
          label="Требуют действий"
          active={cargoTab === "attention"}
          onClick={() => setCargoTab("attention")}
        />
      </div>

      {loading && <p>Загружаем данные…</p>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && filtered.length === 0 && (
        <p className="subtitle">Перевозок по выбранным фильтрам нет.</p>
      )}

      <div className="cargo-list">
        {filtered.map((item, idx) => (
          <CargoCard item={item} key={idx} />
        ))}
      </div>
    </div>
  );
}

// --------- подкомпоненты для фильтров и карточек ----------

type FilterChipProps = {
  label: string;
  active: boolean;
  onClick: () => void;
};

function FilterChip({ label, active, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      className={`filter-chip ${active ? "filter-chip-active" : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

type CargoTabButtonProps = {
  label: string;
  active: boolean;
  onClick: () => void;
};

function CargoTabButton({ label, active, onClick }: CargoTabButtonProps) {
  return (
    <button
      type="button"
      className={`cargo-tab-btn ${active ? "cargo-tab-btn-active" : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function CargoCard({ item }: { item: any }) {
  const number = item.Number || item.number || "-";
  const state = item.State || item.state || "";
  const fromCity = item.FromCity || item.From || item.StartCity || "";
  const toCity = item.ToCity || item.To || item.EndCity || "";
  const planDate =
    item.DatePrih || item.DatePr || item.DateVr || item.PlanDate || "";

  return (
    <div className="cargo-card">
      <div className="cargo-card-header">
        <div className="cargo-card-number">{number}</div>
        <button className="cargo-card-copy" type="button">
          ⧉
        </button>
      </div>

      <div className="cargo-card-status-row">
        <span className="cargo-status-dot" />
        <span className="cargo-status-text">{state || "Статус не указан"}</span>
      </div>

      <div className="cargo-card-route">
        <div className="cargo-card-point">
          <span className="cargo-point-dot origin" />
          <div>
            <div className="cargo-point-label">Откуда</div>
            <div className="cargo-point-city">
              {fromCity || "Не указано место отправления"}
            </div>
          </div>
        </div>

        <div className="cargo-card-point">
          <span className="cargo-point-dot destination" />
          <div>
            <div className="cargo-point-label">Куда</div>
            <div className="cargo-point-city">
              {toCity || "Не указано место доставки"}
            </div>
          </div>
        </div>
      </div>

      <div className="cargo-card-footer">
        <span className="cargo-card-footer-icon">🕒</span>
        <span className="cargo-card-footer-text">
          Плановая доставка: {planDate || "дата не указана"}
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------
//         простые заглушки и таббар
// ------------------------------------------------------

function StubPage({ title }: { title: string }) {
  return (
    <div>
      <h2 className="title">{title}</h2>
      <p className="subtitle">Этот раздел мы заполним позже.</p>
    </div>
  );
}

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

// <<< ВАЖНО: default export >>>
export default App;
