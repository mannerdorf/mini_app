import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flex, Panel, Typography, Button } from "@maxhub/max-ui";
import { ChevronDown, Loader2 } from "lucide-react";
import { DateText } from "../../../components/ui/DateText";
import { FilterDropdownPortal } from "../../../components/ui/FilterDropdownPortal";
import { ShipmentStatusPanel } from "../../../components/ShipmentStatusScreen";
import {
  fetchAdminCargoTimelineReport,
  type CargoTimelineDelayFilter,
  type CargoTimelineReportRow,
} from "../../../api/client/admin/cargoTimelineReport";
import {
  CARGO_TIMELINE_NORM_HOURS,
  formatTimelineGapHours,
} from "../../../lib/adminCargoTimelineReport";
import { formatTimelineDate } from "../../../lib/dateUtils";
import { ListDateFilterControl, useListDateRange, usePersistedDateFilter } from "../../listWorkspace";
import { routeKeyToCargoLabel, type RouteFilterKey } from "../../../lib/sharedListFilters";
import type { PerevozkaTimelineStep } from "../../../types";

function formatGapCell(hours: number | null, overdue: boolean): React.ReactNode {
  if (hours == null) return "—";
  return (
    <span style={{ color: overdue ? "#dc2626" : undefined, fontWeight: overdue ? 600 : undefined }}>
      {formatTimelineGapHours(hours)}
    </span>
  );
}

function CargoTimelineExpanded({ row }: { row: CargoTimelineReportRow }) {
  const fromCity = row.route.split("–")[0]?.trim() || "—";
  const toCity = row.route.split("–")[1]?.trim() || "—";
  const steps: PerevozkaTimelineStep[] = row.steps.map((s) => ({
    label: s.label,
    date: s.date ? formatTimelineDate(s.date) : undefined,
    completed: Boolean(s.date),
  }));

  const overdueStepLabels = useMemo(() => {
    const labels = new Set<string>();
    row.gaps.forEach((gap) => {
      if (!gap.overdue) return;
      labels.add(gap.fromLabel);
      labels.add(gap.toLabel);
    });
    return labels;
  }, [row.gaps]);

  const stepOutOfSla = useCallback(
    (index: number) => overdueStepLabels.has(steps[index]?.label ?? ""),
    [overdueStepLabels, steps],
  );

  return (
    <div style={{ padding: "0.75rem 0 0.25rem" }}>
      <ShipmentStatusPanel
        embedded
        steps={steps}
        fromCity={fromCity}
        toCity={toCity}
        stepOutOfSla={stepOutOfSla}
      />
      {row.gaps.length > 0 && (
        <div style={{ marginTop: "0.75rem", overflowX: "auto" }}>
          <table className="admin-table" style={{ width: "100%", fontSize: "0.82rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Этап от</th>
                <th style={{ textAlign: "left" }}>Этап до</th>
                <th style={{ textAlign: "right" }}>Время</th>
                <th style={{ textAlign: "left" }}>Норма</th>
              </tr>
            </thead>
            <tbody>
              {row.gaps.map((gap) => (
                <tr key={`${gap.fromLabel}-${gap.toLabel}`}>
                  <td>{gap.fromLabel}</td>
                  <td>{gap.toLabel}</td>
                  <td style={{ textAlign: "right" }}>
                    <span
                      style={{
                        color: gap.overdue ? "#dc2626" : undefined,
                        fontWeight: gap.overdue ? 600 : undefined,
                      }}
                    >
                      {formatTimelineGapHours(gap.hours)}
                    </span>
                  </td>
                  <td style={{ color: "var(--color-text-secondary)" }}>
                    {gap.overdueKind === "loading"
                      ? "Отгрузка ≤ 24 ч"
                      : gap.overdueKind === "delivery"
                        ? "Доставка ≤ 24 ч"
                        : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AdminCargoTimelineSection({ adminToken }: { adminToken: string }) {
  const dateFilterControls = usePersistedDateFilter();
  const { apiDateRange } = useListDateRange({
    dateFilter: dateFilterControls.dateFilter,
    customDateFrom: dateFilterControls.customDateFrom,
    customDateTo: dateFilterControls.customDateTo,
    selectedMonthForFilter: dateFilterControls.selectedMonthForFilter,
    selectedYearForFilter: dateFilterControls.selectedYearForFilter,
    selectedWeekForFilter: dateFilterControls.selectedWeekForFilter,
  });

  const [routeFilter, setRouteFilter] = useState<"all" | RouteFilterKey>("all");
  const [delayFilter, setDelayFilter] = useState<CargoTimelineDelayFilter>("all");
  const [isRouteDropdownOpen, setIsRouteDropdownOpen] = useState(false);
  const [isDelayDropdownOpen, setIsDelayDropdownOpen] = useState(false);
  const routeButtonRef = useRef<HTMLDivElement>(null);
  const delayButtonRef = useRef<HTMLDivElement>(null);

  const [report, setReport] = useState<Awaited<ReturnType<typeof fetchAdminCargoTimelineReport>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCargo, setExpandedCargo] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminCargoTimelineReport(adminToken, {
        dateFrom: apiDateRange.dateFrom,
        dateTo: apiDateRange.dateTo,
        routeFilter,
        delayFilter,
      });
      setReport(data);
    } catch (e: unknown) {
      setError((e as Error)?.message || "Ошибка загрузки");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [adminToken, apiDateRange.dateFrom, apiDateRange.dateTo, routeFilter, delayFilter]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    setExpandedCargo(null);
  }, [apiDateRange.dateFrom, apiDateRange.dateTo, routeFilter, delayFilter]);

  const delayFilterLabel =
    delayFilter === "loading"
      ? "Опоздание на отгрузке"
      : delayFilter === "delivery"
        ? "Опоздание на доставке"
        : "Все";

  return (
    <div>
      <Typography.Body style={{ fontSize: "0.88rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Таймлайн перевозок по статусам: время между этапами в днях и часах. Норматив — {CARGO_TIMELINE_NORM_HOURS} ч
        между «Получена» → «Загружена в ТС» и «Прибыла» → «Доставлена». Превышение выделяется красным. Нажмите строку —
        детальный таймлайн.
      </Typography.Body>

      <div className="filters-container filters-row-scroll" style={{ marginBottom: "0.75rem" }}>
        <ListDateFilterControl {...dateFilterControls} apiDateRange={apiDateRange} />
        <div className="filter-group" style={{ flexShrink: 0 }}>
          <div ref={routeButtonRef} style={{ display: "inline-flex" }}>
            <Button
              className="filter-button"
              onClick={() => setIsRouteDropdownOpen(!isRouteDropdownOpen)}
            >
              Маршрут: {routeFilter === "all" ? "Все" : routeKeyToCargoLabel(routeFilter)}{" "}
              <ChevronDown className="w-4 h-4" />
            </Button>
          </div>
          <FilterDropdownPortal
            triggerRef={routeButtonRef}
            isOpen={isRouteDropdownOpen}
            onClose={() => setIsRouteDropdownOpen(false)}
          >
            <div
              className="dropdown-item"
              onClick={() => {
                setRouteFilter("all");
                setIsRouteDropdownOpen(false);
              }}
              style={{ background: routeFilter === "all" ? "var(--color-bg-hover)" : undefined }}
            >
              <Typography.Body>Все {routeFilter === "all" ? "✓" : ""}</Typography.Body>
            </div>
            {(["MSK-KGD", "KGD-MSK"] as const).map((key) => (
              <div
                key={key}
                className="dropdown-item"
                onClick={() => {
                  setRouteFilter(key);
                  setIsRouteDropdownOpen(false);
                }}
                style={{ background: routeFilter === key ? "var(--color-bg-hover)" : undefined }}
              >
                <Typography.Body>
                  {routeKeyToCargoLabel(key)} {routeFilter === key ? "✓" : ""}
                </Typography.Body>
              </div>
            ))}
          </FilterDropdownPortal>
        </div>
        <div className="filter-group" style={{ flexShrink: 0 }}>
          <div ref={delayButtonRef} style={{ display: "inline-flex" }}>
            <Button
              className="filter-button"
              onClick={() => setIsDelayDropdownOpen(!isDelayDropdownOpen)}
            >
              Отбор: {delayFilterLabel} <ChevronDown className="w-4 h-4" />
            </Button>
          </div>
          <FilterDropdownPortal
            triggerRef={delayButtonRef}
            isOpen={isDelayDropdownOpen}
            onClose={() => setIsDelayDropdownOpen(false)}
          >
            {(
              [
                ["all", "Все перевозки"],
                ["loading", "Опоздание на отгрузке (>24 ч)"],
                ["delivery", "Опоздание на доставке (>24 ч)"],
              ] as const
            ).map(([key, label]) => (
              <div
                key={key}
                className="dropdown-item"
                onClick={() => {
                  setDelayFilter(key);
                  setIsDelayDropdownOpen(false);
                }}
                style={{ background: delayFilter === key ? "var(--color-bg-hover)" : undefined }}
              >
                <Typography.Body>
                  {label} {delayFilter === key ? "✓" : ""}
                </Typography.Body>
              </div>
            ))}
          </FilterDropdownPortal>
        </div>
      </div>

      <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Период: {apiDateRange.dateFrom} — {apiDateRange.dateTo}
        {report?.summary ? (
          <>
            {" "}
            · перевозок с таймлайном: {report.summary.withTimeline} · опоздание отгрузки:{" "}
            <span style={{ color: report.summary.loadingOverdue > 0 ? "#dc2626" : undefined }}>
              {report.summary.loadingOverdue}
            </span>
            {" "}
            · опоздание доставки:{" "}
            <span style={{ color: report.summary.deliveryOverdue > 0 ? "#dc2626" : undefined }}>
              {report.summary.deliveryOverdue}
            </span>
          </>
        ) : null}
        {report?.truncatedMessage ? ` · ${report.truncatedMessage}` : null}
      </Typography.Body>

      {loading && (
        <Flex align="center" gap="0.5rem" style={{ padding: "1rem 0", color: "var(--color-text-secondary)" }}>
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
          Загрузка отчёта…
        </Flex>
      )}

      {error && (
        <Panel style={{ padding: "0.75rem", marginBottom: "0.75rem", borderColor: "#fecaca", background: "#fef2f2" }}>
          <Typography.Body style={{ color: "#dc2626" }}>{error}</Typography.Body>
        </Panel>
      )}

      {!loading && !error && report && report.rows.length === 0 && (
        <Typography.Body style={{ color: "var(--color-text-secondary)", padding: "1rem 0" }}>
          За выбранный период нет перевозок с полным таймлайном
          {delayFilter !== "all" ? " по выбранному отбору опозданий" : ""}.
        </Typography.Body>
      )}

      {!loading && report && report.rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table" style={{ width: "100%", fontSize: "0.85rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>№ перевозки</th>
                <th style={{ textAlign: "left" }}>Заказчик</th>
                <th style={{ textAlign: "left" }}>Маршрут</th>
                <th style={{ textAlign: "left" }}>Приём</th>
                <th style={{ textAlign: "right" }}>Получена → ТС</th>
                <th style={{ textAlign: "right" }}>Прибыла → Доставлена</th>
                <th style={{ textAlign: "left" }}>Источник</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => {
                const isExpanded = expandedCargo === row.cargoNumber;
                return (
                  <React.Fragment key={row.cargoNumber}>
                    <tr
                      style={{ cursor: "pointer", background: isExpanded ? "var(--color-bg-secondary)" : undefined }}
                      onClick={() => setExpandedCargo(isExpanded ? null : row.cargoNumber)}
                    >
                      <td>{row.cargoNumber || "—"}</td>
                      <td>{row.customer}</td>
                      <td>{row.route}</td>
                      <td>{row.datePrih ? <DateText value={row.datePrih} /> : "—"}</td>
                      <td style={{ textAlign: "right" }}>{formatGapCell(row.loadingGapHours, row.loadingOverdue)}</td>
                      <td style={{ textAlign: "right" }}>{formatGapCell(row.deliveryGapHours, row.deliveryOverdue)}</td>
                      <td style={{ color: "var(--color-text-secondary)", fontSize: "0.78rem" }}>
                        {row.timelineSource === "embedded"
                          ? "кэш"
                          : row.timelineSource === "fetched"
                            ? "1С"
                            : "частично"}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} style={{ padding: "0 0.75rem 0.75rem" }}>
                          <CargoTimelineExpanded row={row} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
