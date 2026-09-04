import React, { useRef } from "react";
import { motion } from "motion/react";
import { Button, Typography } from "@maxhub/max-ui";
import { ChevronDown, ArrowUp, ArrowDown } from "lucide-react";
import { FilterDropdownPortal } from "../../components/ui/FilterDropdownPortal";
import { ResetAllFiltersButton } from "../../components/ui/ResetAllFiltersButton";
import { CustomPeriodModal } from "../../components/modals/CustomPeriodModal";
import { stripOoo } from "../../lib/formatUtils";
import { STATUS_MAP, BILL_STATUS_MAP } from "../../lib/statusUtils";
import { routeKeyToCargoLabel } from "../../lib/sharedListFilters";
import {
  getDateRange,
  getWeekRange,
  getYearsList,
  getWeeksList,
  MONTH_NAMES,
} from "../../lib/dateUtils";
import { formatDateFilterButtonLabel } from "../listWorkspace";
import type { DateFilter, StatusFilter, AuthData } from "../../types";
import type {
  CargoStatusFilterKey,
  RouteFilterKey,
  SharedBillStatusKey,
  TypeFilterKey,
} from "../../lib/sharedListFilters";
import type { DocSectionKey } from "./documentsSectionConstants";
import { DocumentsTransportFilter } from "./DocumentsTransportFilter";
import { isDocumentsTransportFilterVisible } from "./documentsTransportFilterVisible";
import { DocumentsSummaryCard } from "./views/documentsViewBlocks";
import { DocumentsTariffsToolbarFilters } from "./catalogs/DocumentsTariffsToolbarFilters";
import { DocumentsSverkiToolbarFilters } from "./catalogs/DocumentsSverkiToolbarFilters";
import { DocumentsDogovorsToolbarFilters } from "./catalogs/DocumentsDogovorsToolbarFilters";
import { SverkiOrderActionButton } from "./catalogs/SverkiOrderActionButton";
import { DocumentsOrdersToolbarFilters } from "./orders/DocumentsOrdersToolbarFilters";
import { DocumentsActsToolbarFilters } from "./acts/DocumentsActsToolbarFilters";
import { DocumentsEdoToolbarFilters } from "./edo/DocumentsEdoToolbarFilters";
import { ClaimsToolbarFilters } from "./claims/ClaimsToolbarFilters";
import { ClaimsCreateActionButton } from "./claims/ClaimsCreateActionButton";
import { SendingsToolbarFilters } from "./sendings/SendingsToolbarFilters";
import { cargoSummaryMotion } from "../../pages/cargoMotion";

export type DocumentsPageToolbarDateFilterProps = {
  sortOrder: "asc" | "desc";
  onToggleSort: () => void;
  dateFilter: DateFilter;
  setDateFilter: React.Dispatch<React.SetStateAction<DateFilter>>;
  apiDateRange: { dateFrom: string; dateTo: string };
  customDateFrom: string;
  setCustomDateFrom: React.Dispatch<React.SetStateAction<string>>;
  customDateTo: string;
  setCustomDateTo: React.Dispatch<React.SetStateAction<string>>;
  selectedMonthForFilter: { year: number; month: number } | null;
  setSelectedMonthForFilter: React.Dispatch<
    React.SetStateAction<{ year: number; month: number } | null>
  >;
  selectedYearForFilter: number | null;
  setSelectedYearForFilter: React.Dispatch<React.SetStateAction<number | null>>;
  selectedWeekForFilter: string | null;
  setSelectedWeekForFilter: React.Dispatch<React.SetStateAction<string | null>>;
  isDateDropdownOpen: boolean;
  setIsDateDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  dateDropdownMode: "main" | "months" | "years" | "weeks";
  setDateDropdownMode: React.Dispatch<React.SetStateAction<"main" | "months" | "years" | "weeks">>;
  isCustomModalOpen: boolean;
  setIsCustomModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export type DocumentsPageToolbarCatalogToolbars = {
  customerFilter: string;
  setCustomerFilter: React.Dispatch<React.SetStateAction<string>>;
  uniqueCustomers: string[];
  uniqueOrderCustomers: string[];
  isCustomerDropdownOpen: boolean;
  setIsCustomerDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  actCustomerFilter: string;
  setActCustomerFilter: React.Dispatch<React.SetStateAction<string>>;
  uniqueActCustomers: string[];
  isActCustomerDropdownOpen: boolean;
  setIsActCustomerDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  edoStatusFilterSet: Set<string>;
  setEdoStatusFilterSet: React.Dispatch<React.SetStateAction<Set<string>>>;
  uniqueEdoStatuses: string[];
  isEdoStatusDropdownOpen: boolean;
  setIsEdoStatusDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  billStatusFilterSet: Set<SharedBillStatusKey>;
  setBillStatusFilterSet: React.Dispatch<React.SetStateAction<Set<SharedBillStatusKey>>>;
  invoiceFavoritesOnly: boolean;
  setInvoiceFavoritesOnly: React.Dispatch<React.SetStateAction<boolean>>;
  isBillStatusDropdownOpen: boolean;
  setIsBillStatusDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  deliveryStatusFilterSet: Set<CargoStatusFilterKey>;
  setDeliveryStatusFilterSet: React.Dispatch<React.SetStateAction<Set<CargoStatusFilterKey>>>;
  isDeliveryStatusDropdownOpen: boolean;
  setIsDeliveryStatusDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  routeFilterSet: Set<RouteFilterKey>;
  setRouteFilterSet: React.Dispatch<React.SetStateAction<Set<RouteFilterKey>>>;
  isRouteCargoDropdownOpen: boolean;
  setIsRouteCargoDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  typeFilterSet: Set<TypeFilterKey>;
  setTypeFilterSet: React.Dispatch<React.SetStateAction<Set<TypeFilterKey>>>;
  isTypeDropdownOpen: boolean;
  setIsTypeDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isRouteDropdownOpen: boolean;
  setIsRouteDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  transportFilter: string;
  setTransportFilter: React.Dispatch<React.SetStateAction<string>>;
  transportOptionsCurrentSection: string[];
  isTransportDropdownOpen: boolean;
  setIsTransportDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  transportSearchQuery: string;
  setTransportSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  tariffs: React.ComponentProps<typeof DocumentsTariffsToolbarFilters>;
  orders: React.ComponentProps<typeof DocumentsOrdersToolbarFilters>;
  acts: React.ComponentProps<typeof DocumentsActsToolbarFilters>;
  sverki: React.ComponentProps<typeof DocumentsSverkiToolbarFilters>;
  dogovors: React.ComponentProps<typeof DocumentsDogovorsToolbarFilters>;
  claims: React.ComponentProps<typeof ClaimsToolbarFilters>;
  edo: React.ComponentProps<typeof DocumentsEdoToolbarFilters>;
  sendings: React.ComponentProps<typeof SendingsToolbarFilters>;
};

export type DocumentsPageToolbarSummaryProps = {
  invoicesLoading: boolean;
  invoicesError: string | null;
  filteredInvoiceCount: number;
  invoicesSummary: { sum: number; count: number };
  actsLoading: boolean;
  actsError: string | null;
  filteredActsCount: number;
  actsSummary: { sum: number; count: number };
  showSums: boolean;
  documentsServiceSaasUi: boolean;
  tableModeFlatDirect: boolean;
  docsMotionEnabled: boolean;
};

export type DocumentsPageToolbarActionBars = {
  auth: AuthData;
  effectiveActiveInn?: string;
  activeCustomerName?: string;
  onNewOrder: () => void;
  onOpenClaimsCreate: () => void;
  onOpenSverkiOrder: () => void;
  sverkiOrderDisabled: boolean;
};

export type DocumentsPageToolbarProps = {
  docSection: DocSectionKey;
  effectiveServiceMode: boolean;
  dateFilterProps: DocumentsPageToolbarDateFilterProps;
  catalogToolbars: DocumentsPageToolbarCatalogToolbars;
  summaryProps: DocumentsPageToolbarSummaryProps;
  actionBars: DocumentsPageToolbarActionBars;
  closeDocumentsToolbarDropdownsExceptSendings: () => void;
  closeDocumentsToolbarDropdownsForTransport: () => void;
};

const TOOLBAR_SECTIONS: DocSectionKey[] = [
  "Счета",
  "ЭДО",
  "УПД",
  "Заявки",
  "Отправки",
  "Тарифы",
  "Акты сверок",
  "Договоры",
  "Претензии",
];

export function DocumentsPageToolbar({
  docSection,
  effectiveServiceMode,
  dateFilterProps,
  catalogToolbars,
  summaryProps,
  actionBars,
  closeDocumentsToolbarDropdownsExceptSendings,
  closeDocumentsToolbarDropdownsForTransport,
}: DocumentsPageToolbarProps) {
  const {
    sortOrder,
    onToggleSort,
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
    isDateDropdownOpen,
    setIsDateDropdownOpen,
    dateDropdownMode,
    setDateDropdownMode,
    isCustomModalOpen,
    setIsCustomModalOpen,
  } = dateFilterProps;

  const dateButtonRef = useRef<HTMLDivElement | null>(null);
  const customerButtonRef = useRef<HTMLDivElement | null>(null);
  const billStatusButtonRef = useRef<HTMLDivElement | null>(null);
  const deliveryStatusButtonRef = useRef<HTMLDivElement | null>(null);
  const routeCargoButtonRef = useRef<HTMLDivElement | null>(null);
  const edoStatusButtonRef = useRef<HTMLDivElement | null>(null);
  const monthLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monthWasLongPressRef = useRef(false);
  const yearLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const yearWasLongPressRef = useRef(false);
  const weekLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const weekWasLongPressRef = useRef(false);

  const showToolbar = TOOLBAR_SECTIONS.includes(docSection);

  return (
    <>
      {showToolbar && (
        <div className="filters-container filters-row-scroll">
          <div
            className="filter-group"
            style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexShrink: 0 }}
          >
            <ResetAllFiltersButton />
            {docSection !== "Тарифы" && docSection !== "Договоры" ? (
              <Button
                className="filter-button"
                style={{ padding: "0.5rem", minWidth: "auto" }}
                onClick={onToggleSort}
                title={sortOrder === "desc" ? "Дата по убыванию" : "Дата по возрастанию"}
              >
                {sortOrder === "desc" ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
              </Button>
            ) : null}
            {docSection !== "Договоры" ? (
              <>
                <div ref={dateButtonRef} style={{ display: "inline-flex" }}>
                  <Button
                    className="filter-button"
                    onClick={() => {
                      const next = !isDateDropdownOpen;
                      closeDocumentsToolbarDropdownsExceptSendings();
                      setDateDropdownMode("main");
                      setIsDateDropdownOpen(next);
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
                            setDateFilter("месяц");
                            setSelectedMonthForFilter({ year: new Date().getFullYear(), month: i + 1 });
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
                            ? "Клик — последние 7 дней; удерживайте — выбор недели (пн–вс)"
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
                            if (key === "неделя") setSelectedWeekForFilter(null);
                            setIsDateDropdownOpen(false);
                            if (key === "период") setIsCustomModalOpen(true);
                          }}
                        >
                          <Typography.Body>
                            {key === "год"
                              ? "Год"
                              : key === "период"
                                ? "Период"
                                : key.charAt(0).toUpperCase() + key.slice(1)}
                          </Typography.Body>
                        </div>
                      );
                    })
                  )}
                </FilterDropdownPortal>
              </>
            ) : null}
            {docSection === "Тарифы" && <DocumentsTariffsToolbarFilters {...catalogToolbars.tariffs} />}
            {(docSection === "Счета" || docSection === "ЭДО" || docSection === "Заявки") &&
              effectiveServiceMode && (
                <>
                  <div ref={customerButtonRef} style={{ display: "inline-flex" }}>
                    <Button
                      className="filter-button"
                      onClick={() => {
                        catalogToolbars.setIsCustomerDropdownOpen(!catalogToolbars.isCustomerDropdownOpen);
                        setIsDateDropdownOpen(false);
                        catalogToolbars.setIsActCustomerDropdownOpen(false);
                        catalogToolbars.setIsTypeDropdownOpen(false);
                        catalogToolbars.setIsRouteDropdownOpen(false);
                        catalogToolbars.setIsDeliveryStatusDropdownOpen(false);
                        catalogToolbars.setIsRouteCargoDropdownOpen(false);
                        catalogToolbars.setIsEdoStatusDropdownOpen(false);
                        catalogToolbars.setIsTransportDropdownOpen(false);
                      }}
                    >
                      Заказчик:{" "}
                      {catalogToolbars.customerFilter
                        ? stripOoo(catalogToolbars.customerFilter)
                        : "Все"}{" "}
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </div>
                  <FilterDropdownPortal
                    triggerRef={customerButtonRef}
                    isOpen={catalogToolbars.isCustomerDropdownOpen}
                    onClose={() => catalogToolbars.setIsCustomerDropdownOpen(false)}
                  >
                    <div
                      className="dropdown-item"
                      onClick={() => {
                        catalogToolbars.setCustomerFilter("");
                        catalogToolbars.setIsCustomerDropdownOpen(false);
                      }}
                    >
                      <Typography.Body>Все</Typography.Body>
                    </div>
                    {(docSection === "Заявки"
                      ? catalogToolbars.uniqueOrderCustomers
                      : catalogToolbars.uniqueCustomers
                    ).map((c) => (
                      <div
                        key={c}
                        className="dropdown-item"
                        onClick={() => {
                          catalogToolbars.setCustomerFilter(c);
                          catalogToolbars.setIsCustomerDropdownOpen(false);
                        }}
                      >
                        <Typography.Body>{stripOoo(c)}</Typography.Body>
                      </div>
                    ))}
                  </FilterDropdownPortal>
                </>
              )}
            {docSection === "Заявки" && (
              <DocumentsOrdersToolbarFilters {...catalogToolbars.orders} />
            )}
            {docSection === "Отправки" && <SendingsToolbarFilters {...catalogToolbars.sendings} />}
            {docSection === "УПД" && <DocumentsActsToolbarFilters {...catalogToolbars.acts} />}
            {docSection === "Акты сверок" && (
              <DocumentsSverkiToolbarFilters {...catalogToolbars.sverki} />
            )}
            {docSection === "Договоры" && (
              <DocumentsDogovorsToolbarFilters {...catalogToolbars.dogovors} />
            )}
            {docSection === "Претензии" && <ClaimsToolbarFilters {...catalogToolbars.claims} />}
            {(docSection === "Счета" ||
              docSection === "ЭДО" ||
              docSection === "УПД" ||
              docSection === "Договоры" ||
              docSection === "Акты сверок") && (
              <>
                <div ref={edoStatusButtonRef} style={{ display: "inline-flex" }}>
                  <Button
                    className="filter-button"
                    onClick={() => {
                      catalogToolbars.setIsEdoStatusDropdownOpen(!catalogToolbars.isEdoStatusDropdownOpen);
                      setIsDateDropdownOpen(false);
                      catalogToolbars.setIsCustomerDropdownOpen(false);
                      catalogToolbars.setIsActCustomerDropdownOpen(false);
                      catalogToolbars.setIsTypeDropdownOpen(false);
                      catalogToolbars.setIsRouteDropdownOpen(false);
                      catalogToolbars.setIsDeliveryStatusDropdownOpen(false);
                      catalogToolbars.setIsRouteCargoDropdownOpen(false);
                      catalogToolbars.setIsTransportDropdownOpen(false);
                      catalogToolbars.edo.setIsEdoCounterpartyDropdownOpen(false);
                    }}
                  >
                    Статус ЭДО:{" "}
                    {catalogToolbars.edoStatusFilterSet.size === 0
                      ? "Все"
                      : catalogToolbars.edoStatusFilterSet.size === 1
                        ? [...catalogToolbars.edoStatusFilterSet][0]
                        : `Выбрано: ${catalogToolbars.edoStatusFilterSet.size}`}{" "}
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </div>
                <FilterDropdownPortal
                  triggerRef={edoStatusButtonRef}
                  isOpen={catalogToolbars.isEdoStatusDropdownOpen}
                  onClose={() => catalogToolbars.setIsEdoStatusDropdownOpen(false)}
                >
                  <div
                    className="dropdown-item"
                    onClick={() => {
                      catalogToolbars.setEdoStatusFilterSet(new Set());
                      catalogToolbars.setIsEdoStatusDropdownOpen(false);
                    }}
                  >
                    <Typography.Body>Все</Typography.Body>
                  </div>
                  {catalogToolbars.uniqueEdoStatuses.map((s) => (
                    <div
                      key={s}
                      className="dropdown-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        catalogToolbars.setEdoStatusFilterSet((prev) => {
                          const next = new Set(prev);
                          if (next.has(s)) next.delete(s);
                          else next.add(s);
                          return next;
                        });
                      }}
                      style={{
                        background: catalogToolbars.edoStatusFilterSet.has(s)
                          ? "var(--color-bg-hover)"
                          : undefined,
                      }}
                    >
                      <Typography.Body>
                        {s} {catalogToolbars.edoStatusFilterSet.has(s) ? "✓" : ""}
                      </Typography.Body>
                    </div>
                  ))}
                </FilterDropdownPortal>
              </>
            )}
            {docSection === "ЭДО" && <DocumentsEdoToolbarFilters {...catalogToolbars.edo} />}
            {isDocumentsTransportFilterVisible(docSection, effectiveServiceMode) && (
              <DocumentsTransportFilter
                transportFilter={catalogToolbars.transportFilter}
                setTransportFilter={catalogToolbars.setTransportFilter}
                transportOptions={catalogToolbars.transportOptionsCurrentSection}
                isOpen={catalogToolbars.isTransportDropdownOpen}
                setIsOpen={catalogToolbars.setIsTransportDropdownOpen}
                searchQuery={catalogToolbars.transportSearchQuery}
                setSearchQuery={catalogToolbars.setTransportSearchQuery}
                closeOtherDropdowns={closeDocumentsToolbarDropdownsForTransport}
              />
            )}
            {docSection === "Счета" && (
              <>
                <div ref={billStatusButtonRef} style={{ display: "inline-flex" }}>
                  <Button
                    className="filter-button"
                    onClick={() => {
                      catalogToolbars.setIsBillStatusDropdownOpen(!catalogToolbars.isBillStatusDropdownOpen);
                      setIsDateDropdownOpen(false);
                      catalogToolbars.setIsCustomerDropdownOpen(false);
                      catalogToolbars.setIsActCustomerDropdownOpen(false);
                      catalogToolbars.setIsTypeDropdownOpen(false);
                      catalogToolbars.setIsRouteDropdownOpen(false);
                      catalogToolbars.setIsDeliveryStatusDropdownOpen(false);
                      catalogToolbars.setIsRouteCargoDropdownOpen(false);
                      catalogToolbars.setIsEdoStatusDropdownOpen(false);
                      catalogToolbars.setIsTransportDropdownOpen(false);
                    }}
                  >
                    Статус счёта:{" "}
                    {catalogToolbars.billStatusFilterSet.size === 0 && !catalogToolbars.invoiceFavoritesOnly
                      ? "Все"
                      : catalogToolbars.billStatusFilterSet.size === 1 && !catalogToolbars.invoiceFavoritesOnly
                        ? BILL_STATUS_MAP[[...catalogToolbars.billStatusFilterSet][0]]
                        : catalogToolbars.invoiceFavoritesOnly && catalogToolbars.billStatusFilterSet.size === 0
                          ? "Избранные"
                          : `Выбрано: ${catalogToolbars.billStatusFilterSet.size + (catalogToolbars.invoiceFavoritesOnly ? 1 : 0)}`}{" "}
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </div>
                <FilterDropdownPortal
                  triggerRef={billStatusButtonRef}
                  isOpen={catalogToolbars.isBillStatusDropdownOpen}
                  onClose={() => catalogToolbars.setIsBillStatusDropdownOpen(false)}
                >
                  <div
                    className="dropdown-item"
                    onClick={() => {
                      catalogToolbars.setBillStatusFilterSet(new Set());
                      catalogToolbars.setInvoiceFavoritesOnly(false);
                      catalogToolbars.setIsBillStatusDropdownOpen(false);
                    }}
                  >
                    <Typography.Body>Все</Typography.Body>
                  </div>
                  {(["paid", "unpaid", "partial", "cancelled", "unknown"] as const).map((key) => (
                    <div
                      key={key}
                      className="dropdown-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        catalogToolbars.setBillStatusFilterSet((prev) => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        });
                      }}
                      style={{
                        background: catalogToolbars.billStatusFilterSet.has(key)
                          ? "var(--color-bg-hover)"
                          : undefined,
                      }}
                    >
                      <Typography.Body>
                        {BILL_STATUS_MAP[key]} {catalogToolbars.billStatusFilterSet.has(key) ? "✓" : ""}
                      </Typography.Body>
                    </div>
                  ))}
                  <div
                    className="dropdown-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      catalogToolbars.setInvoiceFavoritesOnly((v) => !v);
                    }}
                    style={{
                      background: catalogToolbars.invoiceFavoritesOnly ? "var(--color-bg-hover)" : undefined,
                    }}
                  >
                    <Typography.Body>
                      Избранные {catalogToolbars.invoiceFavoritesOnly ? "✓" : ""}
                    </Typography.Body>
                  </div>
                </FilterDropdownPortal>
                <div ref={deliveryStatusButtonRef} style={{ display: "inline-flex" }}>
                  <Button
                    className="filter-button"
                    onClick={() => {
                      catalogToolbars.setIsDeliveryStatusDropdownOpen(
                        !catalogToolbars.isDeliveryStatusDropdownOpen,
                      );
                      setIsDateDropdownOpen(false);
                      catalogToolbars.setIsCustomerDropdownOpen(false);
                      catalogToolbars.setIsActCustomerDropdownOpen(false);
                      catalogToolbars.setIsTypeDropdownOpen(false);
                      catalogToolbars.setIsRouteDropdownOpen(false);
                      catalogToolbars.setIsRouteCargoDropdownOpen(false);
                      catalogToolbars.setIsEdoStatusDropdownOpen(false);
                      catalogToolbars.setIsTransportDropdownOpen(false);
                    }}
                  >
                    Статус перевозки:{" "}
                    {catalogToolbars.deliveryStatusFilterSet.size === 0
                      ? "Все"
                      : catalogToolbars.deliveryStatusFilterSet.size === 1
                        ? STATUS_MAP[[...catalogToolbars.deliveryStatusFilterSet][0]]
                        : `Выбрано: ${catalogToolbars.deliveryStatusFilterSet.size}`}{" "}
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </div>
                <FilterDropdownPortal
                  triggerRef={deliveryStatusButtonRef}
                  isOpen={catalogToolbars.isDeliveryStatusDropdownOpen}
                  onClose={() => catalogToolbars.setIsDeliveryStatusDropdownOpen(false)}
                >
                  <div
                    className="dropdown-item"
                    onClick={() => {
                      catalogToolbars.setDeliveryStatusFilterSet(new Set());
                      catalogToolbars.setIsDeliveryStatusDropdownOpen(false);
                    }}
                  >
                    <Typography.Body>Все</Typography.Body>
                  </div>
                  {(Object.keys(STATUS_MAP) as StatusFilter[])
                    .filter((k) => k !== "favorites" && k !== "all")
                    .map((key) => (
                      <div
                        key={key}
                        className="dropdown-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          catalogToolbars.setDeliveryStatusFilterSet((prev) => {
                            const next = new Set(prev);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          });
                        }}
                        style={{
                          background: catalogToolbars.deliveryStatusFilterSet.has(key)
                            ? "var(--color-bg-hover)"
                            : undefined,
                        }}
                      >
                        <Typography.Body>
                          {STATUS_MAP[key]}{" "}
                          {catalogToolbars.deliveryStatusFilterSet.has(key) ? "✓" : ""}
                        </Typography.Body>
                      </div>
                    ))}
                </FilterDropdownPortal>
                <div ref={routeCargoButtonRef} style={{ display: "inline-flex" }}>
                  <Button
                    className="filter-button"
                    onClick={() => {
                      catalogToolbars.setIsRouteCargoDropdownOpen(!catalogToolbars.isRouteCargoDropdownOpen);
                      setIsDateDropdownOpen(false);
                      catalogToolbars.setIsCustomerDropdownOpen(false);
                      catalogToolbars.setIsActCustomerDropdownOpen(false);
                      catalogToolbars.setIsBillStatusDropdownOpen(false);
                      catalogToolbars.setIsTypeDropdownOpen(false);
                      catalogToolbars.setIsRouteDropdownOpen(false);
                      catalogToolbars.setIsDeliveryStatusDropdownOpen(false);
                      catalogToolbars.setIsEdoStatusDropdownOpen(false);
                      catalogToolbars.setIsTransportDropdownOpen(false);
                    }}
                  >
                    Маршрут:{" "}
                    {catalogToolbars.routeFilterSet.size === 0
                      ? "Все"
                      : catalogToolbars.routeFilterSet.size === 2
                        ? "Выбрано: 2"
                        : routeKeyToCargoLabel([...catalogToolbars.routeFilterSet][0])}{" "}
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </div>
                <FilterDropdownPortal
                  triggerRef={routeCargoButtonRef}
                  isOpen={catalogToolbars.isRouteCargoDropdownOpen}
                  onClose={() => catalogToolbars.setIsRouteCargoDropdownOpen(false)}
                >
                  <div
                    className="dropdown-item"
                    onClick={() => {
                      catalogToolbars.setRouteFilterSet(new Set());
                      catalogToolbars.setIsRouteCargoDropdownOpen(false);
                    }}
                  >
                    <Typography.Body>Все</Typography.Body>
                  </div>
                  {(["MSK-KGD", "KGD-MSK"] as const).map((key) => (
                    <div
                      key={key}
                      className="dropdown-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        catalogToolbars.setRouteFilterSet((prev) => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        });
                      }}
                      style={{
                        background: catalogToolbars.routeFilterSet.has(key)
                          ? "var(--color-bg-hover)"
                          : undefined,
                      }}
                    >
                      <Typography.Body>
                        {routeKeyToCargoLabel(key)} {catalogToolbars.routeFilterSet.has(key) ? "✓" : ""}
                      </Typography.Body>
                    </div>
                  ))}
                </FilterDropdownPortal>
              </>
            )}
            <CustomPeriodModal
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
        </div>
      )}
      {(docSection === "Счета" || docSection === "УПД") && (
        <div className="documents-sticky-summary-wrap">
          {docSection === "Счета" &&
            !summaryProps.invoicesLoading &&
            !summaryProps.invoicesError &&
            summaryProps.filteredInvoiceCount > 0 && (
              <motion.div {...(summaryProps.docsMotionEnabled ? cargoSummaryMotion : { initial: false })}>
                <DocumentsSummaryCard
                  summary={summaryProps.invoicesSummary}
                  showSums={summaryProps.showSums}
                  useServiceRequest={effectiveServiceMode}
                  saasAnalytics={summaryProps.documentsServiceSaasUi}
                  expandedMetrics={summaryProps.tableModeFlatDirect}
                />
              </motion.div>
            )}
          {docSection === "УПД" &&
            !summaryProps.actsLoading &&
            !summaryProps.actsError &&
            summaryProps.filteredActsCount > 0 && (
              <motion.div {...(summaryProps.docsMotionEnabled ? cargoSummaryMotion : { initial: false })}>
                <DocumentsSummaryCard
                  summary={summaryProps.actsSummary}
                  showSums={summaryProps.showSums}
                  useServiceRequest={effectiveServiceMode}
                  saasAnalytics={summaryProps.documentsServiceSaasUi}
                  expandedMetrics={summaryProps.tableModeFlatDirect}
                />
              </motion.div>
            )}
        </div>
      )}
      {docSection === "Заявки" && (
        <div className="documents-new-order-bar documents-new-order-bar--in-sticky">
          <Button
            className="button-primary doc-section-action-btn"
            onClick={actionBars.onNewOrder}
            disabled={
              !actionBars.auth?.login ||
              !actionBars.auth?.password ||
              !(actionBars.effectiveActiveInn?.trim() || actionBars.activeCustomerName?.trim())
            }
            title={
              !(actionBars.effectiveActiveInn?.trim() || actionBars.activeCustomerName?.trim())
                ? "Выберите заказчика в хедере"
                : !actionBars.auth?.login || !actionBars.auth?.password
                  ? "Требуется авторизация"
                  : undefined
            }
          >
            Новая заявка
          </Button>
        </div>
      )}
      {docSection === "Претензии" && (
        <ClaimsCreateActionButton auth={actionBars.auth} onOpen={actionBars.onOpenClaimsCreate} />
      )}
      {docSection === "Акты сверок" && (
        <SverkiOrderActionButton
          disabled={actionBars.sverkiOrderDisabled}
          onOpen={actionBars.onOpenSverkiOrder}
        />
      )}
    </>
  );
}
