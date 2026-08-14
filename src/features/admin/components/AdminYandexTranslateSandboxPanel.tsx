import React from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import type { AdminIntegrationsState } from "../hooks/useAdminIntegrations";

const SAMPLE_TEXTS = [
  "jewelry components",
  "usb adapter",
  "0460 jewelry components",
  "0460 usb adapter",
].join("\n");

type Props = Pick<
  AdminIntegrationsState,
  | "yandexConfigured"
  | "yandexKeyHint"
  | "yandexFolderConfigured"
  | "yandexFolderHint"
  | "yandexOpenaiConfigured"
  | "yandexPreferredProvider"
  | "yandexLoading"
  | "yandexError"
  | "yandexResult"
  | "yandexInput"
  | "setYandexInput"
  | "runYandexTranslate"
>;

export function AdminYandexTranslateSandboxPanel({
  yandexConfigured,
  yandexKeyHint,
  yandexFolderConfigured,
  yandexFolderHint,
  yandexOpenaiConfigured,
  yandexPreferredProvider,
  yandexLoading,
  yandexError,
  yandexResult,
  yandexInput,
  setYandexInput,
  runYandexTranslate,
}: Props) {
  const providerLabel =
    yandexPreferredProvider === "yandex"
      ? "Yandex"
      : yandexPreferredProvider === "openai"
        ? "OpenAI"
        : "не настроен";

  return (
    <Panel
      className="cargo-card"
      style={{ padding: "0.85rem", border: "1px solid var(--color-border)", marginTop: "0.9rem" }}
    >
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>
        Yandex Translate песочница
      </Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Проверка перевода en→ru для 5 POST. Ключи берутся с сервера API, не из браузера.
      </Typography.Body>

      <Typography.Body
        style={{
          fontSize: "0.8rem",
          marginBottom: "0.35rem",
          color: yandexConfigured ? "var(--color-text-secondary)" : "var(--color-error, #dc2626)",
        }}
      >
        YANDEX_TRANSLATE_API_KEY: {yandexConfigured ? `настроен (${yandexKeyHint || "скрыт"})` : "не задан"}
      </Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", marginBottom: "0.35rem", color: "var(--color-text-secondary)" }}>
        YANDEX_FOLDER_ID: {yandexFolderConfigured ? yandexFolderHint || "задан" : "не задан (может понадобиться для прав API-ключа)"}
      </Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", marginBottom: "0.75rem", color: "var(--color-text-secondary)" }}>
        OPENAI_API_KEY: {yandexOpenaiConfigured ? "настроен (fallback)" : "не задан"} · активный провайдер 5 POST:{" "}
        <strong>{providerLabel}</strong>
      </Typography.Body>

      <textarea
        value={yandexInput}
        onChange={(e) => setYandexInput(e.target.value)}
        placeholder={"jewelry components\nusb adapter\n0460 jewelry components"}
        style={{
          width: "100%",
          minHeight: "6.5rem",
          resize: "vertical",
          borderRadius: "8px",
          border: "1px solid var(--color-border)",
          background: "var(--color-bg)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: "0.78rem",
          lineHeight: 1.35,
          padding: "0.6rem",
          marginBottom: "0.55rem",
        }}
      />

      <Flex align="center" gap="0.45rem" wrap="wrap" style={{ marginBottom: "0.6rem" }}>
        <Button
          type="button"
          className="filter-button"
          disabled={yandexLoading}
          onClick={() => setYandexInput(SAMPLE_TEXTS)}
        >
          Примеры 5 POST
        </Button>
        <Button
          type="button"
          className="filter-button"
          disabled={yandexLoading || !yandexConfigured}
          onClick={() => void runYandexTranslate("direct")}
        >
          Yandex напрямую
        </Button>
        <Button
          type="button"
          className="filter-button"
          disabled={yandexLoading || !yandexPreferredProvider}
          onClick={() => void runYandexTranslate("productNames")}
        >
          Как productNames
        </Button>
        <Button
          type="button"
          className="filter-button"
          disabled={yandexLoading || !yandexPreferredProvider}
          onClick={() => void runYandexTranslate("fivepost")}
        >
          Как 5 POST (с артикулом)
        </Button>
        {yandexLoading ? (
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
            Запрос...
          </Typography.Body>
        ) : null}
      </Flex>

      {yandexError ? (
        <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-error, #dc2626)", marginBottom: "0.45rem" }}>
          {yandexError}
        </Typography.Body>
      ) : null}

      <textarea
        value={yandexResult}
        onChange={() => {}}
        readOnly
        placeholder="Ответ API появится здесь..."
        style={{
          width: "100%",
          minHeight: "14rem",
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
