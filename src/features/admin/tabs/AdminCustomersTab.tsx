import React from "react";
import { Panel } from "@maxhub/max-ui";
import { useAdminCustomers } from "../hooks/useAdminCustomers";
import { AdminCustomersToolbar } from "../components/AdminCustomersToolbar";
import { AdminCustomersAutoRegisterPanel } from "../components/AdminCustomersAutoRegisterPanel";
import { AdminCustomersTable } from "../components/AdminCustomersTable";
import type { AdminCustomersTabUser } from "../lib/adminCustomersHelpers";

export type { AdminCustomersTabUser };

type AdminCustomersTabProps = {
  adminToken: string;
  isSuperAdmin: boolean;
  users: AdminCustomersTabUser[];
  onUsersRefresh: () => Promise<void>;
  onError: (msg: string | null) => void;
};

export function AdminCustomersTab(props: AdminCustomersTabProps) {
  const c = useAdminCustomers(props);

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
      <AdminCustomersToolbar
        isSuperAdmin={c.isSuperAdmin}
        search={c.search}
        setSearch={c.setSearch}
        showOnlyWithoutEmail={c.showOnlyWithoutEmail}
        setShowOnlyWithoutEmail={c.setShowOnlyWithoutEmail}
        loading={c.loading}
        list={c.list}
        syncLoading={c.syncLoading}
        syncMessage={c.syncMessage}
        syncDebugRequest={c.syncDebugRequest}
        syncDebugResponse={c.syncDebugResponse}
        refreshList={c.refreshList}
        handleExport={c.handleExport}
        runCacheRefresh={c.runCacheRefresh}
      />
      <AdminCustomersAutoRegisterPanel
        isSuperAdmin={c.isSuperAdmin}
        autoRegisterCandidates={c.autoRegisterCandidates}
        autoRegisterStats={c.autoRegisterStats}
        autoRegisterLoading={c.autoRegisterLoading}
        autoRegisterApplying={c.autoRegisterApplying}
        autoRegisterAutoModeEnabled={c.autoRegisterAutoModeEnabled}
        autoRegisterBatchSize={c.autoRegisterBatchSize}
        setAutoRegisterBatchSize={c.setAutoRegisterBatchSize}
        autoRegisterResult={c.autoRegisterResult}
        refreshAutoRegister={c.refreshAutoRegister}
        runAutoRegisterBatch={c.runAutoRegisterBatch}
      />
      <AdminCustomersTable
        loading={c.loading}
        list={c.list}
        search={c.search}
        showOnlyWithoutEmail={c.showOnlyWithoutEmail}
        sorted={c.sorted}
        sortBy={c.sortBy}
        sortOrder={c.sortOrder}
        toggleSort={c.toggleSort}
        registeringInn={c.registeringInn}
        registerCustomer={c.registerCustomer}
        isCustomerRegistered={c.isCustomerRegistered}
      />
    </Panel>
  );
}
