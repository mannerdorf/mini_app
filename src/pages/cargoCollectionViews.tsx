import React from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  Heart,
  Share2,
  Ship,
  Truck,
} from "lucide-react";
import { DateText } from "../components/ui/DateText";
import { StatusBadge, StatusBillBadge } from "../components/shared/StatusBadges";
import { getSlaInfo } from "../lib/cargoUtils";
import { formatCurrency, stripOoo, cityToCode } from "../lib/formatUtils";
import { getSumColorByPaymentStatus } from "../lib/statusUtils";
import type { WorkSchedule } from "../lib/slaWorkSchedule";
import type { CargoItem } from "../types";
import type { CargoGroupedRow } from "./cargoPipeline";

type InnerTableSortCol = "number" | "datePrih" | "status" | "mest" | "pw" | "sum";

type CargoCustomerTableProps = {
  showSums: boolean;
  tableSortColumn: "customer" | "sum" | "mest" | "pw" | "w" | "vol" | "count";
  tableSortOrder: "asc" | "desc";
  sortedGroupedByCustomer: CargoGroupedRow[];
  expandedTableCustomer: string | null;
  innerTableSortColumn: InnerTableSortCol | null;
  innerTableSortOrder: "asc" | "desc";
  workScheduleByInn: Record<string, WorkSchedule>;
  onTableSort: (column: "customer" | "sum" | "mest" | "pw" | "w" | "vol" | "count") => void;
  onInnerTableSort: (column: InnerTableSortCol) => void;
  sortInnerItems: (items: CargoItem[]) => CargoItem[];
  onToggleExpandedCustomer: (customer: string) => void;
  onSelectCargo: (item: CargoItem) => void;
};

export function CargoCustomerTable({
  showSums,
  tableSortColumn,
  tableSortOrder,
  sortedGroupedByCustomer,
  expandedTableCustomer,
  innerTableSortColumn,
  innerTableSortOrder,
  workScheduleByInn,
  onTableSort,
  onInnerTableSort,
  sortInnerItems,
  onToggleExpandedCustomer,
  onSelectCargo,
}: CargoCustomerTableProps) {
  return (
    <div className="cargo-card" style={{ overflowX: "auto", marginBottom: "1rem" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr
            style={{
              borderBottom: "2px solid var(--color-border)",
              background: "var(--color-bg-hover)",
            }}
          >
            <th
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
              Плат. вес{" "}
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
              Перевозок{" "}
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
          {sortedGroupedByCustomer.map((row, i) => (
            <React.Fragment key={i}>
              <tr
                style={{
                  borderBottom: "1px solid var(--color-border)",
                  cursor: "pointer",
                  background:
                    expandedTableCustomer === row.customer ? "var(--color-bg-hover)" : undefined,
                }}
                onClick={() => onToggleExpandedCustomer(row.customer)}
                title={
                  expandedTableCustomer === row.customer
                    ? "Свернуть детали"
                    : "Показать перевозки по строчно"
                }
              >
                <td
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
                  <td style={{ padding: "0.5rem 0.4rem", textAlign: "right", whiteSpace: "nowrap" }}>
                    {formatCurrency(row.sum, true)}
                  </td>
                )}
                <td style={{ padding: "0.5rem 0.4rem", textAlign: "right" }}>
                  {Math.round(row.mest)}
                </td>
                <td
                  style={{
                    padding: "0.5rem 0.4rem",
                    textAlign: "right",
                    whiteSpace: "nowrap",
                    minWidth: "4rem",
                  }}
                >
                  {Math.round(row.pw)} кг
                </td>
                <td style={{ padding: "0.5rem 0.4rem", textAlign: "right", whiteSpace: "nowrap" }}>
                  {Math.round(row.w)} кг
                </td>
                <td style={{ padding: "0.5rem 0.4rem", textAlign: "right" }}>
                  {Math.round(row.vol)} м³
                </td>
                <td style={{ padding: "0.5rem 0.4rem", textAlign: "right" }}>{row.items.length}</td>
              </tr>
              {expandedTableCustomer === row.customer && (
                <tr key={`${i}-detail`}>
                  <td
                    colSpan={showSums ? 7 : 6}
                    style={{
                      padding: 0,
                      borderBottom: "1px solid var(--color-border)",
                      verticalAlign: "top",
                      background: "var(--color-bg-primary)",
                    }}
                  >
                    <div style={{ padding: "0.5rem", overflowX: "auto" }}>
                      <table
                        style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}
                      >
                        <thead>
                          <tr
                            style={{
                              borderBottom: "1px solid var(--color-border)",
                              background: "var(--color-bg-hover)",
                            }}
                          >
                            <th
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
                              Номер
                              {innerTableSortColumn === "number" &&
                                (innerTableSortOrder === "asc" ? (
                                  <ArrowUp
                                    className="w-3 h-3"
                                    style={{
                                      verticalAlign: "middle",
                                      marginLeft: 2,
                                      display: "inline-block",
                                    }}
                                  />
                                ) : (
                                  <ArrowDown
                                    className="w-3 h-3"
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
                              <th style={{ padding: "0.35rem 0.3rem", textAlign: "left", fontWeight: 600 }}>
                                Номер заявки заказчика
                              </th>
                            )}
                            <th
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
                              Дата прихода
                              {innerTableSortColumn === "datePrih" &&
                                (innerTableSortOrder === "asc" ? (
                                  <ArrowUp
                                    className="w-3 h-3"
                                    style={{
                                      verticalAlign: "middle",
                                      marginLeft: 2,
                                      display: "inline-block",
                                    }}
                                  />
                                ) : (
                                  <ArrowDown
                                    className="w-3 h-3"
                                    style={{
                                      verticalAlign: "middle",
                                      marginLeft: 2,
                                      display: "inline-block",
                                    }}
                                  />
                                ))}
                            </th>
                            <th
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
                              title="Сортировка"
                            >
                              Статус
                              {innerTableSortColumn === "status" &&
                                (innerTableSortOrder === "asc" ? (
                                  <ArrowUp
                                    className="w-3 h-3"
                                    style={{
                                      verticalAlign: "middle",
                                      marginLeft: 2,
                                      display: "inline-block",
                                    }}
                                  />
                                ) : (
                                  <ArrowDown
                                    className="w-3 h-3"
                                    style={{
                                      verticalAlign: "middle",
                                      marginLeft: 2,
                                      display: "inline-block",
                                    }}
                                  />
                                ))}
                            </th>
                            <th
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
                              Мест
                              {innerTableSortColumn === "mest" &&
                                (innerTableSortOrder === "asc" ? (
                                  <ArrowUp
                                    className="w-3 h-3"
                                    style={{
                                      verticalAlign: "middle",
                                      marginLeft: 2,
                                      display: "inline-block",
                                    }}
                                  />
                                ) : (
                                  <ArrowDown
                                    className="w-3 h-3"
                                    style={{
                                      verticalAlign: "middle",
                                      marginLeft: 2,
                                      display: "inline-block",
                                    }}
                                  />
                                ))}
                            </th>
                            <th
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
                              Плат. вес
                              {innerTableSortColumn === "pw" &&
                                (innerTableSortOrder === "asc" ? (
                                  <ArrowUp
                                    className="w-3 h-3"
                                    style={{
                                      verticalAlign: "middle",
                                      marginLeft: 2,
                                      display: "inline-block",
                                    }}
                                  />
                                ) : (
                                  <ArrowDown
                                    className="w-3 h-3"
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
                                Сумма
                                {innerTableSortColumn === "sum" &&
                                  (innerTableSortOrder === "asc" ? (
                                    <ArrowUp
                                      className="w-3 h-3"
                                      style={{
                                        verticalAlign: "middle",
                                        marginLeft: 2,
                                        display: "inline-block",
                                      }}
                                    />
                                  ) : (
                                    <ArrowDown
                                      className="w-3 h-3"
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
                              style={{ borderBottom: "1px solid var(--color-border)", cursor: "pointer" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectCargo(item);
                              }}
                              title="Открыть карточку перевозки"
                            >
                              <td style={{ padding: "0.35rem 0.3rem" }}>
                                <span
                                  style={{
                                    color: (() => {
                                      const s = getSlaInfo(item, workScheduleByInn);
                                      return s ? (s.onTime ? "#22c55e" : "#ef4444") : undefined;
                                    })(),
                                  }}
                                >
                                  {item.Number || "—"}
                                </span>
                              </td>
                              {row.items.some(
                                (i: unknown) =>
                                  (i as { Order?: string }).Order != null &&
                                  String((i as { Order?: string }).Order).trim() !== ""
                              ) && (
                                <td style={{ padding: "0.35rem 0.3rem" }}>
                                  {(item as { Order?: string }).Order != null &&
                                  String((item as { Order?: string }).Order).trim() !== ""
                                    ? String((item as { Order?: string }).Order).trim()
                                    : "—"}
                                </td>
                              )}
                              <td style={{ padding: "0.35rem 0.3rem" }}>
                                <DateText value={item.DatePrih} />
                              </td>
                              <td style={{ padding: "0.35rem 0.3rem" }}>
                                <StatusBadge status={item.State} />
                              </td>
                              <td style={{ padding: "0.35rem 0.3rem", textAlign: "right" }}>
                                {item.Mest != null ? Math.round(Number(item.Mest)) : "—"}
                              </td>
                              <td
                                style={{
                                  padding: "0.35rem 0.3rem",
                                  textAlign: "right",
                                  whiteSpace: "nowrap",
                                  minWidth: "4rem",
                                }}
                              >
                                {item.PW != null ? `${Math.round(Number(item.PW))} кг` : "—"}
                              </td>
                              {showSums && (
                                <td style={{ padding: "0.35rem 0.3rem", textAlign: "right" }}>
                                  {item.Sum != null ? formatCurrency(item.Sum as number, true) : "—"}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
  onSelectCargo: (item: CargoItem) => void;
};

export function CargoCardsList({
  filteredItems,
  workScheduleByInn,
  useServiceRequest,
  showSums,
  isFavorite,
  onToggleFavorite,
  onShare,
  onSelectCargo,
}: CargoCardsListProps) {
  return (
    <div className="cargo-list">
      {filteredItems.map((item: CargoItem, idx: number) => {
        const sla = getSlaInfo(item, workScheduleByInn);
        const numberColor = sla ? (sla.onTime ? "#22c55e" : "#ef4444") : undefined;
        return (
          <Panel
            key={item.Number || idx}
            className="cargo-card cargo-list-item"
            onClick={() => onSelectCargo(item)}
            style={{ cursor: "pointer", marginBottom: "0.75rem", position: "relative" }}
          >
            <Flex
              className="cargo-item-row-1"
              justify="space-between"
              align="center"
              style={{
                marginBottom: "0.5rem",
                minWidth: 0,
                overflow: "hidden",
                gap: "0.5rem",
                flexWrap: "wrap",
              }}
            >
              <Flex
                direction="column"
                align="flex-start"
                gap="0.25rem"
                style={{ flex: "0 1 auto", minWidth: 0 }}
                className="cargo-item-number-wrap"
              >
                <Typography.Body
                  className="cargo-item-number"
                  style={{ fontWeight: 600, fontSize: "1rem", color: numberColor, wordBreak: "break-all" }}
                >
                  {item.Number || "—"}
                </Typography.Body>
                {item._role && (
                  <span
                    className="role-badge"
                    style={{
                      fontSize: "0.65rem",
                      fontWeight: 600,
                      padding: "0.15rem 0.4rem",
                      borderRadius: "999px",
                      background: "var(--color-panel-secondary)",
                      color: "var(--color-text-secondary)",
                      border: "1px solid var(--color-border)",
                      flexShrink: 0,
                    }}
                  >
                    {item._role === "Customer"
                      ? "Заказчик"
                      : item._role === "Sender"
                        ? "Отправитель"
                        : "Получатель"}
                  </span>
                )}
              </Flex>
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
              <Calendar className="w-4 h-4 text-theme-secondary" style={{ flexShrink: 0 }} />
              <Typography.Label
                className="text-theme-secondary"
                style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}
              >
                <DateText value={item.DatePrih} />
              </Typography.Label>
            </Flex>
            <Flex justify="space-between" align="center" style={{ marginBottom: "0.5rem" }}>
              <StatusBadge status={item.State} />
              {showSums && item._role === "Customer" && (
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
              {showSums && item._role === "Customer" && <StatusBillBadge status={item.StateBill} />}
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
                {(() => {
                  const isFerry =
                    item?.AK === true || item?.AK === "true" || item?.AK === "1" || item?.AK === 1;
                  const from = cityToCode(item.CitySender);
                  const to = cityToCode(item.CityReceiver);
                  const route = [from, to].filter(Boolean).join(" – ") || "-";
                  return (
                    <>
                      {isFerry ? (
                        <Ship
                          className="w-4 h-4"
                          style={{ flexShrink: 0, color: "var(--color-primary-blue)" }}
                          title="Паром"
                        />
                      ) : (
                        <Truck
                          className="w-4 h-4"
                          style={{ flexShrink: 0, color: "var(--color-primary-blue)" }}
                          title="Авто"
                        />
                      )}
                      <Typography.Label
                        className="text-theme-secondary cargo-item-route-text"
                        style={{
                          fontSize: "0.85rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {route}
                      </Typography.Label>
                    </>
                  );
                })()}
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
        );
      })}
    </div>
  );
}
