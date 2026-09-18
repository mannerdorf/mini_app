import type { Job } from '../../../lib/pickup/model';
import type { Pending } from './outbox';

/** Only arrival may be followed locally. Payload versions are never rebased across conflicts. */
export function queuedArrival(job: Job, items: Pending[]): Pending | undefined {
  const commands = items.filter(item => item.body.id === job.id);
  if (commands.length !== 1) return;
  const item = commands[0];
  if (item.error || item.status || item.body.action !== 'arrive') return;
  const version = Number(item.body.version);
  if (!Number.isInteger(version)) return;
  if ((job.status === 'pending' && job.version === version) ||
      (job.status === 'arrived' && job.version === version + 1)) return item;
}

export function localArrivalView(job: Job, items: Pending[]): Job {
  // Keep the authoritative version for draft comparison; command preparation supplies the dependency version.
  return queuedArrival(job, items) ? { ...job, status: 'arrived' } : job;
}

export function prepareDependentCommand(body: Record<string, unknown>, job: Job | undefined, items: Pending[]) {
  if (!items.some(item => item.body.id === body.id)) return null;
  const arrival = job && queuedArrival(job, items);
  if (!arrival || !['complete', 'problem'].includes(String(body.action)) || body.version !== job.version) {
    throw new Error('Сначала синхронизируйте предыдущую отметку этой точки и проверьте изменения.');
  }
  return { ...body, version: Number(arrival.body.version) + 1 };
}
