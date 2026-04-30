import React from "react";
import { Flex, Panel, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { DateText } from "./ui/DateText";
import * as dateUtils from "../lib/dateUtils";
import { useTimesheetFotDashboard } from "../hooks/useTimesheetFotDashboard";

const MONTH_NAMES = dateUtils.MONTH_NAMES;

export function AdminFotDashboardSection({ adminToken }: { adminToken: string }) {
  const {
    period,
    setPeriod,
    dateRange,
    yearOptions,
    loading,
    error,
    companySummary,
    paidWeight,
    costPerKg,
    byDepartment,
  } = useTimesheetFotDashboard({ mode: "admin", adminToken });

  return (
    <Panel className="cargo-card" style={{ marginBottom: "1rem", background: "var(--color-bg-card)", borderRadius: "12px", padding: "1rem 1.25rem" }}>
      <Typography.Headline style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.25rem" }}>ФОТ</Typography.Headline>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        В разрезе стоимости на 1 кг платного веса за выбранный период
      </Typography.Body>
      <Flex align="center" gap="0.5rem" wrap="wrap" style={{ marginTop: "-0.25rem", marginBottom: "0.55rem" }}>
        <select
          className="admin-form-input"
          value={period.month}
          onChange={(e) => {
            const month = Number(e.target.value);
            if (!Number.isFinite(month) || month < 1 || month > 12) return;
            setPeriod((prev) => ({ ...prev, month }));
          }}
          style={{ padding: "0 0.5rem", minWidth: "10rem" }}
          aria-label="Месяц ФОТ"
        >
          {MONTH_NAMES.map((name, idx) => (
            <option key={`admin-fot-month-${idx + 1}`} value={idx + 1}>
              {name.charAt(0).toUpperCase() + name.slice(1)}
            </option>
          ))}
        </select>
        <select
          className="admin-form-input"
          value={period.year}
          onChange={(e) => {
            const year = Number(e.target.value);
            if (!Number.isFinite(year)) return;
            setPeriod((prev) => ({ ...prev, year }));
          }}
          style={{ padding: "0 0.5rem", minWidth: "6.5rem" }}
          aria-label="Год ФОТ"
        >
          {yearOptions.map((year) => (
            <option key={`admin-fot-year-${year}`} value={year}>
              {year}
            </option>
          ))}
        </select>
      </Flex>
      <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginTop: "-0.35rem", marginBottom: "0.75rem" }}>
        Расчетный период: <DateText value={dateRange.dateFrom} /> – <DateText value={dateRange.dateTo} />
      </Typography.Body>
      {loading ? (
        <Flex align="center" gap="0.5rem">
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body>Загрузка аналитики табеля...</Typography.Body>
        </Flex>
      ) : error ? (
        <Typography.Body style={{ color: "var(--color-error)" }}>{error}</Typography.Body>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <div>
              <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}>ФОТ</Typography.Body>
              <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.5rem" }}>
                <Typography.Body style={{ fontWeight: 600 }}>{Math.round(companySummary.totalMoney).toLocaleString("ru-RU")} ₽</Typography.Body>
              </div>
            </div>
            <div>
              <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}>Платный вес</Typography.Body>
              <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.5rem" }}>
                <Typography.Body style={{ fontWeight: 600 }}>{Math.round(paidWeight).toLocaleString("ru-RU")} кг</Typography.Body>
              </div>
            </div>
            <div>
              <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}>Стоимость на 1 кг</Typography.Body>
              <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.5rem" }}>
                <Typography.Body style={{ fontWeight: 700, color: "#2563eb" }}>{costPerKg.toFixed(2)} ₽/кг</Typography.Body>
              </div>
            </div>
            <div>
              <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}>Выплаты</Typography.Body>
              <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.5rem" }}>
                <Typography.Body style={{ fontWeight: 600, color: "#065f46" }}>{Math.round(companySummary.totalPaid).toLocaleString("ru-RU")} ₽</Typography.Body>
              </div>
            </div>
            <div>
              <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}>Остаток</Typography.Body>
              <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.5rem" }}>
                <Typography.Body style={{ fontWeight: 700, color: "#b45309" }}>{Math.round(companySummary.totalOutstanding).toLocaleString("ru-RU")} ₽</Typography.Body>
              </div>
            </div>
          </div>
          <Typography.Body style={{ fontSize: "0.78rem", fontWeight: 600, marginTop: "0.75rem", marginBottom: "0.4rem" }}>По подразделениям</Typography.Body>
          {byDepartment.length === 0 ? (
            <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>Нет данных по подразделениям за выбранный период.</Typography.Body>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {byDepartment.map((row) => (
                <div key={`admin-fot-dep-${row.department}`} style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "0.3rem" }}>
                  <Flex align="center" justify="space-between" gap="0.5rem">
                    <Typography.Body style={{ fontSize: "0.8rem", fontWeight: 600 }}>{row.department}</Typography.Body>
                    <Flex align="center" justify="flex-end" gap="0.35rem" wrap="wrap">
                      <span
                        style={{
                          fontSize: "0.74rem",
                          padding: "0.14rem 0.4rem",
                          borderRadius: 999,
                          border: "1px solid #cbd5e1",
                          background: "#f8fafc",
                          color: "#0f172a",
                          fontWeight: 600,
                        }}
                      >
                        {Math.round(row.totalCost).toLocaleString("ru-RU")} ₽
                      </span>
                      <span
                        style={{
                          fontSize: "0.74rem",
                          padding: "0.14rem 0.4rem",
                          borderRadius: 999,
                          border: "1px solid #86efac",
                          background: "#dcfce7",
                          color: "#166534",
                          fontWeight: 600,
                        }}
                      >
                        {Math.round(row.totalPaid || 0).toLocaleString("ru-RU")} ₽
                      </span>
                      <span
                        style={{
                          fontSize: "0.74rem",
                          padding: "0.14rem 0.4rem",
                          borderRadius: 999,
                          border: "1px solid #fcd34d",
                          background: "#fef3c7",
                          color: "#92400e",
                          fontWeight: 700,
                        }}
                      >
                        {Math.round(row.totalOutstanding || 0).toLocaleString("ru-RU")} ₽
                      </span>
                    </Flex>
                  </Flex>
                  <Typography.Body style={{ fontSize: "0.74rem", color: "var(--color-text-secondary)" }}>
                    Сотрудников: {row.employeeCount} · Часы: {Number(row.totalHours.toFixed(1))} · Смены: {row.totalShifts} · Доля:{" "}
                    {row.share.toFixed(1)}% · 1 кг: {row.costPerKg.toFixed(2)} ₽/кг
                  </Typography.Body>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
