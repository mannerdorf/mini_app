import { useEffect, useState } from "react";
import "./index.css";
import { getToken, saveToken, removeToken } from "./hooks/auth";

type AuthData = { login: string; password: string };

export default function App() {
  const [auth, setAuth] = useState<AuthData | null>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const saved = getToken();
    if (saved) {
      const decoded = atob(saved);
      const [savedLogin, savedPassword] = decoded.split(":");
      setAuth({ login: savedLogin, password: savedPassword });
    }
  }, []);

  const handleLogin = () => {
    const token = btoa(`${login}:${password}`);
    saveToken(token);
    setAuth({ login, password });
  };

  const handleLogout = () => {
    removeToken();
    setAuth(null);
  };

  if (!auth) {
    return (
      <div>
        <h1>Вход</h1>
        <input
          placeholder="Email"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
        />
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button onClick={handleLogin}>Войти</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Добро пожаловать</h1>
      <button onClick={handleLogout}>Выйти</button>
    </div>
  );
}
