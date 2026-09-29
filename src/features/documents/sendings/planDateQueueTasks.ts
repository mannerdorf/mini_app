import type { PlanDateQueueTask } from '../../../api/client/documentsSendings';
import { formatPerevozkaNumberForApi } from '../../../lib/perevozkaNumber';

/** Older APIs ignore the cargo filter and return the same tasks for every batch. */
export function uniquePlanDateTasks(tasks: PlanDateQueueTask[]): PlanDateQueueTask[] {
  const byNumber = new Map<string, PlanDateQueueTask>();
  for (const task of tasks) {
    const key = formatPerevozkaNumberForApi(task.cargo_number);
    if (!key) continue;
    const previous = byNumber.get(key);
    const previousTime = Date.parse(previous?.updated_at ?? '') || 0;
    const currentTime = Date.parse(task.updated_at ?? '') || 0;
    if (!previous || currentTime >= previousTime) byNumber.set(key, task);
  }
  return [...byNumber.values()];
}
