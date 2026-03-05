type SendingMetricRow = {
  customerInn: string;
  sendingNumber: string;
  cargoNumbers: string[];
  sendStartAt: Date | null;
  firstReadyAt: Date | null;
  inTransitHours: number | null;
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
  return normalizeInn(
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
  return normalizeText(
    item?.SendingNumber ??
      item?.sendingNumber ??
      item?.NumberSend ??
      item?.NumberSending ??
      item?.НомерОтправки ??
      item?.НомерОтпр ??
      item?.Номер ??
      item?.Number ??
      item?.number ??
      item?.ИДОтправления
  );
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
  add(row?.ИДОтправления);

  const rawParcels = row?.Посылки ?? row?.Parcels ?? row?.parcels ?? row?.Packages ?? row?.packages;
  const parcels = Array.isArray(rawParcels)
    ? rawParcels
    : rawParcels && typeof rawParcels === "object"
      ? Object.values(rawParcels as Record<string, any>)
      : [];
  parcels.forEach((parcel: any) => {
    add(parcel?.ИДОтправления);
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
      add((goods as any)?.НомерПеревозки);
      add((goods as any)?.CargoNumber);
      add((goods as any)?.NumberPerevozki);
    }
  });
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
    const sendingNumber = pickSendingNumber(row);
    const cargoNumbers = getSendingCargoNumbers(row);
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
