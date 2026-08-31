import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Flex, Panel, Typography } from "@maxhub/max-ui";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { DateText } from "../../../components/ui/DateText";
import * as dateUtils from "../../../lib/dateUtils";
import {
  fetchAdminLastMileReport,
  type LastMileVehicleDayRow,
  type LastMileVehicleReport,
} from "../../../api/client/admin/lastMileReport";

const MONTH_NAMES = dateUtils.MONTH_NAMES;

function formatWorkDuration(row: LastMileVehicleDayRow): string {
  if (row.firstAt && row.lastAt) {
    if (row.workMinutes != null && row.workMinutes > 0) {
      const h = Math.floor(row.workMinutes / 60);
      const m = row.workMinutes % 60;
      return h > 0 ? `${row.firstAt} – ${row.lastAt} (${h} ч ${m} мин)` : `${row.firstAt} – ${row.lastAt} (${m} мин)`;
    }
    return `${row.firstAt} – ${row.lastAt}`;
  }
  return "—";
}

function VehicleDayBlock({ row }: { row: LastMileVehicleDayRow }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "0.45rem" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          border: "none",
          background: "transparent",
          padding: "0.35rem 0",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <Flex align="center" justify="space-between" gap="0.5rem" wrap="wrap">
          <Flex align="center" gap="0.35rem" style={{ minWidth: 0 }}>
            {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
            <div style={{ minWidth: 0 }}>
              <Typography.Body style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                {row.autoReg !== "—" ? row.autoReg : row.vehicleKey}
                {row.autoType !== "—" ? ` · ${row.autoType}` : ""}
              </Typography.Body>
              <Typography.Body style={{ fontSize: "0.74rem", color: "var(--color-text-secondary)" }}>
                {row.driver !== "—" ? row.driver : "Водитель не указан"}
                {row.driverTel !== "—" ? ` · ${row.driverTel}` : ""}
              </Typography.Body>
            </div>
          </Flex>
          <Flex align="center" gap="0.35rem" wrap="wrap" justify="flex-end">
            <span style={{ fontSize: "0.74rem", color: "var(--color-text-secondary)" }}>{formatWorkDuration(row)}</span>
            <span
              style={{
                fontSize: "0.74rem",
                padding: "0.14rem 0.4rem",
                borderRadius: 999,
                border: "1px solid #cbd5e1",
                background: "#f8fafc",
                fontWeight: 600,
              }}
            >
              {row.totals.tripCount} ходок · {Math.round(row.totals.pw).toLocaleString("ru-RU")} кг PW
            </span>
          </Flex>
        </Flex>
      </button>

      {open ? (
        <div style={{ overflowX: "auto", marginTop: "0.35rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.74rem" }}>
            <thead>
              <tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "0.25rem 0.35rem" }}>№ перевозки</th>
                <th style={{ padding: "0.25rem 0.35rem" }}>Получатель</th>
                <th style={{ padding: "0.25rem 0.35rem" }}>Запланирована</th>
                <th style={{ padding: "0.25rem 0.35rem" }}>Доставлена</th>
                <th style={{ padding: "0.25rem 0.35rem", textAlign: "right" }}>PW, кг</th>
                <th style={{ padding: "0.25rem 0.35rem", textAlign: "right" }}>Вес, кг</th>
                <th style={{ padding: "0.25rem 0.35rem", textAlign: "right" }}>Объём, м³</th>
                <th style={{ padding: "0.25rem 0.35rem", textAlign: "right" }}>Мест</th>
              </tr>
            </thead>
            <tbody>
              {row.trips.map((trip) => (
                <tr key={`${row.date}-${row.vehicleKey}-${trip.cargoNumber}`} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.3rem 0.35rem", fontWeight: 600 }}>{trip.cargoNumber}</td>
                  <td style={{ padding: "0.3rem 0.35rem" }}>{trip.receiver}</td>
                  <td style={{ padding: "0.3rem 0.35rem" }}>
                    {trip.scheduledAt ? new Date(trip.scheduledAt).toLocaleString("ru-RU") : "—"}
                  </td>
                  <td style={{ padding: "0.3rem 0.35rem" }}>
                    {trip.deliveredAt ? new Date(trip.deliveredAt).toLocaleString("ru-RU") : "—"}
                  </td>
                  <td style={{ padding: "0.3rem 0.35rem", textAlign: "right" }}>{Math.round(trip.pw).toLocaleString("ru-RU")}</td>
                  <td style={{ padding: "0.25rem 0.35rem", textAlign: "right" }}>{Math.round(trip.weight).toLocaleString("ru-RU")}</td>
                  <td style={{ padding: "0.25rem 0.35rem", textAlign: "right" }}>{trip.volume.toFixed(3)}</td>
                  <td style={{ padding: "0.25rem 0.35rem", textAlign: "right" }}>{Math.round(trip.places)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: "1px solid var(--color-border)", fontWeight: 700 }}>
                <td colSpan={4} style={{ padding: "0.35rem" }}>
                  Итого за день
                </td>
                <td style={{ padding: "0.35rem", textAlign: "right" }}>{Math.round(row.totals.pw).toLocaleString("ru-RU")}</td>
                <td style={{ padding: "0.35rem", textAlign: "right" }}>{Math.round(row.totals.weight).toLocaleString("ru-RU")}</td>
                <td style={{ padding: "0.35rem", textAlign: "right" }}>{row.totals.volume.toFixed(3)}</td>
                <td style={{ padding: "0.35rem", textAlign: "right" }}>{Math.round(row.totals.places)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function AdminLastMileReportSection({ adminToken }: { adminToken: string }) {
  const [period, setPeriod] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() + 1 };
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<LastMileVehicleReport | null>(null);

  const dateRange = useMemo(() => {
    const { year, month } = period;
    const lastDay = new Date(year, month, 0).getDate();
    return {
      dateFrom: `${year}-${String(month).padStart(2, "0")}-01`,
      dateTo: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    };
  }, [period.month, period.year]);

  const yearOptions = useMemo(() => {
    const nowYear = new Date().getFullYear();
    const years = new Set<number>([nowYear - 2, nowYear - 1, nowYear, nowYear + 1, period.year]);
    return Array.from(years).sort((a, b) => b - a);
  }, [period.year]);

  const load = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminLastMileReport(adminToken, dateRange);
      setReport(data);
    } catch (e: unknown) {
      setReport(null);
      setError((e as Error)?.message || "Не удалось загрузить отчёт");
    } finally {
      setLoading(false);
    }
  }, [adminToken, dateRange.dateFrom, dateRange.dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const rowsByDate = useMemo(() => {
    const map = new Map<string, LastMileVehicleDayRow[]>();
    for (const row of report?.rows ?? []) {
      const list = map.get(row.date) ?? [];
      list.push(row);
      map.set(row.date, list);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [report?.rows]);

  return (
    <Panel className="cargo-card" style={{ background: "var(--color-bg-card)", borderRadius: "12px", padding: "1rem 1.25rem" }}>
      <Typography.Headline style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.25rem" }}>
        Последняя миля · ТС по дням
      </Typography.Headline>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Сколько проработало каждое ТС в день — от первой до последней доставки. Данные авто, водителя и телефона из 1С,
        времена «Запланирована доставка» / «Доставлена» из таймлайна перевозки.
      </Typography.Body>

      <Flex align="center" gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
        <select
          className="admin-form-input"
          value={period.month}
          onChange={(e) => {
            const month = Number(e.target.value);
            if (!Number.isFinite(month) || month < 1 || month > 12) return;
            setPeriod((prev) => ({ ...prev, month }));
          }}
          style={{ padding: "0 0.5rem", minWidth: "10rem" }}
          aria-label="Месяц отчёта последней мили"
        >
          {MONTH_NAMES.map((name, idx) => (
            <option key={`admin-lm-month-${idx + 1}`} value={idx + 1}>
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
          aria-label="Год отчёта последней мили"
        >
          {yearOptions.map((year) => (
            <option key={`admin-lm-year-${year}`} value={year}>
              {year}
            </option>
          ))}
        </select>
      </Flex>

      <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Период: <DateText value={dateRange.dateFrom} /> – <DateText value={dateRange.dateTo} />
      </Typography.Body>

      {loading ? (
        <Flex align="center" gap="0.5rem">
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body>Формирование отчёта...</Typography.Body>
        </Flex>
      ) : error ? (
        <Typography.Body style={{ color: "var(--color-error)" }}>{error}</Typography.Body>
      ) : !report || report.rows.length === 0 ? (
        <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
          Нет доставок последней мили с данными ТС за выбранный период.
        </Typography.Body>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "0.5rem",
              marginBottom: "0.85rem",
            }}
          >
            <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.5rem" }}>
              <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>ТС·дней</Typography.Body>
              <Typography.Body style={{ fontWeight: 700 }}>{report.summary.vehicleDays}</Typography.Body>
            </div>
            <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.5rem" }}>
              <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>Ходок</Typography.Body>
              <Typography.Body style={{ fontWeight: 700 }}>{report.summary.tripCount}</Typography.Body>
            </div>
            <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.5rem" }}>
              <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>PW, кг</Typography.Body>
              <Typography.Body style={{ fontWeight: 700 }}>{Math.round(report.summary.pw).toLocaleString("ru-RU")}</Typography.Body>
            </div>
            <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.5rem" }}>
              <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>Объём, м³</Typography.Body>
              <Typography.Body style={{ fontWeight: 700 }}>{report.summary.volume.toFixed(1)}</Typography.Body>
            </div>
          </div>

          {rowsByDate.map(([date, rows]) => (
            <div key={`lm-day-${date}`} style={{ marginBottom: "0.85rem" }}>
              <Typography.Body style={{ fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                <DateText value={date} />
              </Typography.Body>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {rows.map((row) => (
                  <VehicleDayBlock key={`${row.date}-${row.vehicleKey}-${row.driver}`} row={row} />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </Panel>
  );
}
