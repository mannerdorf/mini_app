import type { Pool } from "pg";
import {
  CARGO_NOTIFICATION_STAGES,
  cargoStageEventLabel,
  type CargoStageEventId,
} from "./notificationCargoEvents.js";
import { PUSH_NOTIFICATION_EVENTS } from "./notificationEmailPrefs.js";
import {
  formatTelegramMessage,
  pickBillNumber,
  type CargoEvent,
} from "./notificationPoll.js";
import { extractCargoLastMileMeta } from "./cargoLastMileMeta.js";
import { formatInvoiceNumberDisplay } from "./weeklySummaryInvoiceTable.js";
import { cargoPlannedDeliveryDateFromItem } from "./cargoDateFilter.js";
import { formatPushPlanDateDisplay } from "./formatPushPlanDate.js";

export { PUSH_NOTIFICATION_EVENTS };

export type PushNotificationTemplateEventId = (typeof PUSH_NOTIFICATION_EVENTS)[number];

export type PushNotificationTemplateRow = {
  eventId: PushNotificationTemplateEventId;
  label: string;
  titleTemplate: string;
  bodyTemplate: string;
  enabled: boolean;
  isDefault: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type PushNotificationTemplateMap = Map<
  PushNotificationTemplateEventId,
  Omit<PushNotificationTemplateRow, "eventId" | "label" | "isDefault">
>;

export const PUSH_TEMPLATE_VARIABLES = [
  {
    key: "cargo_number",
    hint: "Номер перевозки из 1С (поле Number), как в карточке груза",
  },
  {
    key: "number",
    hint: "То же, что {cargo_number} — алиас для совместимости со старыми шаблонами",
  },
  {
    key: "stage_label",
    hint: "Название события или этапа: «Доставлена», «Отправлена», «Создан счёт» и т.п.",
  },
  {
    key: "mest",
    hint: "Количество мест (из 1С, поле Mest)",
  },
  {
    key: "w",
    hint: "Фактический вес груза, кг (из 1С, поле W)",
  },
  {
    key: "pw",
    hint: "Платный (расчётный) вес, кг (из 1С, поле PW)",
  },
  {
    key: "volume",
    hint: "Объём груза, м³ (из 1С, поле Value)",
  },
  {
    key: "sender",
    hint: "Отправитель (из 1С, поле Sender)",
  },
  {
    key: "receiver",
    hint: "Получатель (из 1С, поле Receiver или Poluchatel)",
  },
  {
    key: "bill_sum",
    hint: "Сумма счёта в рублях с форматированием (из 1С: SumDoc, SumBill и др.)",
  },
  {
    key: "bill_number",
    hint: "Номер счёта без префикса 0000- (из 1С: BillNum, NumberBill, BillNumber и др.)",
  },
  {
    key: "auto_reg",
    hint: "Гос. номер автомобиля последней мили (из 1С: LMAutoReg, без региона после «/»)",
  },
  {
    key: "auto_type",
    hint: "Марка автомобиля (из 1С: LMAutoType или AutoType)",
  },
  {
    key: "driver",
    hint: "Экспедитор / водитель последней мили (из 1С: LMDriver или Driver)",
  },
  {
    key: "driver_tel",
    hint: "Телефон экспедитора (из 1С: LMDriverTel или DriverTel)",
  },
  {
    key: "plan_date",
    hint: "Плановая дата доставки / прибытия на терминал (ДД.ММ.ГГГГ)",
  },
  {
    key: "version_name",
    hint: "Номер версии приложения (для шаблона «Новая версия»)",
  },
] as const;

function eventLabel(eventId: PushNotificationTemplateEventId): string {
  if (eventId === "bill_created") return "Создан счёт";
  if (eventId === "bill_paid") return "Счёт оплачен";
  if (eventId === "daily_summary") return "Ежедневная сводка";
  if (eventId === "planned_delivery_date") return "Плановая дата доставки";
  if (eventId === "app_update") return "Новая версия приложения";
  const stage = CARGO_NOTIFICATION_STAGES.find((s) => s.id === eventId);
  return stage?.label ?? eventId;
}

function defaultBodyTemplate(eventId: PushNotificationTemplateEventId): string {
  if (eventId === "bill_created") {
    return "Вам выставлен счет № {bill_number} по перевозке № {cargo_number} на сумму {bill_sum} ₽.";
  }
  if (eventId === "bill_paid") {
    return "Счет № {bill_number} по перевозке № {cargo_number} оплачен.";
  }
  if (eventId === "daily_summary") {
    return "Доброе утро! Ежедневная сводка HAULZ на 10:00.";
  }
  if (eventId === "planned_delivery_date") {
    return "Перевозка № {cargo_number} плановая дата доставки {plan_date}";
  }
  if (eventId === "app_update") {
    return "Вышла новая версия — обновите приложение";
  }
  return "{stage_label}. № {cargo_number}";
}

function defaultTitleTemplate(_eventId: PushNotificationTemplateEventId): string {
  return "HAULZ";
}

export function defaultPushNotificationTemplates(): PushNotificationTemplateRow[] {
  return PUSH_NOTIFICATION_EVENTS.map((eventId) => ({
    eventId,
    label: eventLabel(eventId),
    titleTemplate: defaultTitleTemplate(eventId),
    bodyTemplate: defaultBodyTemplate(eventId),
    enabled: true,
    isDefault: true,
    updatedAt: null,
    updatedBy: null,
  }));
}

function pickFirst(item: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const v = item[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

export function buildPushTemplateContext(
  event: CargoEvent | PushNotificationTemplateEventId,
  cargoNumber: string,
  item?: Record<string, unknown> | null,
): Record<string, string> {
  const anyItem = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
  const n = String(cargoNumber || "").trim();
  const billSumRaw = pickFirst(anyItem, [
    "SumDoc",
    "SumBill",
    "AmountBill",
    "СуммаДокумента",
    "Sum",
    "Amount",
    "Сумма",
  ]);
  const billSumNum =
    typeof billSumRaw === "number" ? billSumRaw : parseFloat(String(billSumRaw ?? "").replace(",", "."));
  const billSum = Number.isFinite(billSumNum)
    ? new Intl.NumberFormat("ru-RU").format(Math.round(billSumNum))
    : "—";
  const stageLabel = CARGO_NOTIFICATION_STAGES.some((s) => s.id === event)
    ? cargoStageEventLabel(event as CargoStageEventId)
    : eventLabel(event as PushNotificationTemplateEventId);
  const lastMile = extractCargoLastMileMeta(anyItem);
  const billNumberRaw = pickBillNumber(anyItem);
  const billNumber = billNumberRaw ? formatInvoiceNumberDisplay(billNumberRaw) : "—";
  const planRaw =
    pickFirst(anyItem, [
      "DateArrivalPlan",
      "DateDeliveryPlan",
      "DeliveryDatePlan",
      "PlanDate",
      "DatePlan",
      "PlannedDeliveryDate",
      "plan_date",
    ]) ?? cargoPlannedDeliveryDateFromItem(anyItem);
  const planDate = formatPushPlanDateDisplay(planRaw);
  const versionName =
    String(anyItem.version_name ?? anyItem.versionName ?? anyItem.VersionName ?? "").trim() || "—";

  return {
    cargo_number: n,
    number: n,
    stage_label: stageLabel,
    mest: String(anyItem.Mest ?? "—"),
    w: String(anyItem.W ?? "—"),
    pw: String(anyItem.PW ?? "—"),
    volume: String(anyItem.Value ?? "—"),
    sender: String(anyItem.Sender ?? "—").trim() || "—",
    receiver: String(anyItem.Receiver ?? anyItem.Poluchatel ?? "—").trim() || "—",
    bill_sum: billSum,
    bill_number: billNumber,
    auto_reg: lastMile.autoReg || "—",
    auto_type: lastMile.autoType || "—",
    driver: lastMile.driver || "—",
    driver_tel: lastMile.driverTel || "—",
    plan_date: planDate,
    version_name: versionName,
  };
}

export function renderPushTemplateString(
  template: string,
  context: Record<string, string>,
): string {
  return String(template ?? "").replace(/\{([a-z_]+)\}/gi, (full, key: string) => {
    const normalized = key.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(context, normalized)) {
      return context[normalized] ?? "";
    }
    return full;
  });
}

export function formatPushNotificationMessage(
  event: CargoEvent | PushNotificationTemplateEventId,
  cargoNumber: string,
  item?: Record<string, unknown> | null,
  templates?: PushNotificationTemplateMap | null,
): { title: string; body: string; usedCustomTemplate: boolean } {
  const ctx = buildPushTemplateContext(event, cargoNumber, item);
  const eventId = event as PushNotificationTemplateEventId;
  const custom = templates?.get(eventId);

  if (custom && custom.enabled === false) {
    return { title: "HAULZ", body: "", usedCustomTemplate: true };
  }

  if (custom && custom.enabled !== false && custom.bodyTemplate.trim()) {
    return {
      title: renderPushTemplateString(custom.titleTemplate || "HAULZ", ctx).trim() || "HAULZ",
      body: renderPushTemplateString(custom.bodyTemplate, ctx).trim(),
      usedCustomTemplate: true,
    };
  }

  if ((PUSH_NOTIFICATION_EVENTS as readonly string[]).includes(eventId)) {
    return {
      title: renderPushTemplateString(defaultTitleTemplate(eventId), ctx).trim() || "HAULZ",
      body: renderPushTemplateString(defaultBodyTemplate(eventId), ctx).trim(),
      usedCustomTemplate: false,
    };
  }

  return {
    title: "HAULZ",
    body: formatTelegramMessage(event as CargoEvent, cargoNumber, item as Parameters<typeof formatTelegramMessage>[2]),
    usedCustomTemplate: false,
  };
}

export const PUSH_TEMPLATE_SAMPLE_ITEM: Record<string, unknown> = {
  Number: "000141572",
  BillNum: "000001529",
  Mest: 251,
  W: 1473,
  PW: 1500,
  Value: 14.951,
  Sender: "ООО Автопитер",
  Receiver: "Гончаров Р.О. ИП",
  SumDoc: 125000,
  LMAutoReg: "У706АР/39",
  LMAutoType: "Мерседес",
  LMDriver: "Ругалев Иван Федорович",
  LMDriverTel: "+79953889445",
  DateArrivalPlan: "2026-08-28",
  version_name: "1.3.8",
};

export async function ensurePushNotificationTemplatesTable(pool: {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}): Promise<void> {
  await pool.query(`
    create table if not exists push_notification_templates (
      event_id text primary key,
      title_template text not null default 'HAULZ',
      body_template text not null default '',
      enabled boolean not null default true,
      updated_at timestamptz not null default now(),
      updated_by text
    )
  `);
}

export async function loadPushNotificationTemplates(pool: Pool): Promise<PushNotificationTemplateMap> {
  const map: PushNotificationTemplateMap = new Map();
  for (const eventId of PUSH_NOTIFICATION_EVENTS) {
    map.set(eventId, {
      titleTemplate: defaultTitleTemplate(eventId),
      bodyTemplate: defaultBodyTemplate(eventId),
      enabled: true,
      updatedAt: null,
      updatedBy: null,
    });
  }

  /** Старые дефолты без {bill_number} — подменяем на актуальные, если админ не кастомизировал иначе. */
  const legacyDefaultBodies: Partial<Record<PushNotificationTemplateEventId, string>> = {
    bill_created: "Вам выставлен счет по перевозке № {cargo_number} на сумму {bill_sum} ₽.",
    bill_paid: "Счет по перевозке № {cargo_number} оплачен.",
  };

  try {
    await ensurePushNotificationTemplatesTable(pool);
    const { rows } = await pool.query<{
      event_id: string;
      title_template: string;
      body_template: string;
      enabled: boolean;
      updated_at: Date | string | null;
      updated_by: string | null;
    }>(`SELECT event_id, title_template, body_template, enabled, updated_at, updated_by FROM push_notification_templates`);

    for (const row of rows) {
      const eventId = String(row.event_id || "").trim() as PushNotificationTemplateEventId;
      if (!PUSH_NOTIFICATION_EVENTS.includes(eventId)) continue;
      let bodyTemplate = String(row.body_template || "");
      const legacy = legacyDefaultBodies[eventId];
      if (legacy && bodyTemplate.trim() === legacy) {
        bodyTemplate = defaultBodyTemplate(eventId);
      }
      map.set(eventId, {
        titleTemplate: String(row.title_template || "HAULZ").trim() || "HAULZ",
        bodyTemplate,
        enabled: row.enabled !== false,
        updatedAt:
          row.updated_at instanceof Date
            ? row.updated_at.toISOString()
            : row.updated_at
              ? String(row.updated_at)
              : null,
        updatedBy: row.updated_by ? String(row.updated_by) : null,
      });
    }
  } catch {
    // table may not exist yet — defaults only
  }

  return map;
}

export async function listPushNotificationTemplates(pool: Pool): Promise<PushNotificationTemplateRow[]> {
  try {
    await ensurePushNotificationTemplatesTable(pool);
  } catch {
    // best-effort: таблица может быть создана миграцией или ensure на первом GET
  }

  const defaults = defaultPushNotificationTemplates();
  const fromDb = await loadPushNotificationTemplates(pool);
  return defaults.map((row) => {
    const saved = fromDb.get(row.eventId);
    if (!saved?.updatedAt && !saved?.updatedBy && saved?.bodyTemplate === defaultBodyTemplate(row.eventId)) {
      return row;
    }
    if (!saved) return row;
    const isDefault =
      saved.titleTemplate === defaultTitleTemplate(row.eventId) &&
      saved.bodyTemplate === defaultBodyTemplate(row.eventId) &&
      saved.enabled === true &&
      !saved.updatedAt;
    return {
      eventId: row.eventId,
      label: row.label,
      titleTemplate: saved.titleTemplate,
      bodyTemplate: saved.bodyTemplate,
      enabled: saved.enabled,
      isDefault,
      updatedAt: saved.updatedAt,
      updatedBy: saved.updatedBy,
    };
  });
}

export type PushTemplateSaveInput = {
  eventId: PushNotificationTemplateEventId;
  titleTemplate?: string;
  bodyTemplate?: string;
  enabled?: boolean;
};

export async function savePushNotificationTemplates(
  pool: Pool,
  templates: PushTemplateSaveInput[],
  updatedBy?: string | null,
): Promise<void> {
  await ensurePushNotificationTemplatesTable(pool);
  const editor = String(updatedBy || "admin").trim() || "admin";

  for (const row of templates) {
    const eventId = String(row.eventId || "").trim() as PushNotificationTemplateEventId;
    if (!PUSH_NOTIFICATION_EVENTS.includes(eventId)) continue;
    const titleTemplate = String(row.titleTemplate ?? defaultTitleTemplate(eventId)).trim() || "HAULZ";
    const bodyTemplate = String(row.bodyTemplate ?? defaultBodyTemplate(eventId));
    const enabled = row.enabled !== false;

    await pool.query(
      `INSERT INTO push_notification_templates (event_id, title_template, body_template, enabled, updated_at, updated_by)
       VALUES ($1, $2, $3, $4, now(), $5)
       ON CONFLICT (event_id) DO UPDATE SET
         title_template = EXCLUDED.title_template,
         body_template = EXCLUDED.body_template,
         enabled = EXCLUDED.enabled,
         updated_at = now(),
         updated_by = EXCLUDED.updated_by`,
      [eventId, titleTemplate, bodyTemplate, enabled, editor],
    );
  }
}
