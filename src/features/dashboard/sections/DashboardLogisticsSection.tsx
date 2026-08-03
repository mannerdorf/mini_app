import React from "react";
import { DashboardSlaMonitor } from "../widgets/DashboardSlaMonitor";
import { DashboardMotionItem } from "../index";
import type { DashboardPageState } from "../../../pages/useDashboardPageState";

type Props = { page: DashboardPageState };

export function DashboardLogisticsSection({ page }: Props) {
    return (
        <DashboardMotionItem enabled={page.dashboardMotionEnabled}>
{/* === ВИДЖЕТ 4: Монитор SLA            {/* === ВИДЖЕТ 4: Монитор SLA (включить: page.WIDGET_4_SLA = true); в режиме "только SLA" показываем даже при 0 перевозок === */}
                        {page.WIDGET_4_SLA && !page.loading && !page.error && (page.slaStats.total > 0 || page.showOnlySla) && (
                <DashboardSlaMonitor
                    auth={page.auth}
                    useServiceRequest={page.useServiceRequest}
                    chartBarFillEnabled={page.chartBarFillEnabled}
                    slaStats={page.slaStats}
                    slaStatsByType={page.slaStatsByType}
                    slaTrend={page.slaTrend}
                    outOfSlaByType={page.outOfSlaByType}
                    onOpenCargo={page.onOpenCargo}
                    normalizeTimelineErrorMessage={page.normalizeTimelineErrorMessage}
                />
            )}        </DashboardMotionItem>
    );
}
