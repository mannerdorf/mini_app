import React from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Activity, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { formatRelativeLoginTime, topActiveAccentOpacity } from "../lib/adminUsersHelpers";

type TopUser = { id: number; login: string; last_login_at?: string | null };
type TopCustomer = { customer: string; users_count?: number; last_login_at?: string | null };

type Props = {
  topActiveExpanded: boolean;
  setTopActiveExpanded: (fn: (e: boolean) => boolean) => void;
  topActiveMode: "users" | "customers";
  setTopActiveMode: (mode: "users" | "customers") => void;
  lastLoginAvailable: boolean;
  loading: boolean;
  topActiveUsers: TopUser[];
  topActiveCustomers: TopCustomer[];
};

export function AdminUsersTopActivePanel({
  topActiveExpanded,
  setTopActiveExpanded,
  topActiveMode,
  setTopActiveMode,
  lastLoginAvailable,
  loading,
  topActiveUsers,
  topActiveCustomers,
}: Props) {
  return (
          <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)", marginBottom: "var(--element-gap, 1rem)" }}>
            <button
              type="button"
              onClick={() => setTopActiveExpanded((e) => !e)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                marginBottom: topActiveExpanded ? "0.5rem" : 0,
                padding: 0,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
                color: "inherit",
              }}
              aria-expanded={topActiveExpanded}
              aria-label={topActiveExpanded ? "Свернуть топ активных пользователей" : "Развернуть топ активных пользователей"}
            >
              {topActiveExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <Activity className="w-4 h-4" />
              <Typography.Body style={{ fontWeight: 600 }}>Топ активных пользователей</Typography.Body>
            </button>
            {topActiveExpanded && (
              <>
                <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
                  По последнему входу в приложение
                </Typography.Body>
                <Flex align="center" gap="0.35rem" style={{ marginBottom: "0.5rem" }}>
                  <Button
                    type="button"
                    className="filter-button"
                    style={{
                      padding: "0 0.6rem",
                      fontSize: "0.85rem",
                      background: topActiveMode === "users" ? "var(--color-primary-blue)" : undefined,
                      color: topActiveMode === "users" ? "white" : undefined,
                    }}
                    onClick={() => setTopActiveMode("users")}
                  >
                    Пользователи
                  </Button>
                  <Button
                    type="button"
                    className="filter-button"
                    style={{
                      padding: "0 0.6rem",
                      fontSize: "0.85rem",
                      background: topActiveMode === "customers" ? "var(--color-primary-blue)" : undefined,
                      color: topActiveMode === "customers" ? "white" : undefined,
                    }}
                    onClick={() => setTopActiveMode("customers")}
                  >
                    Заказчики
                  </Button>
                </Flex>
                {!lastLoginAvailable && (
                  <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-error)", marginBottom: "0.5rem" }}>
                    Колонка last_login_at отсутствует в БД. Выполните миграцию 015 (migrations/015_registered_users_last_login.sql) — тогда время входа будет сохраняться при входе по email/пароль.
                  </Typography.Body>
                )}
                {lastLoginAvailable && topActiveMode === "users" && topActiveUsers.length > 0 && topActiveUsers.every((u) => !u.last_login_at) && (
                  <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
                    Даты появятся после того, как пользователи войдут в приложение по email и паролю.
                  </Typography.Body>
                )}
                {lastLoginAvailable && topActiveMode === "customers" && topActiveCustomers.length > 0 && topActiveCustomers.every((c) => !c.last_login_at) && (
                  <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
                    Даты появятся после того, как пользователи компаний войдут в приложение по email и паролю.
                  </Typography.Body>
                )}
                {loading ? (
                  <Flex align="center" gap="0.5rem">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <Typography.Body style={{ fontSize: "0.9rem" }}>Загрузка...</Typography.Body>
                  </Flex>
                ) : (topActiveMode === "users" ? topActiveUsers.length === 0 : topActiveCustomers.length === 0) ? (
                  <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                    {topActiveMode === "users"
                      ? "Нет активных пользователей. Данные о входах появятся после входа через CMS."
                      : "Нет активных заказчиков. Данные о входах появятся после входа через CMS."}
                  </Typography.Body>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {(topActiveMode === "users" ? topActiveUsers : topActiveCustomers).map((u, i) => {
                      const accentOpacity = topActiveAccentOpacity(u.last_login_at);
                      const timeLabel = formatRelativeLoginTime(u.last_login_at);
                      return (
                      <div
                        key={"id" in u ? u.id : `customer-${u.customer}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "0.55rem 0.65rem",
                          background: "var(--color-bg-hover)",
                          border: "1px solid var(--color-border)",
                          borderLeft: `4px solid rgba(0, 113, 227, ${accentOpacity})`,
                          borderRadius: 8,
                          flexWrap: "wrap",
                          gap: "0.75rem",
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--color-text-primary)" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              minWidth: 22,
                              height: 22,
                              marginRight: 8,
                              borderRadius: 999,
                              fontSize: "0.75rem",
                              background: "var(--color-bg-card)",
                              border: "1px solid var(--color-border)",
                              color: "var(--color-text-secondary)",
                            }}
                          >
                            {i + 1}
                          </span>
                          {"login" in u ? u.login : u.customer}
                          {"users_count" in u ? ` (${u.users_count})` : ""}
                        </span>
                        <Typography.Body
                          style={{
                            fontSize: "0.78rem",
                            color: "var(--color-text-secondary)",
                            marginLeft: "0.5rem",
                            padding: "0.15rem 0.45rem",
                            borderRadius: 999,
                            background: "var(--color-bg-card)",
                            border: "1px solid var(--color-border)",
                          }}
                        >
                          {timeLabel}
                        </Typography.Body>
                      </div>
                    ); })}
                  </div>
                )}
              </>
            )}
          </Panel>
  );
}
