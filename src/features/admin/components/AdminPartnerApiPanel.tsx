import React from "react";
import { Panel, Typography } from "@maxhub/max-ui";
import type { AdminIntegrationsState } from "../hooks/useAdminIntegrations";
import { PARTNER_API_PUBLIC_ORIGIN } from "../../../constants/partnerApi";

type Props = Pick<AdminIntegrationsState, 'partnerApiHealthJson'>;

export function AdminPartnerApiPanel({
  partnerApiHealthJson,
}: Props) {
  return (
<Panel className="cargo-card" style={{ padding: "0.85rem", border: "1px solid var(--color-border)", marginTop: "0.9rem" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Partner API и webhooks (v1)</Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.55rem" }}>
            Внешний REST v1: заголовок <code style={{ fontSize: "0.75rem" }}>Authorization: Bearer &lt;полный ключ haulz_… из ЛК пользователя&gt;</code>, тело как у кэшированных методов (без логина/пароля в теле).
            Базовый URL: <code style={{ fontSize: "0.75rem" }}>{PARTNER_API_PUBLIC_ORIGIN}</code>. Документация:{" "}
            <code style={{ fontSize: "0.75rem" }}>docs/PARTNER_API.md</code>.
            Эндпоинты: <code style={{ fontSize: "0.75rem" }}>/api/partner/v1/cargo</code>,{" "}
            <code style={{ fontSize: "0.75rem" }}>/api/partner/v1/sendings</code>, <code style={{ fontSize: "0.75rem" }}>/api/partner/v1/orders</code> (все POST).
            Мониторинг: поле <code style={{ fontSize: "0.75rem" }}>last_used_at</code> в таблице <code style={{ fontSize: "0.75rem" }}>user_api_keys</code> (Профиль → API).
            Исходящие webhooks: <code style={{ fontSize: "0.75rem" }}>HAULZ_PARTNER_WEBHOOK_URL</code> или <code style={{ fontSize: "0.75rem" }}>HAULZ_PARTNER_WEBHOOK_URLS</code> + секрет{" "}
            <code style={{ fontSize: "0.75rem" }}>HAULZ_PARTNER_WEBHOOK_SECRET</code> (подпись HMAC-SHA256 заголовка <code style={{ fontSize: "0.75rem" }}>X-Haulz-Signature</code> для тела с timestamp).
            Событие пример: <code style={{ fontSize: "0.75rem" }}>cargo.plan_date_batch_updated</code> после массовой записи плановой даты прибытия на терминал.
          </Typography.Body>
          <textarea
            value={partnerApiHealthJson}
            onChange={() => {}}
            readOnly
            placeholder="GET /api/partner/v1/health ..."
            style={{
              width: "100%",
              minHeight: "8rem",
              resize: "vertical",
              borderRadius: "8px",
              border: "1px solid var(--color-border)",
              background: "var(--color-bg)",
              fontFamily: 'ui-monospace, "Liberation Mono", monospace',
              fontSize: "0.75rem",
              lineHeight: 1.35,
              padding: "0.6rem",
            }}
          />
        </Panel>
  );
}
