import { statusLabels } from "../../../lib/pickup/model";
export type JobHistory = {
  createdAt: string; status: string;
  events: { id: string; action: string; created_at: string; data?: { from?: string; to?: string; note?: string } }[];
};
const legacy: Record<string, string> = {
  arrive: "На точке", "Прибыл на точку": "На точке",
  complete: "Груз забран", "Груз забран": "Груз забран",
  problem: "Проблема", "Проблема на точке": "Проблема",
  resolve: "Решение диспетчера", "Решение диспетчера": "Решение диспетчера",
  cancel: "Отменён", "Забор отменён": "Отменён",
  "Груз сдан на склад": "Сдан на склад",
};
export function jobTimeline(history: JobHistory) {
  const result: { id: string; label: string; date: string; note: string }[] = [];
  for (const event of history.events) {
    const to = event.data?.to;
    const from = event.data?.from;
    const resolution = event.action === "resolve" || event.action === "Решение диспетчера";
    // Saving a comment/resolution does not create a new status transition.
    if (from && to && from === to) continue;
    if (resolution && to && to !== "resolved") continue;
    const label = (to && Object.prototype.hasOwnProperty.call(statusLabels, to) ? statusLabels[to as keyof typeof statusLabels] : "") || legacy[event.action];
    if (!label || to === "pending") continue;
    const manual = event.action === "set_job_status" || event.action === "Статус забора изменён диспетчером";
    result.push({ id: event.id, label: manual ? `${label} · изменено диспетчером` : label, date: event.created_at, note: event.data?.note || "" });
  }
  result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const arrival = result.findIndex((entry) => entry.label.startsWith("На точке"));
  // Older pickups may lack arrival events: preserve known later events without inventing a timestamp.
  return arrival >= 0 ? result.slice(arrival) : result;
}
