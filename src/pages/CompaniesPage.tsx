import React from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { ArrowLeft, Building2 } from "lucide-react";

type CompaniesPageProps = {
  onBack: () => void;
  onSelectMethod: (method: "inn" | "login") => void;
};

export function CompaniesPage({ onBack, onSelectMethod }: CompaniesPageProps) {
  return (
    <div className="w-full">
      <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
        <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }} aria-label="Назад">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Typography.Headline style={{ fontSize: "1.25rem" }}>Мои компании</Typography.Headline>
      </Flex>

      <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
        <div
          style={{
            width: "60px",
            height: "60px",
            borderRadius: "50%",
            backgroundColor: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1rem",
          }}
        >
          <Building2 className="w-6 h-6" style={{ color: "var(--color-primary)" }} />
        </div>
        <Typography.Headline style={{ marginBottom: "0.5rem", fontSize: "1.1rem" }}>
          Выберите способ добавления
        </Typography.Headline>
        <Typography.Body
          style={{
            fontSize: "0.9rem",
            color: "var(--color-text-secondary)",
            display: "block",
            marginTop: "0.5rem",
          }}
        >
          Добавьте компанию по ИНН или используя логин и пароль
        </Typography.Body>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <Panel
          className="cargo-card"
          onClick={() => onSelectMethod("inn")}
          style={{ cursor: "pointer", padding: "1rem" }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelectMethod("inn");
            }
          }}
          aria-label="Добавить компанию по ИНН"
        >
          <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.9rem", fontWeight: "600" }}>
            По ИНН
          </Typography.Body>
          <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
            Введите ИНН компании для добавления
          </Typography.Body>
        </Panel>

        <Panel
          className="cargo-card"
          onClick={() => onSelectMethod("login")}
          style={{ cursor: "pointer", padding: "1rem" }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelectMethod("login");
            }
          }}
          aria-label="Добавить компанию по логину и паролю"
        >
          <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.9rem", fontWeight: "600" }}>
            По логину и паролю
          </Typography.Body>
          <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
            Используйте логин и пароль для доступа
          </Typography.Body>
        </Panel>
      </div>
    </div>
  );
}
