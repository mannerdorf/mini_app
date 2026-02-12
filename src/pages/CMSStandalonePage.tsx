import React, { useState, useEffect } from "react";
import { Button, Container, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import { AdminPage } from "./AdminPage";

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
  const [adminVerifyLoading, setAdminVerifyLoading] = useState(false);
  const [adminVerifyError, setAdminVerifyError] = useState<string | null>(null);

  const goBackToApp = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("tab");
      window.history.replaceState(null, "", url.toString());
      window.location.reload();
    } catch {
      window.location.href = window.location.pathname || "/";
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
      <Container className="app-container" style={{ padding: "1rem" }}>
        <AdminPage
          adminToken={adminToken}
          onBack={goBackToApp}
          onLogout={() => {
            try {
              if (typeof sessionStorage !== "undefined") sessionStorage.removeItem("haulz.adminToken");
            } catch {}
            setAdminToken(null);
          }}
        />
      </Container>
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
        <Typography.Body style={{ color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
          Введите логин и пароль администратора.
        </Typography.Body>
        <Input
          type="text"
          value={adminLoginInput}
          onChange={(e) => {
            setAdminLoginInput(e.target.value);
            setAdminVerifyError(null);
          }}
          placeholder="Логин"
          style={{ marginBottom: "0.5rem", width: "100%" }}
          autoComplete="username"
        />
        <Input
          type="password"
          value={adminPasswordInput}
          onChange={(e) => {
            setAdminPasswordInput(e.target.value);
            setAdminVerifyError(null);
          }}
          placeholder="Пароль"
          style={{ marginBottom: "0.75rem", width: "100%" }}
          autoComplete="current-password"
        />
        {adminVerifyError && (
          <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
            {adminVerifyError}
          </Typography.Body>
        )}
        <Button
          className="filter-button"
          disabled={adminVerifyLoading || !adminLoginInput.trim() || !adminPasswordInput}
          onClick={tryAdminAccess}
        >
          {adminVerifyLoading ? "Проверка…" : "Войти"}
        </Button>
      </Panel>
    </Container>
  );
}
