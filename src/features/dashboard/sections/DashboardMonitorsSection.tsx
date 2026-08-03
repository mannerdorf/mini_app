import React from "react";
import { EdoHealthMonitor } from "../../../components/EdoHealthMonitor";
import { UnpaidInvoicesPlanMonitor } from "../../../components/UnpaidInvoicesPlanMonitor";
import type { DashboardPageState } from "../../../pages/useDashboardPageState";

type Props = { page: DashboardPageState };

export function DashboardMonitorsSection({ page }: Props) {
    return (
        <>
{!page.showOnlySla && (
                <EdoHealthMonitor
                    invoices={edoMonitorInvoices}
                    loading={monitorInvoicesLoading}
                    onOpen={page.onOpenDocumentsEdo}
                />
            )}

            {!page.showOnlySla && (
                <UnpaidInvoicesPlanMonitor
                    invoices={unpaidPlanMonitorInvoices as Record<string, unknown>[]}
                    cargoItems={unpaidPlanMonitorCargo}
                    loading={unpaidPlanInvoicesLoading}
                    cargoLoading={unpaidPlanCargoLoading}
                    showSums={page.showSums}
                    onOpen={page.onOpenDocumentsInvoices}
                    onOpenInvoice={page.onOpenInvoice}
                />
            )}
        </>
    );
}
