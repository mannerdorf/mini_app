import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { fetchAdminIntegrationHealth, type AdminIntegrationHealth } from "../../../api/client/admin/journal";
import {
  fetchAdminZvonobotConfig,
  fetchDocumentCacheBackfillStatus,
  postAdminSendlkSync,
  postAdminZvonobotSandbox,
  postDocumentCacheBackfill,
  type DocumentCacheBackfillStatus,
} from "../../../api/client/admin/integrations";
import { AdminUserApiKeysSection } from "../sections/AdminUserApiKeysSection";

export function AdminIntegrationsTab({ adminToken }: { adminToken: string | null }) {
  const [healthDays, setHealthDays] = useState(30);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthFetchTrigger, setHealthFetchTrigger] = useState(0);
  const [health, setHealth] = useState<AdminIntegrationHealth | null>(null);
  const [sendLkLoading, setSendLkLoading] = useState(false);
  const [sendLkResult, setSendLkResult] = useState<string | null>(null);
  const [historyDays, setHistoryDays] = useState(365);
  const [stepDays, setStepDays] = useState(30);
  const [maxSteps, setMaxSteps] = useState(3);
  const [backfill, setBackfill] = useState<DocumentCacheBackfillStatus | null>(null);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const currentMonthRef = useRef<HTMLTableRowElement | null>(null);
  const [zvonobotConfigured, setZvonobotConfigured] = useState<boolean | null>(null);
  const [zvonobotKeyHint, setZvonobotKeyHint] = useState("");
  const [zvonobotLoading, setZvonobotLoading] = useState(false);
  const [zvonobotError, setZvonobotError] = useState("");
  const [zvonobotResult, setZvonobotResult] = useState("");
  const [zvonobotPhone, setZvonobotPhone] = useState("");
  const [zvonobotOutgoingPhone, setZvonobotOutgoingPhone] = useState("");
  const [zvonobotRecordId, setZvonobotRecordId] = useState("");
  const [zvonobotRecordText, setZvonobotRecordText] = useState("");
  const [zvonobotRecordGender, setZvonobotRecordGender] = useState<"0" | "1">("0");
  const [zvonobotPlannedAt, setZvonobotPlannedAt] = useState("");
  const [zvonobotApiCallIds, setZvonobotApiCallIds] = useState("");
  const [partnerApiHealthJson, setPartnerApiHealthJson] = useState("");

  useEffect(() => {
    if (!adminToken) return;
    setHealthLoading(true);
    fetchAdminIntegrationHealth(adminToken, healthDays)
      .then(setHealth)
      .catch(() => setHealth(null))
      .finally(() => setHealthLoading(false));
  }, [adminToken, healthFetchTrigger, healthDays]);

  const runSendLkBulkSync = useCallback(async () => {
    if (!adminToken) return;
    setSendLkLoading(true);
    setSendLkResult(null);
    try {
      const data = await postAdminSendlkSync(adminToken);
      setSendLkResult(`Выгрузка завершена: выбрано ${data.selected}, отправлено ${data.sent}, ошибок ${data.failed}`);
      setHealthFetchTrigger((prev) => prev + 1);
    } catch (e: unknown) {
      setSendLkResult((e as Error)?.message || "Ошибка выгрузки SendLK");
    } finally {
      setSendLkLoading(false);
    }
  }, [adminToken]);

  const loadBackfillStatus = useCallback(async () => {
    if (!adminToken) return;
    setBackfillLoading(true);
    setBackfillError(null);
    try {
      const data = await fetchDocumentCacheBackfillStatus(adminToken);
      setBackfill(data);
    } catch (e: unknown) {
      setBackfillError((e as Error)?.message || "Ошибка загрузки статуса кэша");
      setBackfill(null);
    } finally {
      setBackfillLoading(false);
    }
  }, [adminToken]);

  const runBackfill = useCallback(async (action: "reset" | "step" | "reset_and_run") => {
    if (!adminToken) return;
    setBackfillRunning(true);
    setBackfillError(null);
    try {
      const data = await postDocumentCacheBackfill(adminToken, {
        action,
        historyDays,
        stepDays,
        maxSteps,
      });
      setBackfill(data);
    } catch (e: unknown) {
      setBackfillError((e as Error)?.message || "Ошибка backfill кэша");
    } finally {
      setBackfillRunning(false);
    }
  }, [adminToken, historyDays, stepDays, maxSteps]);

  useEffect(() => {
    if (!adminToken) return;
    void loadBackfillStatus();
  }, [adminToken, healthFetchTrigger, loadBackfillStatus]);

  useEffect(() => {
    if (!backfill?.coverageByMonth?.length) return;
    currentMonthRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [backfill?.state.nextFrom, backfill?.coverageByMonth]);

  const runZvonobotAction = useCallback(async (
    action: "create" | "get" | "userInfo" | "getPhones" | "getAvailableLanguages",
    payload: Record<string, unknown> = {},
  ) => {
    if (!adminToken) return;
    setZvonobotLoading(true);
    setZvonobotError("");
    setZvonobotResult("");
    try {
      const data = await postAdminZvonobotSandbox(adminToken, action, payload);
      setZvonobotResult(JSON.stringify(data, null, 2));
    } catch (e: unknown) {
      setZvonobotError((e as Error)?.message || "Ошибка запроса к Zvonobot");
    } finally {
      setZvonobotLoading(false);
    }
  }, [adminToken]);

  useEffect(() => {
    if (!adminToken) return;
    fetchAdminZvonobotConfig(adminToken)
      .then(({ configured, keyHint }) => {
        setZvonobotConfigured(configured);
        setZvonobotKeyHint(keyHint);
      })
      .catch(() => {
        setZvonobotConfigured(false);
        setZvonobotKeyHint("");
      });
  }, [adminToken]);

  useEffect(() => {
    fetch("/api/partner/v1/health")
      .then((r) => r.json())
      .then((data) => setPartnerApiHealthJson(JSON.stringify(data, null, 2)))
      .catch(() => setPartnerApiHealthJson(JSON.stringify({ error: "Не удалось загрузить /api/partner/v1/health" }, null, 2)));
  }, [healthFetchTrigger]);

  return (
    <>
      <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)", marginBottom: "0.75rem" }}>
        <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Кэш перевозок и документов (1С → PostgreSQL)</Typography.Body>
        <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
          Восстановление истории с 01.01.2025: последовательные запросы в 1С шагом 30 дней (перевозки, отправки, счета, УПД) с merge в cache_*.
          После деплоя нажмите «Сброс + шаг» — backfill начнётся с 01.01.2025. Один клик «Следующий шаг» — один тип данных (4 клика = 30 дней).
          Крон recent — последние 30 дней каждые 5 мин; крон deep — последние 90 дней 4×/сутки (01:00, 07:00, 13:00, 19:00 UTC).
        </Typography.Body>
        <Flex align="center" gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.65rem" }}>
          <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>Глубина:</Typography.Body>
          <select
            className="admin-form-input"
            value={String(historyDays)}
            onChange={(e) => setHistoryDays(Math.max(30, Math.min(730, parseInt(e.target.value, 10) || 365)))}
            style={{ padding: "0 0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.9rem" }}
          >
            <option value="180">180 дней</option>
            <option value="365">365 дней</option>
            <option value="730">730 дней (с 01.01.2025)</option>
          </select>
          <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>Шаг:</Typography.Body>
          <select
            className="admin-form-input"
            value={String(stepDays)}
            onChange={(e) => setStepDays(Math.max(7, Math.min(90, parseInt(e.target.value, 10) || 30)))}
            style={{ padding: "0 0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.9rem" }}
          >
            <option value="30">30 дней</option>
            <option value="60">60 дней</option>
            <option value="90">90 дней</option>
          </select>
          <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>Шагов за клик:</Typography.Body>
          <select
            className="admin-form-input"
            value={String(maxSteps)}
            onChange={(e) => setMaxSteps(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))}
            style={{ padding: "0 0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.9rem" }}
          >
            <option value="1">1</option>
            <option value="3">3</option>
            <option value="5">5</option>
            <option value="13">13 (весь год)</option>
          </select>
          <Button type="button" className="filter-button" disabled={backfillLoading || backfillRunning} onClick={() => void loadBackfillStatus()}>
            {backfillLoading ? "…" : "Обновить статус"}
          </Button>
          <Button type="button" className="filter-button" disabled={backfillRunning} onClick={() => void runBackfill("reset")}>
            Сбросить прогресс
          </Button>
          <Button
            type="button"
            className="filter-button"
            style={{ background: "var(--color-primary-blue)", color: "white" }}
            disabled={backfillRunning}
            onClick={() => void runBackfill("step")}
          >
            {backfillRunning ? "Загрузка…" : "Следующий шаг"}
          </Button>
          <Button
            type="button"
            className="filter-button"
            disabled={backfillRunning}
            onClick={() => void runBackfill("reset_and_run")}
          >
            Сброс + шаг
          </Button>
        </Flex>
        {backfillError ? (
          <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-error, #dc2626)", marginBottom: "0.5rem" }}>{backfillError}</Typography.Body>
        ) : null}
        {backfill ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))", gap: "0.55rem" }}>
            <Panel className="cargo-card" style={{ padding: "0.65rem", border: "1px solid var(--color-border)" }}>
              <Typography.Body style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.25rem" }}>Backfill</Typography.Body>
              <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                Диапазон: {backfill.state.rangeStart} — {backfill.state.rangeEnd}
                {backfill.cacheEarliestDate ? ` · мин. ${backfill.cacheEarliestDate}` : ""}
              </Typography.Body>
              {backfill.cacheEarliestDate &&
              backfill.state.rangeStart > backfill.cacheEarliestDate ? (
                <Typography.Body style={{ fontSize: "0.78rem", color: "#b45309", marginTop: "0.2rem" }}>
                  Backfill начался позже {backfill.cacheEarliestDate}. «Сброс + шаг» с 730 дней загрузит янв–апр 2025.
                </Typography.Body>
              ) : null}
              <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                След. шаг с: {backfill.state.nextFrom}
                {backfill.state.nextKindLabel ? ` · ${backfill.state.nextKindLabel}` : ""}
              </Typography.Body>
              <Typography.Body style={{ fontSize: "0.8rem", color: backfill.state.done ? "#10b981" : "var(--color-text-secondary)" }}>
                {backfill.state.done ? "Завершено" : "В процессе"}
              </Typography.Body>
            </Panel>
            <Panel className="cargo-card" style={{ padding: "0.65rem", border: "1px solid var(--color-border)" }}>
              <Typography.Body style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.25rem" }}>cache_perevozki</Typography.Body>
              <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                Записей: {backfill.coverage.perevozki.count}
              </Typography.Body>
              <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                Даты: {backfill.coverage.perevozki.minDate ?? "—"} … {backfill.coverage.perevozki.maxDate ?? "—"}
              </Typography.Body>
            </Panel>
            <Panel className="cargo-card" style={{ padding: "0.65rem", border: "1px solid var(--color-border)" }}>
              <Typography.Body style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.25rem" }}>cache_invoices</Typography.Body>
              <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                Записей: {backfill.coverage.invoices.count}
              </Typography.Body>
              <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                Даты: {backfill.coverage.invoices.minDate ?? "—"} … {backfill.coverage.invoices.maxDate ?? "—"}
              </Typography.Body>
            </Panel>
            <Panel className="cargo-card" style={{ padding: "0.65rem", border: "1px solid var(--color-border)" }}>
              <Typography.Body style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.25rem" }}>cache_sendings</Typography.Body>
              <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                Записей: {backfill.coverage.sendings?.count ?? 0}
              </Typography.Body>
              <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                Даты: {backfill.coverage.sendings?.minDate ?? "—"} … {backfill.coverage.sendings?.maxDate ?? "—"}
              </Typography.Body>
            </Panel>
            <Panel className="cargo-card" style={{ padding: "0.65rem", border: "1px solid var(--color-border)" }}>
              <Typography.Body style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.25rem" }}>cache_acts</Typography.Body>
              <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                Записей: {backfill.coverage.acts?.count ?? 0}
              </Typography.Body>
              <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                Даты: {backfill.coverage.acts?.minDate ?? "—"} … {backfill.coverage.acts?.maxDate ?? "—"}
              </Typography.Body>
            </Panel>
          </div>
        ) : backfillLoading ? (
          <Flex align="center" gap="0.5rem">
            <Loader2 className="w-4 h-4 animate-spin" />
            <Typography.Body style={{ fontSize: "0.85rem" }}>Загрузка…</Typography.Body>
          </Flex>
        ) : null}
        {backfill?.coverageByMonth && backfill.coverageByMonth.length > 0 ? (
          <div style={{ marginTop: "0.75rem", overflowX: "auto" }}>
            <Typography.Body style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.35rem" }}>
              Покрытие по месяцам (записей в кэше)
            </Typography.Body>
            <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.45rem" }}>
              «—» = нет данных за месяц. Подсветка: зелёный — backfill прошёл, жёлтый — текущий месяц ({backfill?.state.nextFrom?.slice(0, 7) ?? "—"}), серый — ещё в очереди.
            </Typography.Body>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                  <th style={{ padding: "0.35rem 0.5rem" }}>Месяц</th>
                  <th style={{ padding: "0.35rem 0.5rem", textAlign: "right" }}>Грузы</th>
                  <th style={{ padding: "0.35rem 0.5rem", textAlign: "right" }}>Отправки</th>
                  <th style={{ padding: "0.35rem 0.5rem", textAlign: "right" }}>Счета</th>
                  <th style={{ padding: "0.35rem 0.5rem", textAlign: "right" }}>УПД</th>
                </tr>
              </thead>
              <tbody>
                {backfill.coverageByMonth.map((row) => {
                  const status = row.backfillStatus ?? "pending";
                  const rowBg =
                    status === "current"
                      ? "color-mix(in srgb, #fbbf24 18%, transparent)"
                      : status === "done"
                        ? "color-mix(in srgb, #10b981 10%, transparent)"
                        : status === "before_range"
                          ? "color-mix(in srgb, var(--color-text-secondary) 6%, transparent)"
                          : undefined;
                  return (
                  <tr
                    key={row.month}
                    ref={status === "current" ? currentMonthRef : undefined}
                    style={{ borderBottom: "1px solid var(--color-border)", background: rowBg }}
                  >
                    <td style={{ padding: "0.35rem 0.5rem", whiteSpace: "nowrap" }}>
                      {row.monthLabel}
                      {status === "current" ? " · сейчас" : status === "before_range" ? " · до диапазона" : ""}
                    </td>
                    {(["perevozki", "sendings", "invoices", "acts"] as const).map((kind) => {
                      const n = row[kind];
                      return (
                        <td
                          key={kind}
                          style={{
                            padding: "0.35rem 0.5rem",
                            textAlign: "right",
                            color: n > 0 ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                            fontWeight: n > 0 ? 500 : 400,
                          }}
                        >
                          {n > 0 ? n.toLocaleString("ru-RU") : "—"}
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>

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
            onClick={() => setHealthFetchTrigger((x) => x + 1)}
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
      
        <Panel className="cargo-card" style={{ padding: "0.85rem", border: "1px solid var(--color-border)", marginTop: "0.9rem" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Zvonobot API песочница</Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
            Тестовые вызовы через серверный прокси: create/get/userInfo/getPhones/getAvailableLanguages.
          </Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", marginBottom: "0.55rem", color: zvonobotConfigured ? "var(--color-text-secondary)" : "var(--color-error, #dc2626)" }}>
            ZVONOBOT_API_KEY: {zvonobotConfigured ? `настроен (${zvonobotKeyHint || "скрыт"})` : "не задан"}
          </Typography.Body>
      
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))", gap: "0.55rem", marginBottom: "0.6rem" }}>
            <Input className="admin-form-input" placeholder="Телефон (11 цифр)" value={zvonobotPhone} onChange={(e) => setZvonobotPhone(e.target.value.replace(/\D/g, "").slice(0, 11))} />
            <Input className="admin-form-input" placeholder="Исходящий номер (11 цифр)" value={zvonobotOutgoingPhone} onChange={(e) => setZvonobotOutgoingPhone(e.target.value.replace(/\D/g, "").slice(0, 11))} />
            <Input className="admin-form-input" placeholder="record.id (опционально)" value={zvonobotRecordId} onChange={(e) => setZvonobotRecordId(e.target.value.replace(/[^\d]/g, ""))} />
            <Input className="admin-form-input" placeholder="plannedAt (unix, опционально)" value={zvonobotPlannedAt} onChange={(e) => setZvonobotPlannedAt(e.target.value.replace(/[^\d]/g, ""))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.55rem", marginBottom: "0.6rem" }}>
            <Input className="admin-form-input" placeholder="Текст для генерации (если нет record.id)" value={zvonobotRecordText} onChange={(e) => setZvonobotRecordText(e.target.value)} />
            <select className="admin-form-input" value={zvonobotRecordGender} onChange={(e) => setZvonobotRecordGender(e.target.value === "1" ? "1" : "0")} style={{ minWidth: "8rem" }}>
              <option value="0">Голос: жен.</option>
              <option value="1">Голос: муж.</option>
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: "0.45rem", alignItems: "center", marginBottom: "0.6rem" }}>
            <Input className="admin-form-input" placeholder="apiCallIdList (через запятую): 123,456" value={zvonobotApiCallIds} onChange={(e) => setZvonobotApiCallIds(e.target.value)} />
            <Button
              type="button"
              className="filter-button"
              disabled={zvonobotLoading}
              onClick={() => {
                const payload: Record<string, unknown> = {};
                if (zvonobotPhone) payload.phone = zvonobotPhone;
                if (zvonobotOutgoingPhone) payload.outgoingPhone = zvonobotOutgoingPhone;
                if (zvonobotPlannedAt) payload.plannedAt = Number(zvonobotPlannedAt);
                if (zvonobotRecordId) payload.record = { id: Number(zvonobotRecordId) };
                else if (zvonobotRecordText.trim()) payload.record = { text: zvonobotRecordText.trim(), gender: Number(zvonobotRecordGender) };
                void runZvonobotAction("create", payload);
              }}
            >
              Создать звонок
            </Button>
            <Button
              type="button"
              className="filter-button"
              disabled={zvonobotLoading}
              onClick={() => {
                const ids = zvonobotApiCallIds
                  .split(",")
                  .map((v) => Number(v.trim()))
                  .filter((v) => Number.isFinite(v) && v > 0);
                void runZvonobotAction("get", { apiCallIdList: ids });
              }}
            >
              Получить звонки
            </Button>
            <Button type="button" className="filter-button" disabled={zvonobotLoading} onClick={() => void runZvonobotAction("userInfo")}>Баланс</Button>
            <Button type="button" className="filter-button" disabled={zvonobotLoading} onClick={() => void runZvonobotAction("getPhones", { all: true })}>Номера</Button>
          </div>
          <Flex align="center" gap="0.45rem" wrap="wrap" style={{ marginBottom: "0.6rem" }}>
            <Button type="button" className="filter-button" disabled={zvonobotLoading} onClick={() => void runZvonobotAction("getAvailableLanguages")}>Языки</Button>
            {zvonobotLoading ? <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>Запрос...</Typography.Body> : null}
          </Flex>
          {zvonobotError ? (
            <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-error, #dc2626)", marginBottom: "0.45rem" }}>
              {zvonobotError}
            </Typography.Body>
          ) : null}
          <textarea
            value={zvonobotResult}
            onChange={() => {}}
            readOnly
            placeholder="Ответ API появится здесь..."
            style={{
              width: "100%",
              minHeight: "11rem",
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
      
        {adminToken ? <AdminUserApiKeysSection adminToken={adminToken} /> : null}
      
        <Panel className="cargo-card" style={{ padding: "0.85rem", border: "1px solid var(--color-border)", marginTop: "0.9rem" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Partner API и webhooks (v1)</Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.55rem" }}>
            Внешний REST v1: заголовок <code style={{ fontSize: "0.75rem" }}>Authorization: Bearer &lt;полный ключ haulz_… из ЛК пользователя&gt;</code>, тело как у кэшированных методов (без логина/пароля в теле).
            Базовый URL: <code style={{ fontSize: "0.75rem" }}>https://mini-app-lake-phi.vercel.app</code>. Документация:{" "}
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
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "0.75rem",
              lineHeight: 1.35,
              padding: "0.6rem",
            }}
          />
        </Panel>
      </Panel>
    </>
  );
}
