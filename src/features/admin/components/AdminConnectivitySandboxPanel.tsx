import React from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import type { AdminIntegrationsState } from "../hooks/useAdminIntegrations";

type Props = Pick<
  AdminIntegrationsState,
  | "connectivityLoading"
  | "connectivityError"
  | "connectivityResult"
  | "runConnectivityCheck"
>;

function statusColor(ok: boolean | null | undefined): string {
  if (ok === true) return "var(--color-success, #16a34a)";
  if (ok === false) return "var(--color-error, #dc2626)";
  return "var(--color-text-secondary)";
}

export function AdminConnectivitySandboxPanel({
  connectivityLoading,
  connectivityError,
  connectivityResult,
  runConnectivityCheck,
}: Props) {
  let summaryOk: boolean | null = null;
  let summaryText = "Нажмите «Проверить», чтобы прогнать цепочку фронт → API → БД.";

  if (connectivityResult) {
    try {
      const parsed = JSON.parse(connectivityResult) as {
        summary?: { ok?: boolean; text?: string };
      };
      summaryOk = parsed.summary?.ok ?? null;
      summaryText = parsed.summary?.text || summaryText;
    } catch {
      summaryText = "Не удалось разобрать результат проверки.";
    }
  }

  return (
    <Panel
      className="cargo-card"
      style={{ padding: "0.85rem", border: "1px solid var(--color-border)", marginBottom: "0.9rem" }}
    >
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>
        Песочница доступности (фронт / API / БД)
      </Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Диагностика для случаев «нет компаний» и пустых грузов: проверяет, доходит ли браузер до API и может ли API
        подключиться к Postgres.
      </Typography.Body>

      <Typography.Body
        style={{
          fontSize: "0.82rem",
          marginBottom: "0.65rem",
          color: statusColor(summaryOk),
          fontWeight: summaryOk === false ? 600 : 400,
        }}
      >
        {summaryText}
      </Typography.Body>

      <Flex align="center" gap="0.45rem" wrap="wrap" style={{ marginBottom: "0.6rem" }}>
        <Button
          type="button"
          className="filter-button"
          style={{ background: "var(--color-primary-blue)", color: "white" }}
          disabled={connectivityLoading}
          onClick={() => void runConnectivityCheck()}
        >
          {connectivityLoading ? "Проверка..." : "Проверить"}
        </Button>
      </Flex>

      {connectivityError ? (
        <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-error, #dc2626)", marginBottom: "0.45rem" }}>
          {connectivityError}
        </Typography.Body>
      ) : null}

      <textarea
        value={connectivityResult}
        onChange={() => {}}
        readOnly
        placeholder="JSON-отчёт появится здесь..."
        style={{
          width: "100%",
          minHeight: "18rem",
          resize: "vertical",
          borderRadius: "8px",
          border: "1px solid var(--color-border)",
          background: "var(--color-bg)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: "0.75rem",
          lineHeight: 1.35,
          padding: "0.6rem",
        }}
      />
    </Panel>
  );
}
