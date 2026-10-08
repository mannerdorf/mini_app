import React, { useMemo, useState } from 'react';
import { ListDateFilterControl } from '../../../listWorkspace/ListDateFilterControl';
import { normalizeDateFilterState, resolveDateFilterToRange, type DateFilterState } from '../../../../lib/dateUtils';
import { receiptDateLabel } from './planningPickerModel';

export function usePlanningPeriodFilter() {
  const [state, setState] = useState<DateFilterState>(() => normalizeDateFilterState({ dateFilter: 'месяц' }));
  const range = useMemo(() => resolveDateFilterToRange(state.dateFilter, state), [state]);
  const update = <K extends keyof DateFilterState>(key: K) => (value: DateFilterState[K]) => setState(current => ({ ...current, [key]: value }));
  const controls = {
    ...state,
    setDateFilter: update('dateFilter'),
    setCustomDateFrom: update('customDateFrom'),
    setCustomDateTo: update('customDateTo'),
    setSelectedMonthForFilter: update('selectedMonthForFilter'),
    setSelectedQuarterForFilter: update('selectedQuarterForFilter'),
    setSelectedYearForFilter: update('selectedYearForFilter'),
    setSelectedWeekForFilter: update('selectedWeekForFilter'),
  };
  return { state, range, controls };
}

export function PlanningPeriodFilter({ filter }: { filter: ReturnType<typeof usePlanningPeriodFilter> }) {
  return <div className="sending-planning__period-filter">
    <span>Период перевозок</span>
    <ListDateFilterControl {...filter.controls} apiDateRange={filter.range} embedded includeAll showReset={false} label="Период" />
    <small>{filter.state.dateFilter === 'все' ? 'Все даты поступления на склад'
      : `${receiptDateLabel(filter.range.dateFrom)} — ${receiptDateLabel(filter.range.dateTo)}`}</small>
  </div>;
}
