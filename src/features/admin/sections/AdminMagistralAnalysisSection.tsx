import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Flex, Panel, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import * as dateUtils from "../../../lib/dateUtils";
import { fetchAdminPerevozki } from "../../../api/client/admin/perevozki";
import {
  buildMagistralAnalysis,
  magistralPeriodFieldLabel,
  type MagistralPeriodField,
  type MagistralTypeStats,
} from "../../../lib/adminMagistralAnalytics";
import type { CargoItem } from "../../../types";

const MONTH_NAMES = dateUtils.MONTH_NAMES;

function formatDays(value: number | null): string {
  if (value == null) return "—";
  return `${value} д`;
}

function RangeBar({ row, scaleMax }: { row: MagistralTypeStats; scaleMax: number }) {
  if (row.count === 0 || row.minDays == null || row.maxDays == null || row.avgDays == null) {
    return (
      <div
        style={{
          height: 10,
          borderRadius: 999,
          background: "var(--color-border)",
          opacity: 0.35,
        }}
      />
    );
  }
  const max = Math.max(scaleMax, 1);
  const left = (row.minDays / max) * 100;
  const width = Math.max(((row.maxDays - row.minDays) / max) * 100, 1.5);
  const avg = (row.avgDays / max) * 100;
  const plan = (row.planDays / max) * 100;

  return (
    <div style={{ position: "relative", height: 28, paddingTop: 6 }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 14,
          height: 8,
          borderRadius: 999,
          background: "var(--color-border)",
          opacity: 0.35,
        }}
      />
      <div
        title={`${row.minDays}–${row.maxDays} д`}
        style={{
          position: "absolute",
          left: `${left}%`,
          width: `${width}%`,
          top: 14,
          height: 8,
          borderRadius: 999,
          background: row.color,
          opacity: 0.45,
        }}
      />
      <div
        title={`Среднее: ${row.avgDays} д`}
        style={{
          position: "absolute",
          left: `calc(${avg}% - 1px)`,
          top: 10,
          width: 3,
          height: 16,
          borderRadius: 2,
          background: row.color,
        }}
      />
      <div
        title={`План: ${row.planDays} д`}
        style={{
          position: "absolute",
          left: `calc(${plan}% - 1px)`,
          top: 8,
          width: 2,
          height: 20,
          background: "var(--color-text-secondary)",
          opacity: 0.85,
        }}
      />
    </div>
  );
}

export function AdminMagistralAnalysisSection({ adminToken }: { adminToken: string }) {
  const [period, setPeriod] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() + 1 };
  });
  const [periodField, setPeriodField] = useState<MagistralPeriodField>("vr");

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

  const [items, setItems] = useState<CargoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    if (!adminToken) return [];
    return fetchAdminPerevozki(adminToken, dateRange, { dateField: periodField });
  }, [adminToken, dateRange, periodField]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadItems()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError((e as Error)?.message || "Ошибка загрузки");
          setItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadItems]);

  const analysis = useMemo(() => buildMagistralAnalysis(items), [items]);

  return (
    <div>
      <Typography.Body style={{ fontSize: "0.88rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Скорость магистрали: календарные дни от приёмки (<code>DatePrih</code>) до выдачи (<code>DateVr</code>).
        Сводка по типу перевозки — минимум, среднее, максимум; без детализации до отдельных грузов.
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
          aria-label="Месяц"
        >
          {MONTH_NAMES.map((name, idx) => (
            <option key={`magistral-month-${idx + 1}`} value={idx + 1}>
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
          aria-label="Год"
        >
          {yearOptions.map((year) => (
            <option key={`magistral-year-${year}`} value={year}>
              {year}
            </option>
          ))}
        </select>
        <select
          className="admin-form-input"
          value={periodField}
          onChange={(e) => setPeriodField(e.target.value === "prih" ? "prih" : "vr")}
          style={{ padding: "0 0.5rem", minWidth: "12rem" }}
          aria-label="Поле периода"
        >
          <option value="vr">Период по дате выдачи</option>
          <option value="prih">Период по дате приёмки</option>
        </select>
      </Flex>

      <Typography.Label style={{ display: "block", marginBottom: "0.75rem", color: "var(--color-text-secondary)", fontSize: "0.78rem" }}>
        Выборка: {dateRange.dateFrom} — {dateRange.dateTo}, фильтр по {magistralPeriodFieldLabel(periodField)}.
        {" "}
        Завершённых перевозок: {analysis.completedCount}
        {analysis.skippedIncomplete > 0 ? ` · без полной пары дат: ${analysis.skippedIncomplete}` : ""}.
      </Typography.Label>

      {loading && (
        <Flex align="center" gap="0.5rem" style={{ padding: "1.5rem 0", color: "var(--color-text-secondary)" }}>
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
          Загрузка перевозок…
        </Flex>
      )}

      {error && !loading && (
        <Typography.Body style={{ color: "var(--color-danger, #dc2626)", marginBottom: "1rem" }}>{error}</Typography.Body>
      )}

      {!loading && !error && (
        <Panel className="cargo-card" style={{ padding: "1rem 1.1rem", borderRadius: 12, background: "var(--color-bg-card)" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
                  <th style={{ padding: "0.45rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Тип</th>
                  <th style={{ padding: "0.45rem 0.5rem", textAlign: "right", fontWeight: 600 }}>Грузов</th>
                  <th style={{ padding: "0.45rem 0.5rem", textAlign: "right", fontWeight: 600 }}>Мин</th>
                  <th style={{ padding: "0.45rem 0.5rem", textAlign: "right", fontWeight: 600 }}>Среднее</th>
                  <th style={{ padding: "0.45rem 0.5rem", textAlign: "right", fontWeight: 600 }}>Медиана</th>
                  <th style={{ padding: "0.45rem 0.5rem", textAlign: "right", fontWeight: 600 }}>Макс</th>
                  <th style={{ padding: "0.45rem 0.5rem", textAlign: "right", fontWeight: 600 }}>План</th>
                  <th style={{ padding: "0.45rem 0.5rem", textAlign: "left", fontWeight: 600, minWidth: 180 }}>Разброс</th>
                </tr>
              </thead>
              <tbody>
                {analysis.byType.map((row) => (
                  <tr key={row.type} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.45rem 0.5rem", fontWeight: 600 }}>
                      <Flex align="center" gap="0.35rem">
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: row.color, flexShrink: 0 }} />
                        {row.label}
                      </Flex>
                    </td>
                    <td style={{ padding: "0.45rem 0.5rem", textAlign: "right" }}>{row.count || "—"}</td>
                    <td style={{ padding: "0.45rem 0.5rem", textAlign: "right" }}>{formatDays(row.minDays)}</td>
                    <td style={{ padding: "0.45rem 0.5rem", textAlign: "right", fontWeight: 600 }}>{formatDays(row.avgDays)}</td>
                    <td style={{ padding: "0.45rem 0.5rem", textAlign: "right" }}>{formatDays(row.medianDays)}</td>
                    <td style={{ padding: "0.45rem 0.5rem", textAlign: "right" }}>{formatDays(row.maxDays)}</td>
                    <td style={{ padding: "0.45rem 0.5rem", textAlign: "right", color: "var(--color-text-secondary)" }}>
                      {row.planDays} д
                    </td>
                    <td style={{ padding: "0.45rem 0.5rem" }}>
                      <RangeBar row={row} scaleMax={analysis.scaleMaxDays} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Flex gap="1rem" wrap="wrap" style={{ marginTop: "0.75rem", fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>
            <span>Цветная полоса — min…max</span>
            <span>Жирная отметка — среднее</span>
            <span>Тонкая серая — плановый срок по типу</span>
          </Flex>

          {analysis.completedCount === 0 && (
            <Typography.Body style={{ marginTop: "0.75rem", color: "var(--color-text-secondary)" }}>
              За выбранный период нет перевозок с датой приёмки и выдачи. Попробуйте другой месяц или фильтр по дате приёмки.
            </Typography.Body>
          )}
        </Panel>
      )}
    </div>
  );
}
