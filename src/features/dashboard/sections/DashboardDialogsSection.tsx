import React from "react";
import { FilterDialog } from "../../../components/shared/FilterDialog";
import type { DashboardPageState } from "../../../pages/useDashboardPageState";

type Props = { page: DashboardPageState };

export function DashboardDialogsSection({ page }: Props) {
    return (
        <>
            <FilterDialog
                isOpen={page.isCustomModalOpen}
                onClose={() => page.setIsCustomModalOpen(false)}
                dateFrom={page.customDateFrom}
                dateTo={page.customDateTo}
                onApply={(f, t) => {
                    page.setCustomDateFrom(f);
                    page.setCustomDateTo(t);
                }}
            />
            <FilterDialog
                isOpen={page.isComparePeriodDialogOpen}
                onClose={() => page.setIsComparePeriodDialogOpen(false)}
                title="Период сравнения для динамики"
                dateFrom={page.comparePeriodRange?.dateFrom ?? page.prevRange?.dateFrom ?? page.apiDateRange.dateFrom}
                dateTo={page.comparePeriodRange?.dateTo ?? page.prevRange?.dateTo ?? page.apiDateRange.dateTo}
                onApply={(f, t) => page.setComparePeriodOverride({ dateFrom: f, dateTo: t })}
                onReset={page.comparePeriodOverride && page.prevRange ? () => page.setComparePeriodOverride(null) : undefined}
                resetLabel="Период по умолчанию"
            />
        </>
    );
}
