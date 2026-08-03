import React from "react";
import { Typography } from "@maxhub/max-ui";
import { DashboardMotionGroup } from "../features/dashboard";
import { DashboardMotionItem } from "../features/dashboard";
import type { DashboardPageState } from "./useDashboardPageState";
import { DashboardHeaderSection } from "../features/dashboard/sections/DashboardHeaderSection";
import { DashboardStripSection } from "../features/dashboard/sections/DashboardStripSection";
import { DashboardMonitorsSection } from "../features/dashboard/sections/DashboardMonitorsSection";
import { DashboardTrendsSection } from "../features/dashboard/sections/DashboardTrendsSection";
import { DashboardOperationsEarlySection } from "../features/dashboard/sections/DashboardOperationsEarlySection";
import { DashboardOperationsLateSection } from "../features/dashboard/sections/DashboardOperationsLateSection";
import { DashboardLogisticsSection } from "../features/dashboard/sections/DashboardLogisticsSection";
import { DashboardFinanceSection } from "../features/dashboard/sections/DashboardFinanceSection";
import { DashboardClientAnalyticsSection } from "../features/dashboard/sections/DashboardClientAnalyticsSection";
import { DashboardDialogsSection } from "../features/dashboard/sections/DashboardDialogsSection";

export type DashboardPageViewProps = {
    page: DashboardPageState;
};

export function DashboardPageView({ page }: DashboardPageViewProps) {
    if (!page.auth?.login || !page.auth?.password) {
        return (
            <div className="w-full p-4">
                <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Нет доступа к дашборду. Выберите аккаунт в профиле.</Typography.Body>
            </div>
        );
    }

    return (
        <div className={`w-full dashboard-page-offset${page.saasDashboardMotion ? " dashboard-page--saas-analytics" : ""}`} style={{ minWidth: 0, maxWidth: "100%" }}>
            <DashboardHeaderSection page={page} />
            <DashboardMotionGroup enabled={page.dashboardMotionEnabled}>
                <DashboardStripSection page={page} />
                <DashboardMonitorsSection page={page} />
                <DashboardMotionItem enabled={page.dashboardMotionEnabled}>
                    <DashboardTrendsSection page={page} />
                    <DashboardOperationsEarlySection page={page} />
                    <DashboardOperationsLateSection page={page} />
                </DashboardMotionItem>
                <DashboardLogisticsSection page={page} />
                <DashboardMotionItem enabled={page.dashboardMotionEnabled}>
                    <DashboardFinanceSection page={page} />
                    <DashboardClientAnalyticsSection page={page} />
                </DashboardMotionItem>
            </DashboardMotionGroup>
            <DashboardDialogsSection page={page} />
        </div>
    );
}
