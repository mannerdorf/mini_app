import React, { useState, useEffect } from "react";
import "./styles.css";

type CargoItem = {
  Номер: string;
  Дата: string;
  Грузоотправитель: string;
  Грузополучатель: string;
  ГородПогрузки: string;
  ГородВыгрузки: string;
  Статус: string;
  Вес: number;
  ПлатныйВес: number;
  Объем: number;
  Документ?: string;
};

export default function App() {
  // --- AUTH ---
  const [auth, setAuth] = useState({ login: "", password: "" });
  const [isLogged, setIsLogged] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loadingLogin, setLoadingLogin] = useState(false);

  // --- THEME ---
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    document.documentElement.className =
      theme === "dark" ? "dark-mode" : "light-mode";
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  // --- PASSWORD VISIBILITY ---
  const [showPassword, setShowPassword] = useState(false);

  // --- CARGO DATA ---
  const [cargo, setCargo] = useState<CargoItem[]>([]);
  const [loadingCargo, setLoadingCargo] = useState(false);

  // ============== LOGIN HANDLER =================
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoadingLogin(true);

    try {
      const res = await fetch("/api/perevozki", {
        headers: {
          Auth: `Basic ${auth.login}:${auth.password}`,
        },
      });

      if (!res.ok) {
        throw new Error("Неверный логин или пароль");
      }

      setIsLogged(true);
    } catch (err: any) {
      setLoginError(err.message || "Ошибка авторизации");
    } finally {
      setLoadingLogin(false);
    }
  };

  // ============== LOAD CARGO AFTER LOGIN =================
  useEffect(() => {
    if (!isLogged) return;

    const loadCargo = async () => {
      setLoadingCargo(true);
      try {
        const res = await fetch("/api/perevozki", {
          headers: {
            Auth: `Basic ${auth.login}:${auth.password}`,
          },
        });
        const json = await res.json();
        setCargo(Array.isArray(json) ? json : []);
      } catch (e) {
        console.error("Ошибка загрузки грузов", e);
      } finally {
        setLoadingCargo(false);
      }
    };

    loadCargo();
  }, [isLogged, auth.login, auth.password]);

  // =====================================================
  // LOGIN SCREEN (WITH THEME TOGGLER + EYE ICON)
  // =====================================================
  if (!isLogged) {
    return (
      <div className="login-form-wrapper">
        <div className="login-card">
          <div className="login-header-row">
            <div className="logo-text">HAULZ</div>

            {/* СТАРЫЙ ТУМБЛЕР ТЕМЫ */}
            <div className="switch-wrapper" onClick={toggleTheme}>
              <div className="switch-container">
                <div
                  className="switch-knob"
                  style={{
                    transform:
                      theme === "dark"
                        ? "translateX(18px)"
                        : "translateX(0px)",
                  }}
                />
              </div>
            </div>
          </div>

          <form className="form" onSubmit={handleLogin}>
            <div className="field">
              <input
                className="login-input"
                placeholder="Логин"
                value={auth.login}
                onChange={(e) =>
                  setAuth((prev) => ({ ...prev, login: e.target.value }))
                }
              />
            </div>

            <div className="field password-input-container">
              <input
                type={showPassword ? "text" : "password"}
                className="login-input"
                placeholder="Пароль"
                value={auth.password}
                onChange={(e) =>
                  setAuth((prev) => ({ ...prev, password: e.target.value }))
                }
              />

              {/* ГЛАЗИК "ПОКАЗАТЬ ПАРОЛЬ" */}
              <button
                type="button"
                className="password-visibility"
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>

            {loginError && (
              <div className="error-text">
                {loginError}
              </div>
            )}

            <button className="button-primary" type="submit" disabled={loadingLogin}>
              {loadingLogin ? "Входим..." : "Войти"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // =====================================================
  // CARGO PAGE (ONLY PAGE)
  // =====================================================
  return (
    <div className="app-container">
      <div className="app-header">
        <h1 className="header-title">Грузы</h1>

        {/* Можно оставить ТУМБЛЕР и здесь тоже, если нужно */}
        <div className="switch-wrapper" onClick={toggleTheme}>
          <div className="switch-container">
            <div
              className="switch-knob"
              style={{
                transform:
                  theme === "dark"
                    ? "translateX(18px)"
                    : "translateX(0px)",
              }}
            />
          </div>
        </div>
      </div>

      <div className="app-main">
        <div className="w-full">
          {loadingCargo ? (
            <div className="loading">Загрузка...</div>
          ) : cargo.length === 0 ? (
            <div className="empty">Нет данных</div>
          ) : (
            <div className="cargo-list">
              {cargo.map((item, index) => (
                <div className="cargo-card" key={index}>
                  <div className="cargo-header-row">
                    <span className="cargo-id">{item.Номер}</span>
                    <span className="cargo-status">{item.Статус}</span>
                  </div>

                  <div className="cargo-row">
                    <span className="cargo-label">Отправитель:</span>
                    {item.Грузоотправитель}
                  </div>

                  <div className="cargo-row">
                    <span className="cargo-label">Получатель:</span>
                    {item.Грузополучатель}
                  </div>

                  <div className="cargo-row">
                    <span className="cargo-label">Погрузка:</span>
                    {item.ГородПогрузки}
                  </div>

                  <div className="cargo-row">
                    <span className="cargo-label">Выгрузка:</span>
                    {item.ГородВыгрузки}
                  </div>

                  <div className="cargo-row">
                    <span className="cargo-label">Вес:</span>
                    {item.Вес} кг
                  </div>

                  <div className="cargo-row">
                    <span className="cargo-label">Платный вес:</span>
                    {item.ПлатныйВес} кг
                  </div>

                  <div className="cargo-row">
                    <span className="cargo-label">Объём:</span>
                    {item.Объем} м³
                  </div>

                  {item.Документ && (
                    <a
                      href={item.Документ}
                      target="_blank"
                      rel="noreferrer"
                      className="doc-link"
                    >
                      Скачать документ
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
