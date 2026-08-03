import React from "react";
import { Panel } from "@maxhub/max-ui";
import { useAdminWorkSchedule } from "../hooks/useAdminWorkSchedule";
import { AdminWorkScheduleToolbar } from "../components/AdminWorkScheduleToolbar";
import { AdminWorkScheduleCustomerTable } from "../components/AdminWorkScheduleCustomerTable";
import { AdminWorkScheduleConfiguredSection } from "../components/AdminWorkScheduleConfiguredSection";

type AdminWorkScheduleTabProps = {
  adminToken: string;
  onError: (msg: string | null) => void;
};

export function AdminWorkScheduleTab({ adminToken, onError }: AdminWorkScheduleTabProps) {
  const ws = useAdminWorkSchedule({ adminToken, onError });

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
      <AdminWorkScheduleToolbar
        search={ws.search}
        setSearch={ws.setSearch}
        customerLoading={ws.customerLoading}
        fetchCustomers={ws.fetchCustomers}
        loading={ws.loading}
        customerList={ws.customerList}
        selectedInns={ws.selectedInns}
        bulkWeekdays={ws.bulkWeekdays}
        bulkStart={ws.bulkStart}
        setBulkStart={ws.setBulkStart}
        bulkEnd={ws.bulkEnd}
        setBulkEnd={ws.setBulkEnd}
        saving={ws.saving}
        toggleSelectAllInns={ws.toggleSelectAllInns}
        toggleBulkWeekday={ws.toggleBulkWeekday}
        applyBulkSchedule={ws.applyBulkSchedule}
      />
      <AdminWorkScheduleCustomerTable
        customerList={ws.customerList}
        customerListSorted={ws.customerListSorted}
        customerLoading={ws.customerLoading}
        selectedInns={ws.selectedInns}
        savingInn={ws.savingInn}
        toggleInnSelection={ws.toggleInnSelection}
        saveCustomerWeekdays={ws.saveCustomerWeekdays}
        saveCustomerStart={ws.saveCustomerStart}
        saveCustomerEnd={ws.saveCustomerEnd}
      />
      <AdminWorkScheduleConfiguredSection items={ws.items} />
    </Panel>
  );
}
