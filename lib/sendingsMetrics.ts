type SendingMetricRow = {
  customerInn: string;
  sendingNumber: string;
  cargoNumbers: string[];
  sendStartAt: Date | null;
  firstReadyAt: Date | null;
  inTransitHours: number | null;
};

export type CargoSendingAssignmentRow = {
  customerInn: string;
  sendingNumber: string;
  cargoNumber: string;
  sendingDate: string | null;
  vehicleNormalized: string;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeInn(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").trim();
}

function normalizeCargoNumber(value: unknown): string {
  const s = String(value ?? "").replace(/^0000-/, "").trim().replace(/^0+/, "") || "";
  return s;
}

/** Нормализация госномера / контейнера — синхрон с documentsPipeline.normalizeTransportName. */
export function normalizeVehicleText(value: unknown): string {
  const s = String(value ?? "").toUpperCase().trim();
  if (!s) return "";
  const normalizedSpaces = s.replace(/\s+/g, " ");
  const container = normalizedSpaces.match(/([A-ZА-Я]{4})[\s\-]*([0-9]{7})$/u);
  if (container) return `${container[1]} ${container[2]}`;
  const vehicle = normalizedSpaces.match(/([A-ZА-Я][0-9]{3}[A-ZА-Я]{2})(\s*\/?\s*([0-9]{2,3}))?$/u);
  if (vehicle) {
    const base = vehicle[1];
    const region = vehicle[3] ?? "";
    if (!region) return base;
    return `${base}${region}`;
  }
  const looseVehicle = normalizedSpaces.match(/([A-ZА-Я])[\s\-]*([0-9]{3})[\s\-]*([A-ZА-Я]{2})(?:[\s\-]*\/?[\s\-]*([0-9]{2,3}))?$/u);
  if (looseVehicle) {
    const base = `${looseVehicle[1]}${looseVehicle[2]}${looseVehicle[3]}`;
    const region = looseVehicle[4] ?? "";
    if (!region) return base;
    return `${base}${region}`;
  }
  return normalizedSpaces
    .replace(/\bнаименование\s*тс\b[:\-]?\s*/giu, "")
    .replace(/\bконтейнер\b[:\-]?\s*/giu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeDateOnly(raw: unknown): string | null {
  const parsed = parseDateTimeValue(raw);
  if (!parsed) return null;
  return parsed.toISOString().split("T")[0];
}

/** Дата рейса отправки — как колонка «Дата» в отправках. */
function pickSendingDisplayDate(item: any): string | null {
  return normalizeDateOnly(
    item?.Дата ??
      item?.Date ??
      item?.date ??
      item?.DateOtpr ??
      item?.DateSend ??
      item?.DateShipment ??
      item?.ShipmentDate ??
      item?.DateDoc ??
      item?.ДатаОтправки ??
      item?.DatePrih ??
      item?.DateVr,
  );
}

function pickSendingVehicle(item: any): string {
  return normalizeVehicleText(
    item?.АвтомобильCMRНаименование ??
      item?.AutoReg ??
      item?.autoReg ??
      item?.AutoType ??
      "",
  );
}

function collectValuesByKeyRegex(
  node: unknown,
  keyPattern: RegExp,
  maxDepth = 4,
  currentDepth = 0,
  out: unknown[] = []
): unknown[] {
  if (node == null || currentDepth > maxDepth) return out;
  if (Array.isArray(node)) {
    node.forEach((item) => collectValuesByKeyRegex(item, keyPattern, maxDepth, currentDepth + 1, out));
    return out;
  }
  if (typeof node !== "object") return out;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (keyPattern.test(key)) out.push(value);
    collectValuesByKeyRegex(value, keyPattern, maxDepth, currentDepth + 1, out);
  }
  return out;
}

function dateToIso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function parseDateTimeValue(raw: unknown): Date | null {
  const source = String(raw ?? "").trim();
  if (!source) return null;

  const iso = source.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2})(?::(\d{2}))?(?::(\d{2}))?)?/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]) - 1;
    const day = Number(iso[3]);
    const hours = Number(iso[4] ?? 0);
    const minutes = Number(iso[5] ?? 0);
    const seconds = Number(iso[6] ?? 0);
    const date = new Date(year, month, day, hours, minutes, seconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const ru = source.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[ ,T](\d{2})(?::(\d{2}))?(?::(\d{2}))?)?/);
  if (ru) {
    const day = Number(ru[1]);
    const month = Number(ru[2]) - 1;
    const year = Number(ru[3]);
    const hours = Number(ru[4] ?? 0);
    const minutes = Number(ru[5] ?? 0);
    const seconds = Number(ru[6] ?? 0);
    const date = new Date(year, month, day, hours, minutes, seconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const fallback = new Date(source);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function minDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

function calcTransitHours(sendStartAt: Date | null, firstReadyAt: Date | null): number | null {
  if (!sendStartAt || !firstReadyAt) return null;
  const diffMs = firstReadyAt.getTime() - sendStartAt.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return null;
  return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
}

function pickSendingInn(item: any): string {
  const direct = normalizeInn(
    item?.CustomerINN ??
      item?.customerINN ??
      item?.CustomerInn ??
      item?.customerInn ??
      item?.SenderINN ??
      item?.senderINN ??
      item?.InnSender ??
      item?.INNSender ??
      item?.SenderInn ??
      item?.senderInn ??
      item?.ИННЗаказчика ??
      item?.ИННОтправителя ??
      item?.INN ??
      item?.Inn ??
      item?.inn
  );
  if (direct) return direct;
  // Fallback: в некоторых ответах Getotpravki ИНН лежит в "грузовых" полях.
  const cargoInn = pickCargoInn(item);
  if (cargoInn) return cargoInn;
  // Дополнительный fallback: ищем ИНН в любых вложенных полях объекта отправки.
  const nestedCandidates = collectValuesByKeyRegex(item, /(inn|инн)/i, 5);
  for (const candidate of nestedCandidates) {
    const inn = normalizeInn(candidate);
    if (inn && (inn.length === 10 || inn.length === 12)) return inn;
  }
  return "";
}

function pickCargoInn(item: any): string {
  return normalizeInn(
    item?.CustomerINN ??
      item?.customerINN ??
      item?.CustomerInn ??
      item?.customerInn ??
      item?.ReceiverINN ??
      item?.receiverINN ??
      item?.ConsigneeINN ??
      item?.consigneeINN ??
      item?.SenderINN ??
      item?.senderINN ??
      item?.InnSender ??
      item?.INNSender ??
      item?.SenderInn ??
      item?.senderInn ??
      item?.ИННЗаказчика ??
      item?.ИННПолучателя ??
      item?.ИННОтправителя ??
      item?.INN ??
      item?.Inn ??
      item?.inn
  );
}

function pickSendingNumber(item: any): string {
  const direct = normalizeText(
    item?.SendingNumber ??
      item?.sendingNumber ??
      item?.NumberSend ??
      item?.NumberSending ??
      item?.НомерОтправки ??
      item?.НомерОтправления ??
      item?.НомерОтпр ??
      item?.Номер ??
      item?.Number ??
      item?.number ??
      item?.ИДОтправления ??
      item?.ID ??
      item?.Id ??
      item?.id ??
      item?.Ref_Key ??
      item?.RefKey ??
      item?.GUID ??
      item?.Guid ??
      item?.guid
  );
  if (direct) return direct;
  const nestedCandidates = collectValuesByKeyRegex(item, /(sending|отправ|number|номер|ref[_\s-]?key|guid|\bid\b)/i, 5);
  for (const candidate of nestedCandidates) {
    const value = normalizeText(candidate);
    if (!value) continue;
    // Отсекаем слишком короткие/пустые значения, чтобы не брать шум.
    if (value.length >= 4) return value;
  }
  return "";
}

function pickSendingStartDate(item: any): Date | null {
  return parseDateTimeValue(
    item?.DateOtpr ??
      item?.DateSend ??
      item?.DateShipment ??
      item?.ShipmentDate ??
      item?.ДатаОтправки ??
      item?.ДатаОтгрузки ??
      item?.DateDoc ??
      item?.Date ??
      item?.date ??
      item?.DateVr ??
      item?.DatePrih ??
      item?.ДатаПогрузки ??
      item?.ДатаНачала ??
      item?.Дата
  );
}

function statusKey(raw: unknown): "ready" | "delivered" | "other" {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "other";
  if (s.includes("достав")) return "delivered";
  if ((s.includes("готов") && s.includes("выдач")) || s.includes("ready")) return "ready";
  return "other";
}

function getSendingCargoNumbers(row: any): string[] {
  const numbers = new Set<string>();
  const add = (value: unknown) => {
    const normalized = normalizeCargoNumber(value);
    if (normalized) numbers.add(normalized);
  };

  add(row?.НомерПеревозки);
  add(row?.CargoNumber);
  add(row?.NumberPerevozki);
  add(row?.Перевозка);
  add(row?.ИДОтправления);

  const rawParcels = row?.Посылки ?? row?.Parcels ?? row?.parcels ?? row?.Packages ?? row?.packages;
  const parcels = Array.isArray(rawParcels)
    ? rawParcels
    : rawParcels && typeof rawParcels === "object"
      ? Object.values(rawParcels as Record<string, any>)
      : [];
  parcels.forEach((parcel: any) => {
    add(parcel?.ИДОтправления);
    add(parcel?.Перевозка);
    add(parcel?.НомерПеревозки);
    add(parcel?.CargoNumber);
    add(parcel?.NumberPerevozki);
    const goodsRaw = parcel?.Товары;
    const goods = Array.isArray(goodsRaw)
      ? (goodsRaw[0] ?? {})
      : goodsRaw && typeof goodsRaw === "object"
        ? goodsRaw
        : null;
    if (goods && typeof goods === "object") {
      add((goods as any)?.ИДОтправления);
      add((goods as any)?.Перевозка);
      add((goods as any)?.НомерПеревозки);
      add((goods as any)?.CargoNumber);
      add((goods as any)?.NumberPerevozki);
    }
  });
  // Глубокий fallback для нестандартных структур Getotpravki.
  const deepCandidates = collectValuesByKeyRegex(row, /(номерперевоз|cargo(number)?|numberperevozki|идотправлен)/i, 5);
  deepCandidates.forEach((value) => add(value));
  return Array.from(numbers);
}

function buildCargoStopDateByNumber(perevozkiItems: any[]): Map<string, Date> {
  const map = new Map<string, Date>();
  (perevozkiItems || []).forEach((cargo: any) => {
    const raw = normalizeCargoNumber(cargo?.Number ?? cargo?.number ?? cargo?.НомерПеревозки ?? cargo?.CargoNumber ?? cargo?.NumberPerevozki);
    if (!raw) return;
    const key = statusKey(cargo?.State ?? cargo?.state ?? cargo?.Статус ?? cargo?.Status ?? cargo?.StatusName);
    if (key !== "ready" && key !== "delivered") return;
    const stopDate = parseDateTimeValue(
      cargo?.StatusDate ??
        cargo?.DateStatus ??
        cargo?.DateState ??
        cargo?.UpdatedAt ??
        cargo?.updated_at ??
        cargo?.ДатаСтатуса ??
        cargo?.ДатаИзменения ??
        cargo?.DateVr ??
        cargo?.DatePrih ??
        cargo?.DateDelivery ??
        cargo?.DeliveryDate ??
        cargo?.ДатаДоставки
    );
    if (!stopDate) return;
    const prev = map.get(raw);
    if (!prev || stopDate.getTime() < prev.getTime()) {
      map.set(raw, stopDate);
    }
  });
  return map;
}

function buildCargoInnByNumber(perevozkiItems: any[]): Map<string, string> {
  const map = new Map<string, string>();
  (perevozkiItems || []).forEach((cargo: any) => {
    const raw = normalizeCargoNumber(cargo?.Number ?? cargo?.number ?? cargo?.НомерПеревозки ?? cargo?.CargoNumber ?? cargo?.NumberPerevozki);
    if (!raw) return;
    const inn = pickCargoInn(cargo);
    if (!inn) return;
    if (!map.has(raw)) map.set(raw, inn);
  });
  return map;
}

export function extractArrayFromAnyPayload(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  const known = [
    obj.items,
    obj.Items,
    obj.zayavki,
    obj.Zayavki,
    obj.otpravki,
    obj.Otpravki,
    obj.data,
    obj.Data,
    obj.result,
    obj.Result,
    obj.rows,
    obj.Rows,
  ];
  for (const candidate of known) {
    if (Array.isArray(candidate)) return candidate;
  }
  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

export function buildSendingsMetrics(sendingsItems: any[], perevozkiItems: any[]): SendingMetricRow[] {
  const stopDateByCargo = buildCargoStopDateByNumber(perevozkiItems || []);
  const cargoInnByNumber = buildCargoInnByNumber(perevozkiItems || []);
  const byKey = new Map<string, SendingMetricRow>();

  (sendingsItems || []).forEach((row: any) => {
    let customerInn = pickSendingInn(row);
    const cargoNumbers = getSendingCargoNumbers(row);
    let sendingNumber = pickSendingNumber(row);
    // Исторические выгрузки иногда не содержат номер отправки, но содержат номера перевозок.
    // В таком случае используем первый номер перевозки как стабильный fallback-ключ.
    if (!sendingNumber && cargoNumbers.length > 0) {
      sendingNumber = cargoNumbers[0];
    }
    if (!customerInn && cargoNumbers.length > 0) {
      for (const cargoNumber of cargoNumbers) {
        const inferredInn = cargoInnByNumber.get(cargoNumber);
        if (inferredInn) {
          customerInn = inferredInn;
          break;
        }
      }
    }
    if (!customerInn || !sendingNumber) return;

    const sendStartAt = pickSendingStartDate(row);

    let firstReadyAt: Date | null = null;
    cargoNumbers.forEach((cargoNumber) => {
      const stop = stopDateByCargo.get(cargoNumber);
      firstReadyAt = minDate(firstReadyAt, stop ?? null);
    });

    if (!firstReadyAt) {
      const rowStatus = statusKey(row?.State ?? row?.state ?? row?.Статус ?? row?.Status ?? row?.StatusName);
      if (rowStatus === "ready" || rowStatus === "delivered") {
        firstReadyAt = parseDateTimeValue(
          row?.StatusDate ??
            row?.DateStatus ??
            row?.DateState ??
            row?.UpdatedAt ??
            row?.updated_at ??
            row?.ДатаСтатуса ??
            row?.ДатаИзменения
        );
      }
    }

    const key = `${customerInn}|${sendingNumber}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, {
        customerInn,
        sendingNumber,
        cargoNumbers,
        sendStartAt,
        firstReadyAt,
        inTransitHours: calcTransitHours(sendStartAt, firstReadyAt),
      });
      return;
    }

    const mergedCargoNumbers = Array.from(new Set([...prev.cargoNumbers, ...cargoNumbers]));
    const mergedStart = minDate(prev.sendStartAt, sendStartAt);
    const mergedReady = minDate(prev.firstReadyAt, firstReadyAt);
    byKey.set(key, {
      customerInn,
      sendingNumber,
      cargoNumbers: mergedCargoNumbers,
      sendStartAt: mergedStart,
      firstReadyAt: mergedReady,
      inTransitHours: calcTransitHours(mergedStart, mergedReady),
    });
  });

  return Array.from(byKey.values());
}

/** Привязки перевозка → отправка (рейс) → ТС из Getotpravki. */
export function buildCargoSendingAssignments(sendingsItems: any[]): CargoSendingAssignmentRow[] {
  const rows: CargoSendingAssignmentRow[] = [];
  const cargoInnByNumber = new Map<string, string>();

  (sendingsItems || []).forEach((row: any) => {
    let customerInn = pickSendingInn(row);
    const cargoNumbers = getSendingCargoNumbers(row);
    let sendingNumber = pickSendingNumber(row);
    if (!sendingNumber && cargoNumbers.length > 0) {
      sendingNumber = cargoNumbers[0];
    }
    if (!customerInn && cargoNumbers.length > 0) {
      for (const cargoNumber of cargoNumbers) {
        const inferred = cargoInnByNumber.get(cargoNumber);
        if (inferred) {
          customerInn = inferred;
          break;
        }
      }
    }
    if (!customerInn || !sendingNumber || cargoNumbers.length === 0) return;

    const sendingDate = pickSendingDisplayDate(row);
    const vehicleNormalized = pickSendingVehicle(row);
    if (!vehicleNormalized) return;

    cargoNumbers.forEach((cargoNumber) => {
      if (!cargoInnByNumber.has(cargoNumber) && customerInn) {
        cargoInnByNumber.set(cargoNumber, customerInn);
      }
      rows.push({
        customerInn,
        sendingNumber,
        cargoNumber,
        sendingDate,
        vehicleNormalized,
      });
    });
  });

  return rows;
}

export async function upsertCargoSendingAssignments(
  pool: { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> },
  rows: CargoSendingAssignmentRow[],
) {
  if (!rows.length) return { updated: 0 };

  const payload = rows.map((row) => ({
    customer_inn: row.customerInn,
    sending_number: row.sendingNumber,
    cargo_number: row.cargoNumber,
    sending_date: row.sendingDate,
    vehicle_normalized: row.vehicleNormalized,
    now_at: new Date().toISOString(),
  }));

  await pool.query(
    `with src as (
       select *
       from jsonb_to_recordset($1::jsonb) as x(
         customer_inn text,
         sending_number text,
         cargo_number text,
         sending_date date,
         vehicle_normalized text,
         now_at timestamptz
       )
     )
     insert into cargo_sending_assignments (
       customer_inn,
       sending_number,
       cargo_number,
       sending_date,
       vehicle_normalized,
       first_seen_at,
       last_seen_at
     )
     select
       customer_inn,
       sending_number,
       cargo_number,
       sending_date,
       vehicle_normalized,
       now_at,
       now_at
     from src
     on conflict (customer_inn, sending_number, cargo_number) do update
       set sending_date = coalesce(excluded.sending_date, cargo_sending_assignments.sending_date),
           vehicle_normalized = excluded.vehicle_normalized,
           last_seen_at = excluded.last_seen_at`,
    [JSON.stringify(payload)],
  );

  return { updated: payload.length };
}

export async function queryCargoNumbersByVehicleInPeriod(
  pool: { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> },
  vehicleNormalized: string,
  dateFrom: string,
  dateTo: string,
): Promise<string[]> {
  const vehicle = normalizeVehicleText(vehicleNormalized);
  if (!vehicle) return [];
  const res = await pool.query<{ cargo_number: string }>(
    `select distinct cargo_number
     from cargo_sending_assignments
     where vehicle_normalized = $1
       and sending_date is not null
       and sending_date >= $2::date
       and sending_date <= $3::date
     order by cargo_number`,
    [vehicle, dateFrom, dateTo],
  );
  return res.rows.map((r) => r.cargo_number).filter(Boolean);
}

export async function upsertSendingsMetrics(pool: { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> }, rows: SendingMetricRow[]) {
  if (!rows.length) return { updated: 0 };

  const keysPayload = rows.map((row) => ({ customer_inn: row.customerInn, sending_number: row.sendingNumber }));
  const existingRes = await pool.query(
    `with src as (
       select *
       from jsonb_to_recordset($1::jsonb) as x(customer_inn text, sending_number text)
     )
     select
       m.customer_inn,
       m.sending_number,
       m.cargo_numbers,
       m.send_start_at,
       m.first_ready_at
     from sendings_metrics m
     join src s
       on s.customer_inn = m.customer_inn
      and s.sending_number = m.sending_number`,
    [JSON.stringify(keysPayload)]
  );
  const existingMap = new Map<string, any>();
  existingRes.rows.forEach((row) => {
    existingMap.set(`${row.customer_inn}|${row.sending_number}`, row);
  });

  const merged = rows.map((row) => {
    const key = `${row.customerInn}|${row.sendingNumber}`;
    const existing = existingMap.get(key);
    const existingStart = existing?.send_start_at ? new Date(existing.send_start_at) : null;
    const existingReady = existing?.first_ready_at ? new Date(existing.first_ready_at) : null;
    const existingCargo = Array.isArray(existing?.cargo_numbers) ? existing.cargo_numbers.map((v: unknown) => String(v)) : [];
    const sendStartAt = minDate(existingStart, row.sendStartAt);
    const firstReadyAt = minDate(existingReady, row.firstReadyAt);
    const cargoNumbers = Array.from(new Set([...existingCargo, ...row.cargoNumbers]));
    return {
      customer_inn: row.customerInn,
      sending_number: row.sendingNumber,
      cargo_numbers: cargoNumbers,
      send_start_at: dateToIso(sendStartAt),
      first_ready_at: dateToIso(firstReadyAt),
      in_transit_hours: calcTransitHours(sendStartAt, firstReadyAt),
      now_at: new Date().toISOString(),
    };
  });

  await pool.query(
    `with src as (
       select *
       from jsonb_to_recordset($1::jsonb) as x(
         customer_inn text,
         sending_number text,
         cargo_numbers jsonb,
         send_start_at timestamptz,
         first_ready_at timestamptz,
         in_transit_hours numeric,
         now_at timestamptz
       )
     )
     insert into sendings_metrics (
       customer_inn,
       sending_number,
       cargo_numbers,
       send_start_at,
       first_ready_at,
       in_transit_hours,
       first_seen_at,
       last_seen_at,
       updated_at
     )
     select
       customer_inn,
       sending_number,
       cargo_numbers,
       send_start_at,
       first_ready_at,
       in_transit_hours,
       now_at,
       now_at,
       now_at
     from src
     on conflict (customer_inn, sending_number) do update
       set cargo_numbers = excluded.cargo_numbers,
           send_start_at = excluded.send_start_at,
           first_ready_at = excluded.first_ready_at,
           in_transit_hours = excluded.in_transit_hours,
           last_seen_at = excluded.last_seen_at,
           updated_at = excluded.updated_at`,
    [JSON.stringify(merged)]
  );

  return { updated: merged.length };
}
