import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { DateText } from "../../../components/ui/DateText";
import { fetchAdminUserApiKeys, type AdminUserApiKeyRow } from "../../../api/client/admin/userApiKeys";
import { scopeTitleRu } from "../../../constants/userApiKeyScopesClient";

const STATUS_LABEL: Record<AdminUserApiKeyRow["status"], string> = {
  active: "Активен",
  disabled: "Отключён",
  revoked: "Отозван",
};

const STATUS_COLOR: Record<AdminUserApiKeyRow["status"], string> = {
  active: "#16a34a",
  disabled: "#b45309",
  revoked: "#6b7280",
};

function formatDt(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type Props = {
  adminToken: string;
};

export function AdminUserApiKeysSection({ adminToken }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<AdminUserApiKeyRow[]>([]);
  const [summary, setSummary] = useState({ active: 0, disabled: 0, revoked: 0, used_last_7_days: 0, never_used: 0 });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "disabled" | "revoked">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminUserApiKeys(adminToken, { q, status, limit: 300 });
      setKeys(data.keys);
      setSummary(data.summary);
    } catch (e: unknown) {
      setKeys([]);
      setError((e as Error)?.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [adminToken, q, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedKeys = useMemo(() => keys, [keys]);

  return (
    <Panel className="cargo-card" style={{ padding: "0.85rem", border: "1px solid var(--color-border)", marginTop: "0.9rem" }}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Журнал API-ключей (Partner API)</Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.65rem", lineHeight: 1.45 }}>
        Выданные ключи haulz_… с привязкой к логину и компаниям. Активность — по полю last_used_at при успешном вызове Partner API.
      </Typography.Body>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(7rem, 1fr))",
          gap: "0.45rem",
          marginBottom: "0.75rem",
        }}
      >
        {[
          ["Активных", summary.active],
          ["Отключено", summary.disabled],
          ["Отозвано", summary.revoked],
          ["За 7 дней", summary.used_last_7_days],
          ["Не использ.", summary.never_used],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            style={{
              padding: "0.45rem 0.55rem",
              borderRadius: "8px",
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-hover)",
            }}
          >
            <Typography.Body style={{ fontSize: "0.68rem", color: "var(--color-text-secondary)" }}>{label}</Typography.Body>
            <Typography.Body style={{ fontSize: "1rem", fontWeight: 700 }}>{value}</Typography.Body>
          </div>
        ))}
      </div>

      <Flex align="center" gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
        <Input
          className="admin-form-input"
          placeholder="Поиск: логин, название, public_id"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: "12rem", flex: "1 1 12rem" }}
        />
        <select
          className="admin-form-input"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          style={{ padding: "0 0.5rem", borderRadius: "6px", fontSize: "0.85rem" }}
        >
          <option value="all">Все статусы</option>
          <option value="active">Только активные</option>
          <option value="disabled">Отключённые</option>
          <option value="revoked">Отозванные</option>
        </select>
        <Button type="button" className="filter-button" onClick={() => void load()} disabled={loading}>
          {loading ? (
            <Flex align="center" gap="0.35rem">
              <Loader2 className="w-4 h-4 animate-spin" />
              Загрузка…
            </Flex>
          ) : (
            "Обновить"
          )}
        </Button>
      </Flex>

      {error ? (
        <Typography.Body style={{ color: "var(--color-error)", marginBottom: "0.5rem", fontSize: "0.85rem" }}>{error}</Typography.Body>
      ) : null}

      {loading && keys.length === 0 ? (
        <Flex align="center" gap="0.5rem">
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body style={{ fontSize: "0.85rem" }}>Загрузка журнала…</Typography.Body>
        </Flex>
      ) : sortedKeys.length === 0 ? (
        <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>Записей не найдено.</Typography.Body>
      ) : (
        <div style={{ overflowX: "auto", maxHeight: "22rem", overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem", minWidth: "920px" }}>
            <thead>
              <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Выдан</th>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Логин</th>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Компании</th>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Ключ</th>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Права</th>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Последнее использ.</th>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Статус</th>
              </tr>
            </thead>
            <tbody>
              {sortedKeys.map((k) => (
                <tr key={k.id} style={{ borderBottom: "1px solid var(--color-border)", verticalAlign: "top" }}>
                  <td style={{ padding: "0.4rem 0.5rem", whiteSpace: "nowrap" }}>
                    <DateText value={k.created_at} />
                  </td>
                  <td style={{ padding: "0.4rem 0.5rem" }}>
                    <div style={{ fontWeight: 600 }}>{k.user_login}</div>
                    {k.user_full_name ? (
                      <div style={{ color: "var(--color-text-secondary)", fontSize: "0.72rem" }}>{k.user_full_name}</div>
                    ) : null}
                  </td>
                  <td style={{ padding: "0.4rem 0.5rem", maxWidth: "14rem" }}>
                    {k.companies_label || k.user_company_name || "—"}
                    {k.allowed_inns.length > 0 ? (
                      <div style={{ color: "var(--color-text-secondary)", fontSize: "0.7rem", marginTop: "0.15rem" }}>
                        ИНН ключа: {k.allowed_inns.join(", ")}
                      </div>
                    ) : (
                      <div style={{ color: "var(--color-text-secondary)", fontSize: "0.7rem", marginTop: "0.15rem" }}>
                        ИНН: все доступные
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "0.4rem 0.5rem" }}>
                    <div style={{ fontWeight: 600 }}>{k.label}</div>
                    <code style={{ fontSize: "0.68rem", wordBreak: "break-all" }}>{k.key_prefix}</code>
                  </td>
                  <td style={{ padding: "0.4rem 0.5rem", maxWidth: "12rem", color: "var(--color-text-secondary)" }}>
                    {(k.scopes || []).map((s) => scopeTitleRu(String(s))).join(" · ") || "—"}
                  </td>
                  <td style={{ padding: "0.4rem 0.5rem", whiteSpace: "nowrap" }}>{formatDt(k.last_used_at)}</td>
                  <td style={{ padding: "0.4rem 0.5rem", whiteSpace: "nowrap" }}>
                    <span style={{ color: STATUS_COLOR[k.status], fontWeight: 600 }}>{STATUS_LABEL[k.status]}</span>
                    {k.revoked_at ? (
                      <div style={{ fontSize: "0.68rem", color: "var(--color-text-secondary)" }}>{formatDt(k.revoked_at)}</div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
