import React from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { AdminExpenseRequestsSection } from "./AdminExpenseRequestsSection";
import { AdminClaimsTab } from "./AdminClaimsTab";
import type { useAdminEmployeeDirectory } from "../hooks/useAdminEmployeeDirectory";
import type { AccountingSubsection, PnlExpensePrefill } from "../types/expenseAccounting";

type EmployeeDir = ReturnType<typeof useAdminEmployeeDirectory>;

export type AdminAccountingTabProps = {
  adminToken: string;
  isSuperAdmin: boolean;
  onLogout?: (reason?: "expired") => void;
  onError: (msg: string | null) => void;
  employeeDir: EmployeeDir;
  accountingSubsection: AccountingSubsection;
  setAccountingSubsection: (next: AccountingSubsection) => void;
  onPnlPrefill: (prefill: PnlExpensePrefill) => void;
  onNavigateToPnl: () => void;
};

export function AdminAccountingTab({
  adminToken,
  isSuperAdmin,
  onError,
  employeeDir,
  accountingSubsection,
  setAccountingSubsection,
  onPnlPrefill,
  onNavigateToPnl,
}: AdminAccountingTabProps) {
  return (
    <>
      <Panel className="cargo-card" style={{ padding: "0.75rem 1rem", marginBottom: "1rem" }}>
        <Typography.Body style={{ fontWeight: 600, marginBottom: "0.55rem" }}>Бухгалтерия — подразделы</Typography.Body>
        <Flex gap="0.5rem" wrap="wrap">
          <Button
            type="button"
            className="filter-button"
            style={{
              background: accountingSubsection === "expense_requests" ? "var(--color-primary-blue)" : undefined,
              color: accountingSubsection === "expense_requests" ? "white" : undefined,
              height: 36,
              padding: "0 0.85rem",
              minWidth: 170,
            }}
            onClick={() => setAccountingSubsection("expense_requests")}
          >
            Заявки на расходы
          </Button>
          <Button
            type="button"
            className="filter-button"
            style={{
              background: accountingSubsection === "sverki" ? "var(--color-primary-blue)" : undefined,
              color: accountingSubsection === "sverki" ? "white" : undefined,
              height: 36,
              padding: "0 0.85rem",
              minWidth: 130,
            }}
            onClick={() => setAccountingSubsection("sverki")}
          >
            Акты сверок
          </Button>
          <Button
            type="button"
            className="filter-button"
            style={{
              background: accountingSubsection === "claims" ? "var(--color-primary-blue)" : undefined,
              color: accountingSubsection === "claims" ? "white" : undefined,
              height: 36,
              padding: "0 0.85rem",
              minWidth: 120,
            }}
            onClick={() => setAccountingSubsection("claims")}
          >
            Претензии
          </Button>
        </Flex>
      </Panel>

      {accountingSubsection !== "claims" && (
        <AdminExpenseRequestsSection
          adminToken={adminToken}
          isSuperAdmin={isSuperAdmin}
          onError={onError}
          mode={accountingSubsection === "sverki" ? "accounting_sverki" : "accounting_expenses"}
          employeeDir={employeeDir}
          onPnlPrefill={onPnlPrefill}
          onNavigateToPnl={onNavigateToPnl}
        />
      )}

      {accountingSubsection === "claims" && (
        <AdminClaimsTab
          adminToken={adminToken}
          isSuperAdmin={isSuperAdmin}
          onError={onError}
          employeeDir={employeeDir}
          variant="accounting"
        />
      )}
    </>
  );
}
