import React from "react";
import { Ship, Truck } from "lucide-react";
import { PlaneIcon } from "../../../components/icons/PlaneIcon";
import { AppBadge } from "../../../components/shared/AppBadge";
import type { StatusFilter } from "../../../types";

export type SendingsInfographicData = {
  ferry: number;
  auto: number;
  air: number;
  routes: { route: string; count: number }[];
  statusBadges: {
    key: string;
    label: string;
    count: number;
    color: string;
    bg: string;
    percent: number;
  }[];
};

type Props = {
  data: SendingsInfographicData;
  deliveryStatusFilterSet: Set<StatusFilter>;
  setDeliveryStatusFilterSet: React.Dispatch<React.SetStateAction<Set<StatusFilter>>>;
};

export function SendingsInfographic({ data, deliveryStatusFilterSet, setDeliveryStatusFilterSet }: Props) {
  return (
    <div className="cargo-card documents-sendings-infographic" style={{ padding: "0.6rem 0.75rem", marginBottom: "0.5rem" }}>
      <div className="documents-sendings-infographic-row">
        <AppBadge tone="info" style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", flex: "0 0 auto" }}>
          <Ship className="w-3 h-3" /> {data.ferry}
        </AppBadge>
        <AppBadge tone="neutral" style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", flex: "0 0 auto" }}>
          <Truck className="w-3 h-3" /> {data.auto}
        </AppBadge>
        <AppBadge tone="info" style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", flex: "0 0 auto" }}>
          <PlaneIcon className="w-3 h-3" width={12} height={12} /> {data.air}
        </AppBadge>
        {data.routes.map((item) => (
          <AppBadge key={item.route} tone="neutral" style={{ flex: "0 0 auto" }}>
            {item.route}: {item.count}
          </AppBadge>
        ))}
        {data.statusBadges.map((item) => {
          const isActive = deliveryStatusFilterSet.has(item.key as StatusFilter);
          return (
            <button
              key={item.key}
              type="button"
              className="role-badge documents-sendings-infographic-filter-badge"
              onClick={() => {
                setDeliveryStatusFilterSet((prev) => {
                  if (prev.size === 1 && prev.has(item.key as StatusFilter)) return new Set<StatusFilter>();
                  return new Set<StatusFilter>([item.key as StatusFilter]);
                });
              }}
              style={{
                background: item.bg,
                color: item.color,
                border: isActive ? `1px solid ${item.color}` : "1px solid var(--color-border)",
                flex: "0 0 auto",
                cursor: "pointer",
                opacity: isActive || deliveryStatusFilterSet.size === 0 ? 1 : 0.75,
              }}
            >
              {item.label}: {item.percent}% ({item.count})
            </button>
          );
        })}
      </div>
    </div>
  );
}
