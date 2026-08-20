import React, { useCallback, useEffect, useState } from "react";
import { Button, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import {
  fetchAdminPushControlJournal,
  type AdminPushControlJournalEntry,
} from "../../../api/client/admin/pushNotifications";

type Props = {
  adminToken: string;
  onError?: (message: string | null) => void;
};

function formatWhen(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function actionLabel(action: string): string {
  switch (action) {
    case "fcm_subscribe":
      return "Подписка FCM";
    case "fcm_unsubscribe":
      return "Отписка FCM";
    case "prefs_save":
      return "Настройки";
    case "activation_sync":
      return "Синхронизация реестра";
    default:
      return action;
  }
}

export function AdminPushControlJournalSection({ adminToken, onError }: Props) {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<AdminPushControlJournalEntry[]>([]);
  const [notice, setNotice] = useState<string | undefined>();
  const [login, setLogin] = useState("");
  const [inn, setInn] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    onError?.(null);
    try {
      const data = await fetchAdminPushControlJournal(adminToken, {
        login: login.trim() || undefined,
        inn: inn.trim() || undefined,
        limit: 150,
      });
      setEntries(data.entries);
      setNotice(data.notice);
    } catch (e: unknown) {
      setEntries([]);
      setNotice(undefined);
      onError?.((e as Error)?.message || "Не удалось загрузить журнал push");
    } finally {
      setLoading(false);
    }
  }, [adminToken, inn, login, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)", marginBottom: "1rem" }}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>
        Журнал контроля push
      </Typography.Body>
      <Typography.Body
        style={{
          fontSize: "0.8rem",
          color: "var(--color-text-secondary)",
          marginBottom: "0.75rem",
          lineHeight: 1.45,
        }}
      >
        История: пользователь / ИНН заказчика / устройство (суффикс токена) / действие / типы событий. Реестр
        активаций обновляется при подписке FCM и сохранении настроек уведомлений.
      </Typography.Body>

      {notice ? (
        <Typography.Body style={{ fontSize: "0.8rem", color: "#b45309", marginBottom: "0.75rem" }}>
          {notice}
        </Typography.Body>
      ) : null}

      <Flex align="center" gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
        <Input
          className="admin-form-input"
          placeholder="Логин"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          style={{ minWidth: "10rem", flex: "1 1 10rem" }}
        />
        <Input
          className="admin-form-input"
          placeholder="ИНН"
          value={inn}
          onChange={(e) => setInn(e.target.value)}
          style={{ minWidth: "8rem", flex: "0 1 8rem" }}
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

      {loading && entries.length === 0 ? (
        <Flex align="center" gap="0.5rem">
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body style={{ fontSize: "0.85rem" }}>Загрузка журнала…</Typography.Body>
        </Flex>
      ) : entries.length === 0 ? (
        <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
          Записей пока нет. Они появятся после подписки устройства или сохранения настроек push.
        </Typography.Body>
      ) : (
        <div style={{ overflowX: "auto", maxHeight: "22rem", overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", minWidth: "860px" }}>
            <thead>
              <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Когда</th>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Логин</th>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>ИНН</th>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Действие</th>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Устройство</th>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Детали</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => {
                const meta = row.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : null;
                const enabledEvents = Array.isArray(meta?.enabled_events)
                  ? (meta!.enabled_events as string[]).join(", ")
                  : row.eventId
                    ? `${row.eventId}${row.enabled == null ? "" : row.enabled ? " ✓" : " ✕"}`
                    : "";
                return (
                  <tr key={String(row.id)} style={{ borderBottom: "1px solid var(--color-border)", verticalAlign: "top" }}>
                    <td style={{ padding: "0.4rem 0.5rem", whiteSpace: "nowrap" }}>{formatWhen(row.createdAt)}</td>
                    <td style={{ padding: "0.4rem 0.5rem" }}>{row.login}</td>
                    <td style={{ padding: "0.4rem 0.5rem" }}>{row.inn || "—"}</td>
                    <td style={{ padding: "0.4rem 0.5rem" }}>{actionLabel(row.action)}</td>
                    <td style={{ padding: "0.4rem 0.5rem", whiteSpace: "nowrap" }}>
                      {row.deviceTokenSuffix ? `…${row.deviceTokenSuffix}` : "—"}
                      {row.platform ? (
                        <div style={{ color: "var(--color-text-secondary)", fontSize: "0.68rem" }}>{row.platform}</div>
                      ) : null}
                    </td>
                    <td style={{ padding: "0.4rem 0.5rem", maxWidth: "18rem" }}>
                      {enabledEvents || "—"}
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
