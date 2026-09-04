import React, { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button, Typography } from "@maxhub/max-ui";
import * as dateUtils from "../../lib/dateUtils";
import { FilterDialog } from "../../components/shared/FilterDialog";
import { FilterDropdownPortal } from "../../components/ui/FilterDropdownPortal";
import { ResetAllFiltersButton } from "../../components/ui/ResetAllFiltersButton";
import { formatDateFilterButtonLabel } from "./formatDateFilterLabel";
import type { PersistedDateFilterControls } from "./usePersistedDateFilter";

const { getDateRange, getWeekRange, getYearsList, getWeeksList, getDefaultWeekMonday } = dateUtils;
const MONTH_NAMES = dateUtils.MONTH_NAMES;

export type ListDateFilterControlProps = PersistedDateFilterControls & {
  apiDateRange: { dateFrom: string; dateTo: string };
  className?: string;
  onResetFilters?: () => void;
};

export function ListDateFilterControl({
  dateFilter,
  setDateFilter,
  apiDateRange,
  customDateFrom,
  setCustomDateFrom,
  customDateTo,
  setCustomDateTo,
  selectedMonthForFilter,
  setSelectedMonthForFilter,
  selectedYearForFilter,
  setSelectedYearForFilter,
  selectedWeekForFilter,
  setSelectedWeekForFilter,
  className,
  onResetFilters,
}: ListDateFilterControlProps) {
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
  const [dateDropdownMode, setDateDropdownMode] = useState<"main" | "months" | "years" | "weeks">("main");
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const dateButtonRef = useRef<HTMLDivElement>(null);
  const monthLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monthWasLongPressRef = useRef(false);
  const yearLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const yearWasLongPressRef = useRef(false);
  const weekLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const weekWasLongPressRef = useRef(false);

  return (
    <>
      <ResetAllFiltersButton onReset={onResetFilters} />
      <div className={className ?? "filter-group"} style={{ flexShrink: 0 }}>
        <div ref={dateButtonRef} style={{ display: "inline-flex" }}>
          <Button
            className="filter-button"
            onClick={() => {
              setIsDateDropdownOpen(!isDateDropdownOpen);
              setDateDropdownMode("main");
            }}
          >
            Дата:{" "}
            {formatDateFilterButtonLabel({
              dateFilter,
              apiDateRange,
              selectedMonthForFilter,
              selectedYearForFilter,
              selectedWeekForFilter,
            })}{" "}
            <ChevronDown className="w-4 h-4" />
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
            (["сегодня", "вчера", "неделя", "месяц", "год", "период"] as const).map((key) => {
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
              const mode = isMonth ? "months" : isYear ? "years" : "weeks";
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
                    if (doLongPress && wasLongPressRef.current) {
                      wasLongPressRef.current = false;
                      return;
                    }
                    if (key === "период") {
                      let r: { dateFrom: string; dateTo: string };
                      if (dateFilter === "период") {
                        r = { dateFrom: customDateFrom, dateTo: customDateTo };
                      } else if (dateFilter === "месяц" && selectedMonthForFilter) {
                        const { year, month } = selectedMonthForFilter;
                        const pad = (n: number) => String(n).padStart(2, "0");
                        const lastDay = new Date(year, month, 0).getDate();
                        r = {
                          dateFrom: `${year}-${pad(month)}-01`,
                          dateTo: `${year}-${pad(month)}-${pad(lastDay)}`,
                        };
                      } else if (dateFilter === "год" && selectedYearForFilter) {
                        r = {
                          dateFrom: `${selectedYearForFilter}-01-01`,
                          dateTo: `${selectedYearForFilter}-12-31`,
                        };
                      } else if (dateFilter === "неделя" && selectedWeekForFilter) {
                        r = getWeekRange(selectedWeekForFilter);
                      } else {
                        r = getDateRange(dateFilter);
                      }
                      setCustomDateFrom(r.dateFrom);
                      setCustomDateTo(r.dateTo);
                    }
                    setDateFilter(key);
                    if (key === "месяц") setSelectedMonthForFilter(null);
                    if (key === "год") setSelectedYearForFilter(null);
                    if (key === "неделя") setSelectedWeekForFilter(getDefaultWeekMonday());
                    setIsDateDropdownOpen(false);
                    if (key === "период") setIsCustomModalOpen(true);
                  }}
                >
                  <Typography.Body>
                    {key === "год" ? "Год" : key.charAt(0).toUpperCase() + key.slice(1)}
                  </Typography.Body>
                </div>
              );
            })
          )}
        </FilterDropdownPortal>
      </div>
      <FilterDialog
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        dateFrom={customDateFrom}
        dateTo={customDateTo}
        onApply={(from, to) => {
          setCustomDateFrom(from);
          setCustomDateTo(to);
        }}
      />
    </>
  );
}
