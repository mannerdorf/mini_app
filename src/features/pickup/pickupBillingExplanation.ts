import type { Job } from '../../../lib/pickup/model';
import { pickupJobOnBillingTab } from '../../../lib/pickup/pickupBillingJobs';
export function pickupBillingExplanation(job: Job): string {
  if (job.data.issueCustomerBill !== true) return 'Забор не включён в журнал счетов: выключено «Выставлять счёт». Включите его в расчётах ниже и сохраните.';
  if (!pickupJobOnBillingTab(job)) return 'Выставление счёта включено. Забор появится в журнале после сдачи груза на склад.';
  return `Забор включён в журнал счетов за ${job.date}. Связанную перевозку, сумму и результат передачи проверьте в журнале. Номер заявки сам по себе не подтверждает синхронизацию с 1С.`;
}
