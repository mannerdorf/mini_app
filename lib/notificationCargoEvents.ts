/** Этапы перевозки — те же названия, что в таймлайне карточки груза. */

export const CARGO_STAGE_EVENT_IDS = [
  "info_received",
  "received_at_warehouse",
  "measured",
  "consolidation",
  "loaded",
  "sent",
  "arrived",
  "delivery_scheduled",
  "delivered",
] as const;

export type CargoStageEventId = (typeof CARGO_STAGE_EVENT_IDS)[number];

export const CARGO_NOTIFICATION_STAGES: ReadonlyArray<{ id: CargoStageEventId; label: string }> = [
  { id: "info_received", label: "Получена информация" },
  { id: "received_at_warehouse", label: "Получена на складе" },
  { id: "measured", label: "Измерена" },
  { id: "consolidation", label: "Консолидация" },
  { id: "loaded", label: "Загружена в ТС" },
  { id: "sent", label: "Отправлена" },
  { id: "arrived", label: "Прибыла в город назначения" },
  { id: "delivery_scheduled", label: "Запланирована доставка" },
  { id: "delivered", label: "Доставлена" },
];

/** Старые id в настройках (accepted / in_transit / delivered). */
export const LEGACY_CARGO_EVENT_IDS = ["accepted", "in_transit", "delivered"] as const;

function normalizeStateKey(state: string): string {
  return String(state || "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** State из 1С / списка перевозок → этап таймлайна для уведомления. */
export function getCargoStageEventIdFromState(state: string | undefined): CargoStageEventId | null {
  if (!state) return null;
  const key = normalizeStateKey(state);
  if (/полученаинформация|получена\s*информация/.test(key)) return "info_received";
  if (/упакована|измерен/.test(key)) return "measured";
  if (/консолидация/.test(key)) return "consolidation";
  if (/отправленаваэропорт|загружена/.test(key)) return "loaded";
  if (/улетела/.test(key)) return "sent";
  if (/квручению|прибыла/.test(key)) return "arrived";
  if (/поставленанадоставку|вместеприбытия/.test(key)) return "delivery_scheduled";
  if (/доставлен|заверш/.test(key)) return "delivered";
  if (/пути|отправлен/.test(key)) return "sent";
  if (/полученаотзаказчика|полученанаскладе|получена/.test(key)) return "received_at_warehouse";
  if (/готовквыдаче|квыдаче/.test(key)) return "delivery_scheduled";
  if (/готов|принят|ответ/.test(key)) return "received_at_warehouse";
  return null;
}

export function getCargoStageEventsOnStateChange(
  previousState: string | null | undefined,
  currentState: string | null | undefined,
  isFirstSeen: boolean,
): CargoStageEventId[] {
  const next = getCargoStageEventIdFromState(currentState ?? undefined);
  if (!next) return [];
  // First sighting only baselines cargo_last_state — no push for historical backlog.
  if (isFirstSeen) return [];
  const prev = getCargoStageEventIdFromState(previousState ?? undefined);
  if (prev === next) return [];
  return [next];
}

const LEGACY_ACCEPTED_STAGES: CargoStageEventId[] = [
  "info_received",
  "received_at_warehouse",
  "measured",
  "consolidation",
];
const LEGACY_IN_TRANSIT_STAGES: CargoStageEventId[] = ["loaded", "sent", "arrived"];
const LEGACY_DELIVERED_STAGES: CargoStageEventId[] = ["delivery_scheduled", "delivered"];

/** Учитывает старые ключи accepted / in_transit / delivered в сохранённых настройках. */
export function isCargoStageNotificationEnabled(
  prefs: Record<string, boolean>,
  eventId: CargoStageEventId,
): boolean {
  if (prefs[eventId] === true) return true;
  if (prefs[eventId] === false) return false;
  if (LEGACY_ACCEPTED_STAGES.includes(eventId) && prefs.accepted === true) return true;
  if (LEGACY_IN_TRANSIT_STAGES.includes(eventId) && prefs.in_transit === true) return true;
  if (LEGACY_DELIVERED_STAGES.includes(eventId) && prefs.delivered === true) return true;
  return false;
}

export function cargoStageEventLabel(eventId: CargoStageEventId): string {
  return CARGO_NOTIFICATION_STAGES.find((s) => s.id === eventId)?.label ?? eventId;
}
