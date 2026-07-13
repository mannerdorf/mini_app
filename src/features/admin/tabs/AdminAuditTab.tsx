import React, { useCallback, useEffect, useState } from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { fetchAdminAuditLog, type AdminAuditEntry } from "../../../api/client/admin/journal";
import { auditActionLabel, auditDetailsCell, auditObjectCell, highlightMatch } from "../lib/highlightMatch";

export function AdminAuditTab({ adminToken }: { adminToken: string }) {
  const [entries, setEntries] = useState<AdminAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterTargetType, setFilterTargetType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [fetchTrigger, setFetchTrigger] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetchAdminAuditLog(adminToken, {
      q: search,
      action: filterAction || undefined,
      target_type: filterTargetType || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
    })
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [adminToken, fetchTrigger]);

  const exportCsv = useCallback(() => {
    const header = "Время;Действие;Объект;Детали\n";
    const escape = (s: string) => (s.includes(";") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s);
    const rows = entries.map(
      (e) =>
        `${escape(new Date(e.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }))};${escape(auditActionLabel(e.action))};${escape(auditObjectCell(e))};${escape(auditDetailsCell(e.details))}`,
    );
    const blob = new Blob(["\uFEFF" + header + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [entries]);

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Журнал действий</Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>
        Регистрации и изменения прав пользователей, вход в админку, настройки почты, пресеты
      </Typography.Body>
      <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Поиск по действию, типу объекта, id, логину и деталям. Затем нажмите «Обновить».
      </Typography.Body>
      <Flex className="admin-audit-toolbar" wrap="wrap" align="center">
        <label htmlFor="audit-search" className="visually-hidden">Поиск по журналу</label>
        <Input
          id="audit-search"
          className="admin-form-input"
          placeholder="Поиск: действие, объект, логин, детали..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "16rem", minWidth: "12rem" }}
          aria-label="Поиск по журналу: действие, объект, логин, детали"
        />
        <label htmlFor="audit-filter-action" className="visually-hidden">Действие</label>
        <select
          id="audit-filter-action"
          className="admin-form-input"
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          style={{ padding: "0 0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.9rem" }}
          aria-label="Фильтр по действию"
        >
          <option value="">Все действия</option>
          <option value="admin_login">Вход в админку</option>
          <option value="user_register">Регистрация</option>
          <option value="user_update">Изменение</option>
          <option value="email_settings_saved">Настройки почты</option>
          <option value="preset_created">Пресет создан</option>
          <option value="preset_updated">Пресет обновлён</option>
          <option value="preset_deleted">Пресет удалён</option>
          <option value="user_archived">Профиль в архиве</option>
        </select>
        <label htmlFor="audit-filter-type" className="visually-hidden">Тип объекта</label>
        <select
          id="audit-filter-type"
          className="admin-form-input"
          value={filterTargetType}
          onChange={(e) => setFilterTargetType(e.target.value)}
          style={{ padding: "0 0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.9rem" }}
          aria-label="Фильтр по типу объекта"
        >
          <option value="">Все типы</option>
          <option value="user">Пользователь</option>
          <option value="session">Сессия</option>
          <option value="settings">Настройки</option>
          <option value="preset">Пресет</option>
        </select>
        <label htmlFor="audit-from-date" style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>С:</label>
        <input
          id="audit-from-date"
          type="date"
          className="admin-form-input"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          style={{ padding: "0 0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.9rem" }}
          aria-label="Дата начала периода"
        />
        <label htmlFor="audit-to-date" style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>По:</label>
        <input
          id="audit-to-date"
          type="date"
          className="admin-form-input"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          style={{ padding: "0 0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.9rem" }}
          aria-label="Дата окончания периода"
        />
        <Button
          className="filter-button"
          style={{ background: "var(--color-primary-blue)", color: "white" }}
          onClick={() => setFetchTrigger((t) => t + 1)}
          disabled={loading}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Обновить"}
        </Button>
        <Button
          className="filter-button"
          onClick={exportCsv}
                disabled={entries.length === 0}
        >
          Экспорт CSV
        </Button>
      </Flex>
      {loading ? (
        <Flex align="center" gap="0.5rem">
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body>Загрузка...</Typography.Body>
        </Flex>
      ) : entries.length === 0 ? (
        <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет записей или таблица журнала ещё не создана (миграция 017)</Typography.Body>
      ) : (
        <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Время</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Действие</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Объект</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Детали</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const actionLabel = e.action === "admin_login" ? "Вход в админку" : e.action === "user_register" ? "Регистрация" : e.action === "user_update" ? "Изменение" : e.action === "email_settings_saved" ? "Настройки почты" : e.action === "preset_created" ? "Пресет создан" : e.action === "preset_updated" ? "Пресет обновлён" : e.action === "preset_deleted" ? "Пресет удалён" : e.action === "user_archived" ? "Профиль в архиве" : e.action;
                const objCell = e.target_type === "user" && e.details && typeof e.details.login === "string" ? e.details.login : e.target_id ?? "—";
                const detailsStr = e.details && typeof e.details === "object" && Object.keys(e.details).filter((k) => k !== "login").length > 0
                  ? Object.entries(e.details)
                      .filter(([k]) => k !== "login")
                      .map(([k, v]) => (v === true ? k : `${k}: ${String(v)}`))
                      .join(", ")
                  : "—";
                const q = search.trim();
                return (
                  <tr key={e.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>
                      {q ? highlightMatch(new Date(e.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }), q, `t-${e.id}`) : new Date(e.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>
                      {q ? highlightMatch(actionLabel, q, `a-${e.id}`) : actionLabel}
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>
                      {q ? highlightMatch(String(objCell), q, `o-${e.id}`) : objCell}
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                      {q ? highlightMatch(detailsStr, q, `d-${e.id}`) : detailsStr}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
