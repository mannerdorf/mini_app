import React, { useState, useEffect, useCallback, useRef, Component, type ErrorInfo } from "react";
import { Button, Container, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import { Eye, EyeOff } from "lucide-react";
import { AdminPage } from "./AdminPage";

/** Декодирует exp (мс) из JWT-подобного токена админки (payload.base64url). */
function getAdminTokenExpiry(token: string): number | null {
  try {
    const part = token.split(".")[0];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

const SESSION_WARNING_BEFORE_MS = 2 * 60 * 1000; // предупреждение за 2 минуты
const SESSION_CHECK_INTERVAL_MS = 30 * 1000;     // проверка каждые 30 сек

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

/** Красный фавикон для админки (data URL) */
const ADMIN_FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#b91c1c"/></svg>'
  );

/** CMS как отдельная страница по ?tab=cms — без входа в мини-приложение */
export function CMSStandalonePage() {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) {
      link.href = ADMIN_FAVICON;
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
  const [sessionWarningOpen, setSessionWarningOpen] = useState(false);
  const [sessionWarningExpiresAt, setSessionWarningExpiresAt] = useState<number | null>(null);
  const [sessionRefreshLoading, setSessionRefreshLoading] = useState(false);
  const sessionExpiresAtRef = useRef<number | null>(null);

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
      if (res.status === 429) {
        setAdminVerifyError(data?.error || "Слишком много попыток. Подождите минуту.");
        return;
      }
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

  const refreshSession = useCallback(async () => {
    if (!adminToken) return;
    setSessionRefreshLoading(true);
    try {
      const res = await fetch("/api/admin-refresh-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (res.ok && data.adminToken) {
        if (typeof sessionStorage !== "undefined") sessionStorage.setItem("haulz.adminToken", data.adminToken);
        setAdminToken(data.adminToken);
        setSessionWarningOpen(false);
        setSessionWarningExpiresAt(null);
      } else {
        if (typeof sessionStorage !== "undefined") sessionStorage.removeItem("haulz.adminToken");
        setAdminToken(null);
        setSessionExpired(true);
        setSessionWarningOpen(false);
      }
    } catch {
      setSessionWarningOpen(false);
    } finally {
      setSessionRefreshLoading(false);
    }
  }, [adminToken]);

  useEffect(() => {
    if (!adminToken) {
      sessionExpiresAtRef.current = null;
      return;
    }
    const exp = getAdminTokenExpiry(adminToken);
    sessionExpiresAtRef.current = exp;
  }, [adminToken]);

  useEffect(() => {
    if (!adminToken) return;
    const check = () => {
      const exp = sessionExpiresAtRef.current;
      if (exp == null) return;
      const now = Date.now();
      if (now >= exp) {
        try {
          if (typeof sessionStorage !== "undefined") sessionStorage.removeItem("haulz.adminToken");
        } catch {}
        setAdminToken(null);
        setSessionExpired(true);
        setSessionWarningOpen(false);
        return;
      }
      if (exp - now <= SESSION_WARNING_BEFORE_MS) {
        setSessionWarningExpiresAt(exp);
        setSessionWarningOpen(true);
      }
    };
    check();
    const id = setInterval(check, SESSION_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [adminToken]);

  const [sessionWarningTick, setSessionWarningTick] = useState(0);
  useEffect(() => {
    if (!sessionWarningOpen || !sessionWarningExpiresAt) return;
    const id = setInterval(() => setSessionWarningTick((t) => t + 1), 10000);
    return () => clearInterval(id);
  }, [sessionWarningOpen, sessionWarningExpiresAt]);

  const sessionWarningMinutes = sessionWarningExpiresAt
    ? Math.max(0, Math.ceil((sessionWarningExpiresAt - Date.now()) / 60000))
    : 0;

  if (adminToken) {
    return (
      <AdminErrorBoundary onBack={goBackToApp}>
        <Container className="app-container" style={{ padding: "1rem" }}>
          {sessionWarningOpen && (
            <div
              className="modal-overlay"
              style={{ zIndex: 10001 }}
              onClick={(e) => e.target === e.currentTarget && !sessionRefreshLoading && setSessionWarningOpen(false)}
            >
              <div className="modal-content" style={{ maxWidth: "22rem" }} onClick={(e) => e.stopPropagation()}>
                <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
                  Сессия истекает
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
                  {sessionWarningMinutes <= 0
                    ? "Сессия истекла. Войдите снова."
                    : `Сессия истекает через ${sessionWarningMinutes} мин. Нажмите «Продолжить», чтобы остаться в админке.`}
                </Typography.Body>
                <Flex gap="0.5rem" wrap="wrap">
                  <Button
                    className="button-primary"
                    disabled={sessionRefreshLoading || sessionWarningMinutes <= 0}
                    onClick={refreshSession}
                  >
                    {sessionRefreshLoading ? "…" : "Продолжить"}
                  </Button>
                  <Button
                    type="button"
                    className="filter-button"
                    disabled={sessionRefreshLoading}
                    onClick={() => {
                      setSessionWarningOpen(false);
                      try {
                        if (typeof sessionStorage !== "undefined") sessionStorage.removeItem("haulz.adminToken");
                      } catch {}
                      setAdminToken(null);
                    }}
                  >
                    Выйти
                  </Button>
                </Flex>
              </div>
            </div>
          )}
          <AdminPage
            adminToken={adminToken}
            onBack={goBackToApp}
            onLogout={(reason) => {
              try {
                if (typeof sessionStorage !== "undefined") sessionStorage.removeItem("haulz.adminToken");
              } catch {}
              setSessionExpired(reason === "expired");
              setSessionWarningOpen(false);
              setSessionWarningExpiresAt(null);
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
