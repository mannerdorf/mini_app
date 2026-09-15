import React from "react";
import type { Route } from "../../../lib/pickup/model";

const labels: Record<Route["status"], string> = {
  draft: "Черновик",
  published: "Опубликован",
  started: "Выполняется",
  completed: "Завершён",
};

export function PickupRouteStatusBadge({ status }: { status: Route["status"] }) {
  return (
    <span className={`pk-badge pk-badge--route-${status}`}>
      {labels[status]}
    </span>
  );
}
