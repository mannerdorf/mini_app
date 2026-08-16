import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Bell, Loader2, Package } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import type { Account } from "../../types";
import { fetchPushHistory, type PushHistoryItem } from "../../api/client/notifications";
import { formatDateTime } from "../../lib/dateUtils";
import {
  CARGO_STAGE_EVENT_IDS,
  cargoStageEventLabel,
  type CargoStageEventId,
} from "../../../lib/notificationCargoEvents";

type Props = {
  activeAccount: Account | null;
  onBack: () => void;
};

const CARGO_STAGE_SET = new Set<string>(CARGO_STAGE_EVENT_IDS);

function pushEventLabel(event: string): string {
  if (CARGO_STAGE_SET.has(event)) {
    return cargoStageEventLabel(event as CargoStageEventId);
  }
  switch (event) {
    case "bill_created":
      return "Создан счёт";
    case "bill_paid":
      return "Счёт оплачен";
    case "daily_summary":
      return "Ежедневная сводка";
    case "weekly_summary":
      return "Еженедельная сводка";
    case "broadcast":
      return "Сообщение HAULZ";
    case "accepted":
      return "Принят";
    case "in_transit":
      return "В пути";
    case "delivered":
      return "Доставлен";
    default:
      return event || "Уведомление";
  }
}

export function ProfilePushHistorySection({ activeAccount, onBack }: Props) {
  const login = activeAccount?.login?.trim().toLowerCase() || "";
  const [items, setItems] = useState<PushHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!login) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await fetchPushHistory(login, { limit: 50 });
      setItems(next);
    } catch (e) {
      setError((e as { message?: string })?.message || "Не удалось загрузить историю");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [login]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="w-full">
      <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
        <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }} aria-label="Назад">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Typography.Headline className="text-page-title">Push</Typography.Headline>
      </Flex>

      <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "1rem" }}>
        <Flex align="flex-start" style={{ gap: "0.75rem" }}>
          <div className="profile-saas-row-icon">
            <Bell className="w-5 h-5" style={{ color: "var(--color-primary)" }} />
          </div>
          <div>
            <Typography.Body style={{ fontWeight: 700, margin: 0 }}>История push-уведомлений</Typography.Body>
            <Typography.Body
              style={{
                margin: "0.35rem 0 0",
                fontSize: "0.84rem",
                color: "var(--color-text-secondary)",
                lineHeight: 1.45,
              }}
            >
              Здесь отображаются push, отправленные в Android-приложение HAULZ по этапам перевозки и счетам.
            </Typography.Body>
          </div>
        </Flex>
      </Panel>

      {!login ? (
        <Panel className="cargo-card" style={{ padding: "1.25rem" }}>
          <Typography.Body style={{ color: "var(--color-text-secondary)", margin: 0 }}>
            Выберите компанию в шапке, чтобы увидеть историю.
          </Typography.Body>
        </Panel>
      ) : loading ? (
        <Panel className="cargo-card" style={{ padding: "1.25rem", display: "flex", justifyContent: "center" }}>
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--color-text-secondary)" }} />
        </Panel>
      ) : error ? (
        <Panel className="cargo-card" style={{ padding: "1.25rem" }}>
          <Typography.Body style={{ color: "var(--color-error, #dc2626)", margin: "0 0 0.75rem" }}>{error}</Typography.Body>
          <Button className="button-secondary" type="button" onClick={() => void load()}>
            Повторить
          </Button>
        </Panel>
      ) : items.length === 0 ? (
        <Panel className="cargo-card" style={{ padding: "1.25rem" }}>
          <Typography.Body style={{ color: "var(--color-text-secondary)", margin: 0 }}>
            Пока нет отправленных push-уведомлений. Включите их в разделе «Уведомления» и дождитесь смены статуса груза.
          </Typography.Body>
        </Panel>
      ) : (
        <div className="profile-saas-stack" style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          {items.map((item) => (
            <Panel key={item.id} className="cargo-card profile-saas-row-card" style={{ padding: "1rem" }}>
              <Flex align="flex-start" style={{ gap: "0.75rem" }}>
                <div className="profile-saas-row-icon">
                  <Package className="w-5 h-5" style={{ color: "var(--color-primary)" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Typography.Body style={{ fontWeight: 700, margin: 0, fontSize: "0.92rem" }}>
                    {pushEventLabel(item.event)}
                  </Typography.Body>
                  <Typography.Body
                    style={{
                      margin: "0.25rem 0 0",
                      fontSize: "0.84rem",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {item.event === "broadcast"
                      ? item.cargoNumber || "Рассылка HAULZ"
                      : item.cargoNumber
                        ? `Груз ${item.cargoNumber}`
                        : "Без номера груза"}
                    {item.inn ? ` · ИНН ${item.inn}` : ""}
                  </Typography.Body>
                  <Flex
                    align="center"
                    justify="space-between"
                    style={{ marginTop: "0.45rem", gap: "0.5rem", flexWrap: "wrap" }}
                  >
                    <Typography.Body
                      style={{
                        margin: 0,
                        fontSize: "0.78rem",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {formatDateTime(item.sentAt)}
                    </Typography.Body>
                    <Typography.Body
                      style={{
                        margin: 0,
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        color: item.success
                          ? "var(--color-success, #16a34a)"
                          : "var(--color-error, #dc2626)",
                      }}
                    >
                      {item.success ? "Доставлено" : "Ошибка"}
                    </Typography.Body>
                  </Flex>
                  {!item.success && item.errorMessage ? (
                    <Typography.Body
                      style={{
                        margin: "0.35rem 0 0",
                        fontSize: "0.78rem",
                        color: "var(--color-error, #dc2626)",
                        wordBreak: "break-word",
                      }}
                    >
                      {item.errorMessage}
                    </Typography.Body>
                  ) : null}
                </div>
              </Flex>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
