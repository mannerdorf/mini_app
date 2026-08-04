import React from "react";
import { Typography } from "@maxhub/max-ui";
import { CLAIM_STATUS_LABELS_RU, CLAIM_EVENT_TYPE_LABELS_RU } from "../lib/claimConstants";
import {
  claimTimelineSectionStyle,
  getClaimEventStatusBadgeBg,
  getClaimEventStatusBadgeColor,
} from "../lib/adminClaimStatusStyles";
import type { AdminClaimsState } from "../hooks/useAdminClaims";

type Detail = NonNullable<AdminClaimsState["adminClaimDetail"]>;

export function AdminClaimDetailTimelineSection({ detail }: { detail: Detail }) {
  return (
    <div style={claimTimelineSectionStyle}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.45rem" }}>Хронология</Typography.Body>
      {Array.isArray(detail.events) && detail.events.length > 0 ? (
        <div style={{ display: "grid", gap: "0.4rem" }}>
          {detail.events.slice(-20).reverse().map((ev: { id?: number; eventType?: string; toStatus?: string; createdAt?: string }) => {
            const eventKey = String(ev.eventType || "").toLowerCase();
            const eventLabel = CLAIM_EVENT_TYPE_LABELS_RU[eventKey] || ev.eventType || "—";
            const statusKey = String(ev.toStatus || "").toLowerCase();
            const statusLabel = ev.toStatus ? (CLAIM_STATUS_LABELS_RU[statusKey] || ev.toStatus) : null;
            return (
              <Typography.Body key={ev.id} style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                <span style={{ color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                  {new Date(ev.createdAt || "").toLocaleString("ru-RU")}
                </span>
                <span
                  style={{
                    display: "inline-block",
                    fontSize: "0.7rem",
                    padding: "0.15rem 0.4rem",
                    borderRadius: 999,
                    fontWeight: 600,
                    background: "rgba(59,130,246,0.12)",
                    color: "#2563eb",
                    whiteSpace: "nowrap",
                  }}
                >
                  {eventLabel}
                </span>
                {statusLabel ? (
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: "0.7rem",
                      padding: "0.15rem 0.4rem",
                      borderRadius: 999,
                      fontWeight: 600,
                      background: getClaimEventStatusBadgeBg(statusKey),
                      color: getClaimEventStatusBadgeColor(statusKey),
                      whiteSpace: "nowrap",
                    }}
                  >
                    {statusLabel}
                  </span>
                ) : null}
              </Typography.Body>
            );
          })}
        </div>
      ) : (
        <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>Событий пока нет</Typography.Body>
      )}
    </div>
  );
}
