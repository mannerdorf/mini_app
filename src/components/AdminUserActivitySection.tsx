import React, { useCallback, useMemo, useState } from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { DateText } from "./ui/DateText";

function toYMDLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultPeriod(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 6);
  return { from: toYMDLocal(from), to: toYMDLocal(to) };
}

const SECTION_LABELS: Record<string, string> = {
  cargo: "Грузы",
  dashboard: "Дашборд",
  home: "Главная",
  docs: "Документы",
  expense_requests: "Заявки на расходы",
  profile: "Профиль",
  wildberries: "Wildberries",
};

function sectionLabel(key: string): string {
  return SECTION_LABELS[key] || key;
}

type ReportPayload = {
  period?: { from: string; to: string };
  summary?: {
    distinct_users: number;
    total_logins: number;
    total_ui_opens: number;
    expense_requests_created: number;
    claims_created: number;
    pending_orders_created: number;
  };
  by_user?: Array<{
    login: string;
    company_name: string | null;
    full_name: string | null;
    logins: number;
    ui_hits: number;
    ui_sections: Record<string, number>;
    expense_requests: number;
    claims: number;
    pending_orders: number;
    last_event_at: string | null;
  }>;
  recent_events?: Array<{
    login: string;
    event_type: string;
    meta: Record<string, unknown> | null;
    created_at: string;
  }>;
  error?: string;
};

export function AdminUserActivitySection({ adminToken }: { adminToken: string }) {
  const [{ from, to }, setRange] = useState(defaultPeriod);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReportPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/admin-user-activity-report?${params}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const json = (await res.json().catch(() => ({}))) as ReportPayload;
      if (!res.ok) {
        setData(null);
        setError(json.error || `Ошибка ${res.status}`);
        return;
      }
      setData(json);
    } catch {
      setData(null);
      setError("Не удалось загрузить отчёт");
    } finally {
      setLoading(false);
    }
  }, [adminToken, from, to]);

  const summary = data?.summary;

  const sortedUsers = useMemo(() => {
    const rows = data?.by_user || [];
    return [...rows].sort((a, b) => {
      const la = a.last_event_at ? new Date(a.last_event_at).getTime() : 0;
      const lb = b.last_event_at ? new Date(b.last_event_at).getTime() : 0;
      if (lb !== la) return lb - la;
      return a.login.localeCompare(b.login, "ru");
    });
  }, [data?.by_user]);

  return (
    <Panel className="cargo-card" style={{ marginBottom: "1rem", background: "var(--color-bg-card)", borderRadius: "12px", padding: "1rem 1.25rem" }}>
      <Typography.Headline style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.35rem" }}>
        Активность пользователей
      </Typography.Headline>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.85rem" }}>
        Входы в приложение, открытие разделов (после обновления клиента), заявки на расходы, претензии и заявки «Новая заявка» за период.
        События журнала накапливаются с момента применения миграции{" "}
        <code style={{ fontSize: "0.78rem" }}>064_user_app_events.sql</code>.
      </Typography.Body>

      <Flex align="center" gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
        <label style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
          С&nbsp;
          <input
            type="date"
            className="admin-form-input"
            value={from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            style={{ marginLeft: "0.25rem", padding: "0.25rem 0.5rem" }}
          />
        </label>
        <label style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
          По&nbsp;
          <input
            type="date"
            className="admin-form-input"
            value={to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            style={{ marginLeft: "0.25rem", padding: "0.25rem 0.5rem" }}
          />
        </label>
        <Button type="button" className="filter-button" onClick={() => void load()} disabled={loading}>
          {loading ? (
            <Flex align="center" gap="0.35rem">
              <Loader2 className="w-4 h-4 animate-spin" />
              Загрузка…
            </Flex>
          ) : (
            "Показать отчёт"
          )}
        </Button>
      </Flex>

      {error ? (
        <Typography.Body style={{ color: "var(--color-error)", marginBottom: "0.5rem" }}>{error}</Typography.Body>
      ) : null}

      {summary && !loading ? (
        <>
          <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.65rem" }}>
            Период: {data?.period?.from} — {data?.period?.to}
          </Typography.Body>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "0.5rem",
              marginBottom: "1rem",
            }}
          >
            <StatCard label="Пользователей в сводке" value={String(summary.distinct_users)} />
            <StatCard label="Входов (сессий)" value={String(summary.total_logins)} />
            <StatCard label="Открытий разделов" value={String(summary.total_ui_opens)} />
            <StatCard label="Заявок на расходы" value={String(summary.expense_requests_created)} />
            <StatCard label="Претензий создано" value={String(summary.claims_created)} />
            <StatCard label="Заявок к 1С (pending)" value={String(summary.pending_orders_created)} />
          </div>

          <Typography.Body style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>По пользователям</Typography.Body>
          <div style={{ overflowX: "auto", marginBottom: "1rem", border: "1px solid var(--color-border)", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
              <thead>
                <tr style={{ background: "var(--color-bg-secondary, rgba(0,0,0,0.04))", textAlign: "left" }}>
                  <th style={{ padding: "0.45rem 0.5rem" }}>Логин</th>
                  <th style={{ padding: "0.45rem 0.5rem" }}>Имя / компания</th>
                  <th style={{ padding: "0.45rem 0.5rem" }}>Входы</th>
                  <th style={{ padding: "0.45rem 0.5rem" }}>Разделы</th>
                  <th style={{ padding: "0.45rem 0.5rem" }}>Заявки</th>
                  <th style={{ padding: "0.45rem 0.5rem" }}>Претензии</th>
                  <th style={{ padding: "0.45rem 0.5rem" }}>Заявки 1С</th>
                  <th style={{ padding: "0.45rem 0.5rem" }}>Последнее событие</th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "0.65rem 0.5rem", color: "var(--color-text-secondary)" }}>
                      Нет данных за выбранный период.
                    </td>
                  </tr>
                ) : (
                  sortedUsers.map((row) => (
                    <tr key={row.login} style={{ borderTop: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "0.45rem 0.5rem", fontWeight: 600 }}>{row.login}</td>
                      <td style={{ padding: "0.45rem 0.5rem", color: "var(--color-text-secondary)" }}>
                        {[row.full_name, row.company_name].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td style={{ padding: "0.45rem 0.5rem" }}>{row.logins}</td>
                      <td style={{ padding: "0.45rem 0.5rem", maxWidth: 220 }}>
                        {Object.keys(row.ui_sections).length === 0 ? (
                          "—"
                        ) : (
                          <span style={{ lineHeight: 1.35 }}>
                            {Object.entries(row.ui_sections)
                              .sort((a, b) => b[1] - a[1])
                              .map(([k, n]) => (
                                <span key={k} style={{ display: "inline-block", marginRight: "0.35rem", marginBottom: "0.15rem" }}>
                                  {sectionLabel(k)} ({n})
                                </span>
                              ))}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "0.45rem 0.5rem" }}>{row.expense_requests}</td>
                      <td style={{ padding: "0.45rem 0.5rem" }}>{row.claims}</td>
                      <td style={{ padding: "0.45rem 0.5rem" }}>{row.pending_orders}</td>
                      <td style={{ padding: "0.45rem 0.5rem", whiteSpace: "nowrap" }}>
                        {row.last_event_at ? <DateText value={row.last_event_at} /> : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Typography.Body style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>Последние события журнала</Typography.Body>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", maxHeight: 320, overflowY: "auto" }}>
            {(data.recent_events || []).length === 0 ? (
              <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>Нет записей.</Typography.Body>
            ) : (
              (data.recent_events || []).map((ev, idx) => {
                const sec = typeof ev.meta?.section === "string" ? ev.meta.section : "";
                let detail = ev.event_type;
                if (ev.event_type === "app_login") detail = "Вход в приложение";
                else if (ev.event_type === "ui_section") detail = `Раздел: ${sec ? sectionLabel(sec) : "—"}`;
                return (
                  <div
                    key={`${ev.created_at}-${idx}`}
                    style={{
                      fontSize: "0.76rem",
                      padding: "0.35rem 0.5rem",
                      borderRadius: 6,
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    <Flex justify="space-between" gap="0.5rem" wrap="wrap">
                      <span style={{ fontWeight: 600 }}>{ev.login}</span>
                      <span style={{ color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                        <DateText value={ev.created_at} />
                      </span>
                    </Flex>
                    <div style={{ marginTop: "0.2rem", color: "var(--color-text-secondary)" }}>{detail}</div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : null}
    </Panel>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}>{label}</Typography.Body>
      <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.5rem" }}>
        <Typography.Body style={{ fontWeight: 600 }}>{value}</Typography.Body>
      </div>
    </div>
  );
}
