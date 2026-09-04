import { normCargoKey } from "../lib/documentsPipeline";
import { normalizeStatus } from "../../../lib/statusUtils";
import { sumParcelsFreightCost } from "./sendingsMetrics";

export type CounterpartySummaryRow = {
  party: string;
  count: number;
  volume: number;
  weight: number;
  paidWeight: number;
  cost: number;
  cargoNumbers: string[];
  _index: number;
  selectionKey: string;
};

export type CargoSummaryRow = {
  cargo: string;
  status: string;
  count: number;
  volume: number;
  weight: number;
  paidWeight: number;
  cost: number;
  partyName: string;
  _idx: number;
};

export function parseSendingSummaryNumber(v: unknown): number {
  const raw = String(v ?? "").trim().replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function formatSendingSummaryNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return String(Math.round(n));
}

export function sendingSummaryDensityOf(weight: number, volume: number): string {
  if (!Number.isFinite(weight) || !Number.isFinite(volume) || volume <= 0) return "—";
  return formatSendingSummaryNum(weight / volume);
}

export function sendingSummaryDensityColor(weight: number, volume: number): string {
  if (!Number.isFinite(weight) || !Number.isFinite(volume) || volume <= 0) return "var(--color-text-secondary)";
  const density = weight / volume;
  if (density >= 180 && density <= 220) return "#16a34a";
  if ((density >= 150 && density < 180) || (density > 220 && density <= 260)) return "#ca8a04";
  return "#dc2626";
}

export function getSendingRowDefaults(row: any) {
  return {
    customer: String(row?.Заказчик ?? row?.Customer ?? row?.customer ?? row?.Контрагент ?? row?.Contractor ?? row?.Organization ?? "").trim() || "—",
    receiver: String(row?.Получатель ?? row?.Грузополучатель ?? row?.Receiver ?? row?.receiver ?? row?.Consignee ?? "").trim() || "—",
  };
}

export function resolveSendingPartyFromParcel(
  parcel: any,
  row: any,
  groupBy: "customer" | "receiver",
  cargoCustomerByNumber: Map<string, string>,
  cargoReceiverByNumber: Map<string, string>,
): string {
  const { customer: rowDefaultCustomer, receiver: rowDefaultReceiver } = getSendingRowDefaults(row);
  const cargo = String(parcel?.Перевозка ?? "").trim();
  const customerFromParcel = String(parcel?.ЗаказчикНаименование ?? parcel?.Заказчик ?? parcel?.Customer ?? parcel?.customer ?? "").trim();
  const customerFromCargo = cargo ? String(cargoCustomerByNumber.get(normCargoKey(cargo)) ?? "").trim() : "";
  const receiverFromParcel = String(
    parcel?.ПолучательНаименование ?? parcel?.Получатель ?? parcel?.ГрузополучательНаименование ?? parcel?.Грузополучатель ?? parcel?.Receiver ?? parcel?.receiver ?? parcel?.Consignee ?? "",
  ).trim();
  const receiverFromCargo = cargo ? String(cargoReceiverByNumber.get(normCargoKey(cargo)) ?? "").trim() : "";
  return groupBy === "receiver"
    ? receiverFromParcel || receiverFromCargo || rowDefaultReceiver
    : customerFromParcel || customerFromCargo || rowDefaultCustomer;
}

export function buildCounterpartySummaries(
  parcelsToRender: any[],
  row: any,
  rowKey: string,
  groupBy: "customer" | "receiver",
  cargoCustomerByNumber: Map<string, string>,
  cargoReceiverByNumber: Map<string, string>,
  cargoSumByNumber?: Map<string, number>,
): CounterpartySummaryRow[] {
  const byCounterparty = new Map<string, { party: string; count: number; volume: number; weight: number; paidWeight: number; cargoNumbers: Set<string>; parcels: any[] }>();
  parcelsToRender.forEach((parcel: any) => {
    const cargo = String(parcel?.Перевозка ?? "").trim();
    const party = resolveSendingPartyFromParcel(parcel, row, groupBy, cargoCustomerByNumber, cargoReceiverByNumber);
    const prev = byCounterparty.get(party) ?? { party, count: 0, volume: 0, weight: 0, paidWeight: 0, cargoNumbers: new Set<string>(), parcels: [] as any[] };
    prev.count += 1;
    prev.volume += parseSendingSummaryNumber(parcel?.ОбъемДляОтчета);
    prev.weight += parseSendingSummaryNumber(parcel?.ВесДляОтчета);
    prev.paidWeight += parseSendingSummaryNumber(parcel?.ПлатныйВес);
    prev.parcels.push(parcel);
    if (cargo) prev.cargoNumbers.add(cargo);
    byCounterparty.set(party, prev);
  });
  return Array.from(byCounterparty.values()).map((summary, index) => ({
    party: summary.party,
    count: summary.count,
    volume: summary.volume,
    weight: summary.weight,
    paidWeight: summary.paidWeight,
    cost: sumParcelsFreightCost(summary.parcels, cargoSumByNumber),
    cargoNumbers: Array.from(summary.cargoNumbers),
    _index: index + 1,
    selectionKey: `${rowKey}::${summary.party}`,
  }));
}

export function sortCounterpartySummaries(
  rows: CounterpartySummaryRow[],
  sortColumn: string,
  sortOrder: "asc" | "desc",
): CounterpartySummaryRow[] {
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (sortColumn) {
      case "index":
        cmp = a._index - b._index;
        break;
      case "count":
        cmp = a.count - b.count;
        break;
      case "volume":
        cmp = a.volume - b.volume;
        break;
      case "weight":
        cmp = a.weight - b.weight;
        break;
      case "paidWeight":
        cmp = a.paidWeight - b.paidWeight;
        break;
      case "cost":
        cmp = a.cost - b.cost;
        break;
      case "density": {
        const dA = a.volume > 0 ? a.weight / a.volume : -Infinity;
        const dB = b.volume > 0 ? b.weight / b.volume : -Infinity;
        cmp = dA - dB;
        break;
      }
      case "cargo":
      case "customer":
        cmp = String(a.party || "").localeCompare(String(b.party || ""));
        break;
    }
    return sortOrder === "asc" ? cmp : -cmp;
  });
}

export function buildCargoRowsForParty(
  parcelsToRender: any[],
  cargoNumbers: string[],
  row: any,
  groupBy: "customer" | "receiver",
  cargoStateByNumber: Map<string, string>,
  cargoCustomerByNumber: Map<string, string>,
  cargoReceiverByNumber: Map<string, string>,
  cargoSumByNumber?: Map<string, number>,
): CargoSummaryRow[] {
  const cargoNumbersSet = new Set(cargoNumbers.map((c) => normCargoKey(c)));
  const parcelsForParty = parcelsToRender.filter((p: any) => {
    const cargo = String(p?.Перевозка ?? "").trim();
    return cargo && cargoNumbersSet.has(normCargoKey(cargo));
  });
  const byCargoExpanded = new Map<string, { cargo: string; status: string; count: number; volume: number; weight: number; paidWeight: number; parcels: any[] }>();
  parcelsForParty.forEach((parcel: any) => {
    const cargo = String(parcel?.Перевозка ?? "").trim() || "—";
    const prev = byCargoExpanded.get(cargo) ?? { cargo, status: "", count: 0, volume: 0, weight: 0, paidWeight: 0, parcels: [] as any[] };
    prev.count += 1;
    prev.volume += parseSendingSummaryNumber(parcel?.ОбъемДляОтчета);
    prev.weight += parseSendingSummaryNumber(parcel?.ВесДляОтчета);
    prev.paidWeight += parseSendingSummaryNumber(parcel?.ПлатныйВес);
    prev.parcels.push(parcel);
    if (!prev.status || prev.status === "-") {
      const state = cargo !== "—" ? String(cargoStateByNumber.get(normCargoKey(cargo)) ?? "") : "";
      prev.status = state || prev.status;
    }
    byCargoExpanded.set(cargo, prev);
  });
  return Array.from(byCargoExpanded.values()).map((s, i) => {
    const cargoKey = normCargoKey(s.cargo);
    const sendingCustomer = cargoCustomerByNumber.get(cargoKey) || String(row?.Заказчик ?? row?.Customer ?? "").trim();
    const sendingReceiver = cargoReceiverByNumber.get(cargoKey) || String(row?.Получатель ?? row?.Грузополучатель ?? "").trim();
    const partyName = groupBy === "receiver" ? sendingReceiver : sendingCustomer;
    return {
      cargo: s.cargo,
      status: normalizeStatus(s.status || ""),
      count: s.count,
      volume: s.volume,
      weight: s.weight,
      paidWeight: s.paidWeight,
      cost: sumParcelsFreightCost(s.parcels, cargoSumByNumber),
      partyName,
      _idx: i + 1,
    };
  });
}

export function getAllCounterpartySelectionKeys(
  parcelsToRender: any[],
  row: any,
  rowKey: string,
  groupBy: "customer" | "receiver",
  cargoCustomerByNumber: Map<string, string>,
  cargoReceiverByNumber: Map<string, string>,
): Set<string> {
  const keys = new Set<string>();
  parcelsToRender.forEach((parcel: any) => {
    const party = resolveSendingPartyFromParcel(parcel, row, groupBy, cargoCustomerByNumber, cargoReceiverByNumber);
    keys.add(`${rowKey}::${party}`);
  });
  return keys;
}

export type ByCargoSummaryRow = {
  cargo: string;
  status: string;
  count: number;
  volume: number;
  weight: number;
  paidWeight: number;
  cost: number;
  customer: string;
  _index: number;
};

export function buildByCargoSummaries(
  parcelsToRender: any[],
  row: any,
  cargoStateByNumber: Map<string, string>,
  cargoCustomerByNumber: Map<string, string>,
  cargoSumByNumber?: Map<string, number>,
): ByCargoSummaryRow[] {
  const byCargo = new Map<string, { cargo: string; status: string; count: number; volume: number; weight: number; paidWeight: number; parcels: any[] }>();
  parcelsToRender.forEach((parcel: any) => {
    const cargo = String(parcel?.Перевозка ?? "").trim() || "—";
    const prev = byCargo.get(cargo) ?? { cargo, status: "", count: 0, volume: 0, weight: 0, paidWeight: 0, parcels: [] as any[] };
    prev.count += 1;
    prev.volume += parseSendingSummaryNumber(parcel?.ОбъемДляОтчета);
    prev.weight += parseSendingSummaryNumber(parcel?.ВесДляОтчета);
    prev.paidWeight += parseSendingSummaryNumber(parcel?.ПлатныйВес);
    prev.parcels.push(parcel);
    if (!prev.status || prev.status === "-") {
      const state = cargo !== "—" ? String(cargoStateByNumber.get(normCargoKey(cargo)) ?? "") : "";
      prev.status = state || prev.status;
    }
    byCargo.set(cargo, prev);
  });
  const { customer: rowDefaultCustomer } = getSendingRowDefaults(row);
  return Array.from(byCargo.values()).map((summary, index) => {
    const cargoKey = normCargoKey(summary.cargo);
    const sendingCustomer = cargoCustomerByNumber.get(cargoKey) || rowDefaultCustomer;
    return {
      cargo: summary.cargo,
      status: normalizeStatus(summary.status || ""),
      count: summary.count,
      volume: summary.volume,
      weight: summary.weight,
      paidWeight: summary.paidWeight,
      cost: sumParcelsFreightCost(summary.parcels, cargoSumByNumber),
      customer: sendingCustomer,
      _index: index + 1,
    };
  });
}

export function sortByCargoSummaries(
  rows: ByCargoSummaryRow[],
  sortColumn: string,
  sortOrder: "asc" | "desc",
): ByCargoSummaryRow[] {
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (sortColumn) {
      case "index":
        cmp = a._index - b._index;
        break;
      case "cargo":
        cmp = a.cargo.localeCompare(b.cargo, undefined, { numeric: true });
        break;
      case "status":
        cmp = String(a.status || "").localeCompare(String(b.status || ""), "ru");
        break;
      case "count":
        cmp = a.count - b.count;
        break;
      case "volume":
        cmp = a.volume - b.volume;
        break;
      case "weight":
        cmp = a.weight - b.weight;
        break;
      case "paidWeight":
        cmp = a.paidWeight - b.paidWeight;
        break;
      case "cost":
        cmp = a.cost - b.cost;
        break;
      case "density": {
        const dA = a.volume > 0 ? a.weight / a.volume : -Infinity;
        const dB = b.volume > 0 ? b.weight / b.volume : -Infinity;
        cmp = dA - dB;
        break;
      }
      case "customer":
        cmp = String(a.customer || "").localeCompare(String(b.customer || ""));
        break;
    }
    return sortOrder === "asc" ? cmp : -cmp;
  });
}

export function sumByCargoSummaryTotals(rows: ByCargoSummaryRow[]) {
  return rows.reduce(
    (acc, s) => {
      acc.count += s.count;
      acc.volume += s.volume;
      acc.weight += s.weight;
      acc.paidWeight += s.paidWeight;
      acc.cost += s.cost;
      return acc;
    },
    { count: 0, volume: 0, weight: 0, paidWeight: 0, cost: 0 },
  );
}

export function resolveSendingPlanDate(
  cargo: string,
  cargoPlanDateByNumber: Map<string, Date | string>,
  plannedArrivalDate: Date | null,
): Date | string | null {
  if (cargo && cargo !== "—") {
    return cargoPlanDateByNumber.get(normCargoKey(cargo)) ?? cargoPlanDateByNumber.get(cargo) ?? plannedArrivalDate;
  }
  return plannedArrivalDate;
}
