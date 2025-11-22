
import { useEffect, useState } from "react";
import "./styles.css";

// Типизация
type AuthData = {
  token: string;
  login: string;
};

type Tab = "cargo" | "drivers";

export default function App() {
  const [auth, setAuth] = useState<AuthData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("cargo");

  // 🚀 При старте проверяем токен в localStorage
  useEffect(() => {
    const saved = localStorage.getItem("authToken");
    const login = localStorage.getItem("authLogin");
    if (saved && login) {
      setAuth({ token: saved, login });
    }
  }, []);

  // 🔐 Форма авторизации
  const handleLogin = async (login: string, password: string) => {
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });

      if (!res.ok) throw new Error("Ошибка авторизации");

      const { token } = await res.json();

      // 💾 Сохраняем токен
      localStorage.setItem("authToken", token);
      localStorage.setItem("authLogin", login);
      setAuth({ token, login });
    } catch (err) {
      alert("Неверный логин или пароль");
    }
  };

  // 🚪 Выход
  const handleLogout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("authLogin");
    setAuth(null);
  };

  // UI
  if (!auth) {
    return (
      <div className="login">
        <h2>Вход</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const login = (e.currentTarget.elements.namedItem("login") as HTMLInputElement).value;
            const password = (e.currentTarget.elements.namedItem("password") as HTMLInputElement).value;
            handleLogin(login, password);
          }}
        >
          <input name="login" placeholder="Логин" />
          <input name="password" placeholder="Пароль" type="password" />
          <button type="submit">Войти</button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <header>
        <h1>Личный кабинет</h1>
        <p>Вы вошли как: {auth.login}</p>
        <button onClick={handleLogout}>Выйти</button>
      </header>
      <nav>
        <button onClick={() => setActiveTab("cargo")}>Грузы</button>
        <button onClick={() => setActiveTab("drivers")}>Водители</button>
      </nav>
      <main>
        {activeTab === "cargo" && <div>Здесь список грузов</div>}
        {activeTab === "drivers" && <div>Здесь список водителей</div>}
      </main>
    </div>
  );
}
