import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import {
  ArrowDown,
  ArrowUp,
  ClipboardList,
  Heart,
  Share2,
} from "lucide-react";
import { DateText } from "../components/ui/DateText";
import { AppBadge } from "../components/shared/AppBadge";
import {
  CargoLogisticsBadges,
  RouteBadge,
  CargoTransportTypeIcon,
  getCargoItemRouteLabel,
} from "../components/shared/CargoTableDisplay";
import { getSlaInfo, getCargoDisplayRoleLabel, getCargoRoleSet } from "../lib/cargoUtils";
import { formatCurrency, stripOoo, cityToCode } from "../lib/formatUtils";
import { ClickableCargoNumber } from "../components/ui/EntityLinks";
import { getSumColorByPaymentStatus } from "../lib/statusUtils";
import type { WorkSchedule } from "../lib/slaWorkSchedule";
import type { CargoItem } from "../types";
import type { CargoGroupedRow } from "./cargoPipeline";
import { getEffectivePlannedDeliveryDate } from "../lib/cargoPlannedDelivery";
import {
  cargoExpandMotionProps,
  cargoListContainerVariants,
  cargoListItemVariants,
  cargoTableGroupRowVariants,
} from "./cargoMotion";

type InnerTableSortCol = "number" | "datePrih" | "planDate" | "status" | "mest" | "pw" | "sum";

function plannedArrivalIso(item: CargoItem, routeTypePlanDays: Map<string, number>): string {
  const d = getEffectivePlannedDeliveryDate(item, routeTypePlanDays);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type CargoCustomerTableProps = {
  showSums: boolean;
  /** Одна компания: сразу таблица перевозок без строки-свёртки по заказчику. */
  flatDirectItems?: CargoItem[];
  tableSortColumn?: "customer" | "sum" | "mest" | "pw" | "w" | "vol" | "count";
  tableSortOrder?: "asc" | "desc";
  sortedGroupedByCustomer?: CargoGroupedRow[];
  expandedTableCustomer?: string | null;
  innerTableSortColumn: InnerTableSortCol | null;
  innerTableSortOrder: "asc" | "desc";
  routeTypePlanDays: Map<string, number>;
  workScheduleByInn: Record<string, WorkSchedule>;
  onTableSort?: (column: "customer" | "sum" | "mest" | "pw" | "w" | "vol" | "count") => void;
  onInnerTableSort: (column: InnerTableSortCol) => void;
  sortInnerItems: (items: CargoItem[]) => CargoItem[];
  onToggleExpandedCustomer?: (customer: string) => void;
  onSelectCargo: (item: CargoItem) => void;
  /** Анимации Motion (отключены при prefers-reduced-motion на странице). */
  motionEnabled?: boolean;
};

export function CargoCustomerTable({
  showSums,
  flatDirectItems,
  tableSortColumn = "customer",
  tableSortOrder = "asc",
  sortedGroupedByCustomer = [],
  expandedTableCustomer = null,
  innerTableSortColumn,
  innerTableSortOrder,
  routeTypePlanDays,
  workScheduleByInn,
  onTableSort,
  onInnerTableSort,
  sortInnerItems,
  onToggleExpandedCustomer,
  onSelectCargo,
  motionEnabled = false,
}: CargoCustomerTableProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const mainColSpan = isMobile ? (showSums ? 5 : 4) : showSums ? 8 : 7;

  const renderInnerItemsTable = (listItems: CargoItem[]) => {
    const showOrderCol = listItems.some(
      (i) => (i as { Order?: string }).Order != null && String((i as { Order?: string }).Order).trim() !== "",
    );
    return (
      <div
        className="cargo-card cargo-customer-table-wrap cargo-customer-table-wrap--flat-direct"
        style={{
          overflowX: isMobile ? "hidden" : "auto",
          overflowY: "visible",
          marginBottom: "1rem",
        }}
      >
        <div
          className="cargo-inner-table-wrap"
          style={{ padding: isMobile ? "0.35rem 0.2rem" : "0.5rem", overflowX: isMobile ? "hidden" : "auto" }}
        >
          <table className="cargo-inner-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: isMobile ? "0.68rem" : "0.8rem" }}>
            <thead>
              <tr
                className="cargo-inner-table__head-row"
                style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}
              >
                <th className="cargo-inner-table__col-type" style={{ padding: "0.35rem 0.3rem", textAlign: "center", fontWeight: 600, width: "2.5rem" }} title="Тип перевозки" />
                <th
                  className="cargo-inner-table__col-number"
                  style={{ padding: "0.35rem 0.3rem", textAlign: "left", fontWeight: 600, cursor: "pointer", userSelect: "none" }}
                  onClick={(e) => { e.stopPropagation(); onInnerTableSort("number"); }}
                  title="Сортировка"
                >
                  <span className="cargo-inner-table__head-long">Номер</span>
                  <span className="cargo-inner-table__head-short">№</span>
                  {innerTableSortColumn === "number" && (innerTableSortOrder === "asc" ? <ArrowUp className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }} /> : <ArrowDown className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }} />)}
                </th>
                {showOrderCol && (
                  <th className="cargo-inner-table__col-order" style={{ padding: "0.35rem 0.3rem", textAlign: "left", fontWeight: 600 }}>Номер заявки заказчика</th>
                )}
                <th
                  className="cargo-inner-table__col-date"
                  style={{ padding: "0.35rem 0.3rem", textAlign: "left", fontWeight: 600, cursor: "pointer", userSelect: "none" }}
                  onClick={(e) => { e.stopPropagation(); onInnerTableSort("datePrih"); }}
                  title="Сортировка"
                >
                  <span className="cargo-inner-table__head-long">Дата прихода</span>
                  <span className="cargo-inner-table__head-short">Дата</span>
                  {innerTableSortColumn === "datePrih" && (innerTableSortOrder === "asc" ? <ArrowUp className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }} /> : <ArrowDown className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }} />)}
                </th>
                <th
                  className="cargo-inner-table__col-plan-date"
                  style={{ padding: "0.35rem 0.3rem", textAlign: "left", fontWeight: 600, cursor: "pointer", userSelect: "none", lineHeight: 1.15 }}
                  onClick={(e) => { e.stopPropagation(); onInnerTableSort("planDate"); }}
                  title="Сортировка"
                >
                  <span className="cargo-inner-table__head-long">Плановая дата прибытия на терминал</span>
                  <span className="cargo-inner-table__head-short">План</span>
                  {innerTableSortColumn === "planDate" && (innerTableSortOrder === "asc" ? <ArrowUp className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }} /> : <ArrowDown className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }} />)}
                </th>
                <th
                  className="cargo-inner-table__col-status"
                  style={{ padding: "0.35rem 0.3rem", textAlign: "left", fontWeight: 600, cursor: "pointer", userSelect: "none" }}
                  onClick={(e) => { e.stopPropagation(); onInnerTableSort("status"); }}
                  title="Сортировка: статус, доставка, маршрут"
                >
                  <span className="cargo-inner-table__head-long">Статус / маршрут</span>
                  <span className="cargo-inner-table__head-short">Ст.</span>
                  {innerTableSortColumn === "status" && (innerTableSortOrder === "asc" ? <ArrowUp className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }} /> : <ArrowDown className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }} />)}
                </th>
                <th className="cargo-inner-table__col-route cargo-inner-table__col-route--desktop" style={{ padding: "0.35rem 0.3rem", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>Маршрут</th>
                <th
                  className="cargo-inner-table__col-mest"
                  style={{ padding: "0.35rem 0.3rem", textAlign: "right", fontWeight: 600, cursor: "pointer", userSelect: "none" }}
                  onClick={(e) => { e.stopPropagation(); onInnerTableSort("mest"); }}
                  title="Сортировка"
                >
                  <span className="cargo-inner-table__head-long">Мест</span>
                  <span className="cargo-inner-table__head-short">Мест</span>
                  {innerTableSortColumn === "mest" && (innerTableSortOrder === "asc" ? <ArrowUp className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }} /> : <ArrowDown className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }} />)}
                </th>
                <th
                  className="cargo-inner-table__col-pw"
                  style={{ padding: "0.35rem 0.3rem", textAlign: "right", fontWeight: 600, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", minWidth: "4rem" }}
                  onClick={(e) => { e.stopPropagation(); onInnerTableSort("pw"); }}
                  title="Сортировка"
                >
                  <span className="cargo-inner-table__head-long">Плат. вес</span>
                  <span className="cargo-inner-table__head-short">Пл.в.</span>
                  {innerTableSortColumn === "pw" && (innerTableSortOrder === "asc" ? <ArrowUp className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }} /> : <ArrowDown className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }} />)}
                </th>
                {showSums && (
                  <th
                    className="cargo-inner-table__col-sum cargo-inner-table__col-sum--stacked-mobile"
                    style={{ padding: "0.35rem 0.3rem", textAlign: "right", fontWeight: 600, cursor: "pointer", userSelect: "none" }}
                    onClick={(e) => { e.stopPropagation(); onInnerTableSort("sum"); }}
                    title="Сортировка"
                  >
                    <span className="cargo-inner-table__head-long">Сумма</span>
                    <span className="cargo-inner-table__head-short">Сум.</span>
                    {innerTableSortColumn === "sum" && (innerTableSortOrder === "asc" ? <ArrowUp className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }} /> : <ArrowDown className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }} />)}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortInnerItems(listItems).map((item, j) => (
                <tr
                  key={item.Number || j}
                  className="cargo-inner-table__row"
                  style={{ borderBottom: "1px solid var(--color-border)", cursor: "pointer" }}
                  onClick={(e) => { e.stopPropagation(); onSelectCargo(item); }}
                  title="Открыть карточку перевозки"
                >
                  <td className="cargo-inner-table__col-type" style={{ padding: "0.35rem 0.3rem", textAlign: "center" }}>
                    <CargoTransportTypeIcon item={item} className="cargo-inner-table__type-icon" />
                  </td>
                  <td className="cargo-inner-table__col-number" style={{ padding: "0.35rem 0.3rem" }}>
                    <ClickableCargoNumber
                      number={item.Number}
                      onOpen={() => onSelectCargo(item)}
                      className="cargo-inner-table__number"
                      style={{ color: (() => { const s = getSlaInfo(item, workScheduleByInn); return s ? (s.onTime ? "#22c55e" : "#ef4444") : undefined; })() }}
                    />
                  </td>
                  {showOrderCol && (
                    <td className="cargo-inner-table__col-order" style={{ padding: "0.35rem 0.3rem" }}>
                      {(item as { Order?: string }).Order != null && String((item as { Order?: string }).Order).trim() !== "" ? String((item as { Order?: string }).Order).trim() : "—"}
                    </td>
                  )}
                  <td className="cargo-inner-table__col-date" style={{ padding: "0.35rem 0.3rem" }}><DateText value={item.DatePrih} omitYear={isMobile} /></td>
                  <td className="cargo-inner-table__col-plan-date" style={{ padding: "0.35rem 0.3rem", whiteSpace: "nowrap" }}>
                    {(() => { const iso = plannedArrivalIso(item, routeTypePlanDays); return iso ? <DateText value={iso} omitYear={isMobile} /> : "—"; })()}
                  </td>
                  <td className="cargo-inner-table__col-status" style={{ padding: "0.35rem 0.3rem" }}>
                    <CargoLogisticsBadges
                      item={item}
                      showPayment={showSums}
                      showRouteInline
                    />
                  </td>
                  <td className="cargo-inner-table__col-route cargo-inner-table__col-route--desktop" style={{ padding: "0.35rem 0.3rem" }}><RouteBadge route={getCargoItemRouteLabel(item)} /></td>
                  <td className="cargo-inner-table__col-mest" style={{ padding: "0.35rem 0.3rem", textAlign: "right" }}>{item.Mest != null ? Math.round(Number(item.Mest)) : "—"}</td>
                  <td className="cargo-inner-table__col-pw" style={{ padding: "0.35rem 0.3rem", textAlign: "right", whiteSpace: "nowrap", minWidth: "4rem" }}>
                    <span className="cargo-inner-table__pw-line">{item.PW != null ? `${Math.round(Number(item.PW))} кг` : "—"}</span>
                    {showSums && <span className="cargo-inner-table__sum-mobile-line">{item.Sum != null ? formatCurrency(item.Sum as number, true) : "—"}</span>}
                  </td>
                  {showSums && (
                    <td className="cargo-inner-table__col-sum cargo-inner-table__col-sum--stacked-mobile" style={{ padding: "0.35rem 0.3rem", textAlign: "right" }}>
                      {item.Sum != null ? formatCurrency(item.Sum as number, true) : "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (flatDirectItems && flatDirectItems.length > 0) {
    return renderInnerItemsTable(flatDirectItems);
  }

  return (
    <div
      className="cargo-card cargo-customer-table-wrap"
      style={{
        overflowX: isMobile ? "hidden" : "auto",
        overflowY: "visible",
        marginBottom: "1rem",
        paddingTop: "0.45rem",
      }}
    >
      <table className="cargo-customer-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr
            style={{
              borderBottom: "2px solid var(--color-border)",
              background: "var(--color-bg-hover)",
            }}
          >
            <th
              className="cargo-customer-table__col-customer"
              style={{
                padding: "0.5rem 0.4rem",
                textAlign: "left",
                fontWeight: 600,
                cursor: "pointer",
                userSelect: "none",
              }}
              onClick={() => onTableSort("customer")}
              title="Сортировка: первый клик А–Я, второй Я–А"
            >
              Заказчик{" "}
              {tableSortColumn === "customer" &&
                (tableSortOrder === "asc" ? (
                  <ArrowUp
                    className="w-3 h-3"
                    style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }}
                  />
                ) : (
                  <ArrowDown
                    className="w-3 h-3"
                    style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }}
                  />
                ))}
            </th>
            {showSums && (
              <th
                className="cargo-customer-table__col-sum"
                style={{
                  padding: "0.5rem 0.4rem",
                  textAlign: "right",
                  fontWeight: 600,
                  cursor: "pointer",
                  userSelect: "none",
                }}
                onClick={() => onTableSort("sum")}
                title="Сортировка: первый клик А–Я, второй Я–А"
              >
                Сумма{" "}
                {tableSortColumn === "sum" &&
                  (tableSortOrder === "asc" ? (
                    <ArrowUp
                      className="w-3 h-3"
                      style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }}
                    />
                  ) : (
                    <ArrowDown
                      className="w-3 h-3"
                      style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }}
                    />
                  ))}
              </th>
            )}
            <th
              className="cargo-customer-table__col-mest"
              style={{
                padding: "0.5rem 0.4rem",
                textAlign: "right",
                fontWeight: 600,
                cursor: "pointer",
                userSelect: "none",
              }}
              onClick={() => onTableSort("mest")}
              title="Сортировка: первый клик А–Я, второй Я–А"
            >
              Мест{" "}
              {tableSortColumn === "mest" &&
                (tableSortOrder === "asc" ? (
                  <ArrowUp
                    className="w-3 h-3"
                    style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }}
                  />
                ) : (
                  <ArrowDown
                    className="w-3 h-3"
                    style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }}
                  />
                ))}
            </th>
            <th
              className="cargo-customer-table__col-pw"
              style={{
                padding: "0.5rem 0.4rem",
                textAlign: "right",
                fontWeight: 600,
                cursor: "pointer",
                userSelect: "none",
                whiteSpace: "nowrap",
                minWidth: "4rem",
              }}
              onClick={() => onTableSort("pw")}
              title="Сортировка: первый клик А–Я, второй Я–А"
            >
              <span className="cargo-customer-table__head-long">Плат. вес</span>
              <span className="cargo-customer-table__head-short">Пл. в.</span>{" "}
              {tableSortColumn === "pw" &&
                (tableSortOrder === "asc" ? (
                  <ArrowUp
                    className="w-3 h-3"
                    style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }}
                  />
                ) : (
                  <ArrowDown
                    className="w-3 h-3"
                    style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }}
                  />
                ))}
            </th>
            <th
              className="cargo-customer-table__col-w"
              style={{
                padding: "0.5rem 0.4rem",
                textAlign: "right",
                fontWeight: 600,
                cursor: "pointer",
                userSelect: "none",
              }}
              onClick={() => onTableSort("w")}
              title="Сортировка: первый клик А–Я, второй Я–А"
            >
              Вес{" "}
              {tableSortColumn === "w" &&
                (tableSortOrder === "asc" ? (
                  <ArrowUp
                    className="w-3 h-3"
                    style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }}
                  />
                ) : (
                  <ArrowDown
                    className="w-3 h-3"
                    style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }}
                  />
                ))}
            </th>
            <th
              className="cargo-customer-table__col-vol"
              style={{
                padding: "0.5rem 0.4rem",
                textAlign: "right",
                fontWeight: 600,
                cursor: "pointer",
                userSelect: "none",
              }}
              onClick={() => onTableSort("vol")}
              title="Сортировка: первый клик А–Я, второй Я–А"
            >
              Объём{" "}
              {tableSortColumn === "vol" &&
                (tableSortOrder === "asc" ? (
                  <ArrowUp
                    className="w-3 h-3"
                    style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }}
                  />
                ) : (
                  <ArrowDown
                    className="w-3 h-3"
                    style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }}
                  />
                ))}
            </th>
            <th
              className="cargo-customer-table__col-count"
              style={{
                padding: "0.5rem 0.4rem",
                textAlign: "right",
                fontWeight: 600,
                cursor: "pointer",
                userSelect: "none",
              }}
              onClick={() => onTableSort("count")}
              title="Сортировка: первый клик А–Я, второй Я–А"
            >
              <span className="cargo-customer-table__head-long">Перевозок</span>
              <span className="cargo-customer-table__head-short">Пер.</span>{" "}
              {tableSortColumn === "count" &&
                (tableSortOrder === "asc" ? (
                  <ArrowUp
                    className="w-3 h-3"
                    style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }}
                  />
                ) : (
                  <ArrowDown
                    className="w-3 h-3"
                    style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }}
                  />
                ))}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr aria-hidden>
            <td
              colSpan={mainColSpan}
              style={{ height: "0.5rem", padding: 0, border: "none", background: "transparent" }}
            />
          </tr>
          {sortedGroupedByCustomer.map((row, i) => (
            <React.Fragment key={row.customer || `row-${i}`}>
              <motion.tr
                custom={i}
                variants={cargoTableGroupRowVariants}
                initial={motionEnabled ? "initial" : false}
                animate={motionEnabled ? "animate" : undefined}
                style={{
                  borderBottom: "1px solid var(--color-border)",
                  cursor: "pointer",
                  background:
                    expandedTableCustomer === row.customer ? "var(--color-bg-hover)" : undefined,
                }}
                onClick={() => onToggleExpandedCustomer?.(row.customer)}
                title={
                  expandedTableCustomer === row.customer
                    ? "Свернуть детали"
                    : "Показать перевозки по строчно"
                }
              >
                <td
                  className="cargo-customer-table__col-customer"
                  style={{
                    padding: "0.5rem 0.4rem",
                    maxWidth: 180,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={stripOoo(row.customer)}
                >
                  {stripOoo(row.customer)}
                </td>
                {showSums && (
                  <td className="cargo-customer-table__col-sum" style={{ padding: "0.5rem 0.4rem", textAlign: "right", whiteSpace: "nowrap" }}>
                    {formatCurrency(row.sum, true)}
                  </td>
                )}
                <td className="cargo-customer-table__col-mest" style={{ padding: "0.5rem 0.4rem", textAlign: "right" }}>
                  {Math.round(row.mest)}
                </td>
                <td
                  className="cargo-customer-table__col-pw"
                  style={{
                    padding: "0.5rem 0.4rem",
                    textAlign: "right",
                    whiteSpace: "nowrap",
                    minWidth: "4rem",
                  }}
                >
                  {isMobile ? Math.round(row.pw).toLocaleString("ru-RU") : `${Math.round(row.pw)} кг`}
                </td>
                <td className="cargo-customer-table__col-w" style={{ padding: "0.5rem 0.4rem", textAlign: "right", whiteSpace: "nowrap" }}>
                  {Math.round(row.w)} кг
                </td>
                <td className="cargo-customer-table__col-vol" style={{ padding: "0.5rem 0.4rem", textAlign: "right" }}>
                  {Math.round(row.vol)} м³
                </td>
                <td className="cargo-customer-table__col-count" style={{ padding: "0.5rem 0.4rem", textAlign: "right" }}>{row.items.length}</td>
              </motion.tr>
              {expandedTableCustomer === row.customer && (
                <tr key={`${i}-detail`}>
                  <td
                    colSpan={mainColSpan}
                    style={{
                      padding: 0,
                      borderBottom: "1px solid var(--color-border)",
                      verticalAlign: "top",
                      background: "var(--color-bg-primary)",
                    }}
                  >
                    <motion.div
                      {...(motionEnabled ? cargoExpandMotionProps : { initial: false })}
                      className="cargo-inner-table-wrap"
                      style={{ padding: isMobile ? "0.35rem 0.2rem" : "0.5rem", overflowX: isMobile ? "hidden" : "auto" }}
                    >
                      <table className="cargo-inner-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: isMobile ? "0.68rem" : "0.8rem" }}>
                        <thead>
                          <tr
                            className="cargo-inner-table__head-row"
                            style={{
                              borderBottom: "1px solid var(--color-border)",
                              background: "var(--color-bg-hover)",
                            }}
                          >
                            <th
                              className="cargo-inner-table__col-type"
                              style={{
                                padding: "0.35rem 0.3rem",
                                textAlign: "center",
                                fontWeight: 600,
                                width: "2.5rem",
                              }}
                              title="Тип перевозки"
                            />
                            <th
                              className="cargo-inner-table__col-number"
                              style={{
                                padding: "0.35rem 0.3rem",
                                textAlign: "left",
                                fontWeight: 600,
                                cursor: "pointer",
                                userSelect: "none",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onInnerTableSort("number");
                              }}
                              title="Сортировка"
                            >
                              <span className="cargo-inner-table__head-long">Номер</span>
                              <span className="cargo-inner-table__head-short">№</span>
                              {innerTableSortColumn === "number" &&
                                (innerTableSortOrder === "asc" ? (
                                  <ArrowUp
                                    className="w-3 h-3 cargo-inner-table__sort-icon"
                                    style={{
                                      verticalAlign: "middle",
                                      marginLeft: 2,
                                      display: "inline-block",
                                    }}
                                  />
                                ) : (
                                  <ArrowDown
                                    className="w-3 h-3 cargo-inner-table__sort-icon"
                                    style={{
                                      verticalAlign: "middle",
                                      marginLeft: 2,
                                      display: "inline-block",
                                    }}
                                  />
                                ))}
                            </th>
                            {row.items.some(
                              (i: unknown) =>
                                (i as { Order?: string }).Order != null &&
                                String((i as { Order?: string }).Order).trim() !== ""
                            ) && (
                              <th
                                className="cargo-inner-table__col-order"
                                style={{ padding: "0.35rem 0.3rem", textAlign: "left", fontWeight: 600 }}
                              >
                                Номер заявки заказчика
                              </th>
                            )}
                            <th
                              className="cargo-inner-table__col-date"
                              style={{
                                padding: "0.35rem 0.3rem",
                                textAlign: "left",
                                fontWeight: 600,
                                cursor: "pointer",
                                userSelect: "none",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onInnerTableSort("datePrih");
                              }}
                              title="Сортировка"
                            >
                              <span className="cargo-inner-table__head-long">Дата прихода</span>
                              <span className="cargo-inner-table__head-short">Дата</span>
                              {innerTableSortColumn === "datePrih" &&
                                (innerTableSortOrder === "asc" ? (
                                  <ArrowUp
                                    className="w-3 h-3 cargo-inner-table__sort-icon"
                                    style={{
                                      verticalAlign: "middle",
                                      marginLeft: 2,
                                      display: "inline-block",
                                    }}
                                  />
                                ) : (
                                  <ArrowDown
                                    className="w-3 h-3 cargo-inner-table__sort-icon"
                                    style={{
                                      verticalAlign: "middle",
                                      marginLeft: 2,
                                      display: "inline-block",
                                    }}
                                  />
                                ))}
                            </th>
                            <th
                              className="cargo-inner-table__col-plan-date"
                              style={{
                                padding: "0.35rem 0.3rem",
                                textAlign: "left",
                                fontWeight: 600,
                                cursor: "pointer",
                                userSelect: "none",
                                lineHeight: 1.15,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onInnerTableSort("planDate");
                              }}
                              title="Сортировка"
                            >
                              <span className="cargo-inner-table__head-long">Плановая дата прибытия на терминал</span>
                              <span className="cargo-inner-table__head-short">План</span>
                              {innerTableSortColumn === "planDate" &&
                                (innerTableSortOrder === "asc" ? (
                                  <ArrowUp
                                    className="w-3 h-3 cargo-inner-table__sort-icon"
                                    style={{
                                      verticalAlign: "middle",
                                      marginLeft: 2,
                                      display: "inline-block",
                                    }}
                                  />
                                ) : (
                                  <ArrowDown
                                    className="w-3 h-3 cargo-inner-table__sort-icon"
                                    style={{
                                      verticalAlign: "middle",
                                      marginLeft: 2,
                                      display: "inline-block",
                                    }}
                                  />
                                ))}
                            </th>
                            <th
                              className="cargo-inner-table__col-status"
                              style={{
                                padding: "0.35rem 0.3rem",
                                textAlign: "left",
                                fontWeight: 600,
                                cursor: "pointer",
                                userSelect: "none",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onInnerTableSort("status");
                              }}
                              title="Сортировка: статус, доставка, маршрут"
                            >
                              <span className="cargo-inner-table__head-long">Статус / маршрут</span>
                              <span className="cargo-inner-table__head-short">Ст.</span>
                              {innerTableSortColumn === "status" &&
                                (innerTableSortOrder === "asc" ? (
                                  <ArrowUp
                                    className="w-3 h-3 cargo-inner-table__sort-icon"
                                    style={{
                                      verticalAlign: "middle",
                                      marginLeft: 2,
                                      display: "inline-block",
                                    }}
                                  />
                                ) : (
                                  <ArrowDown
                                    className="w-3 h-3 cargo-inner-table__sort-icon"
                                    style={{
                                      verticalAlign: "middle",
                                      marginLeft: 2,
                                      display: "inline-block",
                                    }}
                                  />
                                ))}
                            </th>
                            <th
                              className="cargo-inner-table__col-route cargo-inner-table__col-route--desktop"
                              style={{
                                padding: "0.35rem 0.3rem",
                                textAlign: "left",
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                              }}
                            >
                              Маршрут
                            </th>
                            <th
                              className="cargo-inner-table__col-mest"
                              style={{
                                padding: "0.35rem 0.3rem",
                                textAlign: "right",
                                fontWeight: 600,
                                cursor: "pointer",
                                userSelect: "none",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onInnerTableSort("mest");
                              }}
                              title="Сортировка"
                            >
                              <span className="cargo-inner-table__head-long">Мест</span>
                              <span className="cargo-inner-table__head-short">Мест</span>
                              {innerTableSortColumn === "mest" &&
                                (innerTableSortOrder === "asc" ? (
                                  <ArrowUp
                                    className="w-3 h-3 cargo-inner-table__sort-icon"
                                    style={{
                                      verticalAlign: "middle",
                                      marginLeft: 2,
                                      display: "inline-block",
                                    }}
                                  />
                                ) : (
                                  <ArrowDown
                                    className="w-3 h-3 cargo-inner-table__sort-icon"
                                    style={{
                                      verticalAlign: "middle",
                                      marginLeft: 2,
                                      display: "inline-block",
                                    }}
                                  />
                                ))}
                            </th>
                            <th
                              className="cargo-inner-table__col-pw"
                              style={{
                                padding: "0.35rem 0.3rem",
                                textAlign: "right",
                                fontWeight: 600,
                                cursor: "pointer",
                                userSelect: "none",
                                whiteSpace: "nowrap",
                                minWidth: "4rem",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onInnerTableSort("pw");
                              }}
                              title="Сортировка"
                            >
                              <span className="cargo-inner-table__head-long">Плат. вес</span>
                              <span className="cargo-inner-table__head-short">Пл.в.</span>
                              {innerTableSortColumn === "pw" &&
                                (innerTableSortOrder === "asc" ? (
                                  <ArrowUp
                                    className="w-3 h-3 cargo-inner-table__sort-icon"
                                    style={{
                                      verticalAlign: "middle",
                                      marginLeft: 2,
                                      display: "inline-block",
                                    }}
                                  />
                                ) : (
                                  <ArrowDown
                                    className="w-3 h-3 cargo-inner-table__sort-icon"
                                    style={{
                                      verticalAlign: "middle",
                                      marginLeft: 2,
                                      display: "inline-block",
                                    }}
                                  />
                                ))}
                            </th>
                            {showSums && (
                              <th
                                className="cargo-inner-table__col-sum cargo-inner-table__col-sum--stacked-mobile"
                                style={{
                                  padding: "0.35rem 0.3rem",
                                  textAlign: "right",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  userSelect: "none",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onInnerTableSort("sum");
                                }}
                                title="Сортировка"
                              >
                              <span className="cargo-inner-table__head-long">Сумма</span>
                              <span className="cargo-inner-table__head-short">Сум.</span>
                                {innerTableSortColumn === "sum" &&
                                  (innerTableSortOrder === "asc" ? (
                                    <ArrowUp
                                      className="w-3 h-3 cargo-inner-table__sort-icon"
                                      style={{
                                        verticalAlign: "middle",
                                        marginLeft: 2,
                                        display: "inline-block",
                                      }}
                                    />
                                  ) : (
                                    <ArrowDown
                                      className="w-3 h-3 cargo-inner-table__sort-icon"
                                      style={{
                                        verticalAlign: "middle",
                                        marginLeft: 2,
                                        display: "inline-block",
                                      }}
                                    />
                                  ))}
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {sortInnerItems(row.items).map((item, j) => (
                            <tr
                              key={item.Number || j}
                              className="cargo-inner-table__row"
                              style={{ borderBottom: "1px solid var(--color-border)", cursor: "pointer" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectCargo(item);
                              }}
                              title="Открыть карточку перевозки"
                            >
                              <td className="cargo-inner-table__col-type" style={{ padding: "0.35rem 0.3rem", textAlign: "center" }}>
                                <CargoTransportTypeIcon item={item} className="cargo-inner-table__type-icon" />
                              </td>
                              <td className="cargo-inner-table__col-number" style={{ padding: "0.35rem 0.3rem" }}>
                                <ClickableCargoNumber
                                  number={item.Number}
                                  onOpen={() => onSelectCargo(item)}
                                  className="cargo-inner-table__number"
                                  style={{
                                    color: (() => {
                                      const s = getSlaInfo(item, workScheduleByInn);
                                      return s ? (s.onTime ? "#22c55e" : "#ef4444") : undefined;
                                    })(),
                                  }}
                                />
                              </td>
                              {row.items.some(
                                (i: unknown) =>
                                  (i as { Order?: string }).Order != null &&
                                  String((i as { Order?: string }).Order).trim() !== ""
                              ) && (
                                <td className="cargo-inner-table__col-order" style={{ padding: "0.35rem 0.3rem" }}>
                                  {(item as { Order?: string }).Order != null &&
                                  String((item as { Order?: string }).Order).trim() !== ""
                                    ? String((item as { Order?: string }).Order).trim()
                                    : "—"}
                                </td>
                              )}
                              <td className="cargo-inner-table__col-date" style={{ padding: "0.35rem 0.3rem" }}>
                                <DateText value={item.DatePrih} omitYear={isMobile} />
                              </td>
                              <td className="cargo-inner-table__col-plan-date" style={{ padding: "0.35rem 0.3rem", whiteSpace: "nowrap" }}>
                                {(() => {
                                  const iso = plannedArrivalIso(item, routeTypePlanDays);
                                  return iso ? <DateText value={iso} omitYear={isMobile} /> : "—";
                                })()}
                              </td>
                              <td className="cargo-inner-table__col-status" style={{ padding: "0.35rem 0.3rem" }}>
                                <CargoLogisticsBadges
                                  item={item}
                                  showPayment={showSums}
                                  showRouteInline
                                />
                              </td>
                              <td className="cargo-inner-table__col-route cargo-inner-table__col-route--desktop" style={{ padding: "0.35rem 0.3rem" }}>
                                <RouteBadge route={getCargoItemRouteLabel(item)} />
                              </td>
                              <td className="cargo-inner-table__col-mest" style={{ padding: "0.35rem 0.3rem", textAlign: "right" }}>
                                {item.Mest != null ? Math.round(Number(item.Mest)) : "—"}
                              </td>
                              <td
                                className="cargo-inner-table__col-pw"
                                style={{
                                  padding: "0.35rem 0.3rem",
                                  textAlign: "right",
                                  whiteSpace: "nowrap",
                                  minWidth: "4rem",
                                }}
                              >
                                <span className="cargo-inner-table__pw-line">
                                  {item.PW != null ? `${Math.round(Number(item.PW))} кг` : "—"}
                                </span>
                                {showSums && (
                                  <span className="cargo-inner-table__sum-mobile-line">
                                    {item.Sum != null ? formatCurrency(item.Sum as number, true) : "—"}
                                  </span>
                                )}
                              </td>
                              {showSums && (
                                <td className="cargo-inner-table__col-sum cargo-inner-table__col-sum--stacked-mobile" style={{ padding: "0.35rem 0.3rem", textAlign: "right" }}>
                                  {item.Sum != null ? formatCurrency(item.Sum as number, true) : "—"}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </motion.div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type CargoCardsListProps = {
  filteredItems: CargoItem[];
  workScheduleByInn: Record<string, WorkSchedule>;
  useServiceRequest: boolean;
  showSums: boolean;
  isFavorite: (cargoNumber: string | undefined) => boolean;
  onToggleFavorite: (cargoNumber: string | undefined) => void;
  onShare: (item: CargoItem) => Promise<void>;
  onCreateClaim?: (cargoNumber: string) => void;
  onSelectCargo: (item: CargoItem) => void;
  motionEnabled?: boolean;
};

export function CargoCardsList({
  filteredItems,
  workScheduleByInn,
  useServiceRequest,
  showSums,
  isFavorite,
  onToggleFavorite,
  onShare,
  onCreateClaim,
  onSelectCargo,
  motionEnabled = false,
}: CargoCardsListProps) {
  return (
    <motion.div
      className="cargo-list"
      variants={motionEnabled ? cargoListContainerVariants : undefined}
      initial={motionEnabled ? "hidden" : false}
      animate={motionEnabled ? "visible" : undefined}
    >
      {filteredItems.map((item: CargoItem, idx: number) => {
        const sla = getSlaInfo(item, workScheduleByInn);
        const numberColor = sla ? (sla.onTime ? "#22c55e" : "#ef4444") : undefined;
        return (
          <motion.div
            key={item.Number || idx}
            variants={motionEnabled ? cargoListItemVariants : undefined}
            initial={motionEnabled ? "hidden" : false}
            animate={motionEnabled ? "visible" : undefined}
          >
          <Panel
            className="cargo-card cargo-list-item"
            onClick={() => onSelectCargo(item)}
            style={{ cursor: "pointer", marginBottom: "0.75rem", position: "relative" }}
          >
            <Flex
              className="cargo-item-row-1"
              justify="space-between"
              align="flex-start"
              style={{
                marginBottom: "0.5rem",
                minWidth: 0,
                gap: "0.5rem",
                flexWrap: "nowrap",
              }}
            >
              <Flex
                direction="column"
                align="flex-start"
                gap="0.25rem"
                style={{ flex: "1 1 auto", minWidth: 0, overflow: "hidden" }}
                className="cargo-item-number-wrap"
              >
                <Typography.Body
                  className="cargo-item-number"
                  style={{ fontWeight: 600, fontSize: "1rem", color: numberColor, wordBreak: "break-all" }}
                >
                  {item.Number || "—"}
                </Typography.Body>
                {getCargoDisplayRoleLabel(item) && (
                  <AppBadge tone="role" className="cargo-role-badge" style={{ flexShrink: 0, alignSelf: "flex-start" }}>
                    {getCargoDisplayRoleLabel(item)}
                  </AppBadge>
                )}
              </Flex>
              <Flex
                align="center"
                gap="0.5rem"
                style={{ flexShrink: 0, marginLeft: "auto" }}
                className="cargo-item-row-1-actions"
              >
                <Flex align="center" gap="0.25rem" style={{ flexShrink: 0 }}>
                  <Button
                    style={{
                      padding: "0.25rem",
                      minWidth: "auto",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    onClick={async (e) => {
                      e.stopPropagation();
                      await onShare(item);
                    }}
                    title="Поделиться"
                  >
                    <Share2 className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
                  </Button>
                  {onCreateClaim && item.Number ? (
                    <Button
                      style={{
                        padding: "0.25rem",
                        minWidth: "auto",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCreateClaim(item.Number as string);
                      }}
                      title="Создать претензию"
                    >
                      <ClipboardList className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
                    </Button>
                  ) : null}
                  <Button
                    style={{
                      padding: "0.25rem",
                      minWidth: "auto",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(item.Number);
                    }}
                    title={isFavorite(item.Number) ? "Удалить из избранного" : "Добавить в избранное"}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = "0.7";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = "1";
                    }}
                  >
                    <Heart
                      className="w-4 h-4"
                      style={{
                        fill: isFavorite(item.Number) ? "#ef4444" : "transparent",
                        color: isFavorite(item.Number) ? "#ef4444" : "var(--color-text-secondary)",
                        transition: "all 0.2s",
                      }}
                    />
                  </Button>
                </Flex>
                <Typography.Label
                  className="text-theme-secondary"
                  style={{ fontSize: "0.85rem", whiteSpace: "nowrap", flexShrink: 0 }}
                >
                  <DateText value={item.DatePrih} />
                </Typography.Label>
              </Flex>
            </Flex>
            <Flex justify="space-between" align="center" gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.5rem" }}>
              <CargoLogisticsBadges
                item={item}
                showPayment={showSums}
                className="cargo-inner-table__badges"
              />
              {showSums && getCargoRoleSet(item).has("Customer") && (
                <Typography.Body
                  style={{
                    fontWeight: 600,
                    fontSize: "1rem",
                    color: getSumColorByPaymentStatus(item.StateBill),
                  }}
                >
                  {formatCurrency(item.Sum)}
                </Typography.Body>
              )}
            </Flex>
            <Flex
              justify="space-between"
              align="center"
              style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}
            >
              <Flex gap="1rem">
                <Typography.Label>Мест: {item.Mest || "-"}</Typography.Label>
                <Typography.Label>Плат. вес: {item.PW ? `${item.PW} кг` : "-"}</Typography.Label>
              </Flex>
            </Flex>
            <Flex
              className="cargo-item-route-customer"
              align="center"
              justify="space-between"
              gap="0.5rem"
              style={{ marginTop: "0.5rem", minWidth: 0, overflow: "hidden", flexWrap: "wrap" }}
            >
              <Flex
                align="center"
                gap="0.5rem"
                style={{ minWidth: 0, overflow: "hidden" }}
                className="cargo-item-route"
              >
                <>
                  <CargoTransportTypeIcon item={item} />
                  <RouteBadge route={getCargoItemRouteLabel(item)} />
                </>
              </Flex>
              {useServiceRequest && (item.Customer ?? (item as { customer?: string }).customer) && (
                <Typography.Label
                  className="cargo-item-customer-text"
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--color-text-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    maxWidth: "50%",
                  }}
                >
                  {stripOoo(item.Customer ?? (item as { customer?: string }).customer)}
                </Typography.Label>
              )}
            </Flex>
          </Panel>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
