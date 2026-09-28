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
    const label = (to && Object.prototype.hasOwnProperty.call(statusLabels, to) ? statusLabels[to as keyof typeof statusLabels] : "") || legacy[event.action];
    if (!label || to === "pending") continue;
    result.push({ id: event.id, label, date: event.created_at, note: event.data?.note || "" });
  }
  result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const arrival = result.findIndex((entry) => entry.label === "На точке");
  // Older pickups may lack arrival events: preserve known later events without inventing a timestamp.
  return arrival >= 0 ? result.slice(arrival) : result;
}
