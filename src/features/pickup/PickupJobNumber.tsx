import React from "react";
import type { Job } from "../../../lib/pickup/model";

/** Сквозной номер забора (ZB-…), отдельно от заявки и перевозки. */
export function PickupJobNumber({
  job,
  prominent = false,
}: {
  job: Job;
  prominent?: boolean;
}) {
  const n = job.job_number?.trim();
  if (!n) return null;
  return (
    <p
      className={
        prominent
          ? "pk-job-number pk-job-number--prominent"
          : "pk-job-number"
      }
    >
      Забор <strong>{n}</strong>
    </p>
  );
}
