import React from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatCurrency } from "../../../lib/formatUtils";
import { formatSendingMetricNum, type SendingVehicleTotalRow } from "./sendingsMetrics";
import { SendingsBulkActionsBar } from "./SendingsBulkActionsBar";
import type { EorStatus } from "./sendingsTypes";

type TableTotals = {
  sendingsCount: number;
  paidWeight: number;
  cost: number;
  declaredCost: number;
};

type Props = {
  hasAnalytics: boolean;
  showSums: boolean;
  tableModeEffective: boolean;
  canEditEor: boolean;
  canEditPlanDate: boolean;
  canRunSanctionsCheck: boolean;
  selectedVisibleSendingCount: number;
  bulkSendingActionLoading: boolean;
  bulkEorMenuOpen: boolean;
  setBulkEorMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  bulkPlanDateOpen: boolean;
  setBulkPlanDateOpen: React.Dispatch<React.SetStateAction<boolean>>;
  bulkPlanDateValue: string;
  setBulkPlanDateValue: React.Dispatch<React.SetStateAction<string>>;
  bulkSendingActionError: string | null;
  bulkSendingActionInfo: string | null;
  onApplyEorStatus: (status: EorStatus) => void;
  onApplyPlanDate: () => void;
  onApplySanctionsCheck: () => void;
  sendingsFerryActionError: string | null;
  sendingsRepeatedVehicleTotals: SendingVehicleTotalRow[];
  sendingsVehicleGrandTotals: TableTotals;
  sendingsTableTotals: TableTotals;
  sendingsSummaryCollapsed: boolean;
  setSendingsSummaryCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  rowsCount: number;
};

export function SendingsPreface({
  hasAnalytics,
  showSums,
  tableModeEffective,
  canEditEor,
  canEditPlanDate,
  canRunSanctionsCheck,
  selectedVisibleSendingCount,
  bulkSendingActionLoading,
  bulkEorMenuOpen,
  setBulkEorMenuOpen,
  bulkPlanDateOpen,
  setBulkPlanDateOpen,
  bulkPlanDateValue,
  setBulkPlanDateValue,
  bulkSendingActionError,
  bulkSendingActionInfo,
  onApplyEorStatus,
  onApplyPlanDate,
  onApplySanctionsCheck,
  sendingsFerryActionError,
  sendingsRepeatedVehicleTotals,
  sendingsVehicleGrandTotals,
  sendingsTableTotals,
  sendingsSummaryCollapsed,
  setSendingsSummaryCollapsed,
  rowsCount,
}: Props) {
  return (
    <>
      {(canEditPlanDate || canRunSanctionsCheck) && tableModeEffective && (
        <SendingsBulkActionsBar
          selectedCount={selectedVisibleSendingCount}
          canEditEor={canEditEor}
          canEditPlanDate={canEditPlanDate}
          canRunSanctionsCheck={canRunSanctionsCheck}
          actionLoading={bulkSendingActionLoading}
          eorMenuOpen={bulkEorMenuOpen}
          setEorMenuOpen={setBulkEorMenuOpen}
          planDateOpen={bulkPlanDateOpen}
          setPlanDateOpen={setBulkPlanDateOpen}
          planDateValue={bulkPlanDateValue}
          setPlanDateValue={setBulkPlanDateValue}
          actionError={bulkSendingActionError}
          actionInfo={bulkSendingActionInfo}
          onApplyEorStatus={onApplyEorStatus}
          onApplyPlanDate={onApplyPlanDate}
          onApplySanctionsCheck={onApplySanctionsCheck}
        />
      )}
      {sendingsFerryActionError && (
        <div style={{ marginBottom: "0.5rem" }}>
          <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-error)" }}>
            {sendingsFerryActionError}
          </Typography.Body>
          {sendingsFerryActionError.includes("миграц") && (
            <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
              Выполните миграции 049_ferries.sql и 050_sendings_ferry.sql на БД (Vercel Postgres или подключение через psql).
            </Typography.Body>
          )}
        </div>
      )}
      {hasAnalytics && sendingsRepeatedVehicleTotals.length > 0 && (
        <div
          className="cargo-card documents-sendings-by-vehicle-summary"
          style={{ overflowX: "auto", marginBottom: "0.65rem", padding: "0.55rem 0.65rem" }}
        >
          <Typography.Body style={{ fontWeight: 700, fontSize: "0.88rem", marginBottom: "0.45rem" }}>
            Итого по транспортным средствам
          </Typography.Body>
          <table className="doc-inner-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
                <th style={{ padding: "0.4rem 0.35rem", textAlign: "left", fontWeight: 600 }}>ТС</th>
                <th style={{ padding: "0.4rem 0.35rem", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>Отправок</th>
                <th style={{ padding: "0.4rem 0.35rem", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>Плат. вес</th>
                {showSums && (
                  <th style={{ padding: "0.4rem 0.35rem", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }} title="Сумма за перевозку">
                    Стоимость
                  </th>
                )}
                {showSums && (
                  <th style={{ padding: "0.4rem 0.35rem", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>
                    Объявл. стоимость
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sendingsRepeatedVehicleTotals.map((vehicleRow) => (
                <tr key={vehicleRow.vehicle} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.4rem 0.35rem", whiteSpace: "nowrap", fontWeight: 600 }}>{vehicleRow.vehicle}</td>
                  <td style={{ padding: "0.4rem 0.35rem", textAlign: "right", whiteSpace: "nowrap" }}>{vehicleRow.sendingsCount}</td>
                  <td style={{ padding: "0.4rem 0.35rem", textAlign: "right", whiteSpace: "nowrap" }}>
                    {formatSendingMetricNum(vehicleRow.paidWeight)}
                  </td>
                  {showSums && (
                    <td style={{ padding: "0.4rem 0.35rem", textAlign: "right", whiteSpace: "nowrap" }}>
                      {formatCurrency(vehicleRow.cost, true)}
                    </td>
                  )}
                  {showSums && (
                    <td style={{ padding: "0.4rem 0.35rem", textAlign: "right", whiteSpace: "nowrap" }}>
                      {formatCurrency(vehicleRow.declaredCost, true)}
                    </td>
                  )}
                </tr>
              ))}
              <tr style={{ borderTop: "2px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
                <td style={{ padding: "0.4rem 0.35rem", fontWeight: 700 }}>Всего</td>
                <td style={{ padding: "0.4rem 0.35rem", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>
                  {sendingsVehicleGrandTotals.sendingsCount}
                </td>
                <td style={{ padding: "0.4rem 0.35rem", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>
                  {formatSendingMetricNum(sendingsVehicleGrandTotals.paidWeight)}
                </td>
                {showSums && (
                  <td style={{ padding: "0.4rem 0.35rem", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {formatCurrency(sendingsVehicleGrandTotals.cost, true)}
                  </td>
                )}
                {showSums && (
                  <td style={{ padding: "0.4rem 0.35rem", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {formatCurrency(sendingsVehicleGrandTotals.declaredCost, true)}
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {hasAnalytics && rowsCount > 0 && (
        <div
          className={`cargo-card cargo-summary-totals documents-summary-card documents-summary-totals documents-summary-totals--saas-kpi cargo-summary-totals--saas-kpi documents-sendings-table-summary${sendingsSummaryCollapsed ? " documents-sendings-table-summary--collapsed" : ""}`}
        >
          <button
            type="button"
            className="cargo-summary-totals-toggle documents-sendings-table-summary-toggle"
            onClick={() => setSendingsSummaryCollapsed((value) => !value)}
            aria-expanded={!sendingsSummaryCollapsed}
            aria-label={sendingsSummaryCollapsed ? "Развернуть итоги отправок" : "Свернуть итоги отправок"}
          >
            <Typography.Body style={{ fontSize: "0.78rem", fontWeight: 600 }}>Итого по выборке</Typography.Body>
            {sendingsSummaryCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          <div className="summary-metrics">
            {showSums && (
              <Flex direction="column" align="center">
                <Typography.Label>Стоимость</Typography.Label>
                <Typography.Body>{formatCurrency(sendingsTableTotals.cost, true)}</Typography.Body>
              </Flex>
            )}
            <Flex direction="column" align="center">
              <Typography.Label>Отправок</Typography.Label>
              <Typography.Body>{sendingsTableTotals.sendingsCount}</Typography.Body>
            </Flex>
            <Flex direction="column" align="center">
              <Typography.Label>Плат. вес</Typography.Label>
              <Typography.Body>{formatSendingMetricNum(sendingsTableTotals.paidWeight)}</Typography.Body>
            </Flex>
            {showSums && (
              <Flex direction="column" align="center">
                <Typography.Label>Объявл. стоимость</Typography.Label>
                <Typography.Body>{formatCurrency(sendingsTableTotals.declaredCost, true)}</Typography.Body>
              </Flex>
            )}
          </div>
        </div>
      )}
    </>
  );
}
