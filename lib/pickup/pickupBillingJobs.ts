import { statusLabels, type Job } from "./model.js";

/** Заборы на складе с известным номером перевозки — готовы к выставлению счёта. */
export function pickupJobOnBillingTab(job: Job): boolean {
  return (
    job.status === "deposited" && Boolean(job.data.cargoNumber?.trim())
  );
}

export function pickupBillingStatusLabel(job: Job): string {
  return statusLabels[job.status] ?? job.status;
}
