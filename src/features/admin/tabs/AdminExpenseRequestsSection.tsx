import React from "react";
import { Panel, Typography } from "@maxhub/max-ui";
import type { useAdminEmployeeDirectory } from "../hooks/useAdminEmployeeDirectory";
import { useAdminExpenseRequests } from "../hooks/useAdminExpenseRequests";
import type { AdminExpenseRequestsMode, PnlExpensePrefill } from "../types/expenseAccounting";
import { AdminExpenseSverkiPanel } from "../components/AdminExpenseSverkiPanel";
import { AdminExpenseRequestsTablePanel } from "../components/AdminExpenseRequestsTablePanel";
import { AdminExpenseRequestModals } from "../components/AdminExpenseRequestModals";

type EmployeeDir = ReturnType<typeof useAdminEmployeeDirectory>;

export type AdminExpenseRequestsSectionProps = {
  adminToken: string;
  isSuperAdmin: boolean;
  onError: (msg: string | null) => void;
  mode: AdminExpenseRequestsMode;
  employeeDir: EmployeeDir;
  onPnlPrefill: (prefill: PnlExpensePrefill) => void;
  onNavigateToPnl: () => void;
};

export function AdminExpenseRequestsSection(props: AdminExpenseRequestsSectionProps) {
  const {
    adminToken,
    isSuperAdmin,
    onError,
    mode,
    employeeDir,
    onPnlPrefill,
    onNavigateToPnl,
  } = props;

  const er = useAdminExpenseRequests({
    adminToken,
    isSuperAdmin,
    onError,
    mode,
    employeeDir,
    onPnlPrefill,
    onNavigateToPnl,
  });

  const statusBadge = (s: string) => {
    const m = er.statusBadgeMap[s] ?? er.statusBadgeMap.draft;
    return (
      <span style={{ fontSize: "0.7rem", padding: "0.15rem 0.45rem", borderRadius: 999, fontWeight: 600, background: m.bg, color: m.color, whiteSpace: "nowrap" }}>
        {m.label}
      </span>
    );
  };

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>{er.title}</Typography.Body>
      {er.isAccountingSverki && (
        <AdminExpenseSverkiPanel
          sverkiRequests={er.sverkiRequests}
          sverkiRequestsLoading={er.sverkiRequestsLoading}
          sverkiRequestsUpdatingId={er.sverkiRequestsUpdatingId}
          markSverkiRequestAsSent={er.markSverkiRequestAsSent}
          deleteSverkiRequest={er.deleteSverkiRequest}
        />
      )}
      {!er.isAccountingSverki && (
        <AdminExpenseRequestsTablePanel
          {...er}
          adminToken={adminToken}
          onError={onError}
          statusBadge={statusBadge}
        />
      )}
      <AdminExpenseRequestModals
        {...er}
        adminToken={adminToken}
        employeeDir={employeeDir}
        statusBadge={statusBadge}
      />
    </Panel>
  );
}
