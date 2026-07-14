import React from "react";
import { Typography } from "@maxhub/max-ui";
import { SendingsInfographic } from "./SendingsInfographic";
import { SendingsPreface } from "./SendingsPreface";
import { SendingsSection } from "./SendingsSection";
import { DocumentsStateBlocks } from "../views/documentsViewBlocks";
import type { useDocumentsSendingsPage } from "./useDocumentsSendingsPage";
import type { CargoStatusFilterKey } from "../../../lib/sharedListFilters";

type SendingsPageReturn = ReturnType<typeof useDocumentsSendingsPage>;

type Props = SendingsPageReturn & {
  active: boolean;
  hasAnalytics: boolean;
  showSums: boolean;
  tableModeEffective: boolean;
  deliveryStatusFilterSet: Set<CargoStatusFilterKey>;
  setDeliveryStatusFilterSet: React.Dispatch<React.SetStateAction<Set<CargoStatusFilterKey>>>;
};

export function DocumentsSendingsSection({
  active,
  hasAnalytics,
  showSums,
  tableModeEffective,
  deliveryStatusFilterSet,
  setDeliveryStatusFilterSet,
  sendingsInitialLoading,
  sendingsError,
  sendingsLoading,
  sendingRowsSorted,
  sendingsInfographic,
  sendingsSectionProps,
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
  applyBulkEorStatus,
  applyBulkPlanDate,
  applyBulkSanctionsCheck,
  sendingsFerryActionError,
  sendingsRepeatedVehicleTotals,
  sendingsVehicleGrandTotals,
  sendingsTableTotals,
  sendingsSummaryCollapsed,
  setSendingsSummaryCollapsed,
}: Props) {
  if (!active) return null;

  return (
    <>
      {(sendingsInitialLoading || !!sendingsError) && (
        <DocumentsStateBlocks loading={sendingsInitialLoading} error={sendingsError} emptyText="" />
      )}
      {!sendingsLoading && !sendingsError && sendingRowsSorted.length > 0 && (
        <>
          <SendingsInfographic
            data={sendingsInfographic}
            deliveryStatusFilterSet={deliveryStatusFilterSet}
            setDeliveryStatusFilterSet={setDeliveryStatusFilterSet}
          />
          <SendingsPreface
            hasAnalytics={hasAnalytics}
            showSums={showSums}
            tableModeEffective={tableModeEffective}
            canEditEor={canEditEor}
            canEditPlanDate={canEditPlanDate}
            canRunSanctionsCheck={canRunSanctionsCheck}
            selectedVisibleSendingCount={selectedVisibleSendingCount}
            bulkSendingActionLoading={bulkSendingActionLoading}
            bulkEorMenuOpen={bulkEorMenuOpen}
            setBulkEorMenuOpen={setBulkEorMenuOpen}
            bulkPlanDateOpen={bulkPlanDateOpen}
            setBulkPlanDateOpen={setBulkPlanDateOpen}
            bulkPlanDateValue={bulkPlanDateValue}
            setBulkPlanDateValue={setBulkPlanDateValue}
            bulkSendingActionError={bulkSendingActionError}
            bulkSendingActionInfo={bulkSendingActionInfo}
            onApplyEorStatus={applyBulkEorStatus}
            onApplyPlanDate={applyBulkPlanDate}
            onApplySanctionsCheck={applyBulkSanctionsCheck}
            sendingsFerryActionError={sendingsFerryActionError}
            sendingsRepeatedVehicleTotals={sendingsRepeatedVehicleTotals}
            sendingsVehicleGrandTotals={sendingsVehicleGrandTotals}
            sendingsTableTotals={sendingsTableTotals}
            sendingsSummaryCollapsed={sendingsSummaryCollapsed}
            setSendingsSummaryCollapsed={setSendingsSummaryCollapsed}
            rowsCount={sendingRowsSorted.length}
          />
          <SendingsSection {...sendingsSectionProps} />
        </>
      )}
      {!sendingsLoading && !sendingsError && sendingRowsSorted.length === 0 && (
        <Typography.Body className="text-empty-state" style={{ padding: "2rem 0" }}>
          Нет отправок за выбранный период
        </Typography.Body>
      )}
    </>
  );
}
