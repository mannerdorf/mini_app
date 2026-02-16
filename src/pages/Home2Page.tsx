import React from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { Home } from "lucide-react";

export function Home2Page() {
  return (
    <div
      className="home2-page"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        background: "var(--color-bg-primary)",
      }}
    >
      {/* Хедер */}
      <header
        className="home2-header"
        style={{
          flexShrink: 0,
          padding: "1rem 1.25rem",
          background: "var(--color-bg-elevated, var(--color-bg-card))",
          borderBottom: "1px solid var(--color-border)",
          boxShadow: "0 1px 0 var(--color-border)",
        }}
      >
        <Flex align="center" gap="0.75rem">
          <Home className="w-6 h-6" style={{ color: "var(--color-primary)" }} />
          <Typography.Headline style={{ fontSize: "1.25rem", fontWeight: 600 }}>
            Домой 2
          </Typography.Headline>
        </Flex>
      </header>

      {/* Основная область — пока пустая */}
      <main
        className="home2-main"
        style={{
          flex: 1,
          minHeight: "200px",
          padding: "1rem 1.25rem",
        }}
      />

      {/* Подвал */}
      <footer
        className="home2-footer"
        style={{
          flexShrink: 0,
          padding: "1rem 1.25rem",
          background: "var(--color-bg-elevated, var(--color-bg-card))",
          borderTop: "1px solid var(--color-border)",
          color: "var(--color-text-secondary)",
        }}
      >
        <Typography.Body style={{ fontSize: "0.875rem" }}>
          Подвал · Домой 2
        </Typography.Body>
      </footer>
    </div>
  );
}
