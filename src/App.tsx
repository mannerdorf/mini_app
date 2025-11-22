
import { useEffect, useState } from "react";
import "./styles.css";

type AuthData = {
  login: string;
  token: string;
};

type Tab = "cargo" | "drivers";

// 🔐 Простая генерация токена (можно заменить на UUID/Hash)
const generateToken = (login: string) => {
  return btoa(`${login}_${Date.now()}`);
};

export default function App() {
  const [auth, setAuth] = useState<AuthData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("cargo");

  useEffect(() => {
    const login = localStorage.getItem("authLogin");
    const token = localStorage.getItem("authToken");
    if (login && token) {
      setAuth({ login, token });
    }
  }, []);

  const handleLogin = (login: string, password: string) => {
    // ⚠️ Здесь имитируем авторизацию — замените на реальную проверку!
    if (password === "123") {
      const token = generateToken(login);
      localStorage.setItem("authLogin", login);
      localStorage.setItem("authToken", token);
      setAuth({ login, token });
    } else {
      alert("Неверный пароль");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("authLogin");
    localStorage.removeItem("authToken");
    setAuth(null);
  };

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
        <h1>Добро пожаловать, {auth.login}</h1>
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
