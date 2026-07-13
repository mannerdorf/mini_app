import React, { useEffect, useState } from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { fetchAdminRequestErrorLog, type AdminErrorLogEntry } from "../../../api/client/admin/journal";
import { highlightMatch } from "../lib/highlightMatch";

export function AdminLogsTab({ adminToken }: { adminToken: string }) {
  const [entries, setEntries] = useState<AdminErrorLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [fetchTrigger, setFetchTrigger] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetchAdminRequestErrorLog(adminToken, {
      q: search,
      status: statusFilter || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
    })
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [adminToken, fetchTrigger]);

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Журнал логов</Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>
        Запросы к API, завершившиеся ошибкой или отказом (4xx, 5xx)
      </Typography.Body>
      <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Поиск по пути, тексту ошибки и деталям. Затем нажмите «Обновить».
      </Typography.Body>
      <Flex className="admin-audit-toolbar" wrap="wrap" align="center" gap="0.5rem">
        <label htmlFor="error-log-search" className="visually-hidden">Поиск по журналу логов</label>
        <Input
          id="error-log-search"
          className="admin-form-input"
          placeholder="Поиск: путь, ошибка, детали..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "16rem", minWidth: "12rem" }}
          aria-label="Поиск по журналу логов"
        />
        <label htmlFor="error-log-status" className="visually-hidden">Код ответа</label>
        <select
          id="error-log-status"
          className="admin-form-input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: "0 0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.9rem" }}
          aria-label="Фильтр по коду ответа"
        >
          <option value="">Все коды</option>
          <option value="400">400 — Неверный запрос</option>
          <option value="401">401 — Не авторизован</option>
          <option value="403">403 — Доступ запрещён</option>
          <option value="404">404 — Не найдено</option>
          <option value="429">429 — Слишком много запросов</option>
          <option value="500">500 — Ошибка сервера</option>
          <option value="502">502 — Ошибка шлюза</option>
          <option value="503">503 — Сервис недоступен</option>
        </select>
        <label htmlFor="error-log-from-date" style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>С:</label>
        <input
          id="error-log-from-date"
          type="date"
          className="admin-form-input"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          style={{ padding: "0 0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.9rem" }}
          aria-label="Дата начала"
        />
        <label htmlFor="error-log-to-date" style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>По:</label>
        <input
          id="error-log-to-date"
          type="date"
          className="admin-form-input"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          style={{ padding: "0 0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.9rem" }}
          aria-label="Дата окончания"
        />
        <Button
          className="filter-button"
          style={{ background: "var(--color-primary-blue)", color: "white" }}
          onClick={() => setFetchTrigger((t) => t + 1)}
          disabled={loading}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Обновить"}
        </Button>
      </Flex>
      {loading ? (
        <Flex align="center" gap="0.5rem">
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body>Загрузка...</Typography.Body>
        </Flex>
      ) : entries.length === 0 ? (
        <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет записей или таблица журнала ещё не создана (миграция 023)</Typography.Body>
      ) : (
        <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Время</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Метод</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Код</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Путь</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Ошибка</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Детали</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const detailsStr = e.details && typeof e.details === "object" && Object.keys(e.details).length > 0
                  ? JSON.stringify(e.details).slice(0, 200) + (JSON.stringify(e.details).length > 200 ? "…" : "")
                  : "—";
                const q = search.trim();
                return (
                  <tr key={e.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>
                      {q ? highlightMatch(new Date(e.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }), q, `log-t-${e.id}`) : new Date(e.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>{e.method}</td>
                    <td style={{ padding: "0.5rem 0.75rem", color: e.status_code >= 500 ? "var(--color-error, #dc2626)" : undefined }}>{e.status_code}</td>
                    <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", wordBreak: "break-all" }}>
                      {q ? highlightMatch(e.path, q, `log-p-${e.id}`) : e.path}
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                      {q && e.error_message ? highlightMatch(e.error_message, q, `log-m-${e.id}`) : (e.error_message ?? "—")}
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.75rem", color: "var(--color-text-secondary)", maxWidth: "12rem", overflow: "hidden", textOverflow: "ellipsis" }} title={detailsStr}>
                      {q ? highlightMatch(detailsStr, q, `log-d-${e.id}`) : detailsStr}
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
