import { parseTimesheetHoursValue } from "../types/adminUsers";
import type { AdminTimesheetState } from "../hooks/useAdminTimesheet";

export type AdminTimesheetShiftPickerProps = {
  ts: AdminTimesheetState;
};

export function AdminTimesheetShiftPicker({ ts }: AdminTimesheetShiftPickerProps) {
  const {
    adminShiftPicker,
    setAdminShiftPicker,
    SHIFT_MARK_OPTIONS,
    timesheetPaidDateKeys,
    timesheetHours,
    setTimesheetHours,
    setTimesheetShiftRateOverrides,
    saveTimesheetCell,
    saveTimesheetShiftRate,
  } = ts;

  if (!adminShiftPicker) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000 }} onClick={() => setAdminShiftPicker(null)}>
      <div
        style={{
          position: "fixed",
          top: typeof window !== "undefined" ? Math.min(adminShiftPicker.y + 8, window.innerHeight - 220) : adminShiftPicker.y + 8,
          left: typeof window !== "undefined" ? Math.min(adminShiftPicker.x - 80, window.innerWidth - 190) : adminShiftPicker.x - 80,
          width: 180,
          background: "var(--color-bg-card, #fff)",
          border: "1px solid var(--color-border)",
          borderRadius: 10,
          padding: "0.4rem",
          boxShadow: "0 10px 24px rgba(0,0,0,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {SHIFT_MARK_OPTIONS.map((opt) => (
          <button
            key={`admin-shift-mark-${opt.code}`}
            type="button"
            onClick={() => {
              if (timesheetPaidDateKeys.has(adminShiftPicker.key)) return;
              const currentValue = timesheetHours[adminShiftPicker.key] || "";
              const currentHours = parseTimesheetHoursValue(currentValue);
              const nextValue = opt.code === "Я" && !adminShiftPicker.isShift
                ? (currentHours > 0 ? String(currentHours) : "Я")
                : opt.code;
              setTimesheetHours((prev) => ({ ...prev, [adminShiftPicker.key]: nextValue }));
              if (adminShiftPicker.isShift && nextValue !== "Я") {
                setTimesheetShiftRateOverrides((prev) => {
                  const next = { ...prev };
                  delete next[adminShiftPicker.key];
                  return next;
                });
                void saveTimesheetShiftRate(adminShiftPicker.employeeId, adminShiftPicker.dateIso, "");
              }
              void saveTimesheetCell(adminShiftPicker.employeeId, adminShiftPicker.dateIso, nextValue);
              setAdminShiftPicker(null);
            }}
            style={{
              width: "100%",
              marginBottom: "0.25rem",
              padding: "0.35rem 0.5rem",
              borderRadius: 8,
              border: `1px solid ${opt.border}`,
              background: opt.bg,
              color: opt.color,
              textAlign: "left",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {opt.code} - {opt.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            if (timesheetPaidDateKeys.has(adminShiftPicker.key)) return;
            setTimesheetHours((prev) => ({ ...prev, [adminShiftPicker.key]: "" }));
            if (adminShiftPicker.isShift) {
              setTimesheetShiftRateOverrides((prev) => {
                const next = { ...prev };
                delete next[adminShiftPicker.key];
                return next;
              });
              void saveTimesheetShiftRate(adminShiftPicker.employeeId, adminShiftPicker.dateIso, "");
            }
            void saveTimesheetCell(adminShiftPicker.employeeId, adminShiftPicker.dateIso, "");
            setAdminShiftPicker(null);
          }}
          style={{
            width: "100%",
            padding: "0.3rem 0.5rem",
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            background: "var(--color-bg)",
            color: "var(--color-text-secondary)",
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          ○ - очистить
        </button>
      </div>
    </div>
  );
}
