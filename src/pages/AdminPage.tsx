import React, { useEffect, useRef, useState } from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { ArrowLeft, LogOut } from "lucide-react";
import { PnlSection } from "../pnl/PnlSection";
import { RefSubdivisionsView } from "../pnl/RefSubdivisionsView";
import {
  AdminAuditTab,
  AdminAccountingTab,
  AdminCustomersTab,
  AdminDashboardsPanel,
  AdminDogovorsTab,
  AdminEmployeeDirectoryTab,
  AdminExpenseRequestsTab,
  AdminFerriesTab,
  AdminIntegrationsTab,
  AdminLegalSection,
  AdminLogsTab,
  AdminPaymentCalendarTab,
  AdminPresetsTab,
  AdminPvzTab,
  AdminSuppliersTab,
  AdminSverkiTab,
  AdminTariffsTab,
  AdminTimesheetTab,
  AdminUsersTab,
  AdminWorkScheduleTab,
} from "../features/admin";
import { AdminPageNav } from "../features/admin/components/AdminPageNav";
import { useAdminTab } from "../features/admin/hooks/useAdminTab";
import { useAdminPermissionPresets } from "../features/admin/hooks/useAdminPermissionPresets";
import { useAdminUsers } from "../features/admin/hooks/useAdminUsers";
import { useAdminEmployeeDirectory } from "../features/admin/hooks/useAdminEmployeeDirectory";
import { AdminHaulzCalculatorSection } from "../features/admin/sections/AdminHaulzCalculatorSection";
import { fetchAdminMe } from "../api/client/admin/me";
import type { PnlExpensePrefill } from "../features/admin/types/expenseAccounting";

const ADMIN_THEME_KEY = "admin-theme";

type AdminPageProps = {
  adminToken: string;
  onBack: () => void;
  /** При 401 вызывается как onLogout("expired"), при нажатии «Выход» — onLogout() */
  onLogout?: (reason?: "expired") => void;
};

export function AdminPage({ adminToken, onBack, onLogout }: AdminPageProps) {
  const { tab, setTab } = useAdminTab();
  const [accountingSubsection, setAccountingSubsection] = useState<"expense_requests" | "sverki" | "claims">("expense_requests");
  const [error, setError] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [adminMeLoaded, setAdminMeLoaded] = useState(false);
  const [pnlExpensePrefill, setPnlExpensePrefill] = useState<PnlExpensePrefill | null>(null);

  const { presets: permissionPresets, loading: presetsLoading, reload: fetchPresets } = useAdminPermissionPresets(adminToken);
  const usersState = useAdminUsers(adminToken, permissionPresets, {
    onLogout,
    onError: setError,
    enabled: tab === "users",
  });
  const employeeDir = useAdminEmployeeDirectory(adminToken, isSuperAdmin, {
    onLogout,
    onError: setError,
  });

  const onLogoutRef = useRef(onLogout);
  useEffect(() => {
    onLogoutRef.current = onLogout;
  }, [onLogout]);

  useEffect(() => {
    try {
      localStorage.setItem(ADMIN_THEME_KEY, "light");
    } catch {
      /* ignore */
    }
    const el = typeof document !== "undefined" ? document.body : null;
    if (el) el.classList.add("light-mode");
  }, []);

  useEffect(() => {
    if (!adminToken) {
      setAdminMeLoaded(false);
      return;
    }
    setAdminMeLoaded(false);
    fetchAdminMe(adminToken)
      .then((data) => {
        setIsSuperAdmin(data?.isSuperAdmin === true);
        setAdminMeLoaded(true);
      })
      .catch(() => setAdminMeLoaded(true));
  }, [adminToken]);

  useEffect(() => {
    if (!adminMeLoaded) return;
    if (
      !isSuperAdmin &&
      (tab === "employee_directory" ||
        tab === "subdivisions" ||
        tab === "presets" ||
        tab === "payment_calendar" ||
        tab === "work_schedule" ||
        tab === "timesheet" ||
        tab === "expense_requests" ||
        tab === "accounting" ||
        tab === "claims" ||
        tab === "dashboards" ||
        tab === "pnl")
    ) {
      setTab("users");
    }
    if (isSuperAdmin && tab === "claims") {
      setTab("accounting");
      setAccountingSubsection("claims");
    }
  }, [adminMeLoaded, isSuperAdmin, tab, setTab]);

  useEffect(() => {
    if (tab === "employee_directory" && isSuperAdmin) {
      employeeDir.fetch();
      employeeDir.fetchDepartments();
    }
  }, [tab, isSuperAdmin, employeeDir.fetch, employeeDir.fetchDepartments]);

  return (
    <div className="light-mode w-full admin-page-root admin-page-root--saas-analytics">
      <Flex align="center" justify="space-between" style={{ marginBottom: "1rem", gap: "0.75rem", flexWrap: "wrap" }}>
        <Flex align="center" gap="0.75rem">
          <Button type="button" className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }} aria-label="Назад в приложение">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Typography.Headline style={{ fontSize: "1.25rem" }}>CMS</Typography.Headline>
        </Flex>
        <Flex align="center" gap="0.5rem">
          {onLogout && (
            <Button type="button" className="filter-button" onClick={onLogout} style={{ padding: "0.5rem 0.75rem" }} aria-label="Выйти из админки">
              <LogOut className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
              Выход
            </Button>
          )}
        </Flex>
      </Flex>

      <AdminPageNav
        tab={tab}
        setTab={setTab}
        isSuperAdmin={isSuperAdmin}
        accountingSubsection={accountingSubsection}
        setAccountingSubsection={setAccountingSubsection}
      />

      {error && (
        <Typography.Body style={{ color: "var(--color-error)", marginBottom: "1rem", fontSize: "0.9rem" }}>{error}</Typography.Body>
      )}

      {tab === "users" && (
        <AdminUsersTab
          adminToken={adminToken}
          isSuperAdmin={isSuperAdmin}
          onError={setError}
          permissionPresets={permissionPresets}
          {...usersState}
        />
      )}

      {tab === "customers" && (
        <AdminCustomersTab
          adminToken={adminToken}
          isSuperAdmin={isSuperAdmin}
          users={usersState.users}
          onUsersRefresh={usersState.fetchUsers}
          onError={setError}
        />
      )}

      {tab === "suppliers" && <AdminSuppliersTab adminToken={adminToken} isSuperAdmin={isSuperAdmin} />}
      {tab === "tariffs" && <AdminTariffsTab adminToken={adminToken} />}
      {tab === "sverki" && <AdminSverkiTab adminToken={adminToken} />}
      {tab === "dogovors" && <AdminDogovorsTab adminToken={adminToken} />}
      {tab === "ferries" && <AdminFerriesTab adminToken={adminToken} />}
      {tab === "pvz" && <AdminPvzTab adminToken={adminToken} />}

      {tab === "payment_calendar" && isSuperAdmin && (
        <AdminPaymentCalendarTab adminToken={adminToken} onError={setError} />
      )}

      {tab === "work_schedule" && isSuperAdmin && (
        <AdminWorkScheduleTab adminToken={adminToken} onError={setError} />
      )}

      {tab === "timesheet" && isSuperAdmin && (
        <AdminTimesheetTab
          adminToken={adminToken}
          isSuperAdmin={isSuperAdmin}
          onLogout={onLogout}
          onError={setError}
          employeeDir={employeeDir}
        />
      )}

      {tab === "audit" && <AdminAuditTab adminToken={adminToken} />}
      {tab === "logs" && <AdminLogsTab adminToken={adminToken} />}
      {tab === "integrations" && <AdminIntegrationsTab adminToken={adminToken} />}
      {tab === "legal" && adminToken && <AdminLegalSection adminToken={adminToken} />}

      {tab === "presets" && isSuperAdmin && (
        <AdminPresetsTab
          adminToken={adminToken}
          isSuperAdmin={isSuperAdmin}
          permissionPresets={permissionPresets}
          fetchPresets={fetchPresets}
          presetsLoading={presetsLoading}
        />
      )}

      {tab === "employee_directory" && isSuperAdmin && (
        <AdminEmployeeDirectoryTab adminToken={adminToken} onError={setError} employeeDir={employeeDir} />
      )}

      {tab === "subdivisions" && isSuperAdmin && (
        <div style={{ padding: "var(--pad-card, 1rem)" }}>
          <RefSubdivisionsView />
        </div>
      )}

      {tab === "expense_requests" && isSuperAdmin && (
        <AdminExpenseRequestsTab
          adminToken={adminToken}
          isSuperAdmin={isSuperAdmin}
          onError={setError}
          employeeDir={employeeDir}
          onPnlPrefill={setPnlExpensePrefill}
          onNavigateToPnl={() => setTab("pnl")}
        />
      )}

      {tab === "accounting" && isSuperAdmin && (
        <AdminAccountingTab
          adminToken={adminToken}
          isSuperAdmin={isSuperAdmin}
          onLogout={onLogout}
          onError={setError}
          employeeDir={employeeDir}
          accountingSubsection={accountingSubsection}
          setAccountingSubsection={setAccountingSubsection}
          onPnlPrefill={setPnlExpensePrefill}
          onNavigateToPnl={() => setTab("pnl")}
        />
      )}

      {tab === "dashboards" && isSuperAdmin && <AdminDashboardsPanel adminToken={adminToken} />}

      {tab === "haulz_calculator" && adminToken && <AdminHaulzCalculatorSection adminToken={adminToken} />}

      {tab === "pnl" && isSuperAdmin && (
        <PnlSection
          initialView={pnlExpensePrefill ? "ref-expenses" : "dashboard"}
          expenseCategoryPrefill={pnlExpensePrefill}
        />
      )}
    </div>
  );
}
