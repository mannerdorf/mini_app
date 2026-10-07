import React from "react";
import { Check, TriangleAlert, Package } from "lucide-react";
import { statusLabels, type JobStatus } from "../../../lib/pickup/model";

export function PickupJobStatusBadge({ status, serviceKind }: { status: JobStatus; serviceKind?: string }) {
  const Icon = status === "deposited" || status === "picked_up" || status === "resolved" ? Check : status === "problem" ? TriangleAlert : status === "partial" || status === "arrived" ? Package : null;
  return (
    <span className={`pk-badge pk-badge--${status}`}>
      {Icon && <Icon size={14} aria-hidden="true" />}
      {serviceKind === "last_mile" && status === "deposited" ? "Вручено получателю" : serviceKind === "last_mile" && status === "partial" ? "Вручено частично" : statusLabels[status] ?? status}
    </span>
  );
}
