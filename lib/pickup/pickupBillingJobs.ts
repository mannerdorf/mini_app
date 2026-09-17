import { statusLabels, type Job } from "./model.js";

/** Сданные заборы с включённым выставлением счёта; перевозку журнал ищет в БД. */
export function pickupJobOnBillingTab(job: Job): boolean {
  return (
    job.status === "deposited" && job.data.issueCustomerBill === true
  );
}

export function pickupBillingStatusLabel(job: Job): string {
  return statusLabels[job.status] ?? job.status;
}
