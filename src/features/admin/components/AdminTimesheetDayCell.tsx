import React from "react";
import {
  normalizeShiftMark,
  parseTimesheetHoursValue,
  type EmployeeDirectoryRow,
} from "../types/adminUsers";
import type { AdminTimesheetState } from "../hooks/useAdminTimesheet";
import type { TimesheetDayMeta } from "../lib/adminTimesheetHelpers";
import type { TimesheetEmployeeStats } from "../lib/adminTimesheetRowStats";
import { AdminTimesheetPaidBadge } from "./AdminTimesheetPaidBadge";

export type AdminTimesheetDayCellProps = {
  emp: EmployeeDirectoryRow;
  day: TimesheetDayMeta;
  stats: Pick<TimesheetEmployeeStats, "isShiftAccrual" | "isMarkAccrual">;
  isPayoutExpanded: boolean;
  paidDatesSet: Set<string>;
  ts: AdminTimesheetState;
};

export function AdminTimesheetDayCell({
  emp,
  day: d,
  stats,
  isPayoutExpanded,
  paidDatesSet,
  ts,
}: AdminTimesheetDayCellProps) {
  const {
    timesheetHours,
    setTimesheetHours,
    timesheetPaymentMarks,
    setTimesheetPaymentMarks,
    timesheetShiftRateOverrides,
    setTimesheetShiftRateOverrides,
    timesheetMobilePicker,
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
  } = ts;

  const { isShiftAccrual, isMarkAccrual } = stats;
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

  const clearHoldTimer = () => {
    if (adminShiftHoldTimerRef.current) {
      window.clearTimeout(adminShiftHoldTimerRef.current);
      adminShiftHoldTimerRef.current = null;
    }
  };

  const startHoldPicker = (x: number, y: number, isShift: boolean) => {
    if (isPayoutExpanded || isPaidDate) return;
    if (adminShiftHoldTimerRef.current) window.clearTimeout(adminShiftHoldTimerRef.current);
    adminShiftHoldTriggeredRef.current = false;
    adminShiftHoldTimerRef.current = window.setTimeout(() => {
      adminShiftHoldTriggeredRef.current = true;
      setAdminShiftPicker({ key, employeeId: emp.id, dateIso: d.iso, x, y, isShift });
    }, 450);
  };

  const togglePaymentMark = () => {
    if (!isPayoutExpanded || isPaidDate) return;
    const nextPaid = !isMarkedForPayment;
    setTimesheetPaymentMarks((prev) => ({ ...prev, [key]: nextPaid }));
    void saveTimesheetPaymentMark(emp.id, d.iso, nextPaid);
  };

  const cellTitle = isPaidDate
    ? "Этот день уже оплачен, повторная оплата запрещена"
    : isPayoutExpanded
      ? (isMarkedForPayment ? "Нажмите, чтобы снять день с выплаты" : "Нажмите, чтобы добавить день к выплате")
      : undefined;

  return (
    <td
      onClick={togglePaymentMark}
      style={{
        padding: isPaidDate ? "0.2rem 0.2rem 0.72rem 0.2rem" : "0.2rem",
        borderBottom: "1px solid var(--color-border)",
        background: isMarkedForPayment ? "#fff7d6" : (d.isWeekend ? "var(--color-bg-hover)" : "transparent"),
        boxShadow: isMarkedForPayment ? "inset 0 0 0 1px #f59e0b" : (isPaidDate ? "inset 0 0 0 1px #16a34a" : undefined),
        cursor: isPayoutExpanded ? (isPaidDate ? "not-allowed" : "pointer") : "default",
        opacity: isPayoutExpanded && isPaidDate ? 0.9 : 1,
      }}
      title={cellTitle}
    >
      <div style={{ pointerEvents: isPayoutExpanded ? "none" : "auto" }}>
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
              setTimesheetHours((prev) => ({ ...prev, [key]: nextValue }));
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
            onMouseDown={(e) => startHoldPicker(e.clientX, e.clientY, isShiftAccrual)}
            onMouseUp={() => { if (!isPayoutExpanded && !isPaidDate) clearHoldTimer(); }}
            onMouseLeave={() => { if (!isPayoutExpanded && !isPaidDate) clearHoldTimer(); }}
            onTouchStart={(e) => {
              const touch = e.touches[0];
              startHoldPicker(touch.clientX, touch.clientY, isShiftAccrual);
            }}
            onTouchEnd={() => { if (!isPayoutExpanded && !isPaidDate) clearHoldTimer(); }}
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
            {isPaidDate ? <AdminTimesheetPaidBadge /> : null}
          </button>
          {isShiftAccrual && shiftMark === "Я" ? (
            <input
              type="number"
              min={0}
              step={1}
              value={Number.isFinite(timesheetShiftRateOverrides[key]) ? String(timesheetShiftRateOverrides[key]) : ""}
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
            onMouseDown={(e) => startHoldPicker(e.clientX, e.clientY, false)}
            onMouseUp={clearHoldTimer}
            onMouseLeave={clearHoldTimer}
            onTouchStart={(e) => {
              const touch = e.touches[0];
              startHoldPicker(touch.clientX, touch.clientY, false);
            }}
            onTouchEnd={clearHoldTimer}
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
            {isPaidDate ? <AdminTimesheetPaidBadge /> : null}
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
      </div>
    </td>
  );
}
