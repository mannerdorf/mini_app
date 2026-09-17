import { assess, minutes, type AnalysisPlan, type Point } from './routeAnalysis.js';
import type { RouteProvider, RoutingOptions } from './routeProvider.js';

/** Refine only shortlisted orders, including waiting/loading before the next departure. */
export async function timedAssessment(plan: AnalysisPlan, ids: string[], points: Point[], provider: RouteProvider, options: RoutingOptions) {
  const order = ids.map(id => plan.jobs.findIndex(job => job.id === id));
  const matrix = plan.matrix.map(row => [...row]);
  let clock = plan.departure;
  let previous = 0;
  for (const next of [...order.map(i => i + 1), plan.jobs.length + 1]) {
    const utc = options.utc + Math.round((clock - plan.departure) * 60);
    const traffic = options.traffic === 'jam' && clock - plan.departure <= 15 ? 'jam' : 'statistics';
    const leg = (await provider.matrix([points[previous], points[next]], { ...options, utc, traffic }))[0]?.[1] ?? null;
    matrix[previous][next] = leg;
    if (!leg) break; // No reliable downstream departure after an unreachable section.
    clock += leg.duration / 60;
    const job = plan.jobs[next - 1];
    if (job) clock = Math.max(clock, minutes(job.data.windowFrom)) + job.data.serviceMinutes;
    previous = next;
  }
  return assess({ ...plan, matrix }, order);
}
