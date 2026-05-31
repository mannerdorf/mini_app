import { buildSendingsTotalsByVehicle, getSendingRowParcelMetrics } from "./sendingsMetrics";

export type SendingsTableTotals = {
  sendingsCount: number;
  paidWeight: number;
  cost: number;
  declaredCost: number;
};

export function buildSendingsTableTotals(
  sendingRowsSorted: unknown[],
  cargoSumByNumber: Map<string, number>,
): SendingsTableTotals {
  return sendingRowsSorted.reduce(
    (acc, row) => {
      const metrics = getSendingRowParcelMetrics(row, cargoSumByNumber);
      acc.sendingsCount += 1;
      acc.paidWeight += metrics.paidWeight;
      acc.cost += metrics.cost;
      acc.declaredCost += metrics.declaredCost;
      return acc;
    },
    { sendingsCount: 0, paidWeight: 0, cost: 0, declaredCost: 0 },
  );
}

export function getSendingVehicleLabel(
  row: unknown,
  normalizeTransportDisplay: (value: string) => string,
): string {
  const r = row as Record<string, unknown>;
  return (
    normalizeTransportDisplay(String(r?.АвтомобильCMRНаименование ?? r?.AutoReg ?? r?.AutoType ?? "")) ||
    "—"
  );
}

export function buildSendingsVehicleSummary(
  sendingRowsSorted: unknown[],
  hasAnalytics: boolean,
  normalizeTransportDisplay: (value: string) => string,
  cargoSumByNumber: Map<string, number>,
) {
  if (!hasAnalytics) {
    return {
      sendingsTotalsByVehicle: [] as ReturnType<typeof buildSendingsTotalsByVehicle>,
      sendingsRepeatedVehicleTotals: [] as ReturnType<typeof buildSendingsTotalsByVehicle>,
      sendingsVehicleGrandTotals: { sendingsCount: 0, paidWeight: 0, cost: 0, declaredCost: 0 },
    };
  }

  const getLabel = (row: unknown) => getSendingVehicleLabel(row, normalizeTransportDisplay);
  const sendingsTotalsByVehicle = buildSendingsTotalsByVehicle(
    sendingRowsSorted,
    getLabel,
    cargoSumByNumber,
  );
  const sendingsRepeatedVehicleTotals = sendingsTotalsByVehicle.filter((row) => row.sendingsCount >= 2);
  const sendingsVehicleGrandTotals = sendingsRepeatedVehicleTotals.reduce(
    (acc, row) => {
      acc.sendingsCount += row.sendingsCount;
      acc.paidWeight += row.paidWeight;
      acc.cost += row.cost;
      acc.declaredCost += row.declaredCost;
      return acc;
    },
    { sendingsCount: 0, paidWeight: 0, cost: 0, declaredCost: 0 },
  );

  return { sendingsTotalsByVehicle, sendingsRepeatedVehicleTotals, sendingsVehicleGrandTotals };
}
