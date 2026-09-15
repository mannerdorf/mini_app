import React from "react";
import { statusLabels, type JobStatus } from "../../../lib/pickup/model";

export function PickupJobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={`pk-badge pk-badge--${status}`}>
      {statusLabels[status] ?? status}
    </span>
  );
}
