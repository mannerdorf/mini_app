import React from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import type { AdminIntegrationsState } from "../hooks/useAdminIntegrations";

type Props = Pick<AdminIntegrationsState, 'healthDays' | 'setHealthDays' | 'healthLoading' | 'health' | 'refreshHealth' | 'sendLkLoading' | 'sendLkResult' | 'runSendLkBulkSync'>;

export function AdminIntegrationHealthPanel({
  healthDays,
  setHealthDays,
  healthLoading,
  health,
  refreshHealth,
  sendLkLoading,
  sendLkResult,
  runSendLkBulkSync,
}: Props) {
  return (
<Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
        <Typography.Body style={{ fontWeight: 600, marginBottom: "0.4rem" }}>2FA / Telegram / Email / Голосовой помощник</Typography.Body>
        <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
          Сводное здоровье интеграций по последним дням: привязки, статусы, ошибки отправки и API-сбои.
        </Typography.Body>
        <Flex align="center" gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.9rem" }}>
          <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>Период:</Typography.Body>
          <select
            className="admin-form-input"
            value={String(healthDays)}
            onChange={(e) => setHealthDays(Math.max(1, Math.min(365, parseInt(e.target.value, 10) || 30)))}
            style={{ padding: "0 0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.9rem" }}
          >
            <option value="1">1 день</option>
            <option value="7">7 дней</option>
            <option value="30">30 дней</option>
            <option value="60">60 дней</option>
            <option value="90">90 дней</option>
          </select>
          <Button
            className="filter-button"
            style={{ background: "var(--color-primary-blue)", color: "white" }}
            onClick={refreshHealth}
            disabled={healthLoading}
          >
            {healthLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Обновить"}
          </Button>
        </Flex>
      
        {healthLoading ? (
          <Flex align="center" gap="0.5rem">
            <Loader2 className="w-4 h-4 animate-spin" />
            <Typography.Body>Загрузка...</Typography.Body>
          </Flex>
        ) : !health ? (
          <Typography.Body style={{ color: "var(--color-text-secondary)" }}>
            Нет данных по интеграциям. Проверьте, что есть доступ к БД/Redis и повторите обновление.
          </Typography.Body>
        ) : (
          <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))", gap: "0.75rem" }}>
            <Panel className="cargo-card" style={{ padding: "0.75rem", border: "1px solid var(--color-border)" }}>
              <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>2FA / Telegram</Typography.Body>
              <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>Привязано: {health.telegram.linked_total}</Typography.Body>
              <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>active: {health.telegram.active}</Typography.Body>
              <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>pending: {health.telegram.pending}</Typography.Body>
              <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>disabled: {health.telegram.disabled}</Typography.Body>
              <Typography.Body style={{ fontSize: "0.82rem", marginTop: "0.3rem", color: "var(--color-text-secondary)" }}>
                Средний срок активной привязки: {health.telegram.avg_lifetime_hours_active == null ? "—" : `${health.telegram.avg_lifetime_hours_active} ч`}
              </Typography.Body>
              <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
                Среднее ожидание в pending: {health.telegram.avg_pending_hours == null ? "—" : `${health.telegram.avg_pending_hours} ч`}
              </Typography.Body>
              <Typography.Body style={{ fontSize: "0.82rem", marginTop: "0.3rem", color: health.telegram.pin_email_failed > 0 ? "var(--color-error, #dc2626)" : "var(--color-text-secondary)" }}>
                PIN email: отправлено {health.telegram.pin_email_sent}, ошибок {health.telegram.pin_email_failed}
              </Typography.Body>
              <Typography.Body style={{ fontSize: "0.82rem", color: health.telegram.webhook_errors > 0 ? "var(--color-error, #dc2626)" : "var(--color-text-secondary)" }}>
                Ошибки `/api/tg-webhook`: {health.telegram.webhook_errors}
              </Typography.Body>
            </Panel>
      
            <Panel className="cargo-card" style={{ padding: "0.75rem", border: "1px solid var(--color-border)" }}>
              <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Email доставка</Typography.Body>
              <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                Регистрация: {health.email_delivery.registration.sent} / ошибок {health.email_delivery.registration.failed}
              </Typography.Body>
              <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                Сброс пароля: {health.email_delivery.password_reset.sent} / ошибок {health.email_delivery.password_reset.failed}
              </Typography.Body>
              <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                Telegram PIN: {health.email_delivery.telegram_pin.sent} / ошибок {health.email_delivery.telegram_pin.failed}
              </Typography.Body>
              <Typography.Body style={{ fontSize: "0.82rem", marginTop: "0.3rem", color: "var(--color-text-secondary)" }}>
                API ошибки: register {health.email_delivery.api_errors.register}, reset {health.email_delivery.api_errors.reset}, tg-webhook {health.email_delivery.api_errors.tg_webhook}
              </Typography.Body>
              <Typography.Body style={{ fontSize: "0.82rem", marginTop: "0.3rem", color: health.email_delivery.sendlk.failed > 0 ? "var(--color-error, #dc2626)" : "var(--color-text-secondary)" }}>
                SendLK: отправлено {health.email_delivery.sendlk.sent}, ошибок {health.email_delivery.sendlk.failed}, пропущено {health.email_delivery.sendlk.skipped}, запусков bulk {health.email_delivery.sendlk.bulk_runs}
              </Typography.Body>
              <Flex align="center" gap="0.45rem" wrap="wrap" style={{ marginTop: "0.45rem" }}>
                <Button
                  type="button"
                  className="filter-button"
                  disabled={sendLkLoading}
                  onClick={() => void runSendLkBulkSync()}
                  style={{ padding: "0.3rem 0.55rem" }}
                >
                  {sendLkLoading ? "Выгрузка..." : "Выгрузить активных в 1С (SendLK)"}
                </Button>
                {sendLkResult ? (
                  <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
                    {sendLkResult}
                  </Typography.Body>
                ) : null}
              </Flex>
            </Panel>
      
            <Panel className="cargo-card" style={{ padding: "0.75rem", border: "1px solid var(--color-border)" }}>
              <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Голосовой помощник (MAX)</Typography.Body>
              <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                Логинов с привязкой: {health.voice_assistant.linked_logins}
              </Typography.Body>
              <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                Уникальных чатов: {health.voice_assistant.linked_chats_unique}
              </Typography.Body>
              <Typography.Body style={{ fontSize: "0.82rem", marginTop: "0.3rem", color: health.voice_assistant.link_errors > 0 ? "var(--color-error, #dc2626)" : "var(--color-text-secondary)" }}>
                Ошибки привязок/вебхука: {health.voice_assistant.link_errors}
              </Typography.Body>
              <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
                `max-link`: {health.voice_assistant.max_link_errors}, `max-webhook`: {health.voice_assistant.max_webhook_errors}
              </Typography.Body>
            </Panel>
          </div>
          <Panel className="cargo-card" style={{ padding: "0.75rem", border: "1px solid var(--color-border)", marginTop: "0.75rem" }}>
            <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Email доставка по дням</Typography.Body>
            {health.email_delivery.daily.length === 0 ? (
              <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
                За выбранный период записей нет.
              </Typography.Body>
            ) : (
              <div style={{ overflowX: "auto", maxHeight: "16rem", overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                      <th style={{ padding: "0.35rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Дата</th>
                      <th style={{ padding: "0.35rem 0.5rem", textAlign: "right", fontWeight: 600 }}>Отправлено</th>
                      <th style={{ padding: "0.35rem 0.5rem", textAlign: "right", fontWeight: 600 }}>Ошибок</th>
                      <th style={{ padding: "0.35rem 0.5rem", textAlign: "right", fontWeight: 600 }}>Регистрация</th>
                      <th style={{ padding: "0.35rem 0.5rem", textAlign: "right", fontWeight: 600 }}>Сброс</th>
                      <th style={{ padding: "0.35rem 0.5rem", textAlign: "right", fontWeight: 600 }}>Telegram PIN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {health.email_delivery.daily.map((d) => (
                      <tr key={d.day} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "0.35rem 0.5rem" }}>{d.day}</td>
                        <td style={{ padding: "0.35rem 0.5rem", textAlign: "right" }}>{d.total_sent}</td>
                        <td style={{ padding: "0.35rem 0.5rem", textAlign: "right", color: d.total_failed > 0 ? "var(--color-error, #dc2626)" : "var(--color-text-secondary)" }}>{d.total_failed}</td>
                        <td style={{ padding: "0.35rem 0.5rem", textAlign: "right", color: "var(--color-text-secondary)" }}>{d.registration_sent} / {d.registration_failed}</td>
                        <td style={{ padding: "0.35rem 0.5rem", textAlign: "right", color: "var(--color-text-secondary)" }}>{d.password_reset_sent} / {d.password_reset_failed}</td>
                        <td style={{ padding: "0.35rem 0.5rem", textAlign: "right", color: "var(--color-text-secondary)" }}>{d.telegram_pin_sent} / {d.telegram_pin_failed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          </>
        )}
</Panel>
  );
}
