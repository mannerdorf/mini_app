import { FormEvent, useState } from "react";

type ApiError = {
  error?: string;
  [key: string]: unknown;
};

export default function App() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [agreeOffer, setAgreeOffer] = useState(false);
  const [agreePersonal, setAgreePersonal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);

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

      const res = await fetch("/api/perevozki", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ login, password }),
      });

      if (!res.ok) {
        let message = `Ошибка авторизации: ${res.status}`;

        try {
          const data = (await res.json()) as ApiError;
          if (data.error) message = data.error;
        } catch {
          // не JSON — просто оставляем статус
        }

        setError(message);
        setAuthorized(false);
        return;
      }

      setAuthorized(true);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Ошибка сети");
      setAuthorized(false);
    } finally {
      setLoading(false);
    }
  };

  if (authorized) {
    return (
      <div className="page">
        <div className="card">
          <div className="logo-text">HAULZ</div>
          <div className="tagline">
            Доставка грузов в Калининград и обратно
          </div>

          <h2 className="title">Вы авторизованы</h2>
          <p className="subtitle">
            Дальше сюда выведем список перевозок или дашборд Haulz.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card">
        {/* ЛОГО/СЛОГАН */}
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

          <button
            className="button"
            type="submit"
            disabled={loading}
          >
            {loading ? "Проверяем…" : "Подтвердить"}
          </button>
        </form>

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
