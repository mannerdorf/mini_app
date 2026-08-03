import React from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import {
  normalizeAccrualType,
  isMarkAccrualType,
  getDayRateByAccrualType,
  normalizeShiftMark,
  parseTimesheetHoursValue,
} from "../types/adminUsers";
import type { AdminTimesheetState } from "../hooks/useAdminTimesheet";

export type AdminTimesheetGroupsPanelProps = {
  isSuperAdmin: boolean;
  ts: AdminTimesheetState;
};

export function AdminTimesheetGroupsPanel({ isSuperAdmin, ts }: AdminTimesheetGroupsPanelProps) {
  const {
    timesheetDays,
    timesheetVisibleGroups,
    timesheetHours,
    setTimesheetHours,
    timesheetPaymentMarks,
    setTimesheetPaymentMarks,
    timesheetShiftRateOverrides,
    setTimesheetShiftRateOverrides,
    timesheetExpandedEmployeeId,
    setTimesheetExpandedEmployeeId,
    timesheetPayoutsByEmployee,
    timesheetPayoutSavingEmployeeId,
    timesheetPayoutEditingId,
    setTimesheetPayoutEditingId,
    timesheetPayoutEditingEmployeeId,
    setTimesheetPayoutEditingEmployeeId,
    timesheetPayoutEditDate,
    setTimesheetPayoutEditDate,
    timesheetPayoutEditAmount,
    setTimesheetPayoutEditAmount,
    timesheetPayoutActionLoadingId,
    timesheetMobilePicker,
    SHIFT_MARK_CODES,
    adminShiftHoldTimerRef,
    adminShiftHoldTriggeredRef,
    setAdminShiftPicker,
    toHalfHourValue,
    timesheetHalfHourOptions,
    getShiftMarkStyle,
    getHourlyCellMark,
    saveTimesheetCell,
    saveTimesheetPaymentMark,
    saveTimesheetShiftRate,
    createTimesheetPayout,
    updateTimesheetPayout,
    deleteTimesheetPayout,
    timesheetDepartmentSummaries,
    timesheetCompanySummary,
  } = ts;

  return (
    <>
      {timesheetDays.length === 0 ? (
        <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
          Выберите месяц для отображения табеля.
        </Typography.Body>
      ) : timesheetVisibleGroups.length === 0 ? (
        <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
          За выбранный период сотрудники не найдены.
        </Typography.Body>
      ) : (
        <div className="timesheet-groups-wrap" style={{ display: "flex", flexDirection: "column", gap: "0.9rem", width: "100%", paddingRight: "3rem" }}>
          {timesheetVisibleGroups.map((group) => (
            <Panel
              key={`timesheet-group-${group.department}`}
              className="cargo-card timesheet-panel"
              style={{ padding: "0.6rem" }}
            >
              <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
                Подразделение: {group.department}
              </Typography.Body>
              <div
                className="timesheet-table-scroll"
                style={{
                  overflowX: "auto",
                  overflowY: "auto",
                  minWidth: 0,
                  width: "100%",
                  scrollbarGutter: "stable",
                  paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
                  paddingRight: "max(0.5rem, env(safe-area-inset-right))",
                }}
              >
                <table
                  style={{
                    borderCollapse: "collapse",
                    width: "100%",
                    minWidth: `${380 + timesheetDays.length * 52 + SHIFT_MARK_CODES.length * 52}px`,
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "0.35rem 0.45rem", borderBottom: "1px solid var(--color-border)", position: "sticky", top: 0, left: 0, background: "var(--color-bg-card, #fff)", zIndex: 40, minWidth: "15rem", boxShadow: "2px 0 0 var(--color-border)" }}>
                        Сотрудник
                      </th>
                      {timesheetDays.map((d) => (
                        <th
                          key={`timesheet-head-${group.department}-${d.iso}`}
                          style={{
                            position: "sticky",
                            top: 0,
                            zIndex: 20,
                            textAlign: "center",
                            padding: "0.35rem 0.25rem",
                            borderBottom: "1px solid var(--color-border)",
                            minWidth: "3.2rem",
                            background: d.isWeekend ? "var(--color-bg-hover)" : "var(--color-bg-card)",
                          }}
                        >
                          <div style={{ fontSize: "0.76rem", color: d.isWeekend ? "#d93025" : "inherit", fontWeight: d.isWeekend ? 600 : 500 }}>{d.day}</div>
                          <div style={{ fontSize: "0.68rem", color: d.isWeekend ? "#d93025" : "var(--color-text-secondary)" }}>{d.weekdayShort}</div>
                        </th>
                      ))}
                      <th style={{ position: "sticky", top: 0, zIndex: 20, textAlign: "center", padding: "0.35rem 0.45rem", borderBottom: "1px solid var(--color-border)", minWidth: "4rem", background: "var(--color-bg-card)" }}>Итого</th>
                      {SHIFT_MARK_CODES.map((code) => (
                        <th key={`timesheet-legend-head-${code}`} style={{ position: "sticky", top: 0, zIndex: 20, textAlign: "center", padding: "0.35rem 0.25rem", borderBottom: "1px solid var(--color-border)", minWidth: "52px", background: "var(--color-bg-card)" }}>
                          {code}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.employees.map((emp) => {
                      const accrualType = normalizeAccrualType(emp.accrual_type);
                      const isShiftAccrual = accrualType === "shift";
                      const isMarkAccrual = isMarkAccrualType(accrualType);
                      const hourlyRate = Number(emp.accrual_rate ?? 0);
                      const shiftHours = 8;
                      const totalShifts = timesheetDays.reduce((acc, d) => {
                        const key = `${emp.id}__${d.iso}`;
                        const val = timesheetHours[key] || "";
                        return acc + (normalizeShiftMark(val) === "Я" ? 1 : 0);
                      }, 0);
                      const totalHours = isMarkAccrual
                        ? totalShifts * shiftHours
                        : timesheetDays.reduce((acc, d) => {
                            const key = `${emp.id}__${d.iso}`;
                            return acc + parseTimesheetHoursValue(timesheetHours[key] || "");
                          }, 0);
                      const totalMoney = isMarkAccrual
                        ? (isShiftAccrual
                            ? timesheetDays.reduce((acc, d) => {
                                const key = `${emp.id}__${d.iso}`;
                                if (normalizeShiftMark(timesheetHours[key] || "") !== "Я") return acc;
                                const override = Number(timesheetShiftRateOverrides[key]);
                                const dayRate = Number.isFinite(override) ? override : hourlyRate;
                                return acc + dayRate;
                              }, 0)
                            : totalShifts * getDayRateByAccrualType(hourlyRate, accrualType))
                        : totalHours * hourlyRate;
                      const paidShifts = isMarkAccrual
                        ? timesheetDays.reduce((acc, d) => {
                            const key = `${emp.id}__${d.iso}`;
                            if (!timesheetPaymentMarks[key]) return acc;
                            return acc + (normalizeShiftMark(timesheetHours[key] || "") === "Я" ? 1 : 0);
                          }, 0)
                        : 0;
                      const paidHours = isMarkAccrual
                        ? paidShifts * shiftHours
                        : timesheetDays.reduce((acc, d) => {
                            const key = `${emp.id}__${d.iso}`;
                            if (!timesheetPaymentMarks[key]) return acc;
                            return acc + parseTimesheetHoursValue(timesheetHours[key] || "");
                          }, 0);
                      const totalMoneyToPay = isMarkAccrual
                        ? (isShiftAccrual
                            ? timesheetDays.reduce((acc, d) => {
                                const key = `${emp.id}__${d.iso}`;
                                if (!timesheetPaymentMarks[key]) return acc;
                                if (normalizeShiftMark(timesheetHours[key] || "") !== "Я") return acc;
                                const override = Number(timesheetShiftRateOverrides[key]);
                                const dayRate = Number.isFinite(override) ? override : hourlyRate;
                                return acc + dayRate;
                              }, 0)
                            : paidShifts * getDayRateByAccrualType(hourlyRate, accrualType))
                        : paidHours * hourlyRate;
                      const totalPrimaryText = isMarkAccrual
                        ? `${totalShifts} ${timesheetMobilePicker ? "смены" : "смен"}`
                        : `${Number(totalHours.toFixed(1))} ${timesheetMobilePicker ? "часы" : "ч"}`;
                      const legendCounts = SHIFT_MARK_CODES.reduce<Record<string, number>>((acc, code) => {
                        acc[code] = 0;
                        return acc;
                      }, {});
                      for (const d of timesheetDays) {
                        const key = `${emp.id}__${d.iso}`;
                        const mark = normalizeShiftMark(timesheetHours[key] || "");
                        if (mark) legendCounts[mark] = (legendCounts[mark] || 0) + 1;
                      }
                      const totalColumnCount = 1 + timesheetDays.length + 1 + SHIFT_MARK_CODES.length;
                      const employeePayouts = timesheetPayoutsByEmployee[String(emp.id)] || [];
                      const employeePaidTotal = employeePayouts.reduce((acc, payout) => acc + Number(payout.amount || 0), 0);
                      const employeeOutstanding = Math.max(0, Number((totalMoney - employeePaidTotal).toFixed(2)));
                      const paidDatesSet = new Set(
                        employeePayouts.flatMap((payout) =>
                          Array.isArray(payout.paidDates) ? payout.paidDates : []
                        ),
                      );
                      const showTaxColumns = emp.cooperation_type === "ip" || emp.cooperation_type === "self_employed";
                      const markedDaysCount = timesheetDays.reduce((acc, d) => {
                        const key = `${emp.id}__${d.iso}`;
                        return acc + (timesheetPaymentMarks[key] ? 1 : 0);
                      }, 0);
                      const isPayoutExpanded = timesheetExpandedEmployeeId === emp.id;
                      return (
                        <React.Fragment key={`timesheet-row-wrap-${group.department}-${emp.id}`}>
                        <tr>
                          <td style={{ padding: "0.35rem 0.45rem", borderBottom: "1px solid var(--color-border)", position: "sticky", left: 0, background: "var(--color-bg-card, #fff)", zIndex: 30, minWidth: "15rem", boxShadow: "2px 0 0 var(--color-border)" }}>
                            <Typography.Body
                              style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" }}
                              onClick={() => {
                                setTimesheetExpandedEmployeeId((prev) => (prev === emp.id ? null : emp.id));
                              }}
                            >
                              {emp.full_name || emp.login}
                            </Typography.Body>
                            <Typography.Body style={{ display: "block", fontSize: "0.74rem", color: "var(--color-text-secondary)", marginTop: "0.1rem" }}>{emp.position || "—"}</Typography.Body>
                          </td>
                          {timesheetDays.map((d) => {
                            const key = `${emp.id}__${d.iso}`;
                            const value = (timesheetHours[key] || "").trim().toUpperCase();
                            const fallback = "0";
                            const shiftMark = normalizeShiftMark(value);
                            const shiftMarkStyle = getShiftMarkStyle(shiftMark);
                            const hourlyMark = isMarkAccrual ? shiftMark : getHourlyCellMark(value);
                            const hourlyMarkStyle = getShiftMarkStyle(hourlyMark);
                            const hourInputValue = parseTimesheetHoursValue(value) > 0 ? String(parseTimesheetHoursValue(value)) : "";
                            const hourPickerValue = toHalfHourValue(hourInputValue || fallback);
                            const hourlyHoursEnabled = isMarkAccrual ? false : hourlyMark === "Я";
                            const isMarkedForPayment = timesheetPaymentMarks[key] === true;
                            const isPaidDate = paidDatesSet.has(d.iso);
                            const baseShiftRate = Number(emp.accrual_rate || 0);
                            const overrideShiftRate = Number(timesheetShiftRateOverrides[key]);
                            const hasOverrideShiftRate = Number.isFinite(overrideShiftRate);
                            const effectiveShiftRate = hasOverrideShiftRate ? overrideShiftRate : baseShiftRate;
                            const shiftRateHint = hasOverrideShiftRate
                              ? `База: ${baseShiftRate.toLocaleString("ru-RU")} ₽ · Ручная: ${overrideShiftRate.toLocaleString("ru-RU")} ₽`
                              : `База: ${baseShiftRate.toLocaleString("ru-RU")} ₽`;
                            return (
                              <td
                                key={`timesheet-cell-${emp.id}-${d.iso}`}
                                onClick={() => {
                                  if (!isPayoutExpanded) return;
                                  if (isPaidDate) return;
                                  const nextPaid = !isMarkedForPayment;
                                  setTimesheetPaymentMarks((prev) => ({ ...prev, [key]: nextPaid }));
                                  void saveTimesheetPaymentMark(emp.id, d.iso, nextPaid);
                                }}
                                style={{
                                  padding: isPaidDate ? "0.2rem 0.2rem 0.72rem 0.2rem" : "0.2rem",
                                  borderBottom: "1px solid var(--color-border)",
                                  background: isMarkedForPayment ? "#fff7d6" : (d.isWeekend ? "var(--color-bg-hover)" : "transparent"),
                                  boxShadow: isMarkedForPayment ? "inset 0 0 0 1px #f59e0b" : (isPaidDate ? "inset 0 0 0 1px #16a34a" : undefined),
                                  cursor: isPayoutExpanded ? (isPaidDate ? "not-allowed" : "pointer") : "default",
                                  opacity: isPayoutExpanded && isPaidDate ? 0.9 : 1,
                                }}
                                title={isPaidDate ? "Этот день уже оплачен, повторная оплата запрещена" : undefined}
                              >
                                {isMarkAccrual ? (
                                  <div style={{ display: "grid", justifyItems: "center", rowGap: "0.08rem" }}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isPayoutExpanded || isPaidDate) return;
                                        if (adminShiftHoldTriggeredRef.current) {
                                          adminShiftHoldTriggeredRef.current = false;
                                          return;
                                        }
                                        const nextValue = shiftMark === "Я" ? "" : "Я";
                                        setTimesheetHours((prev) => ({
                                          ...prev,
                                          [key]: nextValue,
                                        }));
                                        if (isShiftAccrual && nextValue !== "Я") {
                                          setTimesheetShiftRateOverrides((prev) => {
                                            const next = { ...prev };
                                            delete next[key];
                                            return next;
                                          });
                                          void saveTimesheetShiftRate(emp.id, d.iso, "");
                                        }
                                        void saveTimesheetCell(emp.id, d.iso, nextValue);
                                      }}
                                      onMouseDown={(e) => {
                                        if (isPayoutExpanded || isPaidDate) return;
                                        if (adminShiftHoldTimerRef.current) window.clearTimeout(adminShiftHoldTimerRef.current);
                                        adminShiftHoldTriggeredRef.current = false;
                                        const { clientX, clientY } = e;
                                        adminShiftHoldTimerRef.current = window.setTimeout(() => {
                                          adminShiftHoldTriggeredRef.current = true;
                                          setAdminShiftPicker({ key, employeeId: emp.id, dateIso: d.iso, x: clientX, y: clientY, isShift: isShiftAccrual });
                                        }, 450);
                                      }}
                                      onMouseUp={() => {
                                        if (isPayoutExpanded || isPaidDate) return;
                                        if (adminShiftHoldTimerRef.current) {
                                          window.clearTimeout(adminShiftHoldTimerRef.current);
                                          adminShiftHoldTimerRef.current = null;
                                        }
                                      }}
                                      onMouseLeave={() => {
                                        if (isPayoutExpanded || isPaidDate) return;
                                        if (adminShiftHoldTimerRef.current) {
                                          window.clearTimeout(adminShiftHoldTimerRef.current);
                                          adminShiftHoldTimerRef.current = null;
                                        }
                                      }}
                                      onTouchStart={(e) => {
                                        if (isPayoutExpanded || isPaidDate) return;
                                        if (adminShiftHoldTimerRef.current) window.clearTimeout(adminShiftHoldTimerRef.current);
                                        adminShiftHoldTriggeredRef.current = false;
                                        const touch = e.touches[0];
                                        adminShiftHoldTimerRef.current = window.setTimeout(() => {
                                          adminShiftHoldTriggeredRef.current = true;
                                          setAdminShiftPicker({ key, employeeId: emp.id, dateIso: d.iso, x: touch.clientX, y: touch.clientY, isShift: isShiftAccrual });
                                        }, 450);
                                      }}
                                      onTouchEnd={() => {
                                        if (isPayoutExpanded || isPaidDate) return;
                                        if (adminShiftHoldTimerRef.current) {
                                          window.clearTimeout(adminShiftHoldTimerRef.current);
                                          adminShiftHoldTimerRef.current = null;
                                        }
                                      }}
                                      className="timesheet-mark-btn"
                                      style={{
                                        width: "2.2rem",
                                        height: "1.6rem",
                                        padding: 0,
                                        textAlign: "center",
                                        margin: "0 auto",
                                        display: "block",
                                        borderRadius: 999,
                                        border: shiftMarkStyle.border,
                                        background: shiftMarkStyle.background,
                                        color: shiftMarkStyle.color,
                                        fontWeight: 600,
                                        lineHeight: "1.6rem",
                                        fontSize: shiftMark ? "0.82rem" : "1rem",
                                        WebkitAppearance: "none",
                                        appearance: "none",
                                        position: "relative",
                                        overflow: "visible",
                                        cursor: isPayoutExpanded || isPaidDate ? "default" : "pointer",
                                        opacity: isPayoutExpanded || isPaidDate ? 0.9 : 1,
                                      }}
                                      aria-label={shiftMark ? `Статус ${shiftMark}. Нажмите для Я/○, удерживайте для выбора` : "Нажмите для Я, удерживайте для выбора статуса"}
                                      title={isPaidDate ? `Этот день уже оплачен. ${shiftRateHint}` : (shiftMark ? `Статус: ${shiftMark}. ${shiftRateHint}` : `Нажмите для Я, удерживайте для выбора. ${shiftRateHint}`)}
                                    >
                                      {shiftMark || "○"}
                                      {isPaidDate ? (
                                        <span
                                          style={{
                                            position: "absolute",
                                            left: "50%",
                                            bottom: "-0.68rem",
                                            transform: "translateX(-50%)",
                                            fontSize: "0.58rem",
                                            fontWeight: 700,
                                            lineHeight: 1,
                                            padding: "0.07rem 0.22rem",
                                            borderRadius: 999,
                                            border: "1px solid #15803d",
                                            color: "#15803d",
                                            background: "#dcfce7",
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          опл
                                        </span>
                                      ) : null}
                                    </button>
                                    {isShiftAccrual && shiftMark === "Я" ? (
                                      <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={
                                          Number.isFinite(timesheetShiftRateOverrides[key])
                                            ? String(timesheetShiftRateOverrides[key])
                                            : ""
                                        }
                                        placeholder={String(Number(emp.accrual_rate || 0))}
                                        disabled={isPayoutExpanded || isPaidDate}
                                        onChange={(e) => {
                                          if (isPayoutExpanded || isPaidDate) return;
                                          const nextRaw = e.target.value;
                                          if (nextRaw.trim() === "") {
                                            setTimesheetShiftRateOverrides((prev) => {
                                              const next = { ...prev };
                                              delete next[key];
                                              return next;
                                            });
                                            void saveTimesheetShiftRate(emp.id, d.iso, "");
                                            return;
                                          }
                                          const parsed = Number(String(nextRaw).replace(",", "."));
                                          if (!Number.isFinite(parsed) || parsed < 0) return;
                                          setTimesheetShiftRateOverrides((prev) => ({
                                            ...prev,
                                            [key]: Number(parsed.toFixed(2)),
                                          }));
                                          void saveTimesheetShiftRate(emp.id, d.iso, String(parsed));
                                        }}
                                        style={{
                                          width: "3.4rem",
                                          minWidth: "3.4rem",
                                          boxSizing: "border-box",
                                          border: "1px solid var(--color-border)",
                                          borderRadius: 6,
                                          background: "var(--color-bg)",
                                          padding: "0.08rem 0.2rem",
                                          textAlign: "center",
                                          fontSize: "0.68rem",
                                          lineHeight: 1.1,
                                        }}
                                        aria-label="Ручная стоимость смены"
                                        title={`Стоимость смены (переопределение). ${shiftRateHint}. Факт: ${effectiveShiftRate.toLocaleString("ru-RU")} ₽`}
                                      />
                                    ) : null}
                                  </div>
                                ) : (
                                  <div style={{ display: "grid", justifyItems: "center", rowGap: "0.08rem" }}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isPayoutExpanded || isPaidDate) return;
                                        if (adminShiftHoldTriggeredRef.current) {
                                          adminShiftHoldTriggeredRef.current = false;
                                          return;
                                        }
                                        const nextMark = hourlyMark === "Я" ? "В" : "Я";
                                        const nextValue = nextMark === "Я" ? (hourInputValue || "Я") : "В";
                                        setTimesheetHours((prev) => ({ ...prev, [key]: nextValue }));
                                        void saveTimesheetCell(emp.id, d.iso, nextValue);
                                      }}
                                      onMouseDown={(e) => {
                                        if (isPayoutExpanded || isPaidDate) return;
                                        if (adminShiftHoldTimerRef.current) window.clearTimeout(adminShiftHoldTimerRef.current);
                                        adminShiftHoldTriggeredRef.current = false;
                                        const { clientX, clientY } = e;
                                        adminShiftHoldTimerRef.current = window.setTimeout(() => {
                                          adminShiftHoldTriggeredRef.current = true;
                                          setAdminShiftPicker({ key, employeeId: emp.id, dateIso: d.iso, x: clientX, y: clientY, isShift: false });
                                        }, 450);
                                      }}
                                      onMouseUp={() => {
                                        if (adminShiftHoldTimerRef.current) {
                                          window.clearTimeout(adminShiftHoldTimerRef.current);
                                          adminShiftHoldTimerRef.current = null;
                                        }
                                      }}
                                      onMouseLeave={() => {
                                        if (adminShiftHoldTimerRef.current) {
                                          window.clearTimeout(adminShiftHoldTimerRef.current);
                                          adminShiftHoldTimerRef.current = null;
                                        }
                                      }}
                                      onTouchStart={(e) => {
                                        if (isPayoutExpanded || isPaidDate) return;
                                        if (adminShiftHoldTimerRef.current) window.clearTimeout(adminShiftHoldTimerRef.current);
                                        adminShiftHoldTriggeredRef.current = false;
                                        const touch = e.touches[0];
                                        adminShiftHoldTimerRef.current = window.setTimeout(() => {
                                          adminShiftHoldTriggeredRef.current = true;
                                          setAdminShiftPicker({ key, employeeId: emp.id, dateIso: d.iso, x: touch.clientX, y: touch.clientY, isShift: false });
                                        }, 450);
                                      }}
                                      onTouchEnd={() => {
                                        if (adminShiftHoldTimerRef.current) {
                                          window.clearTimeout(adminShiftHoldTimerRef.current);
                                          adminShiftHoldTimerRef.current = null;
                                        }
                                      }}
                                      className="timesheet-mark-btn"
                                      style={{
                                        width: "2.2rem",
                                        height: "1.6rem",
                                        padding: 0,
                                        textAlign: "center",
                                        margin: "0 auto",
                                        display: "block",
                                        borderRadius: 999,
                                        border: hourlyMarkStyle.border,
                                        background: hourlyMarkStyle.background,
                                        color: hourlyMarkStyle.color,
                                        fontWeight: 600,
                                        lineHeight: "1.6rem",
                                        fontSize: hourlyMark ? "0.82rem" : "1rem",
                                        WebkitAppearance: "none",
                                        appearance: "none",
                                        position: "relative",
                                        overflow: "visible",
                                        cursor: isPayoutExpanded || isPaidDate ? "default" : "pointer",
                                        opacity: isPayoutExpanded || isPaidDate ? 0.9 : 1,
                                      }}
                                      aria-label={hourlyMark ? `Статус ${hourlyMark}. Нажмите для Я/В, удерживайте для выбора` : "Нажмите для Я, удерживайте для выбора статуса"}
                                    >
                                      {hourlyMark || "В"}
                                      {isPaidDate ? (
                                        <span
                                          style={{
                                            position: "absolute",
                                            left: "50%",
                                            bottom: "-0.68rem",
                                            transform: "translateX(-50%)",
                                            fontSize: "0.58rem",
                                            fontWeight: 700,
                                            lineHeight: 1,
                                            padding: "0.07rem 0.22rem",
                                            borderRadius: 999,
                                            border: "1px solid #15803d",
                                            color: "#15803d",
                                            background: "#dcfce7",
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          опл
                                        </span>
                                      ) : null}
                                    </button>
                                    {timesheetMobilePicker ? (
                                      <select
                                        value={hourPickerValue}
                                        disabled={isPayoutExpanded || isPaidDate || !hourlyHoursEnabled}
                                        onChange={(e) => {
                                          if (isPaidDate || !hourlyHoursEnabled) return;
                                          const nextValue = e.target.value;
                                          setTimesheetHours((prev) => ({ ...prev, [key]: nextValue }));
                                          void saveTimesheetCell(emp.id, d.iso, nextValue);
                                        }}
                                        className="admin-form-input"
                                        style={{ width: "4.3rem", padding: "0 0.2rem", textAlign: "center", margin: "0 auto", display: "block" }}
                                        aria-label="Количество часов за день"
                                      >
                                        {timesheetHalfHourOptions.map((opt) => (
                                          <option key={`${key}-opt-${opt.value}`} value={opt.value}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <input
                                        type="number"
                                        min={0}
                                        max={24}
                                        step={0.5}
                                        value={hourInputValue}
                                        disabled={isPayoutExpanded || isPaidDate || !hourlyHoursEnabled}
                                        onChange={(e) => {
                                          if (isPaidDate || !hourlyHoursEnabled) return;
                                          const raw = e.target.value;
                                          const nextValue = raw.trim() === "" ? "Я" : String(Math.max(0, Math.min(24, Number(raw) || 0)));
                                          setTimesheetHours((prev) => ({ ...prev, [key]: nextValue }));
                                          void saveTimesheetCell(emp.id, d.iso, nextValue);
                                        }}
                                        className="admin-form-input"
                                        style={{ width: "3rem", padding: "0 0.25rem", textAlign: "center", margin: "0 auto" }}
                                      />
                                    )}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                          <td style={{ textAlign: "center", padding: "0.35rem 0.45rem", borderBottom: "1px solid var(--color-border)", fontWeight: 600, minWidth: "7.2rem" }}>
                            <div>{totalPrimaryText}</div>
                            <div style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>
                              {Number(totalMoney.toFixed(2))} ₽
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "#15803d", marginTop: "0.12rem" }}>
                              Остаток: {employeeOutstanding.toLocaleString("ru-RU")} ₽
                            </div>
                          </td>
                          {SHIFT_MARK_CODES.map((code) => (
                            <td key={`${emp.id}-legend-${code}`} style={{ textAlign: "center", padding: "0.35rem 0.25rem", borderBottom: "1px solid var(--color-border)" }}>
                              <Typography.Body style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                                {legendCounts[code] || 0}
                              </Typography.Body>
                            </td>
                          ))}
                        </tr>
                        {timesheetExpandedEmployeeId === emp.id ? (
                          <tr>
                            <td colSpan={totalColumnCount} style={{ padding: "0.55rem", borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
                              <Flex align="center" justify="space-between" wrap="wrap" gap="0.5rem" style={{ marginBottom: "0.45rem" }}>
                                <Typography.Body style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                                  Выплаты сотрудника
                                </Typography.Body>
                                <Flex align="center" gap="0.45rem" wrap="wrap">
                                  <Typography.Body style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>
                                    Дней к выплате: {markedDaysCount} · Сумма: {Number(totalMoneyToPay.toFixed(2)).toLocaleString("ru-RU")} ₽
                                  </Typography.Body>
                                  <Button
                                    type="button"
                                    className="filter-button"
                                    disabled={timesheetPayoutSavingEmployeeId === emp.id || markedDaysCount === 0 || Number(totalMoneyToPay) <= 0}
                                    onClick={() => void createTimesheetPayout(emp.id)}
                                    style={{ padding: "0.35rem 0.6rem" }}
                                  >
                                    {timesheetPayoutSavingEmployeeId === emp.id ? "Выплата..." : "+ Новая выплата"}
                                  </Button>
                                </Flex>
                              </Flex>
                              {employeePayouts.length === 0 ? (
                                <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
                                  Выплат пока нет.
                                </Typography.Body>
                              ) : (
                                <div style={{ overflowX: "auto" }}>
                                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                                    <thead>
                                      <tr>
                                        <th style={{ textAlign: "left", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Дата выплаты</th>
                                        <th style={{ textAlign: "left", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>За период</th>
                                        <th style={{ textAlign: "right", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Сумма</th>
                                        {showTaxColumns ? (
                                          <th style={{ textAlign: "right", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Налог</th>
                                        ) : null}
                                        {showTaxColumns ? (
                                          <th style={{ textAlign: "right", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Сумма с налогом</th>
                                        ) : null}
                                        {isSuperAdmin ? (
                                          <th style={{ textAlign: "right", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Действия</th>
                                        ) : null}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {employeePayouts.map((payout) => {
                                        const isEditing = timesheetPayoutEditingId === payout.id && timesheetPayoutEditingEmployeeId === emp.id;
                                        const isActionLoading = timesheetPayoutActionLoadingId === payout.id;
                                        const editAmountNumber = Number(String(timesheetPayoutEditAmount || "").replace(",", "."));
                                        const previewTax = Number.isFinite(editAmountNumber) && editAmountNumber >= 0
                                          ? ((payout.cooperationType === "ip" || payout.cooperationType === "self_employed")
                                              ? Number((editAmountNumber / 0.94 - editAmountNumber).toFixed(2))
                                              : 0)
                                          : Number(payout.taxAmount || 0);
                                        return (
                                          <tr key={`timesheet-payout-row-${payout.id}`}>
                                            <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>
                                              {isEditing ? (
                                                <input
                                                  type="date"
                                                  className="admin-form-input"
                                                  value={timesheetPayoutEditDate}
                                                  onChange={(e) => setTimesheetPayoutEditDate(e.target.value)}
                                                  style={{ minWidth: "8.6rem", padding: "0.2rem 0.3rem" }}
                                                />
                                              ) : (
                                                payout.payoutDate
                                              )}
                                            </td>
                                            <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>
                                              {payout.periodFrom} — {payout.periodTo}
                                            </td>
                                            <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)", textAlign: "right", fontWeight: 600 }}>
                                              {isEditing ? (
                                                <input
                                                  type="number"
                                                  min={0}
                                                  step={0.01}
                                                  className="admin-form-input"
                                                  value={timesheetPayoutEditAmount}
                                                  onChange={(e) => setTimesheetPayoutEditAmount(e.target.value)}
                                                  style={{ width: "7.2rem", textAlign: "right", padding: "0.2rem 0.3rem" }}
                                                />
                                              ) : (
                                                `${Number(payout.amount || 0).toLocaleString("ru-RU")} ₽`
                                              )}
                                            </td>
                                            {showTaxColumns ? (
                                              <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)", textAlign: "right", fontWeight: 600, color: "#b45309" }}>
                                                {isEditing
                                                  ? `${Number(previewTax || 0).toLocaleString("ru-RU")} ₽`
                                                  : `${Number(payout.taxAmount || 0).toLocaleString("ru-RU")} ₽`}
                                              </td>
                                            ) : null}
                                            {showTaxColumns ? (
                                              <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)", textAlign: "right", fontWeight: 700, color: "#92400e" }}>
                                                {isEditing
                                                  ? `${Number((Number.isFinite(editAmountNumber) ? editAmountNumber + Number(previewTax || 0) : Number(payout.amount || 0) + Number(payout.taxAmount || 0))).toLocaleString("ru-RU")} ₽`
                                                  : `${Number(Number(payout.amount || 0) + Number(payout.taxAmount || 0)).toLocaleString("ru-RU")} ₽`}
                                              </td>
                                            ) : null}
                                            {isSuperAdmin ? (
                                              <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)", textAlign: "right" }}>
                                                {isEditing ? (
                                                  <Flex align="center" justify="flex-end" gap="0.3rem">
                                                    <Button
                                                      type="button"
                                                      className="filter-button"
                                                      disabled={isActionLoading}
                                                      onClick={() => void updateTimesheetPayout(emp.id, payout.id, timesheetPayoutEditDate, timesheetPayoutEditAmount)}
                                                      style={{ padding: "0.2rem 0.45rem" }}
                                                    >
                                                      {isActionLoading ? "Сохранение..." : "Сохранить"}
                                                    </Button>
                                                    <Button
                                                      type="button"
                                                      className="filter-button"
                                                      disabled={isActionLoading}
                                                      onClick={() => {
                                                        setTimesheetPayoutEditingId(null);
                                                        setTimesheetPayoutEditingEmployeeId(null);
                                                        setTimesheetPayoutEditDate("");
                                                        setTimesheetPayoutEditAmount("");
                                                      }}
                                                      style={{ padding: "0.2rem 0.45rem" }}
                                                    >
                                                      Отмена
                                                    </Button>
                                                  </Flex>
                                                ) : (
                                                  <Flex align="center" justify="flex-end" gap="0.3rem">
                                                    <Button
                                                      type="button"
                                                      className="filter-button"
                                                      disabled={timesheetPayoutActionLoadingId !== null}
                                                      onClick={() => {
                                                        setTimesheetPayoutEditingId(payout.id);
                                                        setTimesheetPayoutEditingEmployeeId(emp.id);
                                                        setTimesheetPayoutEditDate(payout.payoutDate || "");
                                                        setTimesheetPayoutEditAmount(String(Number(payout.amount || 0)));
                                                      }}
                                                      style={{ padding: "0.2rem 0.45rem" }}
                                                    >
                                                      Изменить
                                                    </Button>
                                                    <Button
                                                      type="button"
                                                      className="filter-button"
                                                      disabled={timesheetPayoutActionLoadingId !== null}
                                                      onClick={() => void deleteTimesheetPayout(emp.id, payout.id)}
                                                      style={{ padding: "0.2rem 0.45rem", borderColor: "#dc2626", color: "#b91c1c" }}
                                                    >
                                                      Удалить
                                                    </Button>
                                                  </Flex>
                                                )}
                                              </td>
                                            ) : null}
                                          </tr>
                                        );
                                      })}
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
            </Panel>
          ))}
          <Flex align="center" gap="0.5rem" wrap="wrap">
            <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>Я - Явка</Typography.Body>
            <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>ПР - прогул</Typography.Body>
            <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>Б - Болезнь</Typography.Body>
            <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>В - Выходной</Typography.Body>
            <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>ОГ - Отгул</Typography.Body>
            <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>ОТ - отпуск</Typography.Body>
            <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>УВ - Уволен</Typography.Body>
            <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
              Смена: нажмите и удерживайте для выбора статуса
            </Typography.Body>
          </Flex>
          {timesheetDepartmentSummaries.map((row) => (
            <Panel key={`timesheet-summary-${row.department}`} className="cargo-card" style={{ marginTop: "0.65rem", padding: "0.7rem" }}>
              <Typography.Body style={{ fontWeight: 600 }}>
                Итого по подразделению: {row.department} · {row.totalShifts} смен · {row.totalHours} ч
              </Typography.Body>
              <Flex align="center" gap="0.35rem" wrap="wrap" style={{ marginTop: "0.14rem" }}>
                <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a", fontWeight: 600 }}>
                  {row.totalMoney.toLocaleString("ru-RU")} ₽
                </span>
                <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #86efac", background: "#dcfce7", color: "#166534", fontWeight: 600 }}>
                  {row.totalPaid.toLocaleString("ru-RU")} ₽
                </span>
                <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #fcd34d", background: "#fef3c7", color: "#92400e", fontWeight: 700 }}>
                  {row.totalOutstanding.toLocaleString("ru-RU")} ₽
                </span>
              </Flex>
            </Panel>
          ))}
          <Panel className="cargo-card" style={{ marginTop: "0.65rem", padding: "0.7rem" }}>
            <Typography.Body style={{ fontWeight: 600 }}>
              Итого по компании: {timesheetCompanySummary.totalShifts} смен · {timesheetCompanySummary.totalHours} ч
            </Typography.Body>
            <Flex align="center" gap="0.35rem" wrap="wrap" style={{ marginTop: "0.14rem" }}>
              <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a", fontWeight: 600 }}>
                {timesheetCompanySummary.totalMoney.toLocaleString("ru-RU")} ₽
              </span>
              <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #86efac", background: "#dcfce7", color: "#166534", fontWeight: 600 }}>
                {timesheetCompanySummary.totalPaid.toLocaleString("ru-RU")} ₽
              </span>
              <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #fcd34d", background: "#fef3c7", color: "#92400e", fontWeight: 700 }}>
                {timesheetCompanySummary.totalOutstanding.toLocaleString("ru-RU")} ₽
              </span>
            </Flex>
          </Panel>
        </div>
      )}
    </>
  );
}
