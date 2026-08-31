import React, { useState } from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DateText } from "../../../components/ui/DateText";
import * as dateUtils from "../../../lib/dateUtils";
import { useTimesheetFotDashboard } from "../../../hooks/useTimesheetFotDashboard";
import { useTimesheetFotYearDashboard } from "../../../hooks/useTimesheetFotYearDashboard";
import type { TimesheetFotDepartmentRow } from "../../../lib/timesheetFotAnalytics";

const MONTH_NAMES = dateUtils.MONTH_NAMES;

type FotViewMode = "month" | "year";

function MoneyBadge({
  value,
  border,
  background,
  color,
  weight = 600,
}: {
  value: number;
  border: string;
  background: string;
  color: string;
  weight?: number;
}) {
  return (
    <span
      style={{
        fontSize: "0.74rem",
        padding: "0.14rem 0.4rem",
        borderRadius: 999,
        border,
        background,
        color,
        fontWeight: weight,
      }}
    >
      {Math.round(value).toLocaleString("ru-RU")} ₽
    </span>
  );
}

function DepartmentRow({ row }: { row: TimesheetFotDepartmentRow }) {
  return (
    <div style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "0.3rem" }}>
      <Flex align="center" justify="space-between" gap="0.5rem">
        <Typography.Body style={{ fontSize: "0.8rem", fontWeight: 600 }}>{row.department}</Typography.Body>
        <Flex align="center" justify="flex-end" gap="0.35rem" wrap="wrap">
          <MoneyBadge value={row.totalCost} border="1px solid #cbd5e1" background="#f8fafc" color="#0f172a" />
          <MoneyBadge value={row.totalPaid} border="1px solid #86efac" background="#dcfce7" color="#166534" />
          <MoneyBadge value={row.totalOutstanding} border="1px solid #fcd34d" background="#fef3c7" color="#92400e" weight={700} />
        </Flex>
      </Flex>
      <Typography.Body style={{ fontSize: "0.74rem", color: "var(--color-text-secondary)" }}>
        Сотрудников: {row.employeeCount} · Часы: {Number(row.totalHours.toFixed(1))} · Смены: {row.totalShifts} · Доля:{" "}
        {row.share.toFixed(1)}% · 1 кг: {row.costPerKg.toFixed(2)} ₽/кг
      </Typography.Body>
    </div>
  );
}

function KpiTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}>
        {label}
      </Typography.Body>
      <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.5rem" }}>
        <Typography.Body style={{ fontWeight: accent ? 700 : 600, color: accent }}>{value}</Typography.Body>
      </div>
    </div>
  );
}

function AdminFotMonthView({ adminToken }: { adminToken: string }) {
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

  if (loading) {
    return (
      <Flex align="center" gap="0.5rem">
        <Loader2 className="w-4 h-4 animate-spin" />
        <Typography.Body>Загрузка аналитики табеля...</Typography.Body>
      </Flex>
    );
  }

  if (error) {
    return <Typography.Body style={{ color: "var(--color-error)" }}>{error}</Typography.Body>;
  }

  return (
    <>
      <Flex align="center" gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.55rem" }}>
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
          {yearOptions.map((y) => (
            <option key={`admin-fot-year-${y}`} value={y}>
              {y}
            </option>
          ))}
        </select>
      </Flex>
      <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Расчетный период: <DateText value={dateRange.dateFrom} /> – <DateText value={dateRange.dateTo} />
      </Typography.Body>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <KpiTile label="ФОТ" value={`${Math.round(companySummary.totalMoney).toLocaleString("ru-RU")} ₽`} />
        <KpiTile label="Платный вес" value={`${Math.round(paidWeight).toLocaleString("ru-RU")} кг`} />
        <KpiTile label="Стоимость на 1 кг" value={`${costPerKg.toFixed(2)} ₽/кг`} accent="#2563eb" />
        <KpiTile label="Выплаты" value={`${Math.round(companySummary.totalPaid).toLocaleString("ru-RU")} ₽`} accent="#065f46" />
        <KpiTile label="Остаток" value={`${Math.round(companySummary.totalOutstanding).toLocaleString("ru-RU")} ₽`} accent="#b45309" />
      </div>
      <Typography.Body style={{ fontSize: "0.78rem", fontWeight: 600, marginTop: "0.75rem", marginBottom: "0.4rem" }}>
        По подразделениям
      </Typography.Body>
      {byDepartment.length === 0 ? (
        <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
          Нет данных по подразделениям за выбранный период.
        </Typography.Body>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          {byDepartment.map((row) => (
            <DepartmentRow key={`admin-fot-dep-${row.department}`} row={row} />
          ))}
        </div>
      )}
    </>
  );
}

function AdminFotYearView({ adminToken }: { adminToken: string }) {
  const { year, setYear, yearOptions, monthsInYear, loading, error, yearSummary, chartData, departmentMatrix } =
    useTimesheetFotYearDashboard(adminToken);

  const monthLabels = monthsInYear.map((m) => MONTH_NAMES[m - 1]?.slice(0, 3) ?? String(m));

  if (loading) {
    return (
      <Flex align="center" gap="0.5rem">
        <Loader2 className="w-4 h-4 animate-spin" />
        <Typography.Body>Загрузка годовой аналитики ФОТ...</Typography.Body>
      </Flex>
    );
  }

  if (error) {
    return <Typography.Body style={{ color: "var(--color-error)" }}>{error}</Typography.Body>;
  }

  return (
    <>
      <Flex align="center" gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
        <select
          className="admin-form-input"
          value={year}
          onChange={(e) => {
            const nextYear = Number(e.target.value);
            if (!Number.isFinite(nextYear)) return;
            setYear(nextYear);
          }}
          style={{ padding: "0 0.5rem", minWidth: "6.5rem" }}
          aria-label="Год ФОТ"
        >
          {yearOptions.map((y) => (
            <option key={`admin-fot-year-all-${y}`} value={y}>
              {y}
            </option>
          ))}
        </select>
        <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
          {monthsInYear.length} мес. · платный вес {Math.round(yearSummary.paidWeight).toLocaleString("ru-RU")} кг
        </Typography.Body>
      </Flex>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <KpiTile label="ФОТ за год" value={`${Math.round(yearSummary.totalCost).toLocaleString("ru-RU")} ₽`} />
        <KpiTile label="Средняя стоимость на 1 кг" value={`${yearSummary.costPerKg.toFixed(2)} ₽/кг`} accent="#2563eb" />
        <KpiTile label="Выплаты за год" value={`${Math.round(yearSummary.totalPaid).toLocaleString("ru-RU")} ₽`} accent="#065f46" />
        <KpiTile label="Остаток за год" value={`${Math.round(yearSummary.totalOutstanding).toLocaleString("ru-RU")} ₽`} accent="#b45309" />
      </div>

      {chartData.length > 0 ? (
        <div style={{ marginBottom: "1rem", height: 280 }}>
          <Typography.Body style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.4rem" }}>
            Динамика по месяцам
          </Typography.Body>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="fot" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <YAxis yAxisId="kg" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} ₽`} />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === "costPerKg") return [`${Number(value).toFixed(2)} ₽/кг`, "1 кг"];
                  if (name === "fot") return [`${Math.round(value).toLocaleString("ru-RU")} ₽`, "ФОТ"];
                  return [value, name];
                }}
              />
              <Legend />
              <Line yAxisId="fot" type="monotone" dataKey="fot" name="ФОТ" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
              <Line yAxisId="kg" type="monotone" dataKey="costPerKg" name="1 кг" stroke="#b45309" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <Typography.Body style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.4rem" }}>
        По подразделениям и месяцам
      </Typography.Body>
      {departmentMatrix.length === 0 ? (
        <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
          Нет данных по подразделениям за выбранный год.
        </Typography.Body>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.74rem", minWidth: 720 }}>
            <thead>
              <tr style={{ background: "var(--color-bg-secondary)" }}>
                <th style={{ textAlign: "left", padding: "0.45rem 0.5rem", position: "sticky", left: 0, background: "var(--color-bg-secondary)", zIndex: 1 }}>
                  Подразделение
                </th>
                {monthLabels.map((label, idx) => (
                  <th key={`fot-month-head-${monthsInYear[idx]}`} style={{ textAlign: "right", padding: "0.45rem 0.35rem", whiteSpace: "nowrap" }}>
                    {label}
                  </th>
                ))}
                <th style={{ textAlign: "right", padding: "0.45rem 0.5rem", whiteSpace: "nowrap" }}>Итого</th>
              </tr>
            </thead>
            <tbody>
              {departmentMatrix.map((row) => (
                <tr key={`fot-year-dep-${row.department}`} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.4rem 0.5rem", fontWeight: 600, position: "sticky", left: 0, background: "var(--color-bg-card)", zIndex: 1 }}>
                    {row.department}
                  </td>
                  {monthsInYear.map((month) => {
                    const cell = row.months[month];
                    return (
                      <td key={`fot-cell-${row.department}-${month}`} style={{ padding: "0.35rem", textAlign: "right", verticalAlign: "top" }}>
                        {cell ? (
                          <div>
                            <div style={{ fontWeight: 600 }}>{Math.round(cell.totalCost).toLocaleString("ru-RU")} ₽</div>
                            <div style={{ color: "#2563eb", fontSize: "0.68rem" }}>{cell.costPerKg.toFixed(2)} ₽/кг</div>
                          </div>
                        ) : (
                          <span style={{ color: "var(--color-text-secondary)" }}>—</span>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontWeight: 700 }}>
                    {Math.round(row.yearTotalCost).toLocaleString("ru-RU")} ₽
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function AdminFotDashboardSection({ adminToken }: { adminToken: string }) {
  const [viewMode, setViewMode] = useState<FotViewMode>("year");

  return (
    <Panel className="cargo-card" style={{ marginBottom: "1rem", background: "var(--color-bg-card)", borderRadius: "12px", padding: "1rem 1.25rem" }}>
      <Typography.Headline style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.25rem" }}>ФОТ</Typography.Headline>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Фонд оплаты труда в разрезе подразделений и стоимости на 1 кг платного веса
      </Typography.Body>

      <Flex gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.85rem" }}>
        <Button
          type="button"
          className="filter-button"
          style={{
            background: viewMode === "year" ? "var(--color-primary-blue)" : undefined,
            color: viewMode === "year" ? "white" : undefined,
          }}
          onClick={() => setViewMode("year")}
        >
          По месяцам (год)
        </Button>
        <Button
          type="button"
          className="filter-button"
          style={{
            background: viewMode === "month" ? "var(--color-primary-blue)" : undefined,
            color: viewMode === "month" ? "white" : undefined,
          }}
          onClick={() => setViewMode("month")}
        >
          Один месяц
        </Button>
      </Flex>

      {viewMode === "year" ? <AdminFotYearView adminToken={adminToken} /> : <AdminFotMonthView adminToken={adminToken} />}
    </Panel>
  );
}
