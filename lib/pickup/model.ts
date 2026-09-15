/** Shared contract for the isolated pickup dispatch module. No 1C writes. */
export type City = "moscow" | "kaliningrad";
export const cities: Record<City, string> = {
  moscow: "Москва",
  kaliningrad: "Калининград",
};
export type ResourceKind = "driver" | "vehicle" | "depot";
export type Resource = {
  id: string;
  kind: ResourceKind;
  city: City;
  name: string;
  active: boolean;
  version: number;
  data: Record<string, string>;
};
export type Contact = {
  name: string;
  phone: string;
  extension: string;
  purpose: string;
};
export type Basis = { number: string; date: string };
export type Place = {
  kind: string;
  count: number;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
};
export type JobData = {
  customerInn: string;
  customerName: string;
  senderInn: string;
  senderName: string;
  address: string;
  instructions: string;
  directionsUrl: string;
  contacts: Contact[];
  documents: Basis[];
  places: Place[];
  weightKg: number | null;
  volumeM3: number | null;
  windowFrom: string;
  windowTo: string;
  warehouseHours: string;
  serviceMinutes: number;
  /** Номер заявки в 1С / документы (не путать с номером перевозки). */
  zayavkaNumber: string;
  cargoNumber: string;
  priceRub: number | null;
  payment: string;
  mkadKm: number | null;
  requirements: string;
  note: string;
  latitude: number | null;
  longitude: number | null;
  /** Как в заявках: курьером / со склада HAULZ. */
  deliveryMode: "courier" | "point";
  addressKind: "pvz" | "custom";
  /** Ссылка ПВЗ из cache_pvz (если addressKind=pvz). */
  pvzRef: string;
  /** Куда по умолчанию сдаём груз после забора (склад HAULZ или другая точка). */
  defaultPlaceAddress: string;
  defaultPlaceLatitude: number | null;
  defaultPlaceLongitude: number | null;
  defaultPlaceMode: "courier" | "point";
  defaultPlaceKind: "pvz" | "custom";
  defaultPlacePvzRef: string;
};
export type JobStatus =
  | "pending"
  | "arrived"
  | "picked_up"
  | "partial"
  | "problem"
  | "deposited"
  | "resolved";
export const statusLabels: Record<JobStatus, string> = {
  pending: "Ожидает забора",
  arrived: "На точке",
  picked_up: "Груз забран",
  partial: "Частичный забор",
  problem: "Проблема",
  deposited: "Сдан на склад",
  resolved: "Закрыто диспетчером",
};
export type Job = {
  id: string;
  city: City;
  date: string;
  data: JobData;
  status: JobStatus;
  route_id: string | null;
  position: number;
  actual_places: number | null;
  note: string;
  version: number;
  resolution: string;
  photo_count?: number;
};
export type Route = {
  id: string;
  city: City;
  date: string;
  name: string;
  driver_id: string;
  vehicle_id: string;
  depot_id: string;
  status: "draft" | "published" | "started" | "completed";
  version: number;
  acknowledged_version: number;
  start_time: string;
  snapshot: { driver?: Resource; vehicle?: Resource; depot?: Resource };
};
export type Event = {
  id: string;
  route_id: string | null;
  job_id: string | null;
  actor: string;
  action: string;
  created_at: string;
  data: Record<string, unknown>;
};
export type Snapshot = {
  resources: Resource[];
  jobs: Job[];
  routes: Route[];
  events: Event[];
  dispatcher: boolean;
};
export class PickupError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new PickupError(message);
}
export function validCity(value: unknown): asserts value is City {
  requireValue(value === "moscow" || value === "kaliningrad", "Выберите город");
}
export function validDate(value: unknown): asserts value is string {
  requireValue(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Укажите корректную дату",
  );
}
export function validTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
export function textValue(value: unknown, max = 1000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
export function numberValue(
  value: unknown,
  label: string,
  max = 1000000,
): number | null {
  if (value === "" || value == null) return null;
  const n = Number(value);
  requireValue(
    Number.isFinite(n) && n >= 0 && n <= max,
    `Некорректное значение: ${label}`,
  );
  return n;
}
export function safeUrl(value: unknown): string {
  const text = textValue(value, 2000);
  if (!text) return "";
  try {
    const u = new URL(text);
    if (["https:", "http:"].includes(u.protocol) && !u.username && !u.password)
      return u.href;
  } catch {
    /* reject */
  }
  throw new PickupError("Ссылка должна начинаться с https:// или http://");
}
export function plannedPlaces(data: JobData): number {
  return data.places.reduce((sum, p) => sum + p.count, 0);
}
export function normalizeJob(raw: any): JobData {
  requireValue(raw && typeof raw === "object", "Заполните забор");
  requireValue(
    Array.isArray(raw.places) &&
      raw.places.length > 0 &&
      raw.places.length <= 30,
    "Добавьте грузовые места",
  );
  const places: Place[] = raw.places.map((p: any) => {
    const count = numberValue(p.count, "количество мест", 100000);
    requireValue(
      count && Number.isInteger(count),
      "Количество мест должно быть целым положительным числом",
    );
    return {
      kind: textValue(p.kind, 100),
      count,
      lengthCm: numberValue(p.lengthCm, "длина"),
      widthCm: numberValue(p.widthCm, "ширина"),
      heightCm: numberValue(p.heightCm, "высота"),
    };
  });
  const contacts: Contact[] = (Array.isArray(raw.contacts) ? raw.contacts : [])
    .slice(0, 10)
    .map((c: any) => ({
      name: textValue(c.name, 150),
      phone: textValue(c.phone, 60),
      extension: textValue(c.extension, 30),
      purpose: textValue(c.purpose, 100),
    }));
  requireValue(
    contacts.some((c) => c.phone.replace(/\D/g, "").length >= 7),
    "Добавьте телефон на точке",
  );
  requireValue(
    validTime(raw.windowFrom) &&
      validTime(raw.windowTo) &&
      raw.windowFrom < raw.windowTo,
    "Укажите окно забора в пределах дня: начало раньше окончания",
  );
  requireValue(textValue(raw.address), "Укажите адрес забора");
  const documents: Basis[] = (Array.isArray(raw.documents) ? raw.documents : [])
    .slice(0, 20)
    .map((d: any) => {
      const date = textValue(d.date, 10);
      if (date) validDate(date);
      return { number: textValue(d.number, 150), date };
    });
  const coordinate = (v: unknown, bound: number) => {
    if (v === "" || v == null) return null;
    const n = Number(v);
    requireValue(
      Number.isFinite(n) && Math.abs(n) <= bound,
      "Некорректные координаты",
    );
    return n;
  };
  const latitude = coordinate(raw.latitude, 90),
    longitude = coordinate(raw.longitude, 180);
  requireValue(
    (latitude === null) === (longitude === null),
    "Укажите обе координаты",
  );
  const deliveryMode =
    raw.deliveryMode === "point" ? "point" : "courier";
  const addressKind =
    raw.addressKind === "custom" ? "custom" : "pvz";
  const defaultPlaceLatitude = coordinate(raw.defaultPlaceLatitude, 90);
  const defaultPlaceLongitude = coordinate(raw.defaultPlaceLongitude, 180);
  requireValue(
    (defaultPlaceLatitude === null) === (defaultPlaceLongitude === null),
    "Укажите обе координаты места по умолчанию",
  );
  const defaultPlaceMode =
    raw.defaultPlaceMode === "courier" ? "courier" : "point";
  const defaultPlaceKind =
    raw.defaultPlaceKind === "custom" ? "custom" : "pvz";

  return {
    customerInn: textValue(raw.customerInn, 20),
    customerName: textValue(raw.customerName, 300),
    senderInn: textValue(raw.senderInn, 20),
    senderName: textValue(raw.senderName, 300),
    address: textValue(raw.address),
    instructions: textValue(raw.instructions, 3000),
    directionsUrl: safeUrl(raw.directionsUrl),
    contacts,
    documents,
    places,
    weightKg: numberValue(raw.weightKg, "вес"),
    volumeM3: numberValue(raw.volumeM3, "объём"),
    windowFrom: raw.windowFrom,
    windowTo: raw.windowTo,
    warehouseHours: textValue(raw.warehouseHours),
    serviceMinutes:
      numberValue(raw.serviceMinutes, "время погрузки", 600) ?? 20,
    zayavkaNumber: textValue(raw.zayavkaNumber, 100),
    cargoNumber: textValue(raw.cargoNumber, 100),
    priceRub: numberValue(raw.priceRub, "стоимость", 100000000),
    payment: textValue(raw.payment, 100),
    mkadKm: numberValue(raw.mkadKm, "км от МКАД", 10000),
    requirements: textValue(raw.requirements),
    note: textValue(raw.note, 3000),
    latitude,
    longitude,
    deliveryMode,
    addressKind,
    pvzRef: textValue(raw.pvzRef, 80),
    defaultPlaceAddress: textValue(raw.defaultPlaceAddress),
    defaultPlaceLatitude,
    defaultPlaceLongitude,
    defaultPlaceMode,
    defaultPlaceKind,
    defaultPlacePvzRef: textValue(raw.defaultPlacePvzRef, 80),
  };
}

/** Колонки pickup_jobs, дублирующие ключевые поля из data для поиска. */
export function pickupJobSearchColumns(data: JobData): {
  zayavka_number: string | null;
  cargo_number: string | null;
  customer_inn: string | null;
  sender_inn: string | null;
} {
  const trim = (v: string) => {
    const t = v.trim();
    return t || null;
  };
  return {
    zayavka_number: trim(data.zayavkaNumber),
    cargo_number: trim(data.cargoNumber),
    customer_inn: trim(data.customerInn),
    sender_inn: trim(data.senderInn),
  };
}
export function driverJob(job: Job): Job {
  const { priceRub, payment, mkadKm, ...data } = job.data;
  return { ...job, data: data as JobData };
}
export function routeWarnings(jobs: Job[], vehicle?: Resource): string[] {
  const warnings: string[] = [];
  if (jobs.some((j) => j.data.weightKg === null || j.data.volumeM3 === null))
    warnings.push(
      "Не у всех грузов указан вес и объём — вместимость проверена не полностью.",
    );
  const weight = jobs.reduce((sum, j) => sum + (j.data.weightKg ?? 0), 0);
  const volume = jobs.reduce((sum, j) => sum + (j.data.volumeM3 ?? 0), 0);
  if (vehicle?.data.capacityKg && weight > Number(vehicle.data.capacityKg))
    warnings.push("Превышена грузоподъёмность автомобиля.");
  if (vehicle?.data.capacityM3 && volume > Number(vehicle.data.capacityM3))
    warnings.push("Превышен объём автомобиля.");
  return warnings;
}
export function validateCompletion(
  job: Job,
  actual: unknown,
  note: unknown,
): number {
  const count = numberValue(actual, "фактическое количество мест", 100000);
  requireValue(
    count !== null && count > 0 && Number.isInteger(count),
    "Укажите фактически забранное количество мест; при нуле используйте «Проблема»",
  );
  if (count !== plannedPlaces(job.data))
    requireValue(
      textValue(note),
      "Объясните расхождение с плановым количеством мест",
    );
  return count;
}
