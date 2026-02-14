import React, { FormEvent, useState } from "react";
import { Button, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import { ArrowLeft, Building2, FileText, Loader2 } from "lucide-react";
import type { Account } from "../types";

type AddCompanyByINNPageProps = {
  activeAccount: Account | null;
  onBack: () => void;
  onSuccess: () => void;
};

export function AddCompanyByINNPage({ activeAccount, onBack, onSuccess }: AddCompanyByINNPageProps) {
  const [inn, setInn] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [showCodeInput, setShowCodeInput] = useState(false);
  const login = activeAccount?.login?.trim() || "";

  const handleSubmitINN = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!inn || (inn.length !== 10 && inn.length !== 12)) {
      setError("ИНН должен содержать 10 или 12 цифр");
      return;
    }
    if (!activeAccount?.isRegisteredUser || !login) {
      setError(
        "Добавление по ИНН доступно только зарегистрированным пользователям (вход по email и паролю). Сначала войдите в такой аккаунт."
      );
      return;
    }
    try {
      setLoading(true);
      const res = await fetch("/api/request-inn-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inn: inn.replace(/\D/g, ""), login }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ошибка запроса");
      setOtpCode("");
      setShowCodeInput(true);
    } catch (err: unknown) {
      setError((err as Error)?.message || "Ошибка при запросе");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (value: string) => {
    const digits = (value || "").replace(/\D/g, "").slice(0, 6);
    setOtpCode(digits);
    if (error) setError(null);
  };

  const handleCodeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6) {
      setError("Введите полный код из 6 цифр");
      return;
    }
    if (!login) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/verify-inn-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inn: inn.replace(/\D/g, ""), login, code: otpCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Неверный код");
      onSuccess();
    } catch (err: unknown) {
      setError((err as Error)?.message || "Неверный код подтверждения");
    } finally {
      setLoading(false);
    }
  };

  if (showCodeInput) {
    return (
      <div className="w-full">
        <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
          <Button
            className="filter-button"
            onClick={() => {
              setShowCodeInput(false);
              setError(null);
              setOtpCode("");
            }}
            style={{ padding: "0.5rem" }}
            aria-label="Назад"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Typography.Headline style={{ fontSize: "1.25rem" }}>Введите пин-код</Typography.Headline>
        </Flex>
        <div style={{ textAlign: "center", marginBottom: "1rem" }}>
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "50%",
              backgroundColor: "var(--color-bg-card)",
              border: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 0.75rem",
            }}
          >
            <FileText className="w-5 h-5" style={{ color: "var(--color-primary)" }} />
          </div>
          <Typography.Headline style={{ marginBottom: "0.5rem", fontSize: "1.1rem" }}>
            Введите пин-код из письма
          </Typography.Headline>
          <Typography.Body
            style={{
              fontSize: "0.9rem",
              color: "var(--color-text-secondary)",
              display: "block",
              marginTop: "0.5rem",
            }}
          >
            На верифицированную почту организации отправлено письмо с пин-кодом. Попросите руководителя
            передать вам пин-код (6 цифр).
          </Typography.Body>
        </div>
        <Panel className="cargo-card" style={{ padding: "1rem" }}>
          <form onSubmit={handleCodeSubmit}>
            <input
              className="login-input"
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              placeholder="------"
              value={otpCode}
              onChange={(e) => handleOtpChange(e.target.value)}
              style={{
                width: "100%",
                maxWidth: "320px",
                margin: "0 auto 1.25rem",
                display: "block",
                textAlign: "center",
                letterSpacing: "0.5rem",
                fontSize: "1.25rem",
                padding: "0.9rem 0.75rem",
              }}
              autoFocus
              aria-label="Пин-код из письма (6 цифр)"
            />
            {error && (
              <Typography.Body
                className="login-error"
                style={{ marginBottom: "1rem", textAlign: "center", fontSize: "0.9rem" }}
              >
                {error}
              </Typography.Body>
            )}
            <Button
              className="button-primary"
              type="submit"
              disabled={loading}
              style={{ width: "100%", marginBottom: "0.75rem", fontSize: "0.9rem", padding: "0.75rem" }}
            >
              {loading ? <Loader2 className="animate-spin w-4 h-4" /> : "Подтвердить"}
            </Button>
            <Button
              type="button"
              className="filter-button"
              onClick={onBack}
              style={{ width: "100%", fontSize: "0.9rem", padding: "0.75rem" }}
            >
              Отмена
            </Button>
          </form>
        </Panel>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
        <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }} aria-label="Назад">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Typography.Headline style={{ fontSize: "1.25rem" }}>Введите ИНН компании</Typography.Headline>
      </Flex>
      <div style={{ textAlign: "center", marginBottom: "1rem" }}>
        <div
          style={{
            width: "52px",
            height: "52px",
            borderRadius: "50%",
            backgroundColor: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 0.75rem",
          }}
        >
          <Building2 className="w-5 h-5" style={{ color: "var(--color-primary)" }} />
        </div>
        <Typography.Headline style={{ marginBottom: "0.5rem", fontSize: "1.1rem" }}>
          Введите ИНН компании
        </Typography.Headline>
        <Typography.Body
          style={{
            fontSize: "0.9rem",
            color: "var(--color-text-secondary)",
            display: "block",
            marginTop: "0.5rem",
          }}
        >
          Мы найдём компанию в справочнике и отправим на почту организации письмо: логин (ваш email) хочет
          доступ. Если руководитель согласен — он передаст вам пин-код из 6 цифр.
        </Typography.Body>
      </div>
      {!activeAccount?.isRegisteredUser && (
        <Typography.Body
          style={{
            fontSize: "0.85rem",
            color: "var(--color-error)",
            marginBottom: "0.75rem",
            display: "block",
          }}
        >
          Добавление по ИНН доступно только зарегистрированным пользователям (вход по email и паролю).
        </Typography.Body>
      )}
      <Panel className="cargo-card" style={{ padding: "1rem" }}>
        <form onSubmit={handleSubmitINN}>
          <div className="field form-row-same-height" style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="add-company-inn-input" className="visually-hidden">
              ИНН компании (10 или 12 цифр)
            </label>
            <Input
              id="add-company-inn-input"
              className="login-input"
              type="text"
              inputMode="numeric"
              placeholder="ИНН (10 или 12 цифр)"
              value={inn}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "");
                if (value.length <= 12) {
                  setInn(value);
                  setError(null);
                }
              }}
              autoFocus
              style={{ fontSize: "0.9rem" }}
              aria-label="ИНН компании (10 или 12 цифр)"
            />
          </div>
          {error && (
            <Typography.Body className="login-error" style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
              {error}
            </Typography.Body>
          )}
          <Button
            className="button-primary"
            type="submit"
            disabled={loading || !activeAccount?.isRegisteredUser}
            style={{ width: "100%", marginBottom: "0.75rem", fontSize: "0.9rem", padding: "0.75rem" }}
          >
            {loading ? <Loader2 className="animate-spin w-4 h-4" /> : "Получить код"}
          </Button>
          <Button
            type="button"
            className="filter-button"
            onClick={onBack}
            style={{ width: "100%", fontSize: "0.9rem", padding: "0.75rem" }}
          >
            Отмена
          </Button>
        </form>
      </Panel>
    </div>
  );
}
