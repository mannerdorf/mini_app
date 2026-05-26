import React from "react";
import { Ship, Truck } from "lucide-react";
import { AppBadge } from "./AppBadge";
import { StatusBadge, StatusBillBadge } from "./StatusBadges";
import { cityToCode } from "../../lib/formatUtils";
import {
  cargoLastMileIsSelfPickup,
  cargoPickupLogisticsIsTerminalTo,
  getCargoRoleSet,
  isFerry,
} from "../../lib/cargoUtils";
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
  const ferry = item != null ? isFerry(item as CargoItem) : isAkFerry(ak);
  const iconClass = className ?? "w-4 h-4";
  const iconStyle: React.CSSProperties = {
    color: ferry ? "var(--color-primary-blue)" : "var(--color-text-secondary)",
    display: "inline-block",
    verticalAlign: "middle",
  };
  return ferry ? (
    <Ship className={iconClass} width={size} height={size} style={iconStyle} title="Паром" />
  ) : (
    <Truck className={iconClass} width={size} height={size} style={iconStyle} title="Авто" />
  );
}

/** Заборная логистика (пикап / terminal-to). */
export function CargoPickupLogisticsBadge({ item }: { item: CargoItem }) {
  const terminalTo = cargoPickupLogisticsIsTerminalTo(item);
  return (
    <span
      title={
        terminalTo
          ? "Заборная логистика: доставка на терминал (terminal-to)"
          : "Заборная логистика: пикап (PickUP)"
      }
      className={`max-badge ${terminalTo ? "cargo-pickup-terminal-to" : "cargo-pickup-pickup"}`}
      style={{ flexShrink: 0 }}
    >
      {terminalTo ? "На терминал" : "Пикап"}
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
 * Бейджи перевозки в логической цепочке:
 * забор → магистраль (статус) → последняя миля → оплата.
 */
export function CargoLogisticsBadges({
  item,
  showPayment = false,
  showRouteInline = false,
  className = "cargo-inner-table__badges cargo-inner-table__badges--stack-mobile",
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
      <CargoPickupLogisticsBadge item={item} />
      <StatusBadge status={item.State} />
      <CargoLastMileBadge item={item} />
      {showBill ? <StatusBillBadge status={item.StateBill} /> : null}
      {showRouteInline ? (
        <span className="cargo-inner-table__route-inline">
          <RouteBadge route={getCargoItemRouteLabel(item)} />
        </span>
      ) : null}
    </div>
  );
}
