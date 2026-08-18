import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import {
  fetchAdminPushSubscribers,
  type AdminPushSubscriber,
  type AdminPushSubscriberCompany,
} from "../../../api/client/admin/pushNotifications";

type Props = {
  adminToken: string;
  onError?: (message: string | null) => void;
};

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function companyLine(company: AdminPushSubscriberCompany): string {
  return company.name && company.name !== company.inn ? `${company.name} · ${company.inn}` : company.inn;
}

function matchesQuery(row: AdminPushSubscriber, q: string): boolean {
  if (!q) return true;
  const hay = [
    row.login,
    row.companyName,
    ...row.pushCompanies.flatMap((c) => [c.inn, c.name]),
    ...row.accountCompanies.flatMap((c) => [c.inn, c.name]),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function AdminPushSubscribersSection({ adminToken, onError }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AdminPushSubscriber[]>([]);
  const [users, setUsers] = useState(0);
  const [devices, setDevices] = useState(0);
  const [companies, setCompanies] = useState(0);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    onError?.(null);
    try {
      const data = await fetchAdminPushSubscribers(adminToken);
      setRows(data.subscribers);
      setUsers(data.users);
      setDevices(data.devices);
      setCompanies(data.companies);
    } catch (e: unknown) {
      setRows([]);
      setUsers(0);
      setDevices(0);
      setCompanies(0);
      onError?.((e as Error)?.message || "Не удалось загрузить пользователей с push");
    } finally {
      setLoading(false);
    }
  }, [adminToken, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((row) => matchesQuery(row, query));
  }, [rows, q]);

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)", marginBottom: "1rem" }}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Кто включил push</Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem", lineHeight: 1.45 }}>
        Пользователи с активным FCM-токеном в Android-приложении и компании, по которым им уходят автоматические
        уведомления (счета, этапы, сводка).
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
          ["Пользователей", users],
          ["Устройств", devices],
          ["Компаний в автопуше", companies],
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
          placeholder="Поиск: логин, компания, ИНН"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: "12rem", flex: "1 1 12rem" }}
        />
        <Button type="button" className="filter-button" disabled={loading} onClick={() => void load()}>
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

      {loading && rows.length === 0 ? (
        <Flex align="center" gap="0.5rem">
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body style={{ fontSize: "0.85rem" }}>Загрузка подписчиков…</Typography.Body>
        </Flex>
      ) : visible.length === 0 ? (
        <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
          {rows.length === 0 ? "Пока никто не включил push в приложении." : "Никого не найдено по запросу."}
        </Typography.Body>
      ) : (
        <div style={{ overflowX: "auto", maxHeight: "28rem", overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem", minWidth: "720px" }}>
            <thead>
              <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Пользователь</th>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Компании (автопуш)</th>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Устройства</th>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Активность</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const extraCompanies = row.accountCompanies.filter(
                  (company) => !row.pushCompanies.some((push) => push.inn === company.inn),
                );
                return (
                  <tr key={row.login} style={{ borderBottom: "1px solid var(--color-border)", verticalAlign: "top" }}>
                    <td style={{ padding: "0.45rem 0.5rem" }}>
                      <div style={{ fontWeight: 600 }}>{row.login}</div>
                      {row.companyName ? (
                        <div style={{ color: "var(--color-text-secondary)", fontSize: "0.72rem" }}>{row.companyName}</div>
                      ) : null}
                      {row.serviceWide ? (
                        <div style={{ color: "#b45309", fontSize: "0.7rem", marginTop: "0.15rem" }}>
                          Служебный / все ИНН
                        </div>
                      ) : null}
                      {row.boundFromProfile ? (
                        <div style={{ color: "var(--color-text-secondary)", fontSize: "0.7rem" }}>ИНН из профиля</div>
                      ) : null}
                    </td>
                    <td style={{ padding: "0.45rem 0.5rem" }}>
                      {row.pushCompanies.length > 0 ? (
                        row.pushCompanies.map((company) => (
                          <div key={company.inn}>{companyLine(company)}</div>
                        ))
                      ) : (
                        <div style={{ color: "var(--color-text-secondary)" }}>
                          {row.serviceWide
                            ? "Автопуши по документам не уходят"
                            : "Нет привязанной компании"}
                        </div>
                      )}
                      {extraCompanies.length > 0 ? (
                        <div style={{ color: "var(--color-text-secondary)", fontSize: "0.7rem", marginTop: "0.25rem" }}>
                          В приложении ещё: {extraCompanies.map(companyLine).join("; ")}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: "0.45rem 0.5rem", whiteSpace: "nowrap" }}>
                      {row.deviceCount}
                      {row.platforms.length > 0 ? (
                        <div style={{ color: "var(--color-text-secondary)", fontSize: "0.7rem" }}>
                          {row.platforms.join(", ")}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: "0.45rem 0.5rem", whiteSpace: "nowrap" }}>{formatWhen(row.lastSeen)}</td>
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
