import React from "react";
import { Check, Truck } from "lucide-react";
import type { Route } from "../../../lib/pickup/model";

const labels: Record<Route["status"], string> = {
  draft: "Черновик",
  published: "Опубликован",
  started: "Выполняется",
  completed: "Завершён",
};

export function PickupRouteStatusBadge({ status }: { status: Route["status"] }) {
  const Icon = status === "completed" ? Check : status === "started" ? Truck : null;
  return (
    <span className={`pk-badge pk-badge--route-${status}`}>
      {Icon && <Icon size={14} aria-hidden="true" />}
      {labels[status]}
    </span>
  );
}
