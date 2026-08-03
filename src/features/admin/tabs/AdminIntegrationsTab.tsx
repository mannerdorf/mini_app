import React from "react";
import { AdminUserApiKeysSection } from "../sections/AdminUserApiKeysSection";
import { useAdminIntegrations } from "../hooks/useAdminIntegrations";
import { AdminDocumentCacheBackfillPanel } from "../components/AdminDocumentCacheBackfillPanel";
import { AdminIntegrationHealthPanel } from "../components/AdminIntegrationHealthPanel";
import { AdminZvonobotSandboxPanel } from "../components/AdminZvonobotSandboxPanel";
import { AdminPartnerApiPanel } from "../components/AdminPartnerApiPanel";

export function AdminIntegrationsTab({ adminToken }: { adminToken: string | null }) {
  const state = useAdminIntegrations(adminToken);

  return (
    <>
      <AdminDocumentCacheBackfillPanel
        historyDays={state.historyDays}
        setHistoryDays={state.setHistoryDays}
        stepDays={state.stepDays}
        setStepDays={state.setStepDays}
        maxSteps={state.maxSteps}
        setMaxSteps={state.setMaxSteps}
        backfill={state.backfill}
        backfillLoading={state.backfillLoading}
        backfillRunning={state.backfillRunning}
        backfillError={state.backfillError}
        currentMonthRef={state.currentMonthRef}
        loadBackfillStatus={state.loadBackfillStatus}
        runBackfill={state.runBackfill}
      />
      <AdminIntegrationHealthPanel
        healthDays={state.healthDays}
        setHealthDays={state.setHealthDays}
        healthLoading={state.healthLoading}
        health={state.health}
        refreshHealth={state.refreshHealth}
        sendLkLoading={state.sendLkLoading}
        sendLkResult={state.sendLkResult}
        runSendLkBulkSync={state.runSendLkBulkSync}
      />
      <AdminZvonobotSandboxPanel
        zvonobotConfigured={state.zvonobotConfigured}
        zvonobotKeyHint={state.zvonobotKeyHint}
        zvonobotLoading={state.zvonobotLoading}
        zvonobotError={state.zvonobotError}
        zvonobotResult={state.zvonobotResult}
        zvonobotPhone={state.zvonobotPhone}
        setZvonobotPhone={state.setZvonobotPhone}
        zvonobotOutgoingPhone={state.zvonobotOutgoingPhone}
        setZvonobotOutgoingPhone={state.setZvonobotOutgoingPhone}
        zvonobotRecordId={state.zvonobotRecordId}
        setZvonobotRecordId={state.setZvonobotRecordId}
        zvonobotRecordText={state.zvonobotRecordText}
        setZvonobotRecordText={state.setZvonobotRecordText}
        zvonobotRecordGender={state.zvonobotRecordGender}
        setZvonobotRecordGender={state.setZvonobotRecordGender}
        zvonobotPlannedAt={state.zvonobotPlannedAt}
        setZvonobotPlannedAt={state.setZvonobotPlannedAt}
        zvonobotApiCallIds={state.zvonobotApiCallIds}
        setZvonobotApiCallIds={state.setZvonobotApiCallIds}
        runZvonobotAction={state.runZvonobotAction}
      />
      {adminToken ? <AdminUserApiKeysSection adminToken={adminToken} /> : null}
      <AdminPartnerApiPanel partnerApiHealthJson={state.partnerApiHealthJson} />
    </>
  );
}
