export type PickupSiteChecklistId =
  | "entry"
  | "landmark"
  | "pass"
  | "poa"
  | "call";

export type PickupSiteChecklistItem = {
  id: PickupSiteChecklistId;
  label: string;
  enabled: boolean;
};

export type PickupSiteInstructionsState = {
  order: PickupSiteChecklistId[];
  items: PickupSiteChecklistItem[];
  note: string;
};

const META_PREFIX = "\n#pk-inst:";

export const PICKUP_WAREHOUSE_HOURS_PRESETS: { value: string; label: string }[] = [
  { value: "Пн–Пт 10:00–18:00", label: "Пн–Пт 10:00–18:00" },
  { value: "Пн–Пт 9:00–17:00", label: "Пн–Пт 9:00–17:00" },
  { value: "Пн–Сб 10:00–16:00", label: "Пн–Сб 10:00–16:00" },
  { value: "Ежедневно 10:00–20:00", label: "Ежедневно 10:00–20:00" },
  { value: "Круглосуточно по согласованию", label: "Круглосуточно по согласованию" },
  { value: "Только по предварительной записи", label: "Только по предварительной записи" },
];

const DEFAULT_ORDER: PickupSiteChecklistId[] = [
  "entry",
  "landmark",
  "pass",
  "poa",
  "call",
];

const LABELS: Record<PickupSiteChecklistId, string> = {
  entry: "Въезд",
  landmark: "Ориентир",
  pass: "Пропуск",
  poa: "Доверенность",
  call: "Предварительный звонок",
};

export function createDefaultPickupSiteInstructions(): PickupSiteInstructionsState {
  return {
    order: [...DEFAULT_ORDER],
    items: DEFAULT_ORDER.map((id) => ({ id, label: LABELS[id], enabled: false })),
    note: "",
  };
}

type StoredMeta = {
  v: 1;
  order: PickupSiteChecklistId[];
  on: Partial<Record<PickupSiteChecklistId, boolean>>;
  note: string;
};

function stripMeta(raw: string): { body: string; meta: StoredMeta | null } {
  const idx = raw.lastIndexOf(META_PREFIX);
  if (idx < 0) return { body: raw, meta: null };
  const body = raw.slice(0, idx).trimEnd();
  const json = raw.slice(idx + META_PREFIX.length).trim();
  try {
    const meta = JSON.parse(json) as StoredMeta;
    if (meta?.v !== 1 || !Array.isArray(meta.order)) return { body: raw.trim(), meta: null };
    return { body, meta };
  } catch {
    return { body: raw.trim(), meta: null };
  }
}

export function parsePickupSiteInstructions(raw: string): PickupSiteInstructionsState {
  const base = createDefaultPickupSiteInstructions();
  const trimmed = raw.trim();
  if (!trimmed) return base;

  const { body, meta } = stripMeta(trimmed);
  if (meta) {
    const on = meta.on ?? {};
    const order = meta.order.filter((id): id is PickupSiteChecklistId => id in LABELS);
    const mergedOrder = [
      ...order,
      ...DEFAULT_ORDER.filter((id) => !order.includes(id)),
    ];
    return {
      order: mergedOrder,
      items: mergedOrder.map((id) => ({
        id,
        label: LABELS[id],
        enabled: Boolean(on[id]),
      })),
      note: meta.note ?? "",
    };
  }

  return { ...base, note: body };
}

export function formatPickupSiteInstructions(state: PickupSiteInstructionsState): string {
  const byId = new Map(state.items.map((i) => [i.id, i]));
  const enabledLines = state.order
    .map((id) => byId.get(id))
    .filter((i): i is PickupSiteChecklistItem => !!i && i.enabled)
    .map((i) => `• ${i.label}`);

  const note = state.note.trim();
  const display = [enabledLines.join("\n"), note].filter(Boolean).join("\n\n");

  const meta: StoredMeta = {
    v: 1,
    order: state.order,
    on: Object.fromEntries(state.items.map((i) => [i.id, i.enabled])),
    note,
  };

  if (!display && !state.items.some((i) => i.enabled)) return note ? note : "";

  const metaLine = `${META_PREFIX}${JSON.stringify(meta)}`;
  return `${display}${metaLine}`;
}

/** Текст для водителя / карточки без служебного хвоста. */
export function pickupSiteInstructionsDisplay(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const { body, meta } = stripMeta(trimmed);
  if (meta) {
    const enabled = formatPickupSiteInstructions({
      order: meta.order,
      items: meta.order.map((id) => ({
        id,
        label: LABELS[id],
        enabled: Boolean(meta.on[id]),
      })),
      note: meta.note ?? "",
    });
    const { body: displayBody } = stripMeta(enabled);
    return displayBody;
  }
  return body;
}

export function isPresetWarehouseHours(value: string): boolean {
  return PICKUP_WAREHOUSE_HOURS_PRESETS.some((p) => p.value === value);
}
