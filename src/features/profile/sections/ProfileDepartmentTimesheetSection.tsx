import React from "react";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { Button, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import { getCurrentMonthYm } from "../../../lib/dateUtils";
import type { DepartmentTimesheetState } from "../hooks/useDepartmentTimesheet";
import {
    WORK_DAYS_IN_MONTH,
    SHIFT_MARK_OPTIONS,
    SHIFT_MARK_CODES,
    COOPERATION_TYPE_OPTIONS,
    cooperationTypeLabel,
    normalizeDepartmentAccrualType,
    normalizeShiftMark,
    getShiftMarkStyle,
    isShiftAccrual,
    toHalfHourValue,
    parseHourValue,
    getHourlyCellMark,
} from "../departmentTimesheetHelpers";

type Props = {
    onBack: () => void;
    timesheet: DepartmentTimesheetState;
};

export function ProfileDepartmentTimesheetSection({ onBack, timesheet }: Props) {
    const {
        departmentTimesheetDepartment,
        departmentTimesheetAllDepartments,
        departmentTimesheetDepartmentFilter,
        setDepartmentTimesheetDepartmentFilter,
        departmentTimesheetEmployees,
        departmentTimesheetAvailableEmployees,
        departmentTimesheetSelectedEmployeeId,
        setDepartmentTimesheetSelectedEmployeeId,
        departmentTimesheetLoading,
        departmentTimesheetError,
        setDepartmentTimesheetError,
        departmentTimesheetSearch,
        setDepartmentTimesheetSearch,
        departmentTimesheetManageExpanded,
        setDepartmentTimesheetManageExpanded,
        departmentTimesheetMonth,
        setDepartmentTimesheetMonth,
        departmentTimesheetIsEditableMonth,
        departmentTimesheetHours,
        setDepartmentTimesheetHours,
        departmentTimesheetPayoutsByEmployee,
        departmentTimesheetPaidDayMarks,
        departmentTimesheetPayoutsDetailByEmployee,
        departmentTimesheetExpandedEmployeeId,
        setDepartmentTimesheetExpandedEmployeeId,
        departmentTimesheetShiftRateOverrides,
        setDepartmentTimesheetShiftRateOverrides,
        departmentTimesheetMobilePicker,
        departmentTimesheetWideMode,
        setDepartmentTimesheetWideMode,
        filteredDepartmentTimesheetEmployees,
        departmentTimesheetEmployeeFullName,
        setDepartmentTimesheetEmployeeFullName,
        departmentTimesheetEmployeePosition,
        setDepartmentTimesheetEmployeePosition,
        departmentTimesheetEmployeeAccrualType,
        setDepartmentTimesheetEmployeeAccrualType,
        departmentTimesheetEmployeeAccrualRate,
        setDepartmentTimesheetEmployeeAccrualRate,
        departmentTimesheetEmployeeCooperationType,
        setDepartmentTimesheetEmployeeCooperationType,
        departmentTimesheetEmployeeSaving,
        departmentShiftPicker,
        setDepartmentShiftPicker,
        departmentShiftHoldTimerRef,
        departmentShiftHoldTriggeredRef,
        departmentTimesheetMonthlyEstimate,
        departmentTimesheetHalfHourOptions,
        departmentTimesheetDays,
        departmentTimesheetWeekdayByDay,
        departmentTimesheetDepartmentOptions,
        visibleDepartmentTimesheetSummaries,
        departmentTimesheetContainerStyle,
        fetchDepartmentTimesheet,
        saveDepartmentTimesheetCell,
        saveDepartmentTimesheetShiftRate,
        removeDepartmentEmployeeFromMonth,
        addExistingDepartmentTimesheetEmployee,
        addDepartmentTimesheetEmployee,
    } = timesheet;

    return (
        <div className="w-full" style={departmentTimesheetContainerStyle}>
            <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: '0.5rem' }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline className="text-page-title">Табель учета рабочего времени</Typography.Headline>
                {!departmentTimesheetMobilePicker && (
                    <Button
                        type="button"
                        className="filter-button"
                        onClick={() => setDepartmentTimesheetWideMode((prev) => !prev)}
                        style={{ marginLeft: "auto" }}
                    >
                        {departmentTimesheetWideMode ? "Стандартная ширина" : "Шире экран"}
                    </Button>
                )}
            </Flex>
            <Typography.Body style={{ marginBottom: '0.75rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                Отображаются только сотрудники вашего подразделения HAULZ.
            </Typography.Body>
            <Panel className="cargo-card" style={{ padding: '1rem', marginBottom: '0.75rem' }}>
                <Flex align="center" justify="space-between" wrap="wrap" gap="0.75rem">
                    <Typography.Body style={{ fontWeight: 600 }}>
                        Подразделение: {departmentTimesheetAllDepartments ? "Все подразделения" : (departmentTimesheetDepartment || "—")}
                    </Typography.Body>
                    <Flex align="center" gap="0.5rem">
                        {departmentTimesheetAllDepartments && (
                            <select
                                value={departmentTimesheetDepartmentFilter}
                                onChange={(e) => setDepartmentTimesheetDepartmentFilter(e.target.value)}
                                style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.4rem 0.6rem', background: 'var(--color-bg)', minWidth: '12.5rem' }}
                                aria-label="Фильтр подразделения"
                            >
                                <option value="all">Все подразделения</option>
                                {departmentTimesheetDepartmentOptions.map((dep) => (
                                    <option key={`timesheet-department-filter-${dep}`} value={dep}>
                                        {dep}
                                    </option>
                                ))}
                            </select>
                        )}
                        <input
                            type="month"
                            value={departmentTimesheetMonth}
                            onChange={(e) => setDepartmentTimesheetMonth(e.target.value)}
                            style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.4rem 0.6rem', background: 'var(--color-bg)' }}
                        />
                        <Button
                            type="button"
                            className="filter-button"
                            title="Текущий месяц"
                            style={{ padding: '0.4rem 0.55rem', whiteSpace: 'nowrap' }}
                            onClick={() => setDepartmentTimesheetMonth(getCurrentMonthYm())}
                        >
                            Сегодня
                        </Button>
                        <Button type="button" className="filter-button" onClick={() => void fetchDepartmentTimesheet()}>
                            Обновить
                        </Button>
                    </Flex>
                </Flex>
                <Input
                    type="text"
                    className="admin-form-input"
                    value={departmentTimesheetSearch}
                    onChange={(e) => setDepartmentTimesheetSearch(e.target.value)}
                    placeholder="Поиск по сотруднику: ФИО, должность, логин"
                    style={{ width: "100%", marginTop: "0.55rem", minHeight: "2.4rem", boxSizing: "border-box" }}
                />
                {!departmentTimesheetIsEditableMonth ? (
                    <Typography.Body style={{ marginTop: '0.55rem', fontSize: '0.78rem', color: '#b45309' }}>
                        Редактирование доступно только для текущего, предыдущего месяца и декабря 2025.
                    </Typography.Body>
                ) : null}
            </Panel>
            <Panel className="cargo-card" style={{ padding: '1rem', marginBottom: '0.75rem' }}>
                <Flex align="center" justify="space-between" gap="0.6rem" wrap="wrap">
                    <Typography.Body style={{ fontWeight: 600 }}>Управление сотрудниками табеля</Typography.Body>
                    <Button
                        type="button"
                        className="filter-button"
                        onClick={() => setDepartmentTimesheetManageExpanded((prev) => !prev)}
                        style={{ padding: '0.35rem 0.6rem' }}
                    >
                        {departmentTimesheetManageExpanded ? 'Свернуть' : 'Развернуть'}
                    </Button>
                </Flex>
                {departmentTimesheetManageExpanded ? (
                    <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.75rem' }}>
                        <div>
                            <Typography.Body style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Добавить существующего сотрудника из подразделения</Typography.Body>
                            <Flex align="center" gap="0.5rem" wrap="wrap">
                                <select
                                    value={departmentTimesheetSelectedEmployeeId}
                                    onChange={(e) => { setDepartmentTimesheetSelectedEmployeeId(e.target.value); setDepartmentTimesheetError(null); }}
                                    style={{ padding: '0 0.6rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: '0.9rem', height: '2.4rem', boxSizing: 'border-box', minWidth: '18rem' }}
                                    aria-label="Сотрудник подразделения"
                                >
                                    <option value="">Выберите сотрудника</option>
                                    {departmentTimesheetAvailableEmployees.map((emp) => (
                                        <option key={`existing-dep-emp-${emp.id}`} value={String(emp.id)}>
                                            {(emp.fullName || emp.login) + (emp.position ? ` — ${emp.position}` : "")}
                                        </option>
                                    ))}
                                </select>
                                <Button
                                    type="button"
                                    className="filter-button"
                                    disabled={!departmentTimesheetIsEditableMonth || departmentTimesheetEmployeeSaving || !departmentTimesheetAvailableEmployees.length}
                                    onClick={() => void addExistingDepartmentTimesheetEmployee()}
                                    style={{ height: '2.4rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                                >
                                    {departmentTimesheetEmployeeSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                    Добавить выбранного
                                </Button>
                                {!departmentTimesheetAvailableEmployees.length ? (
                                    <Typography.Body style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>
                                        Нет скрытых сотрудников для этого месяца.
                                    </Typography.Body>
                                ) : null}
                            </Flex>
                        </div>
                        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}>
                            <Typography.Body style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Добавить сотрудника в табель</Typography.Body>
                            <Typography.Body style={{ marginBottom: '0.75rem', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                                Новый сотрудник будет добавлен в ваше подразделение как сотрудник.
                            </Typography.Body>
                            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '0.1rem' }}>
                            <Flex className="form-row-same-height invite-form-row" gap="0.5rem" wrap="nowrap" align="center" style={{ width: 'max-content', minWidth: '100%' }}>
                                <Input
                                    type="text"
                                    placeholder="ФИО"
                                    value={departmentTimesheetEmployeeFullName}
                                    onChange={(e) => { setDepartmentTimesheetEmployeeFullName(e.target.value); setDepartmentTimesheetError(null); }}
                                    style={{ width: '14rem', minWidth: '12rem', height: '2.4rem', boxSizing: 'border-box' }}
                                    className="admin-form-input"
                                />
                                <Input
                                    type="text"
                                    placeholder="Должность"
                                    value={departmentTimesheetEmployeePosition}
                                    onChange={(e) => { setDepartmentTimesheetEmployeePosition(e.target.value); setDepartmentTimesheetError(null); }}
                                    style={{ width: '12rem', minWidth: '10rem', height: '2.4rem', boxSizing: 'border-box' }}
                                    className="admin-form-input"
                                />
                                <select
                                    value={departmentTimesheetEmployeeAccrualType}
                                    onChange={(e) => setDepartmentTimesheetEmployeeAccrualType(normalizeDepartmentAccrualType(e.target.value))}
                                    style={{ padding: '0 0.6rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: '0.9rem', height: '2.4rem', boxSizing: 'border-box', minWidth: '9rem' }}
                                    aria-label="Тип начисления"
                                >
                                    <option value="hour">Почасовая</option>
                                    <option value="shift">Сменная</option>
                                    <option value="month">Месячная (21 раб. дн.)</option>
                                </select>
                                <select
                                    value={departmentTimesheetEmployeeCooperationType}
                                    onChange={(e) => setDepartmentTimesheetEmployeeCooperationType(
                                        e.target.value === "self_employed" || e.target.value === "ip" ? e.target.value : "staff"
                                    )}
                                    style={{ padding: '0 0.6rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: '0.9rem', height: '2.4rem', boxSizing: 'border-box', minWidth: '11rem' }}
                                    aria-label="Тип занятости"
                                >
                                    {COOPERATION_TYPE_OPTIONS.map((opt) => (
                                        <option key={`cooperation-type-${opt.value}`} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                                <Input
                                    type="number"
                                    placeholder="Ставка"
                                    min={0}
                                    step={0.01}
                                    value={departmentTimesheetEmployeeAccrualRate}
                                    onChange={(e) => { setDepartmentTimesheetEmployeeAccrualRate(e.target.value); setDepartmentTimesheetError(null); }}
                                    style={{ width: '5.2rem', minWidth: '4.6rem', height: '2.4rem', boxSizing: 'border-box' }}
                                    className="admin-form-input"
                                />
                                <Button
                                    type="button"
                                    className="filter-button"
                                    disabled={!departmentTimesheetIsEditableMonth || departmentTimesheetEmployeeSaving}
                                    onClick={() => void addDepartmentTimesheetEmployee()}
                                    style={{ height: '2.4rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                                >
                                    {departmentTimesheetEmployeeSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                    Добавить
                                </Button>
                            </Flex>
                            </div>
                            <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.4rem' }}>
                                За {departmentTimesheetEmployeeAccrualType === "month" ? "месяц" : (departmentTimesheetEmployeeAccrualType === 'shift' ? 'смену' : 'час')}: {Number(departmentTimesheetEmployeeAccrualRate || 0).toLocaleString('ru-RU')} ₽ ·
                                За месяц ({WORK_DAYS_IN_MONTH} раб. дн.): {Math.round(departmentTimesheetMonthlyEstimate).toLocaleString('ru-RU')} ₽
                            </Typography.Body>
                        </div>
                    </div>
                ) : null}
            </Panel>
            {departmentTimesheetLoading ? (
                <Flex align="center" gap="0.5rem"><Loader2 className="w-4 h-4 animate-spin" /><Typography.Body>Загрузка...</Typography.Body></Flex>
            ) : departmentTimesheetError ? (
                <Typography.Body style={{ color: 'var(--color-error)' }}>{departmentTimesheetError}</Typography.Body>
            ) : departmentTimesheetEmployees.length === 0 ? (
                <Panel className="cargo-card" style={{ padding: '1rem' }}>
                    <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>В вашем подразделении пока нет сотрудников.</Typography.Body>
                </Panel>
            ) : filteredDepartmentTimesheetEmployees.length === 0 ? (
                <Panel className="cargo-card" style={{ padding: '1rem' }}>
                    <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>По вашему фильтру сотрудники не найдены.</Typography.Body>
                </Panel>
            ) : (
                <>
                <Typography.Body style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: '0.35rem', display: 'block' }}>
                    Нажмите на ФИО сотрудника, чтобы открыть таблицу выплат за выбранный месяц.
                </Typography.Body>
                <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '70vh', WebkitOverflowScrolling: 'touch', paddingLeft: 'max(0.5rem, env(safe-area-inset-left))', paddingRight: 'max(0.5rem, env(safe-area-inset-right))' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${340 + departmentTimesheetDays.length * 44 + SHIFT_MARK_CODES.length * 52}px` }}>
                        <thead>
                            <tr>
                                <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 40, background: 'var(--color-bg-card, #fff)', textAlign: 'left', borderBottom: '1px solid var(--color-border)', padding: '0.5rem', minWidth: '220px', boxShadow: '2px 0 0 var(--color-border)' }}>Сотрудник</th>
                                {departmentTimesheetDays.map((day) => {
                                    const dayMeta = departmentTimesheetWeekdayByDay[day];
                                    const isWeekend = !!dayMeta?.isWeekend;
                                    return (
                                        <th key={day} style={{ position: 'sticky', top: 0, zIndex: 20, textAlign: 'center', borderBottom: '1px solid var(--color-border)', padding: '0.3rem 0.2rem', minWidth: '44px', background: isWeekend ? 'var(--color-bg-hover)' : 'var(--color-bg-card, #fff)' }}>
                                            <div style={{ fontSize: '0.76rem', color: isWeekend ? '#d93025' : 'inherit', fontWeight: isWeekend ? 600 : 500 }}>{day}</div>
                                            <div style={{ fontSize: '0.68rem', color: isWeekend ? '#d93025' : 'var(--color-text-secondary)' }}>{dayMeta?.short || ''}</div>
                                        </th>
                                    );
                                })}
                                <th style={{ position: 'sticky', top: 0, zIndex: 20, textAlign: 'center', borderBottom: '1px solid var(--color-border)', padding: '0.4rem', minWidth: '120px', background: 'var(--color-bg-card, #fff)' }}>Итого</th>
                                {SHIFT_MARK_CODES.map((code) => (
                                    <th key={`legend-col-${code}`} style={{ position: 'sticky', top: 0, zIndex: 20, textAlign: 'center', borderBottom: '1px solid var(--color-border)', padding: '0.35rem 0.25rem', minWidth: '52px', background: 'var(--color-bg-card, #fff)' }}>
                                        {code}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredDepartmentTimesheetEmployees.map((emp) => {
                                const accrualType = normalizeDepartmentAccrualType(emp.accrualType);
                                const isShift = accrualType === "shift";
                                const isMarkAccrualType = accrualType === "shift" || accrualType === "month";
                                const rate = Number(emp.accrualRate ?? 0);
                                const totalShiftCount = departmentTimesheetDays.reduce((acc, day) => {
                                    const key = `${emp.id}:${day}`;
                                    return acc + (normalizeShiftMark(departmentTimesheetHours[key] || '') === 'Я' ? 1 : 0);
                                }, 0);
                                const totalHours = isMarkAccrualType
                                    ? totalShiftCount * 8
                                    : departmentTimesheetDays.reduce((acc, day) => {
                                        const key = `${emp.id}:${day}`;
                                        const value = (departmentTimesheetHours[key] || '').trim().replace(',', '.');
                                        const num = Number(value);
                                        return acc + (Number.isFinite(num) ? num : 0);
                                    }, 0);
                                const totalMoney = isMarkAccrualType
                                    ? departmentTimesheetDays.reduce((acc, day) => {
                                        const key = `${emp.id}:${day}`;
                                        if (normalizeShiftMark(departmentTimesheetHours[key] || '') !== 'Я') return acc;
                                        const override = Number(departmentTimesheetShiftRateOverrides[key]);
                                        const dayRate = isShift
                                            ? (Number.isFinite(override) ? override : rate)
                                            : getDayRateByAccrualType(rate, accrualType);
                                        return acc + dayRate;
                                    }, 0)
                                    : totalHours * rate;
                                const totalPaid = Number(departmentTimesheetPayoutsByEmployee[String(emp.id)] || 0);
                                const totalOutstanding = Math.max(0, Number((totalMoney - totalPaid).toFixed(2)));
                                const totalPrimaryText = isMarkAccrualType
                                    ? `${totalShiftCount} ${departmentTimesheetMobilePicker ? 'смены' : 'смен'}`
                                    : `${Number(totalHours.toFixed(2))} ${departmentTimesheetMobilePicker ? 'часы' : 'ч'}`;
                                const legendCounts = SHIFT_MARK_CODES.reduce<Record<string, number>>((acc, code) => {
                                    acc[code] = 0;
                                    return acc;
                                }, {});
                                for (const day of departmentTimesheetDays) {
                                    const key = `${emp.id}:${day}`;
                                    const mark = normalizeShiftMark(departmentTimesheetHours[key] || '');
                                    if (mark) legendCounts[mark] = (legendCounts[mark] || 0) + 1;
                                }

                                const employeePayouts = departmentTimesheetPayoutsDetailByEmployee[String(emp.id)] || [];
                                const showPayoutTaxColumns = emp.cooperationType === "ip" || emp.cooperationType === "self_employed";
                                const deptTimesheetColSpan = 1 + departmentTimesheetDays.length + 1 + SHIFT_MARK_CODES.length;

                                return (
                                <React.Fragment key={emp.id}>
                                <tr>
                                    <td style={{ position: 'sticky', left: 0, zIndex: 30, minWidth: '220px', background: 'var(--color-bg-card, #fff)', borderBottom: '1px solid var(--color-border)', padding: '0.5rem', boxShadow: '2px 0 0 var(--color-border)' }}>
                                        <Flex align="center" justify="space-between" gap="0.35rem" style={{ alignItems: 'flex-start' }}>
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => setDepartmentTimesheetExpandedEmployeeId((prev) => (prev === emp.id ? null : emp.id))}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" || e.key === " ") {
                                                        e.preventDefault();
                                                        setDepartmentTimesheetExpandedEmployeeId((prev) => (prev === emp.id ? null : emp.id));
                                                    }
                                                }}
                                                style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                                                aria-expanded={departmentTimesheetExpandedEmployeeId === emp.id}
                                            >
                                                <Typography.Body style={{ display: 'block', fontWeight: 600 }}>{emp.fullName || emp.login}</Typography.Body>
                                                <Typography.Body style={{ display: 'block', fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: '0.1rem' }}>
                                                    {cooperationTypeLabel(emp.cooperationType)}
                                                </Typography.Body>
                                                {emp.position ? (
                                                    <Typography.Body style={{ display: 'block', fontSize: '0.74rem', color: 'var(--color-text-secondary)', marginTop: '0.06rem' }}>
                                                        {emp.position}
                                                    </Typography.Body>
                                                ) : null}
                                                <Typography.Body style={{ display: 'block', fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>
                                                    {accrualType === "month" ? "Месяц" : (isShift ? 'Смена' : 'Часы')}
                                                </Typography.Body>
                                            </div>
                                            <Button
                                                type="button"
                                                className="filter-button"
                                                disabled={!departmentTimesheetIsEditableMonth}
                                                style={{ padding: '0.25rem' }}
                                                aria-label="Удалить сотрудника из выбранного месяца"
                                                title="Удалить из выбранного месяца"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    void removeDepartmentEmployeeFromMonth(emp.id);
                                                }}
                                            >
                                                <Trash2 className="w-4 h-4" style={{ color: 'var(--color-error)' }} />
                                            </Button>
                                        </Flex>
                                    </td>
                                    {departmentTimesheetDays.map((day) => {
                                        const key = `${emp.id}:${day}`;
                                        const value = departmentTimesheetHours[key] || '';
                                        const isShift = accrualType === "shift";
                                        const isMarkAccrual = accrualType === "shift" || accrualType === "month";
                                        const shiftMark = normalizeShiftMark(value);
                                        const shiftMarkStyle = getShiftMarkStyle(shiftMark);
                                        const hourlyMark = isMarkAccrual ? shiftMark : getHourlyCellMark(value);
                                        const hourlyMarkStyle = getShiftMarkStyle(hourlyMark);
                                        const hourValue = parseHourValue(value);
                                        const hourInputValue = hourValue > 0 ? String(hourValue) : '';
                                        const hourPickerValue = toHalfHourValue(hourInputValue || '0');
                                        const hourlyHoursEnabled = isMarkAccrual ? false : hourlyMark === 'Я';
                                        const isPaidDate = departmentTimesheetPaidDayMarks[key] === true;
                                        const baseShiftRate = Number(emp.accrualRate || 0);
                                        const overrideShiftRate = Number(departmentTimesheetShiftRateOverrides[key]);
                                        const hasOverrideShiftRate = Number.isFinite(overrideShiftRate);
                                        const effectiveShiftRate = hasOverrideShiftRate ? overrideShiftRate : baseShiftRate;
                                        const shiftRateHint = isShift
                                            ? (hasOverrideShiftRate
                                                ? `База: ${baseShiftRate.toLocaleString('ru-RU')} ₽ · Ручная: ${overrideShiftRate.toLocaleString('ru-RU')} ₽`
                                                : `База: ${baseShiftRate.toLocaleString('ru-RU')} ₽`)
                                            : `База за день: ${(baseShiftRate / WORK_DAYS_IN_MONTH).toLocaleString('ru-RU')} ₽`;
                                        return (
                                            <td key={key} style={{ borderBottom: '1px solid var(--color-border)', padding: isPaidDate ? '0.2rem 0.2rem 0.72rem 0.2rem' : '0.2rem' }}>
                                                {isMarkAccrual ? (
                                                    <div style={{ display: 'grid', justifyItems: 'center', rowGap: '0.12rem' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (isPaidDate) return;
                                                                if (!departmentTimesheetIsEditableMonth) return;
                                                                if (departmentShiftHoldTriggeredRef.current) {
                                                                    departmentShiftHoldTriggeredRef.current = false;
                                                                    return;
                                                                }
                                                                const nextValue = shiftMark === 'Я' ? '' : 'Я';
                                                                setDepartmentTimesheetHours((prev) => ({
                                                                    ...prev,
                                                                    [key]: nextValue,
                                                                }));
                                                                if (isShift && nextValue !== 'Я') {
                                                                    setDepartmentTimesheetShiftRateOverrides((prev) => {
                                                                        const next = { ...prev };
                                                                        delete next[key];
                                                                        return next;
                                                                    });
                                                                    void saveDepartmentTimesheetShiftRate(emp.id, day, '');
                                                                }
                                                                void saveDepartmentTimesheetCell(emp.id, day, nextValue);
                                                            }}
                                                            onMouseDown={(e) => {
                                                                if (isPaidDate) return;
                                                                if (!departmentTimesheetIsEditableMonth) return;
                                                                if (departmentShiftHoldTimerRef.current) window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                departmentShiftHoldTriggeredRef.current = false;
                                                                const { clientX, clientY } = e;
                                                                departmentShiftHoldTimerRef.current = window.setTimeout(() => {
                                                                    departmentShiftHoldTriggeredRef.current = true;
                                                                    setDepartmentShiftPicker({ key, employeeId: emp.id, day, x: clientX, y: clientY, isShift });
                                                                }, 450);
                                                            }}
                                                            onMouseUp={() => {
                                                                if (isPaidDate) return;
                                                                if (!departmentTimesheetIsEditableMonth) return;
                                                                if (departmentShiftHoldTimerRef.current) {
                                                                    window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                    departmentShiftHoldTimerRef.current = null;
                                                                }
                                                            }}
                                                            onMouseLeave={() => {
                                                                if (isPaidDate) return;
                                                                if (!departmentTimesheetIsEditableMonth) return;
                                                                if (departmentShiftHoldTimerRef.current) {
                                                                    window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                    departmentShiftHoldTimerRef.current = null;
                                                                }
                                                            }}
                                                            onTouchStart={(e) => {
                                                                if (isPaidDate) return;
                                                                if (!departmentTimesheetIsEditableMonth) return;
                                                                if (departmentShiftHoldTimerRef.current) window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                departmentShiftHoldTriggeredRef.current = false;
                                                                const touch = e.touches[0];
                                                                departmentShiftHoldTimerRef.current = window.setTimeout(() => {
                                                                    departmentShiftHoldTriggeredRef.current = true;
                                                                    setDepartmentShiftPicker({ key, employeeId: emp.id, day, x: touch.clientX, y: touch.clientY, isShift });
                                                                }, 450);
                                                            }}
                                                            onTouchEnd={() => {
                                                                if (isPaidDate) return;
                                                                if (!departmentTimesheetIsEditableMonth) return;
                                                                if (departmentShiftHoldTimerRef.current) {
                                                                    window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                    departmentShiftHoldTimerRef.current = null;
                                                                }
                                                            }}
                                                            style={{
                                                                width: '2.2rem',
                                                                height: '1.6rem',
                                                                minWidth: '2.2rem',
                                                                boxSizing: 'border-box',
                                                                border: shiftMarkStyle.border,
                                                                borderRadius: 999,
                                                                background: shiftMarkStyle.background,
                                                                color: shiftMarkStyle.color,
                                                                padding: 0,
                                                                lineHeight: '1.6rem',
                                                                textAlign: 'center',
                                                                fontWeight: 600,
                                                                fontSize: shiftMark ? '0.82rem' : '1rem',
                                                                WebkitAppearance: 'none',
                                                                appearance: 'none',
                                                                display: 'block',
                                                                margin: '0 auto',
                                                                position: 'relative',
                                                                overflow: 'visible',
                                                                cursor: departmentTimesheetIsEditableMonth && !isPaidDate ? 'pointer' : 'default',
                                                                opacity: departmentTimesheetIsEditableMonth && !isPaidDate ? 1 : 0.85,
                                                            }}
                                                            aria-label={shiftMark ? `Статус ${shiftMark}. Нажмите для Я/○, удерживайте для выбора` : 'Нажмите для Я, удерживайте для выбора статуса'}
                                                            title={isPaidDate ? `Этот день уже оплачен. ${shiftRateHint}` : (shiftMark ? `Статус: ${shiftMark}. ${shiftRateHint}` : `Нажмите для Я, удерживайте для выбора. ${shiftRateHint}`)}
                                                        >
                                                            {shiftMark || '○'}
                                                            {isPaidDate ? (
                                                                <span
                                                                    style={{
                                                                        position: 'absolute',
                                                                        left: '50%',
                                                                        bottom: '-0.68rem',
                                                                        transform: 'translateX(-50%)',
                                                                        fontSize: '0.58rem',
                                                                        fontWeight: 700,
                                                                        lineHeight: 1,
                                                                        padding: '0.07rem 0.22rem',
                                                                        borderRadius: 999,
                                                                        border: '1px solid #15803d',
                                                                        color: '#15803d',
                                                                        background: '#dcfce7',
                                                                        whiteSpace: 'nowrap',
                                                                    }}
                                                                >
                                                                    опл
                                                                </span>
                                                            ) : null}
                                                        </button>
                                                        {isShift && shiftMark === 'Я' ? (
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                step={1}
                                                                value={
                                                                    Number.isFinite(departmentTimesheetShiftRateOverrides[key])
                                                                        ? String(departmentTimesheetShiftRateOverrides[key])
                                                                        : ''
                                                                }
                                                                placeholder={String(Number(emp.accrualRate || 0))}
                                                                disabled={!departmentTimesheetIsEditableMonth || isPaidDate}
                                                                onChange={(e) => {
                                                                    if (isPaidDate || !departmentTimesheetIsEditableMonth) return;
                                                                    const nextRaw = e.target.value;
                                                                    if (nextRaw.trim() === '') {
                                                                        setDepartmentTimesheetShiftRateOverrides((prev) => {
                                                                            const next = { ...prev };
                                                                            delete next[key];
                                                                            return next;
                                                                        });
                                                                        void saveDepartmentTimesheetShiftRate(emp.id, day, '');
                                                                        return;
                                                                    }
                                                                    const parsed = Number(nextRaw);
                                                                    if (!Number.isFinite(parsed) || parsed < 0) return;
                                                                    setDepartmentTimesheetShiftRateOverrides((prev) => ({
                                                                        ...prev,
                                                                        [key]: Number(parsed.toFixed(2)),
                                                                    }));
                                                                    void saveDepartmentTimesheetShiftRate(emp.id, day, String(parsed));
                                                                }}
                                                                style={{
                                                                    width: '3.4rem',
                                                                    minWidth: '3.4rem',
                                                                    boxSizing: 'border-box',
                                                                    border: '1px solid var(--color-border)',
                                                                    borderRadius: 6,
                                                                    background: 'var(--color-bg)',
                                                                    padding: '0.08rem 0.2rem',
                                                                    textAlign: 'center',
                                                                    fontSize: '0.68rem',
                                                                    lineHeight: 1.1,
                                                                }}
                                                                aria-label="Ручная стоимость смены"
                                                                title={`Стоимость смены (переопределение). ${shiftRateHint}. Факт: ${effectiveShiftRate.toLocaleString('ru-RU')} ₽`}
                                                            />
                                                        ) : null}
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'grid', justifyItems: 'center', rowGap: '0.12rem' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (isPaidDate) return;
                                                                if (!departmentTimesheetIsEditableMonth) return;
                                                                if (departmentShiftHoldTriggeredRef.current) {
                                                                    departmentShiftHoldTriggeredRef.current = false;
                                                                    return;
                                                                }
                                                                const nextMark = hourlyMark === 'Я' ? 'В' : 'Я';
                                                                const nextValue = nextMark === 'Я' ? (hourInputValue || 'Я') : 'В';
                                                                setDepartmentTimesheetHours((prev) => ({ ...prev, [key]: nextValue }));
                                                                void saveDepartmentTimesheetCell(emp.id, day, nextValue);
                                                            }}
                                                            onMouseDown={(e) => {
                                                                if (isPaidDate) return;
                                                                if (!departmentTimesheetIsEditableMonth) return;
                                                                if (departmentShiftHoldTimerRef.current) window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                departmentShiftHoldTriggeredRef.current = false;
                                                                const { clientX, clientY } = e;
                                                                departmentShiftHoldTimerRef.current = window.setTimeout(() => {
                                                                    departmentShiftHoldTriggeredRef.current = true;
                                                                    setDepartmentShiftPicker({ key, employeeId: emp.id, day, x: clientX, y: clientY, isShift: false });
                                                                }, 450);
                                                            }}
                                                            onMouseUp={() => {
                                                                if (departmentShiftHoldTimerRef.current) {
                                                                    window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                    departmentShiftHoldTimerRef.current = null;
                                                                }
                                                            }}
                                                            onMouseLeave={() => {
                                                                if (departmentShiftHoldTimerRef.current) {
                                                                    window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                    departmentShiftHoldTimerRef.current = null;
                                                                }
                                                            }}
                                                            onTouchStart={(e) => {
                                                                if (isPaidDate) return;
                                                                if (!departmentTimesheetIsEditableMonth) return;
                                                                if (departmentShiftHoldTimerRef.current) window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                departmentShiftHoldTriggeredRef.current = false;
                                                                const touch = e.touches[0];
                                                                departmentShiftHoldTimerRef.current = window.setTimeout(() => {
                                                                    departmentShiftHoldTriggeredRef.current = true;
                                                                    setDepartmentShiftPicker({ key, employeeId: emp.id, day, x: touch.clientX, y: touch.clientY, isShift: false });
                                                                }, 450);
                                                            }}
                                                            onTouchEnd={() => {
                                                                if (departmentShiftHoldTimerRef.current) {
                                                                    window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                    departmentShiftHoldTimerRef.current = null;
                                                                }
                                                            }}
                                                            style={{
                                                                width: '2.2rem',
                                                                height: '1.6rem',
                                                                minWidth: '2.2rem',
                                                                boxSizing: 'border-box',
                                                                border: hourlyMarkStyle.border,
                                                                borderRadius: 999,
                                                                background: hourlyMarkStyle.background,
                                                                color: hourlyMarkStyle.color,
                                                                padding: 0,
                                                                lineHeight: '1.6rem',
                                                                textAlign: 'center',
                                                                fontWeight: 600,
                                                                fontSize: hourlyMark ? '0.82rem' : '1rem',
                                                                WebkitAppearance: 'none',
                                                                appearance: 'none',
                                                                display: 'block',
                                                                margin: '0 auto',
                                                                position: 'relative',
                                                                overflow: 'visible',
                                                                cursor: departmentTimesheetIsEditableMonth && !isPaidDate ? 'pointer' : 'default',
                                                                opacity: departmentTimesheetIsEditableMonth && !isPaidDate ? 1 : 0.85,
                                                            }}
                                                            aria-label={hourlyMark ? `Статус ${hourlyMark}. Нажмите для Я/В, удерживайте для выбора` : 'Нажмите для Я, удерживайте для выбора статуса'}
                                                            title={isPaidDate ? 'Этот день уже оплачен' : (hourlyMark ? `Статус: ${hourlyMark}` : 'Сначала отметьте статус')}
                                                        >
                                                            {hourlyMark || 'В'}
                                                            {isPaidDate ? (
                                                                <span
                                                                    style={{
                                                                        position: 'absolute',
                                                                        left: '50%',
                                                                        bottom: '-0.68rem',
                                                                        transform: 'translateX(-50%)',
                                                                        fontSize: '0.58rem',
                                                                        fontWeight: 700,
                                                                        lineHeight: 1,
                                                                        padding: '0.07rem 0.22rem',
                                                                        borderRadius: 999,
                                                                        border: '1px solid #15803d',
                                                                        color: '#15803d',
                                                                        background: '#dcfce7',
                                                                        whiteSpace: 'nowrap',
                                                                    }}
                                                                >
                                                                    опл
                                                                </span>
                                                            ) : null}
                                                        </button>
                                                        {departmentTimesheetMobilePicker ? (
                                                            <select
                                                                value={hourPickerValue}
                                                                disabled={!departmentTimesheetIsEditableMonth || isPaidDate || !hourlyHoursEnabled}
                                                                onChange={(e) => {
                                                                    if (isPaidDate) return;
                                                                    if (!departmentTimesheetIsEditableMonth) return;
                                                                    if (!hourlyHoursEnabled) return;
                                                                    const nextValue = e.target.value;
                                                                    setDepartmentTimesheetHours((prev) => ({ ...prev, [key]: nextValue }));
                                                                    void saveDepartmentTimesheetCell(emp.id, day, nextValue);
                                                                }}
                                                                style={{ width: '4.3rem', minWidth: 36, boxSizing: 'border-box', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-bg)', padding: '0 0.2rem', textAlign: 'center', display: 'block', margin: '0 auto' }}
                                                                aria-label="Количество часов за день"
                                                            >
                                                                {departmentTimesheetHalfHourOptions.map((opt) => (
                                                                    <option key={`${key}-opt-${opt.value}`} value={opt.value}>{opt.label}</option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                max={24}
                                                                step={0.5}
                                                                value={hourInputValue}
                                                                disabled={!departmentTimesheetIsEditableMonth || isPaidDate || !hourlyHoursEnabled}
                                                                onChange={(e) => {
                                                                    if (isPaidDate) return;
                                                                    if (!departmentTimesheetIsEditableMonth) return;
                                                                    if (!hourlyHoursEnabled) return;
                                                                    const nextRaw = e.target.value;
                                                                    const next = nextRaw.replace(/[^0-9.,]/g, '').replace(',', '.');
                                                                    const nextValue = next.trim() === '' ? 'Я' : next;
                                                                    setDepartmentTimesheetHours((prev) => ({ ...prev, [key]: nextValue }));
                                                                    void saveDepartmentTimesheetCell(emp.id, day, nextValue);
                                                                }}
                                                                placeholder="0"
                                                                style={{ width: '100%', minWidth: 36, boxSizing: 'border-box', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-bg)', padding: '0.2rem 0.25rem', textAlign: 'center' }}
                                                            />
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td style={{ borderBottom: '1px solid var(--color-border)', padding: '0.35rem 0.4rem', textAlign: 'center' }}>
                                        <Typography.Body style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', lineHeight: 1.2 }}>
                                            {totalPrimaryText}
                                        </Typography.Body>
                                        <Typography.Body style={{ display: 'block', marginTop: '0.15rem', fontSize: '0.76rem', color: 'var(--color-text-secondary)', lineHeight: 1.2 }}>
                                            {Number(totalMoney.toFixed(2))} ₽
                                        </Typography.Body>
                                        <Typography.Body style={{ display: 'block', marginTop: '0.12rem', fontSize: '0.72rem', color: '#065f46', lineHeight: 1.2 }}>
                                            Выплачено: {Number(totalPaid.toFixed(2)).toLocaleString('ru-RU')} ₽
                                        </Typography.Body>
                                        <Typography.Body style={{ display: 'block', marginTop: '0.08rem', fontSize: '0.72rem', color: '#15803d', lineHeight: 1.2 }}>
                                            Остаток: {Number(totalOutstanding.toFixed(2)).toLocaleString('ru-RU')} ₽
                                        </Typography.Body>
                                    </td>
                                    {SHIFT_MARK_CODES.map((code) => (
                                        <td key={`${emp.id}-legend-${code}`} style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'center', padding: '0.35rem 0.2rem' }}>
                                            <Typography.Body style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                                                {legendCounts[code] || 0}
                                            </Typography.Body>
                                        </td>
                                    ))}
                                </tr>
                                {departmentTimesheetExpandedEmployeeId === emp.id ? (
                                    <tr>
                                        <td
                                            colSpan={deptTimesheetColSpan}
                                            style={{
                                                padding: "0.55rem",
                                                borderBottom: "1px solid var(--color-border)",
                                                background: "var(--color-bg-hover)",
                                            }}
                                        >
                                            <Typography.Body style={{ fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.35rem", display: "block" }}>
                                                Выплаты сотрудника
                                            </Typography.Body>
                                            <Typography.Body style={{ fontSize: "0.74rem", color: "var(--color-text-secondary)", marginBottom: "0.45rem", display: "block" }}>
                                                Просмотр за {departmentTimesheetMonth}. Создание и правка выплат — в админке.
                                            </Typography.Body>
                                            {employeePayouts.length === 0 ? (
                                                <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
                                                    Выплат за этот месяц пока нет.
                                                </Typography.Body>
                                            ) : (
                                                <div style={{ overflowX: "auto" }}>
                                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                                                        <thead>
                                                            <tr>
                                                                <th style={{ textAlign: "left", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Дата выплаты</th>
                                                                <th style={{ textAlign: "left", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>За период</th>
                                                                <th style={{ textAlign: "right", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Сумма</th>
                                                                {showPayoutTaxColumns ? (
                                                                    <th style={{ textAlign: "right", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Налог</th>
                                                                ) : null}
                                                                {showPayoutTaxColumns ? (
                                                                    <th style={{ textAlign: "right", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Сумма с налогом</th>
                                                                ) : null}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {employeePayouts.map((payout) => (
                                                                <tr key={`dept-ts-payout-${emp.id}-${payout.id}`}>
                                                                    <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>{payout.payoutDate}</td>
                                                                    <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>
                                                                        {payout.periodFrom} — {payout.periodTo}
                                                                    </td>
                                                                    <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)", textAlign: "right", fontWeight: 600 }}>
                                                                        {Number(payout.amount || 0).toLocaleString("ru-RU")} ₽
                                                                    </td>
                                                                    {showPayoutTaxColumns ? (
                                                                        <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)", textAlign: "right", color: "#b45309" }}>
                                                                            {Number(payout.taxAmount || 0).toLocaleString("ru-RU")} ₽
                                                                        </td>
                                                                    ) : null}
                                                                    {showPayoutTaxColumns ? (
                                                                        <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)", textAlign: "right", fontWeight: 700, color: "#92400e" }}>
                                                                            {Number(Number(payout.amount || 0) + Number(payout.taxAmount || 0)).toLocaleString("ru-RU")} ₽
                                                                        </td>
                                                                    ) : null}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ) : null}
                                </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <Flex align="center" gap="0.5rem" wrap="wrap" style={{ marginTop: '0.65rem' }}>
                    <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>Я - Явка</Typography.Body>
                    <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>ПР - прогул</Typography.Body>
                    <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>Б - Болезнь</Typography.Body>
                    <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>В - Выходной</Typography.Body>
                    <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>ОГ - Отгул</Typography.Body>
                    <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>ОТ - отпуск</Typography.Body>
                    <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>УВ - Уволен</Typography.Body>
                </Flex>
                {visibleDepartmentTimesheetSummaries.map((summary, idx) => (
                    <Panel key={`department-summary-${summary.departmentName}`} className="cargo-card" style={{ marginTop: idx === 0 ? '0.7rem' : '0.45rem', padding: '0.7rem' }}>
                        <Typography.Body style={{ fontWeight: 600 }}>
                            Итого по подразделению: {summary.departmentName} · {summary.totalShifts} смен · {summary.totalHours} ч
                        </Typography.Body>
                        <Typography.Body style={{ marginTop: '0.12rem', color: 'var(--color-text-secondary)' }}>
                            {summary.totalMoney.toLocaleString('ru-RU')} ₽
                        </Typography.Body>
                        <Typography.Body style={{ marginTop: '0.08rem', color: '#065f46', fontSize: '0.84rem' }}>
                            Выплачено: {summary.totalPaid.toLocaleString('ru-RU')} ₽
                        </Typography.Body>
                        <Typography.Body style={{ marginTop: '0.08rem', color: '#15803d', fontSize: '0.84rem' }}>
                            Остаток: {summary.totalOutstanding.toLocaleString('ru-RU')} ₽
                        </Typography.Body>
                    </Panel>
                ))}
                {activeAccount?.permissions?.analytics === true ? (
                    <Panel className="cargo-card" style={{ marginTop: '0.45rem', padding: '0.7rem' }}>
                        <Typography.Body style={{ fontWeight: 600 }}>
                            {departmentTimesheetAllDepartments && departmentTimesheetDepartmentFilter !== "all"
                                ? `Итого по выбранному подразделению: ${filteredDepartmentTimesheetSummary.totalShifts} смен · ${filteredDepartmentTimesheetSummary.totalHours} ч`
                                : `Итого по компании: ${companyTimesheetSummary.totalShifts} смен · ${companyTimesheetSummary.totalHours} ч`}
                        </Typography.Body>
                        <Typography.Body style={{ marginTop: '0.12rem', color: 'var(--color-text-secondary)' }}>
                            {(departmentTimesheetAllDepartments && departmentTimesheetDepartmentFilter !== "all"
                                ? filteredDepartmentTimesheetSummary.totalMoney
                                : companyTimesheetSummary.totalMoney
                            ).toLocaleString('ru-RU')} ₽
                        </Typography.Body>
                        <Typography.Body style={{ marginTop: '0.08rem', color: '#065f46', fontSize: '0.84rem' }}>
                            Выплачено: {(departmentTimesheetAllDepartments && departmentTimesheetDepartmentFilter !== "all"
                                ? filteredDepartmentTimesheetSummary.totalPaid
                                : companyTimesheetSummary.totalPaid
                            ).toLocaleString('ru-RU')} ₽
                        </Typography.Body>
                        <Typography.Body style={{ marginTop: '0.08rem', color: '#15803d', fontSize: '0.84rem' }}>
                            Остаток: {(departmentTimesheetAllDepartments && departmentTimesheetDepartmentFilter !== "all"
                                ? filteredDepartmentTimesheetSummary.totalOutstanding
                                : companyTimesheetSummary.totalOutstanding
                            ).toLocaleString('ru-RU')} ₽
                        </Typography.Body>
                    </Panel>
                ) : null}
                </>
            )}
            {departmentShiftPicker ? (
                <div
                    style={{ position: 'fixed', inset: 0, zIndex: 10000 }}
                    onClick={() => setDepartmentShiftPicker(null)}
                >
                    <div
                        style={{
                            position: 'fixed',
                            top: typeof window !== 'undefined' ? Math.min(departmentShiftPicker.y + 8, window.innerHeight - 220) : departmentShiftPicker.y + 8,
                            left: typeof window !== 'undefined' ? Math.min(departmentShiftPicker.x - 80, window.innerWidth - 190) : departmentShiftPicker.x - 80,
                            width: 180,
                            background: 'var(--color-bg-card, #fff)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 10,
                            padding: '0.4rem',
                            boxShadow: '0 10px 24px rgba(0,0,0,0.15)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {SHIFT_MARK_OPTIONS.map((opt) => (
                            <button
                                key={`dept-shift-mark-${opt.code}`}
                                type="button"
                                onClick={() => {
                                    const currentValue = departmentTimesheetHours[departmentShiftPicker.key] || '';
                                    const currentHours = parseHourValue(currentValue);
                                    const nextValue = opt.code === 'Я' && !departmentShiftPicker.isShift
                                        ? (currentHours > 0 ? String(currentHours) : 'Я')
                                        : opt.code;
                                    setDepartmentTimesheetHours((prev) => ({ ...prev, [departmentShiftPicker.key]: nextValue }));
                                    if (departmentShiftPicker.isShift && nextValue !== 'Я') {
                                        setDepartmentTimesheetShiftRateOverrides((prev) => {
                                            const next = { ...prev };
                                            delete next[departmentShiftPicker.key];
                                            return next;
                                        });
                                        void saveDepartmentTimesheetShiftRate(departmentShiftPicker.employeeId, departmentShiftPicker.day, '');
                                    }
                                    void saveDepartmentTimesheetCell(departmentShiftPicker.employeeId, departmentShiftPicker.day, nextValue);
                                    setDepartmentShiftPicker(null);
                                }}
                                style={{
                                    width: '100%',
                                    marginBottom: '0.25rem',
                                    padding: '0.35rem 0.5rem',
                                    borderRadius: 8,
                                    border: `1px solid ${opt.border}`,
                                    background: opt.bg,
                                    color: opt.color,
                                    textAlign: 'left',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                {opt.code} - {opt.label}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => {
                                setDepartmentTimesheetHours((prev) => ({ ...prev, [departmentShiftPicker.key]: '' }));
                                if (departmentShiftPicker.isShift) {
                                    setDepartmentTimesheetShiftRateOverrides((prev) => {
                                        const next = { ...prev };
                                        delete next[departmentShiftPicker.key];
                                        return next;
                                    });
                                    void saveDepartmentTimesheetShiftRate(departmentShiftPicker.employeeId, departmentShiftPicker.day, '');
                                }
                                void saveDepartmentTimesheetCell(departmentShiftPicker.employeeId, departmentShiftPicker.day, '');
                                setDepartmentShiftPicker(null);
                            }}
                            style={{
                                width: '100%',
                                padding: '0.3rem 0.5rem',
                                borderRadius: 8,
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-bg)',
                                color: 'var(--color-text-secondary)',
                                textAlign: 'left',
                                cursor: 'pointer',
                            }}
                        >
                            ○ - очистить
                        </button>
                    </div>
                </div>
            ) : null}
        </div>

    );
}
