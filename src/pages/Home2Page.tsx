import React, { useState, useRef, useEffect, useMemo } from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import {
  Home,
  ChevronDown,
  ChevronUp,
  RussianRuble,
  Scale,
  Weight,
  List,
  Package,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
} from "lucide-react";
import { FilterDropdownPortal } from "../components/ui/FilterDropdownPortal";
import { FilterDialog } from "../components/shared/FilterDialog";
import { DateText } from "../components/ui/DateText";
import * as dateUtils from "../lib/dateUtils";
import { STATUS_MAP, BILL_STATUS_MAP } from "../lib/statusUtils";
import type { DateFilter } from "../types";
import type { StatusFilter } from "../types";
import type { BillStatusFilterKey } from "../lib/statusUtils";
import { stripOoo, formatCurrency, cityToCode } from "../lib/formatUtils";
import {
  getFilterKeyByStatus,
  getPaymentFilterKey,
  isReceivedInfoStatus,
} from "../lib/statusUtils";
import { usePerevozki, usePrevPeriodPerevozki } from "../hooks/useApi";
import type { AuthData } from "../types";
import type { CargoItem } from "../types";

const {
  getDateRange,
  getWeekRange,
  getWeeksList,
  getYearsList,
  MONTH_NAMES,
  loadDateFilterState,
  saveDateFilterState,
  DEFAULT_DATE_FROM,
  DEFAULT_DATE_TO,
  getPreviousPeriodRange,
} = dateUtils;

export type ChartType = "money" | "paidWeight" | "weight" | "volume" | "pieces";

/** Свод за период для полоски (опционально — если не передано, показываем «—») */
export type StripSummary = {
  sum?: number;
  paidWeight?: number;
  weight?: number;
  volume?: number;
  pieces?: number;
};

/** Динамика к прошлому периоду (опционально — для служебного режима) */
export type PeriodToPeriodTrend = {
  direction: "up" | "down" | null;
  percent: number;
} | null;

type Home2PageProps = {
  /** Текущий авторизованный аккаунт — при переданном auth загружаются перевозки и считаются свод/тренд */
  auth?: AuthData | null;
  /** Служебный режим: показывать фильтр «Статус счёта» и динамику к прошлому периоду в полоске */
  useServiceRequest?: boolean;
  /** Список отправителей для выпадающего списка (если не передан — строится из загруженных перевозок) */
  uniqueSenders?: string[];
  /** Список получателей для выпадающего списка (если не передан — строится из загруженных перевозок) */
  uniqueReceivers?: string[];
  /** Свод за период для полоски (если не передан — считается из загруженных перевозок по фильтрам) */
  stripSummary?: StripSummary | null;
  /** Динамика к прошлому периоду (если не передан — считается при useServiceRequest и наличии данных) */
  periodToPeriodTrend?: PeriodToPeriodTrend;
  /** Идёт загрузка данных прошлого периода (если не передан — берётся из usePrevPeriodPerevozki) */
  prevPeriodLoading?: boolean;
  /** Показывать рубли в переключателях полоски (как на дашборде при showSums) */
  showSums?: boolean;
};

export function Home2Page({
  auth = null,
  useServiceRequest = false,
  uniqueSenders: uniqueSendersProp,
  uniqueReceivers: uniqueReceiversProp,
  stripSummary: stripSummaryProp,
  periodToPeriodTrend: periodToPeriodTrendProp,
  prevPeriodLoading: prevPeriodLoadingProp,
  showSums = true,
}: Home2PageProps) {
  const initDate = () => loadDateFilterState();
  const [dateFilter, setDateFilter] = useState<DateFilter>(
    () => initDate()?.dateFilter ?? "месяц"
  );
  const [customDateFrom, setCustomDateFrom] = useState(
    () => initDate()?.customDateFrom ?? DEFAULT_DATE_FROM
  );
  const [customDateTo, setCustomDateTo] = useState(
    () => initDate()?.customDateTo ?? DEFAULT_DATE_TO
  );
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
  const [dateDropdownMode, setDateDropdownMode] = useState<
    "main" | "months" | "years" | "weeks"
  >("main");
  const [selectedMonthForFilter, setSelectedMonthForFilter] = useState<{
    year: number;
    month: number;
  } | null>(() => initDate()?.selectedMonthForFilter ?? null);
  const [selectedYearForFilter, setSelectedYearForFilter] = useState<
    number | null
  >(() => initDate()?.selectedYearForFilter ?? null);
  const [selectedWeekForFilter, setSelectedWeekForFilter] = useState<string | null>(
    () => initDate()?.selectedWeekForFilter ?? null
  );

  const monthLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monthWasLongPressRef = useRef(false);
  const yearLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const yearWasLongPressRef = useRef(false);
  const weekLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const weekWasLongPressRef = useRef(false);

  useEffect(() => {
    saveDateFilterState({
      dateFilter,
      customDateFrom,
      customDateTo,
      selectedMonthForFilter,
      selectedYearForFilter,
      selectedWeekForFilter,
    });
  }, [
    dateFilter,
    customDateFrom,
    customDateTo,
    selectedMonthForFilter,
    selectedYearForFilter,
    selectedWeekForFilter,
  ]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [senderFilter, setSenderFilter] = useState("");
  const [receiverFilter, setReceiverFilter] = useState("");
  const [billStatusFilter, setBillStatusFilter] =
    useState<BillStatusFilterKey>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "ferry" | "auto">("all");
  const [routeFilter, setRouteFilter] = useState<
    "all" | "MSK-KGD" | "KGD-MSK"
  >("all");

  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isSenderDropdownOpen, setIsSenderDropdownOpen] = useState(false);
  const [isReceiverDropdownOpen, setIsReceiverDropdownOpen] = useState(false);
  const [isBillStatusDropdownOpen, setIsBillStatusDropdownOpen] = useState(false);
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [isRouteDropdownOpen, setIsRouteDropdownOpen] = useState(false);

  const dateButtonRef = useRef<HTMLDivElement>(null);
  const statusButtonRef = useRef<HTMLDivElement>(null);
  const senderButtonRef = useRef<HTMLDivElement>(null);
  const receiverButtonRef = useRef<HTMLDivElement>(null);
  const billStatusButtonRef = useRef<HTMLDivElement>(null);
  const typeButtonRef = useRef<HTMLDivElement>(null);
  const routeButtonRef = useRef<HTMLDivElement>(null);

  const dateLabel =
    dateFilter === "период"
      ? "Период"
      : dateFilter === "месяц" && selectedMonthForFilter
        ? `${MONTH_NAMES[selectedMonthForFilter.month - 1]} ${selectedMonthForFilter.year}`
        : dateFilter === "год" && selectedYearForFilter
          ? `${selectedYearForFilter}`
          : dateFilter === "неделя" && selectedWeekForFilter
            ? (() => {
                const r = getWeekRange(selectedWeekForFilter);
                return `${r.dateFrom.slice(8, 10)}.${r.dateFrom.slice(5, 7)} – ${r.dateTo.slice(8, 10)}.${r.dateTo.slice(5, 7)}`;
              })()
            : dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1);

  const { apiDateRange, prevRange } = useMemo(() => {
    const api =
      dateFilter === "период"
        ? { dateFrom: customDateFrom, dateTo: customDateTo }
        : dateFilter === "месяц" && selectedMonthForFilter
          ? (() => {
              const { year, month } = selectedMonthForFilter;
              const pad = (n: number) => String(n).padStart(2, "0");
              const lastDay = new Date(year, month, 0).getDate();
              return {
                dateFrom: `${year}-${pad(month)}-01`,
                dateTo: `${year}-${pad(month)}-${pad(lastDay)}`,
              };
            })()
          : dateFilter === "год" && selectedYearForFilter
            ? {
                dateFrom: `${selectedYearForFilter}-01-01`,
                dateTo: `${selectedYearForFilter}-12-31`,
              }
            : dateFilter === "неделя" && selectedWeekForFilter
              ? getWeekRange(selectedWeekForFilter)
              : getDateRange(dateFilter as DateFilter);
    const prev = getPreviousPeriodRange(
      dateFilter as DateFilter,
      api.dateFrom,
      api.dateTo
    );
    return { apiDateRange: api, prevRange: prev };
  }, [
    dateFilter,
    customDateFrom,
    customDateTo,
    selectedMonthForFilter,
    selectedYearForFilter,
    selectedWeekForFilter,
  ]);

  const { items } = usePerevozki({
    auth: auth ?? null,
    dateFrom: apiDateRange.dateFrom,
    dateTo: apiDateRange.dateTo,
    useServiceRequest,
    inn: !useServiceRequest && auth ? auth.inn : undefined,
  });

  const { items: prevPeriodItems, loading: prevPeriodLoadingFromHook } =
    usePrevPeriodPerevozki({
      auth: auth ?? null,
      dateFrom: apiDateRange.dateFrom,
      dateTo: apiDateRange.dateTo,
      dateFromPrev: prevRange?.dateFrom ?? "",
      dateToPrev: prevRange?.dateTo ?? "",
      useServiceRequest,
      enabled:
        !!useServiceRequest &&
        !!prevRange &&
        !!auth?.login &&
        !!auth?.password,
    });

  const safeItems = Array.isArray(items) ? items : [];
  const safePrevPeriodItems = Array.isArray(prevPeriodItems) ? prevPeriodItems : [];

  const filteredItems = useMemo(() => {
    let res = safeItems.filter((i) => !isReceivedInfoStatus(i.State));
    if (statusFilter === "favorites") {
      try {
        const favorites = JSON.parse(
          localStorage.getItem("haulz.favorites") ?? "[]"
        ) as string[];
        res = res.filter((i) => i.Number && favorites.includes(i.Number));
      } catch {
        // ignore
      }
    } else if (statusFilter !== "all") {
      res = res.filter(
        (i) => getFilterKeyByStatus(i.State) === statusFilter
      );
    }
    if (senderFilter)
      res = res.filter(
        (i) => (i.Sender ?? "").trim() === senderFilter
      );
    if (receiverFilter)
      res = res.filter(
        (i) =>
          (i.Receiver ?? (i as CargoItem & { receiver?: string }).receiver ?? "").trim() ===
          receiverFilter
      );
    if (billStatusFilter !== "all")
      res = res.filter(
        (i) => getPaymentFilterKey(i.StateBill) === billStatusFilter
      );
    if (typeFilter === "ferry")
      res = res.filter(
        (i) =>
          i?.AK === true ||
          i?.AK === "true" ||
          i?.AK === "1" ||
          i?.AK === 1
      );
    if (typeFilter === "auto")
      res = res.filter(
        (i) =>
          !(
            i?.AK === true ||
            i?.AK === "true" ||
            i?.AK === "1" ||
            i?.AK === 1
          )
      );
    if (routeFilter === "MSK-KGD")
      res = res.filter(
        (i) =>
          cityToCode(i.CitySender) === "MSK" &&
          cityToCode(i.CityReceiver) === "KGD"
      );
    if (routeFilter === "KGD-MSK")
      res = res.filter(
        (i) =>
          cityToCode(i.CitySender) === "KGD" &&
          cityToCode(i.CityReceiver) === "MSK"
      );
    return res;
  }, [
    safeItems,
    statusFilter,
    senderFilter,
    receiverFilter,
    billStatusFilter,
    typeFilter,
    routeFilter,
  ]);

  const filteredPrevPeriodItems = useMemo(() => {
    if (!useServiceRequest || safePrevPeriodItems.length === 0) return [];
    let res = safePrevPeriodItems.filter((i) => !isReceivedInfoStatus(i.State));
    if (statusFilter === "favorites") {
      try {
        const favorites = JSON.parse(
          localStorage.getItem("haulz.favorites") ?? "[]"
        ) as string[];
        res = res.filter((i) => i.Number && favorites.includes(i.Number));
      } catch {
        // ignore
      }
    } else if (statusFilter !== "all") {
      res = res.filter(
        (i) => getFilterKeyByStatus(i.State) === statusFilter
      );
    }
    if (senderFilter)
      res = res.filter(
        (i) => (i.Sender ?? "").trim() === senderFilter
      );
    if (receiverFilter)
      res = res.filter(
        (i) =>
          (i.Receiver ?? (i as CargoItem & { receiver?: string }).receiver ?? "").trim() ===
          receiverFilter
      );
    if (billStatusFilter !== "all")
      res = res.filter(
        (i) => getPaymentFilterKey(i.StateBill) === billStatusFilter
      );
    if (typeFilter === "ferry")
      res = res.filter(
        (i) =>
          i?.AK === true ||
          i?.AK === "true" ||
          i?.AK === "1" ||
          i?.AK === 1
      );
    if (typeFilter === "auto")
      res = res.filter(
        (i) =>
          !(
            i?.AK === true ||
            i?.AK === "true" ||
            i?.AK === "1" ||
            i?.AK === 1
          )
      );
    if (routeFilter === "MSK-KGD")
      res = res.filter(
        (i) =>
          cityToCode(i.CitySender) === "MSK" &&
          cityToCode(i.CityReceiver) === "KGD"
      );
    if (routeFilter === "KGD-MSK")
      res = res.filter(
        (i) =>
          cityToCode(i.CitySender) === "KGD" &&
          cityToCode(i.CityReceiver) === "MSK"
      );
    return res;
  }, [
    safePrevPeriodItems,
    useServiceRequest,
    statusFilter,
    senderFilter,
    receiverFilter,
    billStatusFilter,
    typeFilter,
    routeFilter,
  ]);

  const stripSummaryComputed = useMemo((): StripSummary | null => {
    if (filteredItems.length === 0) return null;
    let sum = 0,
      paidWeight = 0,
      weight = 0,
      volume = 0,
      pieces = 0;
    filteredItems.forEach((item) => {
      sum +=
        typeof item.Sum === "string"
          ? parseFloat(item.Sum) || 0
          : (item.Sum || 0);
      paidWeight +=
        typeof item.PW === "string"
          ? parseFloat(item.PW) || 0
          : (item.PW || 0);
      weight +=
        typeof item.W === "string"
          ? parseFloat(item.W) || 0
          : (item.W || 0);
      volume +=
        typeof item.Value === "string"
          ? parseFloat(item.Value) || 0
          : (item.Value || 0);
      pieces +=
        typeof item.Mest === "string"
          ? parseFloat(item.Mest) || 0
          : (item.Mest || 0);
    });
    return { sum, paidWeight, weight, volume, pieces };
  }, [filteredItems]);

  const periodToPeriodTrendComputed = useMemo((): PeriodToPeriodTrend => {
    if (
      !useServiceRequest ||
      filteredPrevPeriodItems.length === 0
    )
      return null;
    const getVal = (item: CargoItem) => {
      if (chartType === "money")
        return typeof item.Sum === "string"
          ? parseFloat(item.Sum) || 0
          : (item.Sum || 0);
      if (chartType === "paidWeight")
        return typeof item.PW === "string"
          ? parseFloat(item.PW) || 0
          : (item.PW || 0);
      if (chartType === "weight")
        return typeof item.W === "string"
          ? parseFloat(item.W) || 0
          : (item.W || 0);
      if (chartType === "pieces")
        return typeof item.Mest === "string"
          ? parseFloat(item.Mest) || 0
          : (item.Mest || 0);
      return typeof item.Value === "string"
        ? parseFloat(item.Value) || 0
        : (item.Value || 0);
    };
    const currentVal = filteredItems.reduce(
      (acc, item) => acc + getVal(item),
      0
    );
    const prevVal = filteredPrevPeriodItems.reduce(
      (acc, item) => acc + getVal(item),
      0
    );
    if (prevVal === 0)
      return currentVal > 0 ? { direction: "up", percent: 100 } : null;
    const percent = Math.round(
      ((currentVal - prevVal) / prevVal) * 100
    );
    return {
      direction:
        currentVal > prevVal ? "up" : currentVal < prevVal ? "down" : null,
      percent: Math.abs(percent),
    };
  }, [
    useServiceRequest,
    filteredItems,
    filteredPrevPeriodItems,
    chartType,
  ]);

  const uniqueSenders = useMemo(() => {
    if (uniqueSendersProp !== undefined) return uniqueSendersProp;
    return [
      ...new Set(
        safeItems.map((i) => (i.Sender ?? "").trim()).filter(Boolean)
      ),
    ].sort();
  }, [safeItems, uniqueSendersProp]);

  const uniqueReceivers = useMemo(() => {
    if (uniqueReceiversProp !== undefined) return uniqueReceiversProp;
    return [
      ...new Set(
        safeItems.map((i) =>
          (i.Receiver ?? (i as CargoItem & { receiver?: string }).receiver ?? "").trim()
        ).filter(Boolean),
      ),
    ].sort();
  }, [safeItems, uniqueReceiversProp]);

  const [chartType, setChartType] = useState<ChartType>("money");
  const [stripExpanded, setStripExpanded] = useState(true);

  const stripSummary =
    stripSummaryProp !== undefined && stripSummaryProp !== null
      ? stripSummaryProp
      : stripSummaryComputed;
  const periodToPeriodTrend =
    periodToPeriodTrendProp !== undefined && periodToPeriodTrendProp !== null
      ? periodToPeriodTrendProp
      : periodToPeriodTrendComputed;
  const prevPeriodLoading =
    prevPeriodLoadingProp !== undefined
      ? prevPeriodLoadingProp
      : prevPeriodLoadingFromHook;

  const formatStripValue = (): string => {
    if (!stripSummary) return "—";
    if (chartType === "money")
      return stripSummary.sum != null
        ? formatCurrency(stripSummary.sum, true)
        : "—";
    if (chartType === "paidWeight" || chartType === "weight") {
      const v = chartType === "paidWeight" ? stripSummary.paidWeight : stripSummary.weight;
      return v != null ? `${Math.round(v).toLocaleString("ru-RU")} кг` : "—";
    }
    if (chartType === "volume")
      return stripSummary.volume != null
        ? `${(stripSummary.volume).toFixed(2).replace(".", ",")} м³`
        : "—";
    return stripSummary.pieces != null
      ? `${Math.round(stripSummary.pieces).toLocaleString("ru-RU")} шт`
      : "—";
  };

  return (
    <div
      className="home2-page"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        background: "var(--color-bg-primary)",
      }}
    >
      <header
        className="home2-header"
        style={{
          flexShrink: 0,
          padding: "1rem 1.25rem",
          background: "var(--color-bg-elevated, var(--color-bg-card))",
          borderBottom: "1px solid var(--color-border)",
          boxShadow: "0 1px 0 var(--color-border)",
        }}
      >
        <Flex align="center" gap="0.75rem">
          <Home
            className="w-6 h-6"
            style={{ color: "var(--color-primary)" }}
          />
          <Typography.Headline style={{ fontSize: "1.25rem", fontWeight: 600 }}>
            Домой 2
          </Typography.Headline>
        </Flex>
      </header>

      {/* Верхняя строка фильтров */}
      <div
        className="cargo-page-sticky-header home2-filters"
        style={{ marginBottom: "1rem", flexShrink: 0 }}
      >
        <div className="filters-container filters-row-scroll">
          <div className="filter-group" style={{ flexShrink: 0 }}>
            <div ref={dateButtonRef} style={{ display: "inline-flex" }}>
              <Button
                className="filter-button"
                onClick={() => {
                  setDateDropdownMode("main");
                  setIsStatusDropdownOpen(false);
                  setIsSenderDropdownOpen(false);
                  setIsReceiverDropdownOpen(false);
                  setIsBillStatusDropdownOpen(false);
                  setIsTypeDropdownOpen(false);
                  setIsRouteDropdownOpen(false);
                  setIsDateDropdownOpen((prev) => !prev);
                }}
              >
                Дата: {dateLabel} <ChevronDown className="w-4 h-4" />
              </Button>
            </div>
            <FilterDropdownPortal
              triggerRef={dateButtonRef}
              isOpen={isDateDropdownOpen}
              onClose={() => setIsDateDropdownOpen(false)}
            >
              {dateDropdownMode === "months" ? (
                <>
                  <div
                    className="dropdown-item"
                    onClick={() => setDateDropdownMode("main")}
                    style={{ fontWeight: 600 }}
                  >
                    ← Назад
                  </div>
                  {MONTH_NAMES.map((name, i) => (
                    <div
                      key={i}
                      className="dropdown-item"
                      onClick={() => {
                        const year = new Date().getFullYear();
                        setDateFilter("месяц");
                        setSelectedMonthForFilter({ year, month: i + 1 });
                        setIsDateDropdownOpen(false);
                        setDateDropdownMode("main");
                      }}
                    >
                      <Typography.Body>
                        {name} {new Date().getFullYear()}
                      </Typography.Body>
                    </div>
                  ))}
                </>
              ) : dateDropdownMode === "years" ? (
                <>
                  <div
                    className="dropdown-item"
                    onClick={() => setDateDropdownMode("main")}
                    style={{ fontWeight: 600 }}
                  >
                    ← Назад
                  </div>
                  {getYearsList(6).map((y) => (
                    <div
                      key={y}
                      className="dropdown-item"
                      onClick={() => {
                        setDateFilter("год");
                        setSelectedYearForFilter(y);
                        setIsDateDropdownOpen(false);
                        setDateDropdownMode("main");
                      }}
                    >
                      <Typography.Body>{y}</Typography.Body>
                    </div>
                  ))}
                </>
              ) : dateDropdownMode === "weeks" ? (
                <>
                  <div
                    className="dropdown-item"
                    onClick={() => setDateDropdownMode("main")}
                    style={{ fontWeight: 600 }}
                  >
                    ← Назад
                  </div>
                  {getWeeksList(16).map((w) => (
                    <div
                      key={w.monday}
                      className="dropdown-item"
                      onClick={() => {
                        setDateFilter("неделя");
                        setSelectedWeekForFilter(w.monday);
                        setIsDateDropdownOpen(false);
                        setDateDropdownMode("main");
                      }}
                    >
                      <Typography.Body>{w.label}</Typography.Body>
                    </div>
                  ))}
                </>
              ) : (
                ["сегодня", "вчера", "неделя", "месяц", "год", "период"].map(
                  (key) => {
                    const isMonth = key === "месяц";
                    const isYear = key === "год";
                    const isWeek = key === "неделя";
                    const doLongPress = isMonth || isYear || isWeek;
                    const timerRef = isMonth
                      ? monthLongPressTimerRef
                      : isYear
                        ? yearLongPressTimerRef
                        : weekLongPressTimerRef;
                    const wasLongPressRef = isMonth
                      ? monthWasLongPressRef
                      : isYear
                        ? yearWasLongPressRef
                        : weekWasLongPressRef;
                    const mode = isMonth
                      ? "months"
                      : isYear
                        ? "years"
                        : "weeks";
                    const title = isMonth
                      ? "Клик — текущий месяц; удерживайте — выбор месяца"
                      : isYear
                        ? "Клик — 365 дней; удерживайте — выбор года"
                        : isWeek
                          ? "Клик — предыдущая неделя; удерживайте — выбор недели (пн–вс)"
                          : undefined;
                    return (
                      <div
                        key={key}
                        className="dropdown-item"
                        title={title}
                        onPointerDown={
                          doLongPress
                            ? () => {
                                wasLongPressRef.current = false;
                                timerRef.current = setTimeout(() => {
                                  timerRef.current = null;
                                  wasLongPressRef.current = true;
                                  setDateDropdownMode(mode);
                                }, 500);
                              }
                            : undefined
                        }
                        onPointerUp={
                          doLongPress
                            ? () => {
                                if (timerRef.current) {
                                  clearTimeout(timerRef.current);
                                  timerRef.current = null;
                                }
                              }
                            : undefined
                        }
                        onPointerLeave={
                          doLongPress
                            ? () => {
                                if (timerRef.current) {
                                  clearTimeout(timerRef.current);
                                  timerRef.current = null;
                                }
                              }
                            : undefined
                        }
                        onClick={() => {
                          if (
                            doLongPress &&
                            wasLongPressRef.current
                          ) {
                            wasLongPressRef.current = false;
                            return;
                          }
                          if (key === "период") {
                            let r: { dateFrom: string; dateTo: string };
                            if (dateFilter === "период") {
                              r = {
                                dateFrom: customDateFrom,
                                dateTo: customDateTo,
                              };
                            } else if (
                              dateFilter === "месяц" &&
                              selectedMonthForFilter
                            ) {
                              const { year, month } = selectedMonthForFilter;
                              const pad = (n: number) =>
                                String(n).padStart(2, "0");
                              const lastDay = new Date(
                                year,
                                month,
                                0
                              ).getDate();
                              r = {
                                dateFrom: `${year}-${pad(month)}-01`,
                                dateTo: `${year}-${pad(month)}-${pad(lastDay)}`,
                              };
                            } else if (
                              dateFilter === "год" &&
                              selectedYearForFilter
                            ) {
                              r = {
                                dateFrom: `${selectedYearForFilter}-01-01`,
                                dateTo: `${selectedYearForFilter}-12-31`,
                              };
                            } else if (
                              dateFilter === "неделя" &&
                              selectedWeekForFilter
                            ) {
                              r = getWeekRange(selectedWeekForFilter);
                            } else {
                              r = getDateRange(dateFilter as DateFilter);
                            }
                            setCustomDateFrom(r.dateFrom);
                            setCustomDateTo(r.dateTo);
                          }
                          setDateFilter(key as DateFilter);
                          if (key === "месяц") setSelectedMonthForFilter(null);
                          if (key === "год") setSelectedYearForFilter(null);
                          if (key === "неделя")
                            setSelectedWeekForFilter(null);
                          setIsDateDropdownOpen(false);
                          if (key === "период") setIsCustomModalOpen(true);
                        }}
                      >
                        <Typography.Body>
                          {key === "год"
                            ? "Год"
                            : key.charAt(0).toUpperCase() + key.slice(1)}
                        </Typography.Body>
                      </div>
                    );
                  }
                )
              )}
            </FilterDropdownPortal>
          </div>

          <div className="filter-group" style={{ flexShrink: 0 }}>
            <div ref={statusButtonRef} style={{ display: "inline-flex" }}>
              <Button
                className="filter-button"
                onClick={() => {
                  setIsDateDropdownOpen(false);
                  setIsSenderDropdownOpen(false);
                  setIsReceiverDropdownOpen(false);
                  setIsBillStatusDropdownOpen(false);
                  setIsTypeDropdownOpen(false);
                  setIsRouteDropdownOpen(false);
                  setIsStatusDropdownOpen((prev) => !prev);
                }}
              >
                Статус: {STATUS_MAP[statusFilter] ?? "Все"}{" "}
                <ChevronDown className="w-4 h-4" />
              </Button>
            </div>
            <FilterDropdownPortal
              triggerRef={statusButtonRef}
              isOpen={isStatusDropdownOpen}
              onClose={() => setIsStatusDropdownOpen(false)}
            >
              {(Object.keys(STATUS_MAP) as StatusFilter[]).map((key) => (
                <div
                  key={key}
                  className="dropdown-item"
                  onClick={() => {
                    setStatusFilter(key);
                    setIsStatusDropdownOpen(false);
                  }}
                >
                  <Typography.Body>{STATUS_MAP[key]}</Typography.Body>
                </div>
              ))}
            </FilterDropdownPortal>
          </div>

          <div className="filter-group" style={{ flexShrink: 0 }}>
            <div ref={senderButtonRef} style={{ display: "inline-flex" }}>
              <Button
                className="filter-button"
                onClick={() => {
                  setIsDateDropdownOpen(false);
                  setIsStatusDropdownOpen(false);
                  setIsReceiverDropdownOpen(false);
                  setIsBillStatusDropdownOpen(false);
                  setIsTypeDropdownOpen(false);
                  setIsRouteDropdownOpen(false);
                  setIsSenderDropdownOpen((prev) => !prev);
                }}
              >
                Отправитель: {senderFilter ? stripOoo(senderFilter) : "Все"}{" "}
                <ChevronDown className="w-4 h-4" />
              </Button>
            </div>
            <FilterDropdownPortal
              triggerRef={senderButtonRef}
              isOpen={isSenderDropdownOpen}
              onClose={() => setIsSenderDropdownOpen(false)}
            >
              <div
                className="dropdown-item"
                onClick={() => {
                  setSenderFilter("");
                  setIsSenderDropdownOpen(false);
                }}
              >
                <Typography.Body>Все</Typography.Body>
              </div>
              {uniqueSenders.map((s) => (
                <div
                  key={s}
                  className="dropdown-item"
                  onClick={() => {
                    setSenderFilter(s);
                    setIsSenderDropdownOpen(false);
                  }}
                >
                  <Typography.Body>{stripOoo(s)}</Typography.Body>
                </div>
              ))}
            </FilterDropdownPortal>
          </div>

          <div className="filter-group" style={{ flexShrink: 0 }}>
            <div ref={receiverButtonRef} style={{ display: "inline-flex" }}>
              <Button
                className="filter-button"
                onClick={() => {
                  setIsDateDropdownOpen(false);
                  setIsStatusDropdownOpen(false);
                  setIsSenderDropdownOpen(false);
                  setIsBillStatusDropdownOpen(false);
                  setIsTypeDropdownOpen(false);
                  setIsRouteDropdownOpen(false);
                  setIsReceiverDropdownOpen((prev) => !prev);
                }}
              >
                Получатель:{" "}
                {receiverFilter ? stripOoo(receiverFilter) : "Все"}{" "}
                <ChevronDown className="w-4 h-4" />
              </Button>
            </div>
            <FilterDropdownPortal
              triggerRef={receiverButtonRef}
              isOpen={isReceiverDropdownOpen}
              onClose={() => setIsReceiverDropdownOpen(false)}
            >
              <div
                className="dropdown-item"
                onClick={() => {
                  setReceiverFilter("");
                  setIsReceiverDropdownOpen(false);
                }}
              >
                <Typography.Body>Все</Typography.Body>
              </div>
              {uniqueReceivers.map((r) => (
                <div
                  key={r}
                  className="dropdown-item"
                  onClick={() => {
                    setReceiverFilter(r);
                    setIsReceiverDropdownOpen(false);
                  }}
                >
                  <Typography.Body>{stripOoo(r)}</Typography.Body>
                </div>
              ))}
            </FilterDropdownPortal>
          </div>

          {useServiceRequest && (
            <div className="filter-group" style={{ flexShrink: 0 }}>
              <div ref={billStatusButtonRef} style={{ display: "inline-flex" }}>
                <Button
                  className="filter-button"
                  onClick={() => {
                    setIsDateDropdownOpen(false);
                    setIsStatusDropdownOpen(false);
                    setIsSenderDropdownOpen(false);
                    setIsReceiverDropdownOpen(false);
                    setIsTypeDropdownOpen(false);
                    setIsRouteDropdownOpen(false);
                    setIsBillStatusDropdownOpen((prev) => !prev);
                  }}
                >
                  Статус счёта: {BILL_STATUS_MAP[billStatusFilter]}{" "}
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>
              <FilterDropdownPortal
                triggerRef={billStatusButtonRef}
                isOpen={isBillStatusDropdownOpen}
                onClose={() => setIsBillStatusDropdownOpen(false)}
              >
                {(
                  [
                    "all",
                    "paid",
                    "unpaid",
                    "partial",
                    "cancelled",
                    "unknown",
                  ] as const
                ).map((key) => (
                  <div
                    key={key}
                    className="dropdown-item"
                    onClick={() => {
                      setBillStatusFilter(key);
                      setIsBillStatusDropdownOpen(false);
                    }}
                  >
                    <Typography.Body>{BILL_STATUS_MAP[key]}</Typography.Body>
                  </div>
                ))}
              </FilterDropdownPortal>
            </div>
          )}

          <div className="filter-group" style={{ flexShrink: 0 }}>
            <div ref={typeButtonRef} style={{ display: "inline-flex" }}>
              <Button
                className="filter-button"
                onClick={() => {
                  setIsDateDropdownOpen(false);
                  setIsStatusDropdownOpen(false);
                  setIsSenderDropdownOpen(false);
                  setIsReceiverDropdownOpen(false);
                  setIsBillStatusDropdownOpen(false);
                  setIsRouteDropdownOpen(false);
                  setIsTypeDropdownOpen((prev) => !prev);
                }}
              >
                Тип:{" "}
                {typeFilter === "all"
                  ? "Все"
                  : typeFilter === "ferry"
                    ? "Паром"
                    : "Авто"}{" "}
                <ChevronDown className="w-4 h-4" />
              </Button>
            </div>
            <FilterDropdownPortal
              triggerRef={typeButtonRef}
              isOpen={isTypeDropdownOpen}
              onClose={() => setIsTypeDropdownOpen(false)}
            >
              <div
                className="dropdown-item"
                onClick={() => {
                  setTypeFilter("all");
                  setIsTypeDropdownOpen(false);
                }}
              >
                <Typography.Body>Все</Typography.Body>
              </div>
              <div
                className="dropdown-item"
                onClick={() => {
                  setTypeFilter("ferry");
                  setIsTypeDropdownOpen(false);
                }}
              >
                <Typography.Body>Паром</Typography.Body>
              </div>
              <div
                className="dropdown-item"
                onClick={() => {
                  setTypeFilter("auto");
                  setIsTypeDropdownOpen(false);
                }}
              >
                <Typography.Body>Авто</Typography.Body>
              </div>
            </FilterDropdownPortal>
          </div>

          <div className="filter-group" style={{ flexShrink: 0 }}>
            <div ref={routeButtonRef} style={{ display: "inline-flex" }}>
              <Button
                className="filter-button"
                onClick={() => {
                  setIsDateDropdownOpen(false);
                  setIsStatusDropdownOpen(false);
                  setIsSenderDropdownOpen(false);
                  setIsReceiverDropdownOpen(false);
                  setIsBillStatusDropdownOpen(false);
                  setIsTypeDropdownOpen(false);
                  setIsRouteDropdownOpen((prev) => !prev);
                }}
              >
                Маршрут:{" "}
                {routeFilter === "all"
                  ? "Все"
                  : routeFilter === "MSK-KGD"
                    ? "MSK – KGD"
                    : "KGD – MSK"}{" "}
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
              >
                <Typography.Body>Все</Typography.Body>
              </div>
              <div
                className="dropdown-item"
                onClick={() => {
                  setRouteFilter("MSK-KGD");
                  setIsRouteDropdownOpen(false);
                }}
              >
                <Typography.Body>MSK – KGD</Typography.Body>
              </div>
              <div
                className="dropdown-item"
                onClick={() => {
                  setRouteFilter("KGD-MSK");
                  setIsRouteDropdownOpen(false);
                }}
              >
                <Typography.Body>KGD – MSK</Typography.Body>
              </div>
            </FilterDropdownPortal>
          </div>
        </div>
      </div>

      {/* Полоска с периодом и типом графика (раскрывающийся блок) */}
      {useServiceRequest && (
        <Typography.Body
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "var(--color-text-secondary)",
            marginBottom: "0.35rem",
          }}
        >
          Приемка
        </Typography.Body>
      )}
      <div
        className="home-strip"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border)",
          borderRadius: "12px",
          marginBottom: "1rem",
          overflow: "hidden",
        }}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => setStripExpanded((e) => !e)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setStripExpanded((e) => !e);
            }
          }}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
            padding: "0.75rem 1rem",
            minWidth: 0,
            cursor: "pointer",
          }}
        >
          <span
            style={{
              flexShrink: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <Typography.Body
              style={{
                color: "var(--color-primary-blue)",
                fontWeight: 600,
                fontSize: "0.6rem",
              }}
            >
              <DateText value={apiDateRange.dateFrom} /> –{" "}
              <DateText value={apiDateRange.dateTo} />
            </Typography.Body>
          </span>
          <Flex gap="0.25rem" align="center" style={{ flexShrink: 0 }}>
            {showSums && (
              <Button
                type="button"
                className="filter-button"
                style={{
                  padding: "0.35rem",
                  minWidth: "auto",
                  background:
                    chartType === "money"
                      ? "var(--color-primary-blue)"
                      : "transparent",
                  border: "none",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setChartType("money");
                }}
                title="Рубли"
              >
                <RussianRuble
                  className="w-4 h-4"
                  style={{
                    color:
                      chartType === "money"
                        ? "white"
                        : "var(--color-text-secondary)",
                  }}
                />
              </Button>
            )}
            <Button
              type="button"
              className="filter-button"
              style={{
                padding: "0.35rem",
                minWidth: "auto",
                background:
                  chartType === "paidWeight" ? "#10b981" : "transparent",
                border: "none",
              }}
              onClick={(e) => {
                e.stopPropagation();
                setChartType("paidWeight");
              }}
              title="Платный вес"
            >
              <Scale
                className="w-4 h-4"
                style={{
                  color:
                    chartType === "paidWeight"
                      ? "white"
                      : "var(--color-text-secondary)",
                }}
              />
            </Button>
            <Button
              type="button"
              className="filter-button"
              style={{
                padding: "0.35rem",
                minWidth: "auto",
                background: chartType === "weight" ? "#0d9488" : "transparent",
                border: "none",
              }}
              onClick={(e) => {
                e.stopPropagation();
                setChartType("weight");
              }}
              title="Вес"
            >
              <Weight
                className="w-4 h-4"
                style={{
                  color:
                    chartType === "weight"
                      ? "white"
                      : "var(--color-text-secondary)",
                }}
              />
            </Button>
            <Button
              type="button"
              className="filter-button"
              style={{
                padding: "0.35rem",
                minWidth: "auto",
                background: chartType === "volume" ? "#f59e0b" : "transparent",
                border: "none",
              }}
              onClick={(e) => {
                e.stopPropagation();
                setChartType("volume");
              }}
              title="Объём"
            >
              <List
                className="w-4 h-4"
                style={{
                  color:
                    chartType === "volume"
                      ? "white"
                      : "var(--color-text-secondary)",
                }}
              />
            </Button>
            <Button
              type="button"
              className="filter-button"
              style={{
                padding: "0.35rem",
                minWidth: "auto",
                background: chartType === "pieces" ? "#8b5cf6" : "transparent",
                border: "none",
              }}
              onClick={(e) => {
                e.stopPropagation();
                setChartType("pieces");
              }}
              title="Шт"
            >
              <Package
                className="w-4 h-4"
                style={{
                  color:
                    chartType === "pieces"
                      ? "white"
                      : "var(--color-text-secondary)",
                }}
              />
            </Button>
            {stripExpanded ? (
              <ChevronUp className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
            ) : (
              <ChevronDown className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
            )}
          </Flex>
        </div>
        {stripExpanded && (
          <div
            style={{
              padding: "1.25rem 1rem 1rem",
              borderTop: "1px solid var(--color-border)",
            }}
          >
            <Flex align="center" gap="0.5rem" style={{ flexWrap: "wrap" }}>
              {dateFilter === "неделя" && (
                <Typography.Body
                  style={{
                    fontWeight: 600,
                    fontSize: "0.6rem",
                    color: "var(--color-text-secondary)",
                    marginRight: "0.5rem",
                  }}
                >
                  За неделю:
                </Typography.Body>
              )}
              <Typography.Body style={{ fontWeight: 600, fontSize: "0.6rem" }}>
                {formatStripValue()}
              </Typography.Body>
              {useServiceRequest && prevPeriodLoading && (
                <Flex
                  align="center"
                  gap="0.35rem"
                  style={{ flexShrink: 0 }}
                  title="Расчёт динамики"
                >
                  <Loader2
                    className="w-5 h-5 animate-spin"
                    style={{ color: "var(--color-primary-blue)" }}
                  />
                </Flex>
              )}
              {useServiceRequest && !prevPeriodLoading && periodToPeriodTrend && (
                <>
                  {periodToPeriodTrend.direction === "up" && (
                    <Flex
                      align="center"
                      gap="0.25rem"
                      style={{ flexShrink: 0 }}
                    >
                      <TrendingUp
                        className="w-5 h-5"
                        style={{ color: "var(--color-success-status)" }}
                      />
                      <Typography.Body
                        style={{
                          fontSize: "0.85rem",
                          color: "var(--color-success-status)",
                          fontWeight: 600,
                        }}
                      >
                        +{periodToPeriodTrend.percent}%
                      </Typography.Body>
                    </Flex>
                  )}
                  {periodToPeriodTrend.direction === "down" && (
                    <Flex
                      align="center"
                      gap="0.25rem"
                      style={{ flexShrink: 0 }}
                    >
                      <TrendingDown
                        className="w-5 h-5"
                        style={{ color: "#ef4444" }}
                      />
                      <Typography.Body
                        style={{
                          fontSize: "0.85rem",
                          color: "#ef4444",
                          fontWeight: 600,
                        }}
                      >
                        -{periodToPeriodTrend.percent}%
                      </Typography.Body>
                    </Flex>
                  )}
                  {periodToPeriodTrend.direction === null &&
                    periodToPeriodTrend.percent === 0 && (
                      <Flex
                        align="center"
                        gap="0.25rem"
                        style={{ flexShrink: 0 }}
                      >
                        <Minus
                          className="w-5 h-5"
                          style={{ color: "var(--color-text-secondary)" }}
                        />
                        <Typography.Body
                          style={{
                            fontSize: "0.85rem",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          0%
                        </Typography.Body>
                      </Flex>
                    )}
                </>
              )}
            </Flex>
          </div>
        )}
      </div>

      <main
        className="home2-main"
        style={{
          flex: 1,
          minHeight: "200px",
          padding: "1rem 1.25rem",
        }}
      />

      <footer
        className="home2-footer"
        style={{
          flexShrink: 0,
          padding: "1rem 1.25rem",
          background: "var(--color-bg-elevated, var(--color-bg-card))",
          borderTop: "1px solid var(--color-border)",
          color: "var(--color-text-secondary)",
        }}
      >
        <Typography.Body style={{ fontSize: "0.875rem" }}>
          Подвал · Домой 2
        </Typography.Body>
      </footer>

      <FilterDialog
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        dateFrom={customDateFrom}
        dateTo={customDateTo}
        onApply={(f, t) => {
          setCustomDateFrom(f);
          setCustomDateTo(t);
          setDateFilter("период");
        }}
      />
    </div>
  );
}
