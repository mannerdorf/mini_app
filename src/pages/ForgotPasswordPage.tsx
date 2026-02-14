import React from "react";
import { Button, Container, Flex, Panel, Typography } from "@maxhub/max-ui";
import { ArrowLeft, Lock } from "lucide-react";
import { getWebApp } from "../webApp";

const DEFAULT_FORGOT_URL = "https://lk.haulz.pro/forgot-password";

type ForgotPasswordPageProps = {
  /** Вернуться к форме входа */
  onBackToLogin: () => void;
  /** Ссылка на восстановление пароля на сайте (открывается в браузере/внешней вкладке) */
  forgotPasswordUrl?: string;
};

export function ForgotPasswordPage({ onBackToLogin, forgotPasswordUrl = DEFAULT_FORGOT_URL }: ForgotPasswordPageProps) {
  const openForgotLink = () => {
    const webApp = getWebApp();
    if (webApp?.openLink) {
      webApp.openLink(forgotPasswordUrl);
    } else {
      window.open(forgotPasswordUrl, "_blank", "noopener,noreferrer");
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
        <Flex align="flex-start" gap="0.5rem" style={{ marginBottom: "1rem" }}>
          <Lock className="w-5 h-5" style={{ color: "var(--color-text-secondary)", flexShrink: 0, marginTop: 2 }} />
          <Typography.Body style={{ color: "var(--color-text-secondary)", fontSize: "0.95rem", lineHeight: 1.5 }}>
            Восстановление пароля от личного кабинета HAULZ выполняется на сайте. Перейдите по ссылке ниже, введите ваш email — на почту придёт инструкция. После сброса пароля вернитесь сюда и войдите с новым паролем.
          </Typography.Body>
        </Flex>
        <Button
          type="button"
          className="button-primary"
          onClick={openForgotLink}
          style={{ width: "100%", marginBottom: "1rem" }}
        >
          Перейти к восстановлению пароля
        </Button>
        <Button type="button" className="filter-button" onClick={onBackToLogin} style={{ width: "100%" }}>
          Вернуться к входу
        </Button>
      </Panel>
    </Container>
  );
}
