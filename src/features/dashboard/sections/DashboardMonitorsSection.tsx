import React from "react";
import { EdoHealthMonitor } from "../../../components/EdoHealthMonitor";
import { UnpaidInvoicesPlanMonitor } from "../../../components/UnpaidInvoicesPlanMonitor";
import { DASHBOARD_INVOICE_MONITORS_ENABLED } from "../hooks/useDashboardMonitors";
import type { DashboardPageState } from "../../../pages/useDashboardPageState";

type Props = { page: DashboardPageState };

export function DashboardMonitorsSection({ page }: Props) {
    if (!DASHBOARD_INVOICE_MONITORS_ENABLED) return null;

    return (
        <>
            {!page.showOnlySla && (
                <EdoHealthMonitor
                    invoices={page.edoMonitorInvoices}
                    loading={page.monitorInvoicesLoading}
                    onOpen={page.onOpenDocumentsEdo}
                />
            )}

            {!page.showOnlySla && (
                <UnpaidInvoicesPlanMonitor
                    invoices={page.unpaidPlanMonitorInvoices as Record<string, unknown>[]}
                    cargoItems={page.unpaidPlanMonitorCargo}
                    loading={page.unpaidPlanInvoicesLoading}
                    cargoLoading={page.unpaidPlanCargoLoading}
                    showSums={page.showSums}
                    onOpen={page.onOpenDocumentsInvoices}
                    onOpenInvoice={page.onOpenInvoice}
                />
            )}
        </>
    );
}
