import React from "react";
import { Ship, Truck } from "lucide-react";
import { PlaneIcon } from "../icons/PlaneIcon";
import { AppBadge } from "./AppBadge";
import { StatusBadge, StatusBillBadge } from "./StatusBadges";
import { cityToCode } from "../../lib/formatUtils";
import {
  cargoLastMileIsSelfPickup,
  cargoPickupLogisticsIsTerminalTo,
  CARGO_PICKUP_LABEL_PICKUP,
  CARGO_PICKUP_LABEL_TERMINAL_TO,
  getCargoPickupLogisticsLabel,
  getCargoRoleSet,
} from "../../lib/cargoUtils";
import { getCargoTransportType } from "../../lib/cargoTransportType";
import type { CargoItem } from "../../types";

export function formatRouteLabel(from?: string | null, to?: string | null): string {
  const f = cityToCode(from) || String(from ?? "").trim();
  const t = cityToCode(to) || String(to ?? "").trim();
  return [f, t].filter(Boolean).join(" – ") || "—";
}

export function getCargoItemRouteLabel(
  item: Pick<CargoItem, "CitySender" | "CityReceiver"> | Record<string, unknown>,
): string {
  const dirRaw = String(
    (item as { Direction?: string; direction?: string; Направление?: string }).Direction
      ?? (item as { direction?: string }).direction
      ?? (item as { Направление?: string }).Направление
      ?? "",
  )
    .trim()
    .toUpperCase();
  if (dirRaw.includes("MSK_TO_KGD") || dirRaw.includes("MSK-KGD")) return "MSK – KGD";
  if (dirRaw.includes("KGD_TO_MSK") || dirRaw.includes("KGD-MSK")) return "KGD – MSK";
  return formatRouteLabel(
    (item as { CitySender?: string; citySender?: string }).CitySender
      ?? (item as { citySender?: string }).citySender,
    (item as { CityReceiver?: string; cityReceiver?: string }).CityReceiver
      ?? (item as { cityReceiver?: string }).cityReceiver,
  );
}

function isAkFerry(ak: unknown): boolean {
  return ak === true || ak === "true" || ak === "1" || ak === 1;
}

export function RouteBadge({
  route,
  className,
  style,
}: {
  route?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const label = route == null ? "" : String(route).trim();
  if (!label || label === "—") return <span>—</span>;
  return (
    <AppBadge tone="info" className={className} style={{ display: "inline-block", whiteSpace: "nowrap", ...style }}>
      {label}
    </AppBadge>
  );
}

export function CargoTransportTypeIcon({
  item,
  ak,
  size = 16,
  className,
}: {
  item?: Pick<CargoItem, "AK"> | null;
  ak?: unknown;
  size?: number;
  className?: string;
}) {
  const type =
    item != null
      ? getCargoTransportType(item)
      : isAkFerry(ak)
        ? "ferry"
        : "auto";
  const iconClass = className ?? "w-4 h-4";
  const iconStyle: React.CSSProperties = {
    color: type === "auto" ? "var(--color-text-secondary)" : "var(--color-primary-blue)",
    display: "inline-block",
    verticalAlign: "middle",
    flexShrink: 0,
  };
  if (type === "air") {
    return <PlaneIcon className={iconClass} width={size} height={size} style={iconStyle} title="Авиа" />;
  }
  if (type === "ferry") {
    return <Ship className={iconClass} width={size} height={size} style={iconStyle} title="Паром" />;
  }
  return <Truck className={iconClass} width={size} height={size} style={iconStyle} title="Авто" />;
}

/** Заборная логистика (пикап / terminal-to). */
export function CargoPickupLogisticsBadge({ item }: { item: CargoItem }) {
  const terminalTo = cargoPickupLogisticsIsTerminalTo(item);
  return (
    <span
      title={
        terminalTo
          ? `Заборная логистика: ${CARGO_PICKUP_LABEL_TERMINAL_TO}`
          : `Заборная логистика: ${CARGO_PICKUP_LABEL_PICKUP}`
      }
      className={`max-badge ${terminalTo ? "cargo-pickup-terminal-to" : "cargo-pickup-pickup"}`}
      style={{ flexShrink: 0 }}
    >
      {getCargoPickupLogisticsLabel(item)}
    </span>
  );
}

/** Последняя миля. */
export function CargoLastMileBadge({ item }: { item: CargoItem }) {
  const selfPickup = cargoLastMileIsSelfPickup(item);
  return (
    <span
      title={
        selfPickup
          ? "Последняя миля: самовывоз"
          : "Последняя миля: доставка"
      }
      className={`max-badge ${selfPickup ? "cargo-last-mile-self" : "cargo-last-mile-delivery"}`}
      style={{ flexShrink: 0 }}
    >
      {selfPickup ? "Самовывоз" : "Доставка"}
    </span>
  );
}

/**
 * Бейджи перевозки: верх — цепочка логистики (забор → магистраль → последняя миля),
 * низ — оплата и маршрут (вторичные метки).
 */
export function CargoLogisticsBadges({
  item,
  showPayment = false,
  showRouteInline = false,
  className = "cargo-logistics-badges cargo-inner-table__badges cargo-inner-table__badges--stack-mobile",
}: {
  item: CargoItem;
  showPayment?: boolean;
  showRouteInline?: boolean;
  className?: string;
}) {
  const showBill =
    showPayment && getCargoRoleSet(item).has("Customer") && Boolean(item.StateBill);

  return (
    <div className={className}>
      <div className="cargo-logistics-badges__flow" aria-label="Цепочка логистики">
        <CargoPickupLogisticsBadge item={item} />
        <span className="cargo-logistics-badges__arrow" aria-hidden>
          →
        </span>
        <StatusBadge status={item.State} />
        <span className="cargo-logistics-badges__arrow" aria-hidden>
          →
        </span>
        <CargoLastMileBadge item={item} />
      </div>
      {(showBill || showRouteInline) && (
        <div className="cargo-logistics-badges__meta">
          {showBill ? <StatusBillBadge status={item.StateBill} /> : null}
          {showRouteInline ? (
            <span className="cargo-inner-table__route-inline">
              <RouteBadge route={getCargoItemRouteLabel(item)} />
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
