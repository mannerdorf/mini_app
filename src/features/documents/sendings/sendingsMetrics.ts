import {
  buildCargoTransportByNumber,
  normCargoKey,
  normalizeTransportName,
} from "../lib/documentsPipeline";

export function sendingRowMatchesTransportFilter(
  row: any,
  transportFilter: string,
  transportLinkedCargoNumbers?: Set<string>,
): boolean {
  if (!transportFilter) return true;
  if (transportLinkedCargoNumbers?.size) {
    return collectSendingCargoNumbers(row).some((num) =>
      transportLinkedCargoNumbers.has(normCargoKey(num)),
    );
  }
  const vehicle = normalizeTransportName(
    row?.АвтомобильCMRНаименование ?? row?.AutoReg ?? row?.autoReg ?? row?.AutoType ?? "",
  );
  return vehicle === normalizeTransportName(transportFilter);
}
export type SendingParcelMetrics = { paidWeight: number; cost: number; declaredCost: number };

/** Синхрон с `pickDate` в api/sendings.ts */
export function normalizeApiDateOnly(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const ruMatch = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (ruMatch) return `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}`;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().split("T")[0];
}

/** Дата рейса отправки — как в колонке «Дата» таблицы отправок. */
export function pickSendingRowDisplayDateRaw(item: any): unknown {
  return (
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
    item?.DateVr
  );
}

export function pickSendingRowDisplayDate(item: any): string {
  return normalizeApiDateOnly(pickSendingRowDisplayDateRaw(item));
}

/** Синхрон с `pickDate` в api/sendings.ts (фильтр кэша на бэкенде). */
export function pickSendingFilterDateRaw(item: any): unknown {
  return (
    item?.DateOtpr ??
    item?.DateSend ??
    item?.DateShipment ??
    item?.ShipmentDate ??
    item?.DateDoc ??
    item?.Date ??
    item?.date ??
    item?.ДатаОтправки ??
    item?.Дата ??
    item?.DatePrih ??
    item?.DateVr
  );
}

export function pickSendingFilterDate(item: any): string {
  return normalizeApiDateOnly(pickSendingFilterDateRaw(item));
}

export function isApiDateInRange(d: string, dateFrom: string, dateTo: string): boolean {
  if (!d) return false;
  return d >= dateFrom && d <= dateTo;
}

/** Отправка попадает в выбранный период по дате рейса. */
export function sendingRowInSelectedPeriod(
  row: any,
  dateFrom: string,
  dateTo: string,
): boolean {
  return isApiDateInRange(pickSendingRowDisplayDate(row), dateFrom, dateTo);
}

/** ТС из отправок за период — для фильтра «Транспортное средство». */
export function buildTransportOptionsFromSendingsInPeriod(
  sendingsItems: any[],
  dateFrom: string,
  dateTo: string,
  sendingsLoading: boolean,
): string[] {
  if (sendingsLoading) return [];
  const set = new Set<string>();
  (sendingsItems || []).forEach((row: any) => {
    if (!sendingRowInSelectedPeriod(row, dateFrom, dateTo)) return;
    const v = normalizeTransportName(
      row?.АвтомобильCMRНаименование ?? row?.AutoReg ?? row?.autoReg ?? row?.AutoType ?? "",
    );
    if (v) set.add(v);
  });
  return [...set].sort((a, b) => a.localeCompare(b, "ru"));
}

function addSendingCargoNumber(numbers: string[], value: unknown): void {
  const v = String(value ?? "").trim();
  if (v) numbers.push(v);
}

/** Все номера грузов/отправлений из строки отправки (посылки, товары). */
export function collectSendingCargoNumbers(row: any): string[] {
  const numbers: string[] = [];
  addSendingCargoNumber(numbers, row?.НомерПеревозки);
  addSendingCargoNumber(numbers, row?.CargoNumber);
  addSendingCargoNumber(numbers, row?.NumberPerevozki);
  addSendingCargoNumber(numbers, row?.Перевозка);
  addSendingCargoNumber(numbers, row?.ИДОтправления);
  addSendingCargoNumber(numbers, row?.Номер);
  addSendingCargoNumber(numbers, row?.Number);
  addSendingCargoNumber(numbers, row?.number);

  for (const parcel of getSendingParcelsFromRow(row)) {
    addSendingCargoNumber(numbers, parcel?.ИДОтправления);
    addSendingCargoNumber(numbers, parcel?.Перевозка);
    addSendingCargoNumber(numbers, parcel?.НомерПеревозки);
    addSendingCargoNumber(numbers, parcel?.CargoNumber);
    addSendingCargoNumber(numbers, parcel?.NumberPerevozki);
    const goods = getParcelGoodsObject(parcel);
    addSendingCargoNumber(numbers, goods?.ИДОтправления);
    addSendingCargoNumber(numbers, goods?.Перевозка);
    addSendingCargoNumber(numbers, goods?.НомерПеревозки);
    addSendingCargoNumber(numbers, goods?.CargoNumber);
    addSendingCargoNumber(numbers, goods?.NumberPerevozki);
  }

  return Array.from(new Set(numbers));
}

export function enrichCargoTransportByNumberFromSendings(
  base: Map<string, string>,
  sendingsItems: any[],
): Map<string, string> {
  const map = new Map(base);
  (sendingsItems || []).forEach((row: any) => {
    const transport = String(
      row?.АвтомобильCMRНаименование
        ?? row?.AutoReg
        ?? row?.autoReg
        ?? row?.AutoType
        ?? "",
    ).trim();
    if (!transport) return;
    for (const raw of collectSendingCargoNumbers(row)) {
      const key = normCargoKey(raw);
      if (!key) continue;
      map.set(key, transport);
      if (key !== raw) map.set(raw, transport);
    }
  });
  return map;
}

export function buildCargoTransportByNumberFromPerevozkiAndSendings(
  perevozkiItems: any[],
  sendingsItems: any[],
): Map<string, string> {
  return enrichCargoTransportByNumberFromSendings(
    buildCargoTransportByNumber(perevozkiItems),
    sendingsItems,
  );
}

function pickSendingRowVehicle(row: any): string {
  return normalizeTransportName(
    row?.АвтомобильCMRНаименование ?? row?.AutoReg ?? row?.autoReg ?? row?.AutoType ?? "",
  );
}

/** Номера перевозок, привязанных к ТС через отправки за период. */
export function buildTransportLinkedCargoNumbersInPeriod(
  sendingsItems: any[],
  dateFrom: string,
  dateTo: string,
  transportFilter: string,
): Set<string> {
  const selected = normalizeTransportName(transportFilter);
  if (!selected) return new Set();
  const set = new Set<string>();
  (sendingsItems || []).forEach((row: any) => {
    if (!sendingRowInSelectedPeriod(row, dateFrom, dateTo)) return;
    if (pickSendingRowVehicle(row) !== selected) return;
    for (const raw of collectSendingCargoNumbers(row)) {
      const key = normCargoKey(raw);
      if (key) set.add(key);
    }
  });
  return set;
}

export function parseSendingMetricNumber(v: unknown): number {
  const raw = String(v ?? "").trim().replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function roundSendingMetric(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

export function formatSendingMetricNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return String(roundSendingMetric(n));
}

export function getSendingParcelsFromRow(row: any): any[] {
  const raw = row?.Посылки ?? row?.Parcels ?? row?.parcels ?? row?.Packages ?? row?.packages;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function getParcelGoodsObject(parcel: any): Record<string, unknown> {
  const goodsRaw = parcel?.Товары;
  if (Array.isArray(goodsRaw)) return (goodsRaw[0] ?? {}) as Record<string, unknown>;
  if (goodsRaw && typeof goodsRaw === "object") return goodsRaw as Record<string, unknown>;
  return {};
}

function pickSendingFreightAmount(...sources: unknown[]): number {
  for (const source of sources) {
    const n = parseSendingMetricNumber(source);
    if (n > 0) return n;
  }
  return 0;
}

function addFreightCargoNumber(numbers: string[], value: unknown): void {
  const v = String(value ?? "").trim();
  if (v) numbers.push(v);
}

function lookupCargoFreightSum(cargoSumByNumber: Map<string, number> | undefined, num: unknown): number {
  if (!cargoSumByNumber?.size) return 0;
  const trimmed = String(num ?? "").trim();
  if (!trimmed) return 0;
  return cargoSumByNumber.get(normCargoKey(trimmed)) ?? cargoSumByNumber.get(trimmed) ?? 0;
}

/** Номера перевозок для суммы freight (без ИД отправления — это не номер груза). */
export function collectSendingFreightCargoNumbers(row: any): string[] {
  const numbers: string[] = [];
  addFreightCargoNumber(numbers, row?.НомерПеревозки);
  addFreightCargoNumber(numbers, row?.CargoNumber);
  addFreightCargoNumber(numbers, row?.NumberPerevozki);
  addFreightCargoNumber(numbers, row?.Перевозка);

  for (const parcel of getSendingParcelsFromRow(row)) {
    addFreightCargoNumber(numbers, parcel?.Перевозка);
    addFreightCargoNumber(numbers, parcel?.НомерПеревозки);
    addFreightCargoNumber(numbers, parcel?.CargoNumber);
    addFreightCargoNumber(numbers, parcel?.NumberPerevozki);
    const goods = getParcelGoodsObject(parcel);
    addFreightCargoNumber(numbers, goods?.Перевозка);
    addFreightCargoNumber(numbers, goods?.НомерПеревозки);
    addFreightCargoNumber(numbers, goods?.CargoNumber);
    addFreightCargoNumber(numbers, goods?.NumberPerevozki);
  }

  return Array.from(new Set(numbers));
}

/** Сумма перевозки по посылке (как «Сумма» в отчёте 1С), не объявленная стоимость товара. */
export function getParcelFreightSum(parcel: any, cargoSumByNumber?: Map<string, number>): number {
  const goods = getParcelGoodsObject(parcel);
  const direct = pickSendingFreightAmount(
    parcel?.Сумма,
    parcel?.Sum,
    parcel?.SumDoc,
    parcel?.Amount,
    parcel?.amount,
    parcel?.sum,
    goods?.Сумма,
    goods?.Sum,
    goods?.SumDoc,
    goods?.Amount,
    goods?.amount,
    goods?.sum,
    parcel?.Стоимость,
    goods?.Стоимость,
  );
  if (direct > 0) return direct;

  for (const num of [
    parcel?.Перевозка,
    parcel?.НомерПеревозки,
    parcel?.CargoNumber,
    parcel?.NumberPerevozki,
    goods?.Перевозка,
    goods?.НомерПеревозки,
    goods?.CargoNumber,
    goods?.NumberPerevozki,
  ]) {
    const sum = lookupCargoFreightSum(cargoSumByNumber, num);
    if (sum > 0) return sum;
  }
  return 0;
}

export function getSendingRowFreightSum(row: any, cargoSumByNumber?: Map<string, number>): number {
  const rowSum = pickSendingFreightAmount(
    row?.Сумма,
    row?.Sum,
    row?.SumDoc,
    row?.Amount,
    row?.amount,
    row?.sum,
  );
  if (rowSum > 0) return rowSum;

  const parcels = getSendingParcelsFromRow(row);
  let directParcelTotal = 0;
  for (const parcel of parcels) {
    directParcelTotal += pickSendingFreightAmount(
      parcel?.Сумма,
      parcel?.Sum,
      parcel?.SumDoc,
      parcel?.Amount,
      parcel?.amount,
      parcel?.sum,
    );
  }
  if (directParcelTotal > 0) return directParcelTotal;

  let total = 0;
  const seen = new Set<string>();
  for (const num of collectSendingFreightCargoNumbers(row)) {
    const key = normCargoKey(num);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    total += lookupCargoFreightSum(cargoSumByNumber, num);
  }
  return total;
}

/** Объявленная стоимость товара в посылке. */
export function getParcelDeclaredCost(parcel: any): number {
  const pickDeclared = (obj: unknown): number =>
    parseSendingMetricNumber(
      (obj as any)?.ОбъявленнаяСтоимостьТовараДляПечати ??
        (obj as any)?.ОбъявленнаяСтоимостьТовара ??
        (obj as any)?.ОбъявленнаяСтоимость ??
        (obj as any)?.ОбъявлСтоимость ??
        (obj as any)?.DeclaredCost ??
        (obj as any)?.declaredCost ??
        (obj as any)?.DeclaredValue ??
        (obj as any)?.declaredValue
    );

  const goodsRaw = parcel?.Товары;
  if (Array.isArray(goodsRaw)) {
    let total = 0;
    for (const item of goodsRaw) {
      total += pickDeclared(item);
    }
    if (total > 0) return total;
  }

  const goods = getParcelGoodsObject(parcel);
  const fromGoods = pickDeclared(goods);
  if (fromGoods > 0) return fromGoods;

  return pickDeclared(parcel);
}

export function getSendingRowDeclaredCost(row: any): number {
  const parcels = getSendingParcelsFromRow(row);
  if (parcels.length === 0) return 0;
  let total = 0;
  for (const parcel of parcels) {
    total += getParcelDeclaredCost(parcel);
  }
  return total;
}

export function sumSendingParcelsMetrics(
  parcels: any[],
  cargoSumByNumber?: Map<string, number>,
): SendingParcelMetrics {
  let paidWeight = 0;
  let cost = 0;
  let declaredCost = 0;
  for (const parcel of parcels) {
    paidWeight += parseSendingMetricNumber(parcel?.ПлатныйВес);
    cost += getParcelFreightSum(parcel, cargoSumByNumber);
    declaredCost += getParcelDeclaredCost(parcel);
  }
  return { paidWeight, cost, declaredCost };
}

export function getSendingRowParcelMetrics(
  row: any,
  cargoSumByNumber?: Map<string, number>,
): SendingParcelMetrics {
  const parcels = getSendingParcelsFromRow(row);
  let paidWeight = 0;
  for (const parcel of parcels) {
    paidWeight += parseSendingMetricNumber(parcel?.ПлатныйВес);
  }
  return {
    paidWeight,
    cost: getSendingRowFreightSum(row, cargoSumByNumber),
    declaredCost: getSendingRowDeclaredCost(row),
  };
}

export type SendingVehicleTotalRow = {
  vehicle: string;
  sendingsCount: number;
  paidWeight: number;
  cost: number;
  declaredCost: number;
};

export function buildSendingsTotalsByVehicle(
  rows: any[],
  getVehicle: (row: any) => string,
  cargoSumByNumber?: Map<string, number>,
): SendingVehicleTotalRow[] {
  const map = new Map<string, SendingVehicleTotalRow>();
  for (const row of rows) {
    const vehicle = getVehicle(row) || "—";
    const metrics = getSendingRowParcelMetrics(row, cargoSumByNumber);
    const prev =
      map.get(vehicle) ??
      { vehicle, sendingsCount: 0, paidWeight: 0, cost: 0, declaredCost: 0 };
    prev.sendingsCount += 1;
    prev.paidWeight += metrics.paidWeight;
    prev.cost += metrics.cost;
    prev.declaredCost += metrics.declaredCost;
    map.set(vehicle, prev);
  }
  return [...map.values()].sort((a, b) =>
    a.vehicle.localeCompare(b.vehicle, "ru", { numeric: true })
  );
}
