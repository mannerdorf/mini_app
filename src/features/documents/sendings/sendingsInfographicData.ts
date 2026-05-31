import { cityToCode } from "../../../lib/formatUtils";
import { STATUS_MAP } from "../../../lib/statusUtils";
import type { StatusFilter } from "../../../types";
import type { SendingsInfographicData } from "./SendingsInfographic";

export function buildSendingsInfographicData(
  sendingRowsSorted: unknown[],
  normalizeTransportDisplay: (value: string) => string,
  getSendingStatusKey: (row: unknown) => StatusFilter,
): SendingsInfographicData {
  let ferry = 0;
  let auto = 0;
  const byRoute = new Map<string, number>();
  const statusCounts: Record<"in_transit" | "ready" | "delivering" | "delivered", number> = {
    in_transit: 0,
    ready: 0,
    delivering: 0,
    delivered: 0,
  };

  sendingRowsSorted.forEach((row) => {
    const r = row as Record<string, unknown>;
    const vehicle = normalizeTransportDisplay(
      String(r?.АвтомобильCMRНаименование ?? r?.AutoReg ?? r?.AutoType ?? ""),
    );
    const hasPlate = /[A-ZА-Я][0-9]{3}[A-ZА-Я]{2}(?:\s*\/?\s*[0-9]{2,3})?/u.test(vehicle.toUpperCase());
    if (hasPlate) auto += 1;
    else ferry += 1;

    const statusKey = getSendingStatusKey(row);
    if (
      statusKey === "in_transit" ||
      statusKey === "ready" ||
      statusKey === "delivering" ||
      statusKey === "delivered"
    ) {
      statusCounts[statusKey] += 1;
    }

    const routeFrom = String(
      r?.ПунктОтправленияГородАэропорт ?? r?.CitySender ?? r?.ГородОтправления ?? "",
    ).trim();
    const routeTo = String(
      r?.ПунктНазначенияГородАэропорт ?? r?.CityReceiver ?? r?.ГородНазначения ?? "",
    ).trim();
    const route =
      [cityToCode(routeFrom), cityToCode(routeTo)].filter(Boolean).join(" – ") ||
      [routeFrom, routeTo].filter(Boolean).join(" – ") ||
      "—";
    byRoute.set(route, (byRoute.get(route) ?? 0) + 1);
  });

  const knownTotal =
    statusCounts.in_transit + statusCounts.ready + statusCounts.delivering + statusCounts.delivered;
  const total = knownTotal || 1;
  const statusBadges = [
    {
      key: "in_transit",
      label: STATUS_MAP.in_transit,
      count: statusCounts.in_transit,
      color: "#2563eb",
      bg: "rgba(37,99,235,0.12)",
    },
    {
      key: "ready",
      label: STATUS_MAP.ready,
      count: statusCounts.ready,
      color: "#7c3aed",
      bg: "rgba(124,58,237,0.12)",
    },
    {
      key: "delivering",
      label: STATUS_MAP.delivering,
      count: statusCounts.delivering,
      color: "#d97706",
      bg: "rgba(217,119,6,0.12)",
    },
    {
      key: "delivered",
      label: STATUS_MAP.delivered,
      count: statusCounts.delivered,
      color: "#16a34a",
      bg: "rgba(22,163,74,0.12)",
    },
  ]
    .filter((s) => s.count > 0)
    .map((s) => ({ ...s, percent: Math.round((s.count / total) * 1000) / 10 }));

  const routes = [...byRoute.entries()]
    .map(([route, count]) => ({ route, count }))
    .sort((a, b) => b.count - a.count || a.route.localeCompare(b.route, "ru"));

  return { ferry, auto, routes, statusBadges };
}
