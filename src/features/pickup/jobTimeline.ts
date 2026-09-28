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
  const result = [{ id: "created", label: "Создан · Ожидает забора", date: history.createdAt, note: "" }];
  for (const event of history.events) {
    const to = event.data?.to;
    const label = (to && Object.prototype.hasOwnProperty.call(statusLabels, to) ? statusLabels[to as keyof typeof statusLabels] : "") || legacy[event.action];
    if (!label) continue;
    result.push({ id: event.id, label, date: event.created_at, note: event.data?.note || "" });
  }
  return result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
