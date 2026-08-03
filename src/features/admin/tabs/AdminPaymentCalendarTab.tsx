import React from "react";
import { Panel } from "@maxhub/max-ui";
import { useAdminPaymentCalendar } from "../hooks/useAdminPaymentCalendar";
import { AdminPaymentCalendarToolbar } from "../components/AdminPaymentCalendarToolbar";
import { AdminPaymentCalendarCustomerTable } from "../components/AdminPaymentCalendarCustomerTable";
import { AdminPaymentCalendarConfiguredSection } from "../components/AdminPaymentCalendarConfiguredSection";

type AdminPaymentCalendarTabProps = {
  adminToken: string;
  onError: (msg: string | null) => void;
};

export function AdminPaymentCalendarTab({ adminToken, onError }: AdminPaymentCalendarTabProps) {
  const pc = useAdminPaymentCalendar({ adminToken, onError });

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
      <AdminPaymentCalendarToolbar
        search={pc.search}
        setSearch={pc.setSearch}
        customerLoading={pc.customerLoading}
        fetchCustomers={pc.fetchCustomers}
        loading={pc.loading}
        daysInput={pc.daysInput}
        setDaysInput={pc.setDaysInput}
        saving={pc.saving}
        selectedInns={pc.selectedInns}
        bulkWeekdays={pc.bulkWeekdays}
        customerList={pc.customerList}
        toggleSelectAllInns={pc.toggleSelectAllInns}
        applyBulkDays={pc.applyBulkDays}
        applyBulkWeekdays={pc.applyBulkWeekdays}
        toggleBulkWeekday={pc.toggleBulkWeekday}
      />
      <AdminPaymentCalendarCustomerTable
        customerList={pc.customerList}
        customerListSorted={pc.customerListSorted}
        customerLoading={pc.customerLoading}
        selectedInns={pc.selectedInns}
        savingInn={pc.savingInn}
        sortColumn={pc.sortColumn}
        sortDir={pc.sortDir}
        toggleSort={pc.toggleSort}
        toggleInnSelection={pc.toggleInnSelection}
        saveCustomerDays={pc.saveCustomerDays}
        saveCustomerWeekdays={pc.saveCustomerWeekdays}
      />
      <AdminPaymentCalendarConfiguredSection
        items={pc.items}
        itemsSorted={pc.itemsSorted}
        selectedInns={pc.selectedInns}
        sortColumn={pc.sortColumn}
        sortDir={pc.sortDir}
        toggleSort={pc.toggleSort}
        toggleInnSelection={pc.toggleInnSelection}
        toggleSelectAllInns={pc.toggleSelectAllInns}
      />
    </Panel>
  );
}
