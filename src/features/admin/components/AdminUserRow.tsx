import { useState } from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { TapSwitch } from "../../../components/TapSwitch";
import { formatDisplayDate, formatDisplayDateFromDate } from "../../../lib/dateUtils";
import type { User } from "../types/adminUsers";

export type AdminUserRowProps = {
  user: User;
  adminToken: string;
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
    setLoading(true);
    try {
      await onToggleActive();
    } finally {
      setLoading(false);
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onEditPermissions(user)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEditPermissions(user);
        }
      }}
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
            {user.login ?? "—"}
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
            <TapSwitch checked={user.active} onToggle={handleToggle} />
          </span>
        </Flex>
      </Flex>
    </div>
  );
}
