import React, { useState, useEffect, Component, type ErrorInfo } from "react";
import { Button, Container, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import { Eye, EyeOff } from "lucide-react";
import { AdminPage } from "./AdminPage";

class AdminErrorBoundary extends Component<{ children: React.ReactNode; onBack: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("AdminPage error:", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <Container className="app-container" style={{ padding: "1rem" }}>
          <Panel className="cargo-card" style={{ padding: "1rem" }}>
            <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Ошибка загрузки админки</Typography.Body>
            <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
              {this.state.error.message}
            </Typography.Body>
            <Button className="filter-button" onClick={this.props.onBack}>
              ← В приложение
            </Button>
          </Panel>
        </Container>
      );
    }
    return this.props.children;
  }
}

/** CMS как отдельная страница по ?tab=cms — без входа в мини-приложение */
export function CMSStandalonePage() {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) {
      link.href = "/favicon-admin.png";
    }
  }, []);

  const [adminToken, setAdminToken] = useState<string | null>(() =>
    typeof sessionStorage !== "undefined" ? sessionStorage.getItem("haulz.adminToken") : null
  );
  const [adminLoginInput, setAdminLoginInput] = useState("");
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [adminVerifyLoading, setAdminVerifyLoading] = useState(false);
  const [adminVerifyError, setAdminVerifyError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const goBackToApp = () => {
    try {
      const path = window.location.pathname || "/";
      if (path === "/admin" || path === "/cms" || path.startsWith("/admin/") || path.startsWith("/cms/")) {
        window.location.href = "/";
        return;
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("tab");
      window.history.replaceState(null, "", url.toString());
      window.location.reload();
    } catch {
      window.location.href = "/";
    }
  };

  const tryAdminAccess = async () => {
    const login = adminLoginInput.trim();
    const password = adminPasswordInput;
    if (!login || !password) {
      setAdminVerifyError("Введите логин и пароль");
      return;
    }
    setAdminVerifyLoading(true);
    setAdminVerifyError(null);
    try {
      const res = await fetch("/api/verify-admin-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const data = await res.json();
      if (res.ok && data.adminToken) {
        if (typeof sessionStorage !== "undefined") sessionStorage.setItem("haulz.adminToken", data.adminToken);
        setAdminToken(data.adminToken);
      } else {
        setAdminVerifyError(data?.error || "Доступ запрещён");
      }
    } catch {
      setAdminVerifyError("Ошибка проверки доступа");
    } finally {
      setAdminVerifyLoading(false);
    }
  };

  if (adminToken) {
    return (
      <AdminErrorBoundary onBack={goBackToApp}>
        <Container className="app-container" style={{ padding: "1rem" }}>
          <AdminPage
            adminToken={adminToken}
            onBack={goBackToApp}
            onLogout={(reason) => {
              try {
                if (typeof sessionStorage !== "undefined") sessionStorage.removeItem("haulz.adminToken");
              } catch {}
              setSessionExpired(reason === "expired");
              setAdminToken(null);
            }}
          />
        </Container>
      </AdminErrorBoundary>
    );
  }

  return (
    <Container className="app-container login-form-wrapper">
      <Panel mode="secondary" className="login-card" style={{ maxWidth: 400 }}>
        <Flex align="center" justify="space-between" style={{ marginBottom: "1rem" }}>
          <Typography.Headline style={{ fontSize: "1.25rem" }}>CMS</Typography.Headline>
          <Button className="filter-button" onClick={goBackToApp} style={{ padding: "0.5rem" }}>
            ← В приложение
          </Button>
        </Flex>
        {sessionExpired && (
          <Typography.Body style={{ color: "var(--color-error-text, var(--color-error))", marginBottom: "0.75rem", fontSize: "0.9rem" }}>
            Сессия истекла или доступ недействителен. Войдите снова.
          </Typography.Body>
        )}
        <Typography.Body style={{ color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
          Введите логин и пароль администратора.
        </Typography.Body>
        <div className="field">
          <Input
            className="login-input"
            type="text"
            value={adminLoginInput}
            onChange={(e) => {
              setAdminLoginInput(e.target.value);
              setAdminVerifyError(null);
              setSessionExpired(false);
            }}
            placeholder="Логин"
            style={{ marginBottom: "0.5rem", width: "100%" }}
            autoComplete="username"
          />
        </div>
        <div className="field">
          <div className="password-input-container">
            <Input
              className="login-input password"
              type={showPassword ? "text" : "password"}
              value={adminPasswordInput}
              onChange={(e) => {
                setAdminPasswordInput(e.target.value);
                setAdminVerifyError(null);
                setSessionExpired(false);
              }}
              placeholder="Пароль"
              style={{ marginBottom: "0.75rem", width: "100%" }}
              autoComplete="current-password"
            />
            <Button
              type="button"
              className="toggle-password-visibility"
              onClick={() => setShowPassword((prev) => !prev)}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        {adminVerifyError && (
          <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
            {adminVerifyError}
          </Typography.Body>
        )}
        <Button
          className="button-primary"
          disabled={adminVerifyLoading || !adminLoginInput.trim() || !adminPasswordInput}
          onClick={tryAdminAccess}
        >
          {adminVerifyLoading ? "Проверка…" : "Войти"}
        </Button>
      </Panel>
    </Container>
  );
}
