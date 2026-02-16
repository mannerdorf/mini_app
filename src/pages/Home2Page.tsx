import React, { useState, useRef, useEffect } from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { Home, ChevronDown } from "lucide-react";
import { FilterDropdownPortal } from "../components/ui/FilterDropdownPortal";
import { FilterDialog } from "../components/shared/FilterDialog";
import * as dateUtils from "../lib/dateUtils";
import { STATUS_MAP, BILL_STATUS_MAP } from "../lib/statusUtils";
import type { DateFilter } from "../types";
import type { StatusFilter } from "../types";
import type { BillStatusFilterKey } from "../lib/statusUtils";
import { stripOoo } from "../lib/formatUtils";

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
} = dateUtils;

type Home2PageProps = {
  /** Служебный режим: показывать фильтр «Статус счёта» */
  useServiceRequest?: boolean;
  /** Список отправителей для выпадающего списка (если не передан — только «Все») */
  uniqueSenders?: string[];
  /** Список получателей для выпадающего списка */
  uniqueReceivers?: string[];
};

export function Home2Page({
  useServiceRequest = false,
  uniqueSenders = [],
  uniqueReceivers = [],
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
