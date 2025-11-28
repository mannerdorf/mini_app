import React, { useState, useEffect } from "react";
import CargoPage from "./hooks/CargoPage"; // грузовая страница — твоя текущая
import "./index.css";
import "./styles.css";

export default function App() {
    const [auth, setAuth] = useState(() => {
        try {
            const stored = localStorage.getItem("haulz_auth");
            return stored ? JSON.parse(stored) : null;
        } catch {
            return null;
        }
    });

    const [passwordVisible, setPasswordVisible] = useState(false);
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem("theme") || "light";
    });

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("theme", theme);
    }, [theme]);

    const [login, setLogin] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        setError("");

        if (!login || !password) {
            setError("Введите логин и пароль");
            return;
        }

        try {
            const result = await fetch("/api/perevozki", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login, password }),
            });

            if (!result.ok) {
                setError("Неверный логин или пароль");
                return;
            }

            const data = await result.json();

            const session = {
                login,
                password,
                token: data?.token || "",
            };

            localStorage.setItem("haulz_auth", JSON.stringify(session));
            setAuth(session);
        } catch {
            setError("Ошибка сети.");
        }
    }

    // ============================
    // 🎯 ЕСЛИ НЕТ АВТОРИЗАЦИИ — ПОКАЗЫВАЕМ СТАРУЮ СТРАНИЦУ ЛОГИНА (НЕ МЕНЯЕМ)
    // ============================

    if (!auth) {
        return (
            <div className="login-wrapper">
                <div className="login-card-new">

                    {/* Тумблер темы — как был */}
                    <div
                        className="theme-toggle"
                        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                    >
                        {theme === "light" ? "🌞" : "🌙"}
                    </div>

                    <h1 className="login-title">HAULZ</h1>
                    <p className="login-subtitle">Доставка грузов в Калининград</p>

                    <form className="login-form-modern" onSubmit={handleLogin}>
                        <input
                            type="email"
                            className="input-modern"
                            placeholder="Логин"
                            value={login}
                            onChange={(e) => setLogin(e.target.value)}
                        />

                        <div className="password-wrapper">
                            <input
                                type={passwordVisible ? "text" : "password"}
                                className="input-modern"
                                placeholder="Пароль"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            <button
                                type="button"
                                className="password-eye-modern"
                                onClick={() => setPasswordVisible(!passwordVisible)}
                            >
                                {passwordVisible ? "🙈" : "👁️"}
                            </button>
                        </div>

                        {error && <div className="login-error-modern">{error}</div>}

                        <button type="submit" className="button-modern-primary">
                            Войти
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // ============================
    // 🎯 ЕСЛИ ЕСТЬ АВТОРИЗАЦИЯ — СРАЗУ ПОКАЗЫВАЕМ ГРУЗЫ
    // ============================

    return (
        <CargoPage
            auth={auth}
            onLogout={() => {
                localStorage.removeItem("haulz_auth");
                setAuth(null);
            }}
        />
    );
}
