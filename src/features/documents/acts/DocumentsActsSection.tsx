import React, { useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Typography } from "@maxhub/max-ui";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { DateText } from "../../../components/ui/DateText";
import { formatCurrency, formatInvoiceNumber, normalizeInvoiceStatus, stripOoo } from "../../../lib/formatUtils";
import { invoiceDocSum } from "../../../lib/invoiceAmounts.js";
import { StatusBadge } from "../../../components/shared/StatusBadges";
import {
  DocumentsActCardsList,
  DocumentsRouteBadge,
  DocumentsInvoiceTableBadges,
  DocumentsStateBlocks,
} from "../views/documentsViewBlocks";
import {
  findInvoiceLinkedToAct,
  getFirstCargoNumberFromInvoice,
} from "../lib/documentsPipeline";
import { ActDetailModal } from "./ActDetailModal";
import {
  cargoExpandMotionProps,
  cargoModeSwitchMotion,
  cargoTableGroupRowVariants,
} from "../../../pages/cargoMotion";
import type { AuthData } from "../../../types";

type Props = {
  active: boolean;
  auth: AuthData;
  actsLoading: boolean;
  actsError: string | null;
  perevozkiLoading: boolean;
  effectiveServiceMode: boolean;
  tableModeGroupedByCustomer: boolean;
  tableModeFlatDirect: boolean;
  tableModeEffective: boolean;
  docsMotionEnabled: boolean;
  showCustomerColumn: boolean;
  showSums: boolean;
  groupedCustomerTableColSpan: number;
  filteredActs: any[];
  actsSummary: { sum: number; count: number };
  sortedGroupedActsByCustomer: { customer: string; items: any[]; sum: number }[];
  expandedTableActCustomer: string | null;
  setExpandedTableActCustomer: React.Dispatch<React.SetStateAction<string | null>>;
  tableSortColumn: "customer" | "sum" | "count";
  tableSortOrder: "asc" | "desc";
  handleTableSort: (column: "customer" | "sum" | "count") => void;
  innerTableActSortColumn: "number" | "date" | "status" | "sum" | "deliveryStatus" | "route";
  innerTableActSortOrder: "asc" | "desc";
  handleInnerTableActSort: (column: "number" | "date" | "status" | "sum" | "deliveryStatus" | "route") => void;
  sortActs: (acts: any[]) => any[];
  items: any[];
  cargoStateByNumber: Map<string, string>;
  cargoRouteByNumber: Map<string, string>;
  normCargoKey: (raw: string) => string;
  isInvoiceFavorite: (invNum: string | undefined) => boolean;
  toggleInvoiceFavorite: (invNum: string | undefined) => void;
  selectedAct: any | null;
  setSelectedAct: (act: any | null) => void;
  onOpenInvoice: (inv: any) => void;
  onNavigateToInvoices: () => void;
  onOpenCargo?: (cargoNumber: string) => void;
};

export function DocumentsActsSection({
  active,
  auth,
  actsLoading,
  actsError,
  perevozkiLoading,
  effectiveServiceMode,
  tableModeGroupedByCustomer,
  tableModeFlatDirect,
  tableModeEffective,
  docsMotionEnabled,
  showCustomerColumn,
  showSums,
  groupedCustomerTableColSpan,
  filteredActs,
  actsSummary,
  sortedGroupedActsByCustomer,
  expandedTableActCustomer,
  setExpandedTableActCustomer,
  tableSortColumn,
  tableSortOrder,
  handleTableSort,
  innerTableActSortColumn,
  innerTableActSortOrder,
  handleInnerTableActSort,
  sortActs,
  items,
  cargoStateByNumber,
  cargoRouteByNumber,
  normCargoKey,
  isInvoiceFavorite,
  toggleInvoiceFavorite,
  selectedAct,
  setSelectedAct,
  onOpenInvoice,
  onNavigateToInvoices,
  onOpenCargo,
}: Props) {
  const renderActInnerTableRow = useCallback(
    (act: any, rowKey: string | number, cellPad: string) => {
      const linkedInv = findInvoiceLinkedToAct(act, items);
      const invSource = linkedInv ?? act;
      const anum = act.Number ?? act.number ?? "";
      const adt = act.DateDoc ?? act.Date ?? act.date ?? "";
      const ainv = act.Invoice ?? act.invoice ?? act.Счёт ?? "";
      const asum = linkedInv ? invoiceDocSum(linkedInv) : invoiceDocSum(act);
      const ist = normalizeInvoiceStatus(
        linkedInv?.Status ??
          linkedInv?.State ??
          linkedInv?.state ??
          linkedInv?.Статус ??
          linkedInv?.status ??
          linkedInv?.PaymentStatus ??
          "",
      );
      const istBadgeStyle =
        ist === "Оплачен"
          ? { bg: "rgba(34, 197, 94, 0.2)", color: "#22c55e" }
          : ist === "Оплачен частично"
            ? { bg: "rgba(234, 179, 8, 0.2)", color: "#ca8a04" }
            : ist === "Не оплачен"
              ? { bg: "rgba(239, 68, 68, 0.2)", color: "#ef4444" }
              : { bg: "var(--color-panel-secondary)", color: "var(--color-text-secondary)" };
      const firstCargoNum = getFirstCargoNumberFromInvoice(invSource);
      const deliveryState = firstCargoNum ? cargoStateByNumber.get(normCargoKey(firstCargoNum)) : undefined;
      const routeFromCargo = firstCargoNum ? cargoRouteByNumber.get(normCargoKey(firstCargoNum)) : null;
      const routeLabel = routeFromCargo || (ainv ? `Сч. ${formatInvoiceNumber(String(ainv))}` : null);
      return (
        <tr
          key={rowKey}
          style={{ borderBottom: "1px solid var(--color-border)", cursor: "pointer" }}
          onClick={(ev) => {
            ev.stopPropagation();
            setSelectedAct(act);
          }}
          title="Открыть УПД"
        >
          <td className="cargo-inner-table__col-number" style={{ padding: cellPad }}>
            <div className="documents-invoice-table-badges-anchor">
              <span className="cargo-inner-table__number">{formatInvoiceNumber(String(anum))}</span>
              <DocumentsInvoiceTableBadges
                billStatus={ist || undefined}
                billBadgeStyle={istBadgeStyle}
                deliveryState={deliveryState}
                routeLabel={routeLabel || undefined}
                perevozkiLoading={perevozkiLoading}
              />
            </div>
          </td>
          <td className="cargo-inner-table__col-date doc-inner-table-date" style={{ padding: cellPad }}>
            <DateText value={typeof adt === "string" ? adt : adt ? String(adt) : undefined} omitYear />
          </td>
          <td className="cargo-inner-table__col-status doc-inner-table-status" style={{ padding: cellPad }} aria-hidden />
          <td
            className="cargo-inner-table__col-delivery doc-inner-table-delivery cargo-inner-table__col-delivery--desktop"
            style={{ padding: cellPad }}
          >
            {perevozkiLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--color-text-secondary)" }} />
            ) : (
              <StatusBadge status={deliveryState} />
            )}
          </td>
          <td
            className="cargo-inner-table__col-route doc-inner-table-route cargo-inner-table__col-route--desktop"
            style={{ padding: cellPad }}
          >
            {perevozkiLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--color-text-secondary)" }} />
            ) : routeLabel ? (
              <DocumentsRouteBadge>{routeLabel}</DocumentsRouteBadge>
            ) : (
              "—"
            )}
          </td>
          {showSums && (
            <td
              className="cargo-inner-table__col-sum documents-invoices-inner-table__sum"
              style={{ padding: cellPad, textAlign: "right", verticalAlign: "middle" }}
            >
              <span className="documents-invoices-inner-table__sum-value">
                {asum != null ? formatCurrency(asum, true) : "—"}
              </span>
            </td>
          )}
        </tr>
      );
    },
    [
      items,
      cargoStateByNumber,
      cargoRouteByNumber,
      normCargoKey,
      perevozkiLoading,
      showSums,
      setSelectedAct,
    ],
  );

  if (!active) return null;

  return (
    <motion.div className="documents-summary-section-body">
      {(actsLoading || !!actsError) && (
        <DocumentsStateBlocks loading={actsLoading} error={actsError} emptyText="" />
      )}
      <AnimatePresence mode="wait">
        {!actsLoading && !actsError && tableModeGroupedByCustomer && sortedGroupedActsByCustomer.length > 0 ? (
          <motion.div
            key="docs-act-g"
            className="documents-table-offset-desktop"
            {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}
          >
            <div className="cargo-card cargo-customer-table-wrap" style={{ marginBottom: "1rem" }}>
              <table
                className="cargo-customer-table documents-grouped-table"
                style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}
              >
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
                    {showCustomerColumn && (
                      <th
                        className="cargo-customer-table__col-customer customer-col"
                        style={{
                          padding: "0.5rem 0.4rem",
                          textAlign: "left",
                          fontWeight: 600,
                          cursor: "pointer",
                          userSelect: "none",
                        }}
                        onClick={() => handleTableSort("customer")}
                        title="Сортировка"
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
                    )}
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
                        onClick={() => handleTableSort("sum")}
                        title="Сортировка"
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
                      className="cargo-customer-table__col-count"
                      style={{
                        padding: "0.5rem 0.4rem",
                        textAlign: "right",
                        fontWeight: 600,
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                      onClick={() => handleTableSort("count")}
                      title="Сортировка"
                    >
                      <span className="cargo-customer-table__head-long">УПД</span>
                      <span className="cargo-customer-table__head-short">УПД</span>{" "}
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
                  {sortedGroupedActsByCustomer.map((row, i) => (
                    <React.Fragment key={i}>
                      <motion.tr
                        custom={i}
                        variants={docsMotionEnabled ? cargoTableGroupRowVariants : undefined}
                        initial={docsMotionEnabled ? "initial" : false}
                        animate={docsMotionEnabled ? "animate" : undefined}
                        style={{
                          borderBottom: "1px solid var(--color-border)",
                          cursor: "pointer",
                          background:
                            expandedTableActCustomer === row.customer ? "var(--color-bg-hover)" : undefined,
                        }}
                        onClick={() =>
                          setExpandedTableActCustomer((prev) => (prev === row.customer ? null : row.customer))
                        }
                        title={expandedTableActCustomer === row.customer ? "Свернуть" : "Показать УПД"}
                      >
                        {showCustomerColumn && (
                          <td
                            className="cargo-customer-table__col-customer customer-col"
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
                        )}
                        {showSums && (
                          <td
                            className="cargo-customer-table__col-sum"
                            style={{ padding: "0.5rem 0.4rem", textAlign: "right", whiteSpace: "nowrap" }}
                          >
                            {formatCurrency(row.sum, true)}
                          </td>
                        )}
                        <td
                          className="cargo-customer-table__col-count"
                          style={{ padding: "0.5rem 0.4rem", textAlign: "right" }}
                        >
                          {row.items.length}
                        </td>
                      </motion.tr>
                      {expandedTableActCustomer === row.customer && (
                        <tr key={`${i}-detail`}>
                          <td
                            colSpan={groupedCustomerTableColSpan}
                            style={{
                              padding: 0,
                              borderBottom: "1px solid var(--color-border)",
                              verticalAlign: "top",
                              background: "var(--color-bg-primary)",
                            }}
                          >
                            <motion.div
                              {...(docsMotionEnabled ? cargoExpandMotionProps : { initial: false })}
                              className="cargo-inner-table-wrap doc-inner-table-wrap"
                              style={{ padding: "0.5rem" }}
                            >
                              <table
                                className="doc-inner-table cargo-inner-table documents-invoices-inner-table documents-acts-inner-table"
                                style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}
                              >
                                <thead>
                                  <tr
                                    style={{
                                      borderBottom: "1px solid var(--color-border)",
                                      background: "var(--color-bg-hover)",
                                    }}
                                  >
                                    {(
                                      [
                                        ["number", "Номер", "№"],
                                        ["date", "Дата", "Дата"],
                                        ["status", "Статус", "Ст."],
                                        ["deliveryStatus", "Статус перевозки", "Пер."],
                                        ["route", "Маршрут", "Мар."],
                                      ] as const
                                    ).map(([col, long, short]) => (
                                      <th
                                        key={col}
                                        className={`cargo-inner-table__col-${col === "number" ? "number" : col === "date" ? "date doc-inner-table-date" : col === "status" ? "status doc-inner-table-status" : col === "deliveryStatus" ? "delivery doc-inner-table-delivery cargo-inner-table__col-delivery--desktop" : "route doc-inner-table-route cargo-inner-table__col-route--desktop"}`}
                                        style={{
                                          padding: "0.35rem 0.3rem",
                                          textAlign: "left",
                                          fontWeight: 600,
                                          cursor: "pointer",
                                          userSelect: "none",
                                        }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleInnerTableActSort(col);
                                        }}
                                        title="Сортировка"
                                      >
                                        <span className="cargo-inner-table__head-long">{long}</span>
                                        <span className="cargo-inner-table__head-short">{short}</span>{" "}
                                        {innerTableActSortColumn === col &&
                                          (innerTableActSortOrder === "asc" ? (
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
                                    ))}
                                    {showSums && (
                                      <th
                                        className="cargo-inner-table__col-sum"
                                        style={{
                                          padding: "0.35rem 0.3rem",
                                          textAlign: "right",
                                          fontWeight: 600,
                                          cursor: "pointer",
                                          userSelect: "none",
                                        }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleInnerTableActSort("sum");
                                        }}
                                        title="Сортировка"
                                      >
                                        <span className="cargo-inner-table__head-long">Сумма</span>
                                        <span className="cargo-inner-table__head-short">Сум.</span>{" "}
                                        {innerTableActSortColumn === "sum" &&
                                          (innerTableActSortOrder === "asc" ? (
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
                                  {sortActs(row.items).map((act: any, j: number) =>
                                    renderActInnerTableRow(act, act.Number ?? act.number ?? j, "0.35rem 0.3rem"),
                                  )}
                                </tbody>
                              </table>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
                    {showCustomerColumn ? (
                      <td
                        className="cargo-customer-table__col-customer customer-col"
                        style={{ padding: "0.5rem 0.4rem", fontWeight: 700 }}
                      >
                        Итого
                      </td>
                    ) : (
                      <td style={{ padding: "0.5rem 0.4rem", fontWeight: 700 }}>Итого</td>
                    )}
                    {showSums && (
                      <td
                        className="cargo-customer-table__col-sum"
                        style={{
                          padding: "0.5rem 0.4rem",
                          textAlign: "right",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatCurrency(actsSummary.sum, true)}
                      </td>
                    )}
                    <td
                      className="cargo-customer-table__col-count"
                      style={{ padding: "0.5rem 0.4rem", textAlign: "right", fontWeight: 700 }}
                    >
                      {actsSummary.count}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </motion.div>
        ) : !actsLoading && !actsError && tableModeFlatDirect && filteredActs.length > 0 ? (
          <motion.div
            key="docs-act-flat-direct"
            className="documents-table-offset-desktop"
            {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}
          >
            <div className="cargo-card cargo-inner-table-wrap" style={{ marginBottom: "1rem" }}>
              <table
                className="cargo-inner-table documents-invoices-inner-table documents-acts-inner-table documents-invoices-flat-table"
                style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}
              >
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
                    <th className="cargo-inner-table__col-number" style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}>
                      <span className="cargo-inner-table__head-long">Номер</span>
                      <span className="cargo-inner-table__head-short">№</span>
                    </th>
                    <th className="cargo-inner-table__col-date" style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}>
                      Дата
                    </th>
                    <th className="cargo-inner-table__col-status" style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}>
                      <span className="cargo-inner-table__head-long">Статус</span>
                      <span className="cargo-inner-table__head-short">Ст.</span>
                    </th>
                    <th
                      className="cargo-inner-table__col-delivery doc-inner-table-delivery cargo-inner-table__col-delivery--desktop"
                      style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}
                    >
                      <span className="cargo-inner-table__head-long">Статус перевозки</span>
                      <span className="cargo-inner-table__head-short">Пер.</span>
                    </th>
                    <th
                      className="cargo-inner-table__col-route cargo-inner-table__col-route--desktop"
                      style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}
                    >
                      <span className="cargo-inner-table__head-long">Маршрут</span>
                      <span className="cargo-inner-table__head-short">Мар.</span>
                    </th>
                    {showSums && (
                      <th className="cargo-inner-table__col-sum" style={{ padding: "0.5rem 0.4rem", textAlign: "right", fontWeight: 600 }}>
                        <span className="cargo-inner-table__head-long">Сумма</span>
                        <span className="cargo-inner-table__head-short">Сум.</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortActs(filteredActs).map((act: any, i: number) =>
                    renderActInnerTableRow(act, act.Number ?? act.number ?? i, "0.5rem 0.4rem"),
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        ) : !actsLoading &&
          !actsError &&
          tableModeEffective &&
          effectiveServiceMode &&
          filteredActs.length > 0 &&
          sortedGroupedActsByCustomer.length === 0 ? (
          <motion.div
            key="docs-act-f"
            className="documents-table-offset-desktop"
            {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}
          >
            <div className="cargo-card cargo-inner-table-wrap" style={{ marginBottom: "1rem" }}>
              <table
                className="cargo-inner-table documents-invoices-inner-table documents-acts-inner-table documents-invoices-flat-table"
                style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}
              >
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
                    <th className="cargo-inner-table__col-number" style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}>
                      <span className="cargo-inner-table__head-long">Номер</span>
                      <span className="cargo-inner-table__head-short">№</span>
                    </th>
                    <th className="cargo-inner-table__col-date" style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}>
                      Дата
                    </th>
                    <th className="cargo-inner-table__col-status" style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}>
                      <span className="cargo-inner-table__head-long">Статус</span>
                      <span className="cargo-inner-table__head-short">Ст.</span>
                    </th>
                    <th
                      className="cargo-inner-table__col-delivery doc-inner-table-delivery cargo-inner-table__col-delivery--desktop"
                      style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}
                    >
                      <span className="cargo-inner-table__head-long">Статус перевозки</span>
                      <span className="cargo-inner-table__head-short">Пер.</span>
                    </th>
                    <th
                      className="cargo-inner-table__col-route cargo-inner-table__col-route--desktop"
                      style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}
                    >
                      <span className="cargo-inner-table__head-long">Маршрут</span>
                      <span className="cargo-inner-table__head-short">Мар.</span>
                    </th>
                    {showSums && (
                      <th className="cargo-inner-table__col-sum" style={{ padding: "0.5rem 0.4rem", textAlign: "right", fontWeight: 600 }}>
                        <span className="cargo-inner-table__head-long">Сумма</span>
                        <span className="cargo-inner-table__head-short">Сум.</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortActs(filteredActs).map((act: any, i: number) =>
                    renderActInnerTableRow(act, act.Number ?? act.number ?? i, "0.5rem 0.4rem"),
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        ) : !actsLoading && !actsError && filteredActs.length > 0 && !tableModeEffective ? (
          <motion.div
            key="docs-act-c"
            className="documents-cards-offset-desktop"
            {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}
          >
            <DocumentsActCardsList
              acts={filteredActs}
              invoices={items}
              onOpenAct={setSelectedAct}
              isActFavorite={isInvoiceFavorite}
              onToggleActFavorite={toggleInvoiceFavorite}
              docsMotionEnabled={docsMotionEnabled}
              showSums={showSums}
              showEdoBadges
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
      {!actsLoading && !actsError && filteredActs.length === 0 && (
        <Typography.Body className="text-empty-state documents-summary-empty-state">
          Нет УПД за выбранный период
        </Typography.Body>
      )}
      {selectedAct && (
        <ActDetailModal
          item={selectedAct}
          isOpen={!!selectedAct}
          onClose={() => setSelectedAct(null)}
          onOpenInvoice={(inv) => {
            setSelectedAct(null);
            onNavigateToInvoices();
            onOpenInvoice(inv);
          }}
          invoices={items}
          onOpenCargo={(cargoNumber) => onOpenCargo?.(cargoNumber)}
          auth={auth}
          cargoStateByNumber={cargoStateByNumber}
          cargoRouteByNumber={cargoRouteByNumber}
          perevozkiLoading={perevozkiLoading}
        />
      )}
    </motion.div>
  );
}
