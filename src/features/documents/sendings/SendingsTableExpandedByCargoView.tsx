import React from "react";
import { DateText } from "../../../components/ui/DateText";
import { ClickableCargoNumber } from "../../../components/ui/EntityLinks";
import { StatusBadge } from "../../../components/shared/StatusBadges";
import { formatCurrency, stripOoo } from "../../../lib/formatUtils";
import { SendingsTableSummarySortTh } from "./SendingsTableSummarySortTh";
import {
  buildByCargoSummaries,
  formatSendingSummaryNum,
  resolveSendingPlanDate,
  sortByCargoSummaries,
  sumByCargoSummaryTotals,
} from "./sendingsByCustomerSummaryHelpers";
import type { SendingsTableExpandedRowProps } from "./sendingsTableExpandedProps";

type Props = Pick<
  SendingsTableExpandedRowProps,
  | "row"
  | "rowKey"
  | "parcelsToRender"
  | "hasParcelSearchMatches"
  | "plannedArrivalDate"
  | "sendingsSummarySortColumn"
  | "sendingsSummarySortOrder"
  | "handleSendingsSummarySort"
  | "cargoStateByNumber"
  | "cargoPlanDateByNumber"
  | "cargoCustomerByNumber"
  | "cargoSumByNumber"
  | "showSums"
  | "handleOpenCargo"
>;

function formatSendingCostCell(cost: number): React.ReactNode {
  return cost > 0 ? formatCurrency(cost, true) : "—";
}

export function SendingsTableExpandedByCargoView(props: Props) {
  const {
    row,
    rowKey,
    parcelsToRender,
    hasParcelSearchMatches,
    plannedArrivalDate,
    sendingsSummarySortColumn,
    sendingsSummarySortOrder,
    handleSendingsSummarySort,
    cargoStateByNumber,
    cargoPlanDateByNumber,
    cargoCustomerByNumber,
    cargoSumByNumber,
    showSums,
    handleOpenCargo,
  } = props;

  const summaryRows = buildByCargoSummaries(parcelsToRender, row, cargoStateByNumber, cargoCustomerByNumber, cargoSumByNumber);
  const sortedSummaryRows = sortByCargoSummaries(summaryRows, sendingsSummarySortColumn, sendingsSummarySortOrder);
  const totals = sumByCargoSummaryTotals(summaryRows);

  return (
    <table className="doc-inner-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
      <thead>
        <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
          <SendingsTableSummarySortTh label="№ пп" column="index" sortColumn={sendingsSummarySortColumn} sortOrder={sendingsSummarySortOrder} onSort={handleSendingsSummarySort} align="right" />
          <SendingsTableSummarySortTh label="Консолидация" column="cargo" sortColumn={sendingsSummarySortColumn} sortOrder={sendingsSummarySortOrder} onSort={handleSendingsSummarySort} />
          <SendingsTableSummarySortTh label="Статус" column="status" sortColumn={sendingsSummarySortColumn} sortOrder={sendingsSummarySortOrder} onSort={handleSendingsSummarySort} />
          <SendingsTableSummarySortTh label="Кол-во" column="count" sortColumn={sendingsSummarySortColumn} sortOrder={sendingsSummarySortOrder} onSort={handleSendingsSummarySort} align="right" />
          <SendingsTableSummarySortTh label="Объем" column="volume" sortColumn={sendingsSummarySortColumn} sortOrder={sendingsSummarySortOrder} onSort={handleSendingsSummarySort} align="right" />
          <SendingsTableSummarySortTh label="Вес" column="weight" sortColumn={sendingsSummarySortColumn} sortOrder={sendingsSummarySortOrder} onSort={handleSendingsSummarySort} align="right" />
          <SendingsTableSummarySortTh label="Платный вес" column="paidWeight" sortColumn={sendingsSummarySortColumn} sortOrder={sendingsSummarySortOrder} onSort={handleSendingsSummarySort} align="right" />
          {showSums && (
            <SendingsTableSummarySortTh label="Стоимость" column="cost" sortColumn={sendingsSummarySortColumn} sortOrder={sendingsSummarySortOrder} onSort={handleSendingsSummarySort} align="right" />
          )}
          <SendingsTableSummarySortTh label="Заказчик" column="customer" sortColumn={sendingsSummarySortColumn} sortOrder={sendingsSummarySortOrder} onSort={handleSendingsSummarySort} />
          <th style={{ padding: "0.35rem 0.3rem", textAlign: "left", fontWeight: 600, lineHeight: 1.15 }}>
            Плановая дата прибытия
            <br />
            на терминал
          </th>
        </tr>
      </thead>
      <tbody>
        {sortedSummaryRows.map((summary, parcelIdx) => {
          const planDate = resolveSendingPlanDate(summary.cargo, cargoPlanDateByNumber, plannedArrivalDate);
          return (
            <tr
              key={`${rowKey}-summary-${summary.cargo}-${parcelIdx}`}
              style={{
                borderBottom: "1px solid var(--color-border)",
                background: hasParcelSearchMatches ? "rgba(37, 99, 235, 0.08)" : undefined,
              }}
            >
              <td style={{ padding: "0.35rem 0.3rem", textAlign: "right", whiteSpace: "nowrap" }}>{parcelIdx + 1}</td>
              <td style={{ padding: "0.35rem 0.3rem", whiteSpace: "nowrap" }}>
                <ClickableCargoNumber
                  number={summary.cargo}
                  onOpen={(n) =>
                    handleOpenCargo(n, {
                      State: summary.status,
                      Customer: summary.customer,
                      PW: summary.paidWeight,
                      W: summary.weight,
                      Value: summary.volume,
                      Mest: summary.count,
                    })
                  }
                  title="Открыть карточку перевозки"
                />
              </td>
              <td style={{ padding: "0.35rem 0.3rem" }}>
                <StatusBadge status={summary.status || "—"} />
              </td>
              <td style={{ padding: "0.35rem 0.3rem", textAlign: "right", whiteSpace: "nowrap" }}>{summary.count}</td>
              <td style={{ padding: "0.35rem 0.3rem", textAlign: "right", whiteSpace: "nowrap" }}>{formatSendingSummaryNum(summary.volume)}</td>
              <td style={{ padding: "0.35rem 0.3rem", textAlign: "right", whiteSpace: "nowrap" }}>{formatSendingSummaryNum(summary.weight)}</td>
              <td style={{ padding: "0.35rem 0.3rem", textAlign: "right", whiteSpace: "nowrap" }}>{formatSendingSummaryNum(summary.paidWeight)}</td>
              {showSums && (
                <td style={{ padding: "0.35rem 0.3rem", textAlign: "right", whiteSpace: "nowrap" }}>{formatSendingCostCell(summary.cost)}</td>
              )}
              <td style={{ padding: "0.35rem 0.3rem" }}>{stripOoo(summary.customer) || "—"}</td>
              <td style={{ padding: "0.35rem 0.3rem", whiteSpace: "nowrap" }}>
                {planDate ? (
                  <DateText value={planDate instanceof Date ? planDate.toISOString() : String(planDate)} />
                ) : (
                  "нет"
                )}
              </td>
            </tr>
          );
        })}
        <tr style={{ borderTop: "2px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
          <td style={{ padding: "0.35rem 0.3rem", textAlign: "right", fontWeight: 700 }} colSpan={3}>
            Итого
          </td>
          <td style={{ padding: "0.35rem 0.3rem", textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }}>{totals.count}</td>
          <td style={{ padding: "0.35rem 0.3rem", textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }}>{formatSendingSummaryNum(totals.volume)}</td>
          <td style={{ padding: "0.35rem 0.3rem", textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }}>{formatSendingSummaryNum(totals.weight)}</td>
          <td style={{ padding: "0.35rem 0.3rem", textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }}>{formatSendingSummaryNum(totals.paidWeight)}</td>
          {showSums && (
            <td style={{ padding: "0.35rem 0.3rem", textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }}>{formatSendingCostCell(totals.cost)}</td>
          )}
          <td style={{ padding: "0.35rem 0.3rem", fontWeight: 700 }}>—</td>
          <td style={{ padding: "0.35rem 0.3rem", whiteSpace: "nowrap", fontWeight: 700 }}>
            {plannedArrivalDate ? <DateText value={plannedArrivalDate.toISOString()} /> : "нет"}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
