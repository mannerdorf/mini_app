import React, { useState } from "react";
import { Button, Container, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { ArrowLeft, Loader2, Mail } from "lucide-react";

type ForgotPasswordPageProps = {
  /** Вернуться к форме входа */
  onBackToLogin: () => void;
  /** Предзаполненный email из формы входа */
  initialEmail?: string;
};

export function ForgotPasswordPage({ onBackToLogin, initialEmail }: ForgotPasswordPageProps) {
  const [login, setLogin] = useState((initialEmail || "").trim());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success?: boolean; error?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = login.trim();
    if (!trimmed) {
      setResult({ error: "Введите логин (email)" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.emailSent) {
        setResult({ success: true });
        setLogin("");
      } else {
        setResult({ error: data?.error || "Ошибка сброса пароля" });
      }
    } catch {
      setResult({ error: "Ошибка сети" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="app-container login-form-wrapper">
      <Panel mode="secondary" className="login-card" style={{ maxWidth: 400 }}>
        <Flex align="center" gap="0.5rem" style={{ marginBottom: "1rem" }}>
          <Button
            type="button"
            className="filter-button"
            onClick={onBackToLogin}
            style={{ padding: "0.5rem" }}
            aria-label="Вернуться к входу"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Typography.Headline style={{ fontSize: "1.25rem" }}>Забыли пароль?</Typography.Headline>
        </Flex>
        <Typography.Body style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem", lineHeight: 1.5, marginBottom: "1.25rem" }}>
          Введите email, указанный при регистрации — мы отправим на него новый пароль.
        </Typography.Body>
        <form onSubmit={handleSubmit}>
          <label htmlFor="forgot-login" className="visually-hidden">Email</label>
          <Flex align="center" gap="0.5rem" style={{ marginBottom: "1.25rem", border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.5rem 0.75rem", background: "var(--color-bg-input, #fff)" }}>
            <Mail className="w-5 h-5" style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} aria-hidden />
            <Input
              id="forgot-login"
              type="email"
              inputMode="email"
              autoComplete="username email"
              placeholder="Введите email..."
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              disabled={loading}
              className="admin-form-input"
              style={{ border: "none", background: "transparent", flex: 1, padding: "0.25rem 0" }}
            />
          </Flex>
          {result?.success && (
            <Typography.Body style={{ color: "var(--color-success-status)", fontSize: "0.9rem", marginBottom: "0.75rem" }}>
              Пароль сброшен. Новый пароль отправлен на указанный email.
            </Typography.Body>
          )}
          {result?.error && (
            <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.9rem", marginBottom: "0.75rem" }}>
              {result.error}
            </Typography.Body>
          )}
          <Flex align="center" gap="0.35rem" style={{ marginBottom: "1rem" }}>
            <Typography.Body style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>
              Помните пароль?
            </Typography.Body>
            <button
              type="button"
              onClick={onBackToLogin}
              style={{ background: "none", border: "none", padding: 0, color: "var(--color-primary-blue)", cursor: "pointer", fontSize: "0.9rem", fontWeight: 500 }}
            >
              Войти
            </button>
          </Flex>
          <Button
            type="submit"
            className="button-primary"
            disabled={loading}
            style={{ width: "100%", borderRadius: 8 }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Запросить сброс пароля"}
          </Button>
        </form>
      </Panel>
    </Container>
  );
}
