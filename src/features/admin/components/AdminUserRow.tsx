import "../../../components/shared/tableControls.css";
import React, { useRef, useState } from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { TapSwitch } from "../../../components/TapSwitch";
import { formatDisplayDate, formatDisplayDateFromDate } from "../../../lib/dateUtils";
import type { User } from "../types/adminUsers";

export type AdminUserRowProps = {
  user: User;
  onToggleActive: () => Promise<void>;
  onEditPermissions: (user: User) => void;
  rank?: number;
};

export function AdminUserRow({
  user,
  onToggleActive,
  onEditPermissions,
  rank,
}: AdminUserRowProps) {
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const now = Date.now();
  const lastMs = user.last_login_at ? new Date(user.last_login_at).getTime() : 0;
  const diffMs = lastMs ? now - lastMs : Infinity;
  const ms30d = 30 * 24 * 3600 * 1000;
  const freshness = diffMs >= ms30d ? 0 : Math.max(0, 1 - diffMs / ms30d);
  const accentOpacity = Math.min(0.5, 0.12 + freshness * 0.38);
  const timeLabel = user.last_login_at
    ? (() => {
        const d = new Date(user.last_login_at as string);
        const dMs = now - d.getTime();
        const diffM = Math.floor(dMs / 60000);
        const diffH = Math.floor(dMs / 3600000);
        const diffD = Math.floor(dMs / 86400000);
        if (diffM < 1) return "только что";
        if (diffM < 60) return `${diffM} мин назад`;
        if (diffH < 24) return `${diffH} ч назад`;
        if (diffD < 7) return `${diffD} дн назад`;
        return formatDisplayDateFromDate(d);
      })()
    : "никогда";
  const handleToggle = async () => {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);setError("");
    try {
      await onToggleActive();
    } catch {
      setError("Не удалось изменить активность. Попробуйте ещё раз.");
    } finally {
      pending.current = false;
      setLoading(false);
    }
  };
  return (
    <div
      style={{
        padding: "0.65rem 0.75rem",
        border: "1px solid var(--color-border)",
        borderRadius: "8px",
        background: user.active ? "var(--color-bg-hover)" : "var(--color-bg-input)",
        borderLeft: `4px solid rgba(0, 113, 227, ${accentOpacity})`,
        opacity: user.active ? 1 : 0.85,
        cursor: "pointer",
      }}
    >
      <Flex justify="space-between" align="flex-start" wrap="wrap" gap="0.5rem">
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography.Body
            style={{
              fontWeight: 600,
              color: "var(--color-text-primary)",
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              flexWrap: "wrap",
            }}
          >
            {typeof rank === "number" && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 22,
                  height: 22,
                  borderRadius: 999,
                  fontSize: "0.75rem",
                  background: "var(--color-bg-card)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-secondary)",
                }}
              >
                {rank + 1}
              </span>
            )}
            <button type="button" className="table-control" aria-label={`Права пользователя ${user.login || ''}`} onClick={() => onEditPermissions(user)}>{user.login ?? "—"}</button>
          </Typography.Body>
          <Flex gap="0.35rem" align="center" wrap="wrap" style={{ marginTop: "0.35rem" }}>
            <Typography.Body
              style={{
                fontSize: "0.74rem",
                color: "var(--color-text-secondary)",
                padding: "0.1rem 0.45rem",
                borderRadius: 999,
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
              }}
            >
              {user.active ? "Активен" : "Неактивен"}
            </Typography.Body>
            {user.created_at && (
              <Typography.Body
                style={{
                  fontSize: "0.74rem",
                  color: "var(--color-text-secondary)",
                  padding: "0.1rem 0.45rem",
                  borderRadius: 999,
                  background: "var(--color-bg-card)",
                  border: "1px solid var(--color-border)",
                }}
              >
                Создан: {formatDisplayDate(user.created_at)}
              </Typography.Body>
            )}
          </Flex>
        </div>
        <Flex align="center" gap="0.5rem" style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <Typography.Body
            style={{
              fontSize: "0.74rem",
              color: "var(--color-text-secondary)",
              padding: "0.15rem 0.45rem",
              borderRadius: 999,
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border)",
            }}
          >
            {timeLabel}
          </Typography.Body>
          <span style={{ cursor: loading ? "wait" : "pointer" }}>
            <TapSwitch aria-label={`Активность пользователя ${user.login || ""}`} disabled={loading} checked={user.active} onToggle={handleToggle} />
          </span>
        </Flex>
      </Flex>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
