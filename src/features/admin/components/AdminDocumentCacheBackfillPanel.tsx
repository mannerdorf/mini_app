import React from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import type { AdminIntegrationsState } from "../hooks/useAdminIntegrations";

type Props = Pick<AdminIntegrationsState, 'historyDays' | 'setHistoryDays' | 'stepDays' | 'setStepDays' | 'maxSteps' | 'setMaxSteps' | 'backfill' | 'backfillLoading' | 'backfillRunning' | 'backfillError' | 'currentMonthRef' | 'loadBackfillStatus' | 'runBackfill'>;

export function AdminDocumentCacheBackfillPanel({
  historyDays,
  setHistoryDays,
  stepDays,
  setStepDays,
  maxSteps,
  setMaxSteps,
  backfill,
  backfillLoading,
  backfillRunning,
  backfillError,
  currentMonthRef,
  loadBackfillStatus,
  runBackfill,
}: Props) {
  return (
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
  );
}
