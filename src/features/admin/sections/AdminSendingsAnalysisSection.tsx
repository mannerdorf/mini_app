import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flex, Panel, Typography, Button } from "@maxhub/max-ui";
import { ChevronDown, Loader2 } from "lucide-react";
import { DateText } from "../../../components/ui/DateText";
import { FilterDropdownPortal } from "../../../components/ui/FilterDropdownPortal";
import { fetchAdminSendings } from "../../../api/client/admin/sendings";
import {
  fetchHaulzInvoices,
  fetchHaulzPerevozki,
  fetchHaulzSendings,
} from "../../../api/client/haulzAnalytics";
import type { AuthData } from "../../../types";
import {
  buildSendingsAnalysis,
  buildSendingsDeliveryWithinDays,
  buildSendingsDetailRows,
  filterSendingsItemsByRoute,
  type SendingItem,
  type SendingsTypeStats,
  type SendingsWithinDaysBucket,
} from "../../../lib/adminSendingsAnalytics";
import { ListDateFilterControl, useListDateRange, usePersistedDateFilter } from "../../listWorkspace";
import { calcStripDynamics, StripDynamicsBadge, type StripDynamics } from "../../dashboard/StripDynamicsBadge";
import { routeKeyToCargoLabel, type RouteFilterKey } from "../../../lib/sharedListFilters";
import type { CargoTransportType } from "../../../lib/cargoTransportType";

function formatDays(value: number | null): string {
  if (value == null) return "—";
  const hours = Math.round(value * 24);
  return `${value} д (${hours} ч)`;
}

function formatDaysDelta(delta: number): string {
  const rounded = Math.round(delta * 10) / 10;
  const hours = Math.round(rounded * 24);
  const dayPart = `${rounded > 0 ? "+" : ""}${rounded} д`;
  const hourPart = `${hours > 0 ? "+" : ""}${hours} ч`;
  return `${dayPart} (${hourPart})`;
}

function RangeBar({ row, scaleMax }: { row: SendingsTypeStats; scaleMax: number }) {
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
        title={`${formatDays(row.minDays)} – ${formatDays(row.maxDays)}`}
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
        title={`Среднее: ${formatDays(row.avgDays)}`}
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
        title={`План: ${formatDays(row.planDays)}`}
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

function WithinDaysBars({ buckets, color }: { buckets: SendingsWithinDaysBucket[]; color: string }) {
  if (buckets.length === 0) {
    return <Typography.Body style={{ color: "var(--color-text-secondary)" }}>—</Typography.Body>;
  }

  return (
    <Flex direction="column" gap="0.35rem" style={{ minWidth: 220 }}>
      {buckets.map((bucket) => (
        <Flex key={bucket.day} align="center" gap="0.5rem">
          <Typography.Body style={{ flexShrink: 0, width: 48, fontSize: "0.78rem", whiteSpace: "nowrap" }}>
            ≤{bucket.day} д
          </Typography.Body>
          <div
            style={{
              flex: 1,
              height: 8,
              borderRadius: 4,
              background: "var(--color-bg-hover)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${bucket.percent}%`,
                height: "100%",
                borderRadius: 4,
                background: color,
                opacity: 0.85,
              }}
            />
          </div>
          <Typography.Body style={{ flexShrink: 0, fontWeight: 600, fontSize: "0.78rem", minWidth: 38 }}>
            {bucket.percent}%
          </Typography.Body>
          <Typography.Body
            style={{
              flexShrink: 0,
              fontSize: "0.72rem",
              color: "var(--color-text-secondary)",
              minWidth: 48,
              textAlign: "right",
            }}
          >
            {bucket.count} шт
          </Typography.Body>
        </Flex>
      ))}
    </Flex>
  );
}

export function AdminSendingsAnalysisSection({
  adminToken,
  auth,
  useServiceRequest = false,
}: {
  adminToken?: string;
  auth?: AuthData;
  useServiceRequest?: boolean;
}) {
  const dateFilterControls = usePersistedDateFilter();
  const {
    dateFilter,
    customDateFrom,
    customDateTo,
    selectedMonthForFilter,
    selectedYearForFilter,
    selectedWeekForFilter,
  } = dateFilterControls;
  const { apiDateRange, prevRange } = useListDateRange({
    dateFilter,
    customDateFrom,
    customDateTo,
    selectedMonthForFilter,
    selectedYearForFilter,
    selectedWeekForFilter,
  });

  const [routeFilter, setRouteFilter] = useState<"all" | RouteFilterKey>("all");
  const [isRouteDropdownOpen, setIsRouteDropdownOpen] = useState(false);
  const routeButtonRef = useRef<HTMLDivElement>(null);

  const [items, setItems] = useState<SendingItem[]>([]);
  const [prevItems, setPrevItems] = useState<SendingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedType, setExpandedType] = useState<CargoTransportType | null>(null);

  const loadItems = useCallback(async () => {
    if (adminToken) {
      const currentPromise = fetchAdminSendings(adminToken, apiDateRange);
      const prevPromise = prevRange
        ? fetchAdminSendings(adminToken, prevRange)
        : Promise.resolve([] as SendingItem[]);
      const [current, prev] = await Promise.all([currentPromise, prevPromise]);
      return { current, prev };
    }
    if (!auth?.login || !auth?.password) {
      return { current: [] as SendingItem[], prev: [] as SendingItem[] };
    }
    const currentPromise = fetchHaulzSendings(auth, apiDateRange, useServiceRequest);
    const prevPromise = prevRange
      ? fetchHaulzSendings(auth, prevRange, useServiceRequest)
      : Promise.resolve([] as SendingItem[]);
    const [current, prev] = await Promise.all([currentPromise, prevPromise]);
    return { current, prev };
  }, [adminToken, auth, useServiceRequest, apiDateRange, prevRange]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadItems()
      .then(({ current, prev }) => {
        if (!cancelled) {
          setItems(current);
          setPrevItems(prev);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError((e as Error)?.message || "Ошибка загрузки");
          setItems([]);
          setPrevItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadItems]);

  useEffect(() => {
    setExpandedType(null);
  }, [
    apiDateRange.dateFrom,
    apiDateRange.dateTo,
    routeFilter,
    dateFilter,
    customDateFrom,
    customDateTo,
    selectedMonthForFilter,
    selectedYearForFilter,
    selectedWeekForFilter,
  ]);

  const filteredItems = useMemo(
    () => filterSendingsItemsByRoute(items, routeFilter),
    [items, routeFilter],
  );
  const filteredPrevItems = useMemo(
    () => filterSendingsItemsByRoute(prevItems, routeFilter),
    [prevItems, routeFilter],
  );

  const analysis = useMemo(() => buildSendingsAnalysis(filteredItems), [filteredItems]);
  const withinDays = useMemo(() => buildSendingsDeliveryWithinDays(filteredItems), [filteredItems]);
  const prevAnalysis = useMemo(() => buildSendingsAnalysis(filteredPrevItems), [filteredPrevItems]);

  const avgDynamicsByType = useMemo(() => {
    const hasPrev = Boolean(prevRange);
    const map = new Map<CargoTransportType, StripDynamics | null>();
    for (const row of analysis.byType) {
      const prevRow = prevAnalysis.byType.find((entry) => entry.type === row.type);
      const curAvg = row.avgDays ?? 0;
      const prevAvg = prevRow?.avgDays ?? 0;
      const hasData = row.count > 0 && (prevRow?.count ?? 0) > 0;
      map.set(row.type, calcStripDynamics(curAvg, prevAvg, hasPrev && hasData));
    }
    return map;
  }, [analysis.byType, prevAnalysis.byType, prevRange]);

  const detailRows = useMemo(
    () => (expandedType ? buildSendingsDetailRows(filteredItems, expandedType) : []),
    [filteredItems, expandedType],
  );

  const expandedLabel = expandedType
    ? analysis.byType.find((row) => row.type === expandedType)?.label
    : null;

  return (
    <div>
      <Typography.Body style={{ fontSize: "0.88rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Скорость отправок: часы в пути от отгрузки (<code>send_start_at</code>) до готовности груза (
        <code>first_ready_at</code>). Период отбирает отправки по дате рейса в выбранном диапазоне. В расчёт входят
        только завершённые отправки с метрикой готовности. Нажмите строку типа — список отправок.
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
      </div>

      <Typography.Label style={{ display: "block", marginBottom: "0.75rem", color: "var(--color-text-secondary)", fontSize: "0.78rem" }}>
        Выборка: {apiDateRange.dateFrom} — {apiDateRange.dateTo}, фильтр по дате отправки
        {routeFilter !== "all" ? `, маршрут ${routeKeyToCargoLabel(routeFilter)}` : ""}.
        {" "}
        Завершённых отправок: {analysis.completedCount}
        {analysis.skippedIncomplete > 0 ? ` · без метрики готовности: ${analysis.skippedIncomplete}` : ""}.
        {prevRange ? (
          <>
            {" "}
            Динамика среднего — к периоду{" "}
            <DateText value={prevRange.dateFrom} /> – <DateText value={prevRange.dateTo} />.
          </>
        ) : null}
      </Typography.Label>

      {loading && (
        <Flex align="center" gap="0.5rem" style={{ padding: "1.5rem 0", color: "var(--color-text-secondary)" }}>
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
          Загрузка отправок…
        </Flex>
      )}

      {error && !loading && (
        <Typography.Body style={{ color: "var(--color-danger, #dc2626)", marginBottom: "1rem" }}>{error}</Typography.Body>
      )}

      {!loading && !error && (
        <>
          <Panel className="cargo-card" style={{ padding: "1rem 1.1rem", borderRadius: 12, background: "var(--color-bg-card)" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
                    <th style={{ padding: "0.45rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Тип</th>
                    <th style={{ padding: "0.45rem 0.5rem", textAlign: "right", fontWeight: 600 }}>Отправок</th>
                    <th style={{ padding: "0.45rem 0.5rem", textAlign: "right", fontWeight: 600 }}>Мин</th>
                    <th style={{ padding: "0.45rem 0.5rem", textAlign: "right", fontWeight: 600 }}>Среднее</th>
                    <th
                      style={{ padding: "0.45rem 0.5rem", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}
                      title="Изменение среднего срока к предыдущему периоду"
                    >
                      Δ
                    </th>
                    <th style={{ padding: "0.45rem 0.5rem", textAlign: "right", fontWeight: 600 }}>Медиана</th>
                    <th style={{ padding: "0.45rem 0.5rem", textAlign: "right", fontWeight: 600 }}>Макс</th>
                    <th style={{ padding: "0.45rem 0.5rem", textAlign: "right", fontWeight: 600 }}>План</th>
                    <th style={{ padding: "0.45rem 0.5rem", textAlign: "left", fontWeight: 600, minWidth: 180 }}>Разброс</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.byType.map((row) => {
                    const expanded = expandedType === row.type;
                    const canExpand = row.count > 0;
                    return (
                      <tr
                        key={row.type}
                        style={{
                          borderBottom: "1px solid var(--color-border)",
                          cursor: canExpand ? "pointer" : "default",
                          background: expanded ? "var(--color-bg-hover)" : undefined,
                        }}
                        onClick={() => {
                          if (!canExpand) return;
                          setExpandedType((prev) => (prev === row.type ? null : row.type));
                        }}
                        aria-expanded={expanded}
                        title={canExpand ? (expanded ? "Свернуть список отправок" : "Показать отправки") : undefined}
                      >
                        <td style={{ padding: "0.45rem 0.5rem", fontWeight: 600 }}>
                          <Flex align="center" gap="0.35rem">
                            <span style={{ width: 10, height: 10, borderRadius: "50%", background: row.color, flexShrink: 0 }} />
                            {row.label}
                          </Flex>
                        </td>
                        <td style={{ padding: "0.45rem 0.5rem", textAlign: "right" }}>{row.count || "—"}</td>
                        <td style={{ padding: "0.45rem 0.5rem", textAlign: "right", whiteSpace: "nowrap" }}>{formatDays(row.minDays)}</td>
                        <td style={{ padding: "0.45rem 0.5rem", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>{formatDays(row.avgDays)}</td>
                        <td style={{ padding: "0.45rem 0.5rem" }}>
                          {avgDynamicsByType.get(row.type) ? (
                            <StripDynamicsBadge
                              dynamics={avgDynamicsByType.get(row.type)!}
                              formatDelta={formatDaysDelta}
                              lowerIsBetter
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td style={{ padding: "0.45rem 0.5rem", textAlign: "right", whiteSpace: "nowrap" }}>{formatDays(row.medianDays)}</td>
                        <td style={{ padding: "0.45rem 0.5rem", textAlign: "right", whiteSpace: "nowrap" }}>{formatDays(row.maxDays)}</td>
                        <td style={{ padding: "0.45rem 0.5rem", textAlign: "right", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                          {formatDays(row.planDays)}
                        </td>
                        <td style={{ padding: "0.45rem 0.5rem" }}>
                          <RangeBar row={row} scaleMax={analysis.scaleMaxDays} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Flex gap="1rem" wrap="wrap" style={{ marginTop: "0.75rem", fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>
              <span>Цветная полоса — min…max</span>
              <span>Жирная отметка — среднее</span>
              <span>Тонкая серая — плановый срок по типу</span>
              <span>Клик по строке — детальный список</span>
              <span>Δ — динамика среднего к прошлому периоду (меньше — лучше)</span>
            </Flex>

            {expandedType && expandedLabel ? (
              <Panel
                className="cargo-card"
                style={{
                  marginTop: "1rem",
                  padding: "0.85rem 0.9rem",
                  borderRadius: 12,
                  background: "var(--color-bg-card)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <Typography.Body style={{ fontWeight: 600, marginBottom: "0.65rem" }}>
                  {expandedLabel}: {detailRows.length} отпр.
                </Typography.Body>
                <div style={{ maxHeight: "20rem", overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <th style={{ padding: "0.35rem 0.4rem", textAlign: "left", fontWeight: 600 }}>№</th>
                        <th style={{ padding: "0.35rem 0.4rem", textAlign: "left", fontWeight: 600 }}>ТС</th>
                        <th style={{ padding: "0.35rem 0.4rem", textAlign: "left", fontWeight: 600 }}>Отправка</th>
                        <th style={{ padding: "0.35rem 0.4rem", textAlign: "left", fontWeight: 600 }}>Готовность</th>
                        <th style={{ padding: "0.35rem 0.4rem", textAlign: "right", fontWeight: 600 }}>Дней</th>
                        <th style={{ padding: "0.35rem 0.4rem", textAlign: "left", fontWeight: 600 }}>Маршрут</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailRows.map((detail) => {
                        const planDays = analysis.byType.find((row) => row.type === expandedType)?.planDays ?? 0;
                        const isOutlier = detail.transitDays > Math.max(planDays * 3, 60);
                        return (
                          <tr key={`${detail.sendingNumber}-${detail.dateReady}`} style={{ borderBottom: "1px solid var(--color-border)" }}>
                            <td style={{ padding: "0.35rem 0.4rem", fontWeight: 600, whiteSpace: "nowrap" }}>{detail.sendingNumber}</td>
                            <td
                              style={{
                                padding: "0.35rem 0.4rem",
                                maxWidth: 160,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={detail.vehicle}
                            >
                              {detail.vehicle}
                            </td>
                            <td style={{ padding: "0.35rem 0.4rem", whiteSpace: "nowrap" }}>
                              {detail.dateDeparture ? <DateText value={detail.dateDeparture} /> : "—"}
                            </td>
                            <td style={{ padding: "0.35rem 0.4rem", whiteSpace: "nowrap" }}>
                              {detail.dateReady ? <DateText value={detail.dateReady} /> : "—"}
                            </td>
                            <td
                              style={{
                                padding: "0.35rem 0.4rem",
                                textAlign: "right",
                                fontWeight: isOutlier ? 700 : 400,
                                color: isOutlier ? "#dc2626" : undefined,
                                whiteSpace: "nowrap",
                              }}
                              title={`${detail.transitHours} ч`}
                            >
                              {formatDays(detail.transitDays)}
                            </td>
                            <td style={{ padding: "0.35rem 0.4rem", whiteSpace: "nowrap" }}>{detail.route}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>
            ) : null}

            {analysis.completedCount === 0 && (
              <Typography.Body style={{ marginTop: "0.75rem", color: "var(--color-text-secondary)" }}>
                За выбранный период нет завершённых отправок с метрикой транзита. Попробуйте другой период или дождитесь
                пересчёта метрик отправок.
              </Typography.Body>
            )}
          </Panel>

          <Panel
            className="cargo-card"
            style={{
              marginTop: "1rem",
              padding: "1rem 1.1rem",
              borderRadius: 12,
              background: "var(--color-bg-card)",
            }}
          >
            <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>
              Завершено за срок
            </Typography.Body>
            <Typography.Body
              style={{
                fontSize: "0.82rem",
                color: "var(--color-text-secondary)",
                marginBottom: "0.85rem",
              }}
            >
              Накопительный процент отправок, завершённых за N дней и быстрее. Показаны только сроки с ненулевой долей.
            </Typography.Body>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
                    <th style={{ padding: "0.45rem 0.5rem", textAlign: "left", fontWeight: 600, width: 120 }}>Тип</th>
                    <th style={{ padding: "0.45rem 0.5rem", textAlign: "right", fontWeight: 600, width: 72 }}>Отправок</th>
                    <th style={{ padding: "0.45rem 0.5rem", textAlign: "left", fontWeight: 600 }}>% по срокам</th>
                  </tr>
                </thead>
                <tbody>
                  {withinDays.byType.map((row) => (
                    <tr key={`within-${row.type}`} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "0.45rem 0.5rem", fontWeight: 600, verticalAlign: "top" }}>
                        <Flex align="center" gap="0.35rem">
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              background: row.color,
                              flexShrink: 0,
                            }}
                          />
                          {row.label}
                        </Flex>
                      </td>
                      <td style={{ padding: "0.45rem 0.5rem", textAlign: "right", verticalAlign: "top" }}>
                        {row.total || "—"}
                      </td>
                      <td style={{ padding: "0.45rem 0.5rem" }}>
                        <WithinDaysBars buckets={row.buckets} color={row.color} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Flex
              gap="1rem"
              wrap="wrap"
              style={{ marginTop: "0.75rem", fontSize: "0.72rem", color: "var(--color-text-secondary)" }}
            >
              <span>≤4 д — 80% означает: 80% отправок завершены за 4 дня или быстрее</span>
              <span>Справа — количество отправок в этой доле</span>
            </Flex>
          </Panel>
        </>
      )}
    </div>
  );
}
