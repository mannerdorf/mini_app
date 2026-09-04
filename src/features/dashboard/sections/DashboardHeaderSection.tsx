import React from "react";
import { motion } from "motion/react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { DashboardFiltersBar } from "../widgets/DashboardFiltersBar";
import { HaulzDispatchSummary } from "../../../components/HaulzDispatchSummary";
import { cargoSummaryMotion } from "../../../pages/cargoMotion";
import type { DashboardPageState } from "../../../pages/useDashboardPageState";

type Props = { page: DashboardPageState };

export function DashboardHeaderSection({ page }: Props) {
    return (
        <>
{/* === ВИДЖЕТ 1: Фильтры (включить: page.WIDGET_1_FILTERS = true) === */}
            {page.WIDGET_1_FILTERS && (
            <motion.div {...(page.dashboardMotionEnabled ? cargoSummaryMotion : { initial: false })}>
            <DashboardFiltersBar
                useServiceRequest={page.useServiceRequest}
                dateFilter={page.dateFilter}
                setDateFilter={page.setDateFilter}
                apiDateRange={page.apiDateRange}
                selectedMonthForFilter={page.selectedMonthForFilter}
                setSelectedMonthForFilter={page.setSelectedMonthForFilter}
                selectedQuarterForFilter={page.selectedQuarterForFilter}
                setSelectedQuarterForFilter={page.setSelectedQuarterForFilter}
                selectedYearForFilter={page.selectedYearForFilter}
                setSelectedYearForFilter={page.setSelectedYearForFilter}
                selectedWeekForFilter={page.selectedWeekForFilter}
                setSelectedWeekForFilter={page.setSelectedWeekForFilter}
                customDateFrom={page.customDateFrom}
                setCustomDateFrom={page.setCustomDateFrom}
                customDateTo={page.customDateTo}
                setCustomDateTo={page.setCustomDateTo}
                onOpenCustomPeriod={() => page.setIsCustomModalOpen(true)}
                billStatusFilterSet={page.billStatusFilterSet}
                setBillStatusFilterSet={page.setBillStatusFilterSet}
                typeFilterSet={page.typeFilterSet}
                setTypeFilterSet={page.setTypeFilterSet}
                routeFilterSet={page.routeFilterSet}
                setRouteFilterSet={page.setRouteFilterSet}
                roleFilter={page.roleFilter}
                setRoleFilter={page.setRoleFilter}
            />
            </motion.div>
            )}

            {/* Выдача грузов (HAULZ): сразу под фильтрами — карточки статусов + таблица */}
            {!page.showOnlySla && page.onOpenCargo && (
                <div id="haulz-dispatch-dashboard" style={{ marginBottom: "0.75rem" }}>
                    <HaulzDispatchSummary
                        auth={page.auth}
                        useServiceRequest={page.useServiceRequest}
                        onOpenCargo={page.onOpenCargo}
                        perevozkiItems={page.filteredCargoItems}
                        perevozkiLoading={page.loading}
                        perevozkiError={page.error}
                        perevozkiMutate={page.mutatePerevozki}
                        showSums={page.showSums}
                    />
                </div>
            )}
        </>
    );
}
