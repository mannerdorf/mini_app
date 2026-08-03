import React from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import type { AdminCustomersState } from "../hooks/useAdminCustomers";

type Props = Pick<
  AdminCustomersState,
  | "isSuperAdmin"
  | "autoRegisterCandidates"
  | "autoRegisterStats"
  | "autoRegisterLoading"
  | "autoRegisterApplying"
  | "autoRegisterAutoModeEnabled"
  | "autoRegisterBatchSize"
  | "setAutoRegisterBatchSize"
  | "autoRegisterResult"
  | "refreshAutoRegister"
  | "runAutoRegisterBatch"
>;

export function AdminCustomersAutoRegisterPanel({
  isSuperAdmin,
  autoRegisterCandidates,
  autoRegisterStats,
  autoRegisterLoading,
  autoRegisterApplying,
  autoRegisterAutoModeEnabled,
  autoRegisterBatchSize,
  setAutoRegisterBatchSize,
  autoRegisterResult,
  refreshAutoRegister,
  runAutoRegisterBatch,
}: Props) {
  return (
      <Panel className="cargo-card" style={{ padding: "0.75rem", marginBottom: "0.75rem", border: "1px dashed var(--color-border)" }}>
        <Flex align="center" justify="space-between" wrap="wrap" gap="0.5rem" style={{ marginBottom: "0.5rem" }}>
          <Typography.Body style={{ fontWeight: 600 }}>Dry-run: кандидаты на автосоздание</Typography.Body>
          <Flex align="center" gap="0.5rem" wrap="wrap">
            <Typography.Body style={{ fontSize: "0.8rem", color: autoRegisterAutoModeEnabled ? "var(--color-success-status)" : "var(--color-text-secondary)" }}>
              Auto-mode: {autoRegisterAutoModeEnabled ? "включен" : "выключен (AUTO_REGISTER_FROM_CUSTOMERS=false)"}
            </Typography.Body>
            <Button
              type="button"
              className="filter-button"
              onClick={() => refreshAutoRegister()}
              disabled={autoRegisterLoading}
              style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem" }}
            >
              {autoRegisterLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.25rem" }} /> : null}
              Обновить dry-run
            </Button>
            {isSuperAdmin && autoRegisterAutoModeEnabled && autoRegisterCandidates.length > 0 && (
              <>
                <select
                  className="admin-form-input"
                  value={String(autoRegisterBatchSize)}
                  onChange={(e) => setAutoRegisterBatchSize(Math.max(1, Math.min(200, parseInt(e.target.value, 10) || 20)))}
                  style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}
                  aria-label="Размер партии авто-регистрации"
                >
                  <option value="10">Партия: 10</option>
                  <option value="20">Партия: 20</option>
                  <option value="50">Партия: 50</option>
                  <option value="100">Партия: 100</option>
                </select>
                <Button
                  type="button"
                  className="button-primary"
                  onClick={() => void runAutoRegisterBatch()}
                  disabled={autoRegisterApplying}
                  style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem" }}
                >
                  {autoRegisterApplying ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.25rem" }} /> : null}
                  Авто-режим: запустить партию
                </Button>
              </>
            )}
          </Flex>
        </Flex>
        <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.45rem" }}>
          Кандидат: валидный email из справочника и отсутствие пользователя с таким login/email.
        </Typography.Body>
        {autoRegisterStats && (
          <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.45rem" }}>
            Всего в справочнике: {autoRegisterStats.total}; с email: {autoRegisterStats.withEmail}; валидных email: {autoRegisterStats.validEmail}; уже зарегистрированы: {autoRegisterStats.alreadyRegistered}; кандидаты: {autoRegisterCandidates.length}
          </Typography.Body>
        )}
        {autoRegisterResult && (
          <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.45rem" }}>
            Результат партии: обработано {autoRegisterResult.processed}, создано {autoRegisterResult.created}, пропущено {autoRegisterResult.skipped_existing}, email отправлено {autoRegisterResult.email_sent}, ошибок email {autoRegisterResult.email_failed}, осталось кандидатов {autoRegisterResult.remaining_candidates ?? 0}. Пауза между письмами: {autoRegisterResult.email_delay_ms ?? 0}ms + jitter {autoRegisterResult.email_jitter_ms ?? 0}ms.
          </Typography.Body>
        )}
        {autoRegisterLoading ? (
          <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>Загрузка кандидатов…</Typography.Body>
        ) : autoRegisterCandidates.length === 0 ? (
          <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>Кандидатов нет.</Typography.Body>
        ) : (
          <div style={{ overflowX: "auto", maxHeight: "12rem", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ padding: "0.35rem 0.5rem", textAlign: "left", fontWeight: 600 }}>ИНН</th>
                  <th style={{ padding: "0.35rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Наименование</th>
                  <th style={{ padding: "0.35rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Email</th>
                </tr>
              </thead>
              <tbody>
                {autoRegisterCandidates.slice(0, 200).map((c) => (
                  <tr key={`${c.inn}-${c.email}`} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.35rem 0.5rem" }}>{c.inn || "—"}</td>
                    <td style={{ padding: "0.35rem 0.5rem" }}>{c.customer_name || "—"}</td>
                    <td style={{ padding: "0.35rem 0.5rem", color: "var(--color-text-secondary)" }}>{c.email || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
  );
}
