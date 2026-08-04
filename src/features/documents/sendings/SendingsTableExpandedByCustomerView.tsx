import React from "react";
import { Typography } from "@maxhub/max-ui";
import { DateText } from "../../../components/ui/DateText";
import { stripOoo } from "../../../lib/formatUtils";
import { normCargoKey } from "../lib/documentsPipeline";
import { SendingsTableByCustomerBulkBar } from "./SendingsTableByCustomerBulkBar";
import { SendingsTableByCustomerCargoTable } from "./SendingsTableByCustomerCargoTable";
import { SendingsTableSummarySortTh } from "./SendingsTableSummarySortTh";
import {
  buildCargoRowsForParty,
  buildCounterpartySummaries,
  formatSendingSummaryNum,
  getAllCounterpartySelectionKeys,
  sendingSummaryDensityColor,
  sendingSummaryDensityOf,
  sortCounterpartySummaries,
} from "./sendingsByCustomerSummaryHelpers";
import type { SendingsTableExpandedRowProps } from "./sendingsTableExpandedProps";

type Props = SendingsTableExpandedRowProps;

export function SendingsTableExpandedByCustomerView(props: Props) {
  const {
    row,
    rowKey,
    parcelsToRender,
    hasParcelSearchMatches,
    plannedArrivalDate,
    sendingsSummaryGroupBy,
    sendingsSummarySortColumn,
    sendingsSummarySortOrder,
    handleSendingsSummarySort,
    cargoStateByNumber,
    cargoPlanDateByNumber,
    cargoReceiverByNumber,
    cargoCustomerByNumber,
    canEditPlanDate,
    selectedByCustomerSummaryKeys,
    setSelectedByCustomerSummaryKeys,
    expandedByCustomerKey,
    setExpandedByCustomerKey,
    byCustomerPlanDateOpen,
    setByCustomerPlanDateOpen,
    byCustomerPlanDateValue,
    setByCustomerPlanDateValue,
    byCustomerActionLoading,
    byCustomerActionError,
    byCustomerActionInfo,
    applyByCustomerPlanDate,
    handleOpenCargo,
  } = props;

  const summaryRows = buildCounterpartySummaries(
    parcelsToRender,
    row,
    rowKey,
    sendingsSummaryGroupBy,
    cargoCustomerByNumber,
    cargoReceiverByNumber,
  );
  const selectedSummaryRows = summaryRows.filter((summary) => selectedByCustomerSummaryKeys.has(summary.selectionKey));
  const sortedSummaryRows = sortCounterpartySummaries(summaryRows, sendingsSummarySortColumn, sendingsSummarySortOrder);
  const allSelectionKeys = getAllCounterpartySelectionKeys(
    parcelsToRender,
    row,
    rowKey,
    sendingsSummaryGroupBy,
    cargoCustomerByNumber,
    cargoReceiverByNumber,
  );
  const allSelected = allSelectionKeys.size > 0 && [...allSelectionKeys].every((key) => selectedByCustomerSummaryKeys.has(key));
  const totals = summaryRows.reduce(
    (acc, s) => {
      acc.count += s.count;
      acc.volume += s.volume;
      acc.weight += s.weight;
      acc.paidWeight += s.paidWeight;
      return acc;
    },
    { count: 0, volume: 0, weight: 0, paidWeight: 0 },
  );
  const stickyTotalsCellBase: React.CSSProperties = {
    padding: "0.35rem 0.3rem",
    position: "sticky",
    bottom: 0,
    background: "var(--color-bg-hover)",
    fontWeight: 700,
    borderTop: "2px solid var(--color-border)",
    zIndex: 3,
  };
  const detailColSpan = canEditPlanDate ? 9 : 8;

  return (
    <>
      {canEditPlanDate && (
        <SendingsTableByCustomerBulkBar
          sendingsSummaryGroupBy={sendingsSummaryGroupBy}
          selectedByCustomerCount={selectedSummaryRows.length}
          byCustomerActionLoading={byCustomerActionLoading}
          byCustomerPlanDateOpen={byCustomerPlanDateOpen}
          setByCustomerPlanDateOpen={setByCustomerPlanDateOpen}
          byCustomerPlanDateValue={byCustomerPlanDateValue}
          setByCustomerPlanDateValue={setByCustomerPlanDateValue}
          byCustomerActionError={byCustomerActionError}
          byCustomerActionInfo={byCustomerActionInfo}
          selectedSummaryRows={selectedSummaryRows}
          applyByCustomerPlanDate={applyByCustomerPlanDate}
        />
      )}
      <table className="doc-inner-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
            {canEditPlanDate && (
              <th style={{ padding: "0.35rem 0.25rem", textAlign: "center", width: 30 }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSelectedByCustomerSummaryKeys((prev) => {
                      const next = new Set(prev);
                      allSelectionKeys.forEach((key) => {
                        if (checked) next.add(key);
                        else next.delete(key);
                      });
                      return next;
                    });
                  }}
                  aria-label={sendingsSummaryGroupBy === "receiver" ? "Выбрать всех получателей" : "Выбрать всех заказчиков"}
                />
              </th>
            )}
            <SendingsTableSummarySortTh label="№ пп" column="index" sortColumn={sendingsSummarySortColumn} sortOrder={sendingsSummarySortOrder} onSort={handleSendingsSummarySort} align="right" />
            <SendingsTableSummarySortTh
              label={sendingsSummaryGroupBy === "receiver" ? "Получатель" : "Заказчик"}
              column="customer"
              sortColumn={sendingsSummarySortColumn}
              sortOrder={sendingsSummarySortOrder}
              onSort={handleSendingsSummarySort}
            />
            <SendingsTableSummarySortTh label="Кол-во" column="count" sortColumn={sendingsSummarySortColumn} sortOrder={sendingsSummarySortOrder} onSort={handleSendingsSummarySort} align="right" />
            <SendingsTableSummarySortTh label="Объем" column="volume" sortColumn={sendingsSummarySortColumn} sortOrder={sendingsSummarySortOrder} onSort={handleSendingsSummarySort} align="right" />
            <SendingsTableSummarySortTh label="Вес" column="weight" sortColumn={sendingsSummarySortColumn} sortOrder={sendingsSummarySortOrder} onSort={handleSendingsSummarySort} align="right" />
            <SendingsTableSummarySortTh label="Платный вес" column="paidWeight" sortColumn={sendingsSummarySortColumn} sortOrder={sendingsSummarySortOrder} onSort={handleSendingsSummarySort} align="right" />
            <SendingsTableSummarySortTh label="Плотность" column="density" sortColumn={sendingsSummarySortColumn} sortOrder={sendingsSummarySortOrder} onSort={handleSendingsSummarySort} align="right" />
            <th style={{ padding: "0.35rem 0.3rem", textAlign: "left", fontWeight: 600, lineHeight: 1.15 }}>
              Плановая дата прибытия
              <br />
              на терминал
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedSummaryRows.map((summary, parcelIdx) => {
            const isExpanded = expandedByCustomerKey === summary.selectionKey;
            const cargoRows = buildCargoRowsForParty(
              parcelsToRender,
              summary.cargoNumbers,
              row,
              sendingsSummaryGroupBy,
              cargoStateByNumber,
              cargoCustomerByNumber,
              cargoReceiverByNumber,
            );
            return (
              <React.Fragment key={`${rowKey}-summary-customer-${summary.party}-${parcelIdx}`}>
                <tr
                  style={{
                    borderBottom: "1px solid var(--color-border)",
                    background: isExpanded ? "var(--color-bg-hover)" : hasParcelSearchMatches ? "rgba(37, 99, 235, 0.08)" : undefined,
                    cursor: "pointer",
                  }}
                  onClick={() => setExpandedByCustomerKey((prev) => (prev === summary.selectionKey ? null : summary.selectionKey))}
                  title={isExpanded ? "Свернуть перевозки" : "Показать перевозки"}
                >
                  {canEditPlanDate && (
                    <td style={{ padding: "0.35rem 0.25rem", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedByCustomerSummaryKeys.has(summary.selectionKey)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setSelectedByCustomerSummaryKeys((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(summary.selectionKey);
                            else next.delete(summary.selectionKey);
                            return next;
                          });
                        }}
                        aria-label={`Выбрать ${sendingsSummaryGroupBy === "receiver" ? "получателя" : "заказчика"} ${summary.party || parcelIdx + 1}`}
                      />
                    </td>
                  )}
                  <td style={{ padding: "0.35rem 0.3rem", textAlign: "right", whiteSpace: "nowrap" }}>{parcelIdx + 1}</td>
                  <td style={{ padding: "0.35rem 0.3rem" }}>
                    {stripOoo(summary.party) || "—"}
                    {summary.cargoNumbers.length > 0 && (
                      <span
                        style={{ marginLeft: "0.25rem", color: "var(--color-text-secondary)", fontSize: "0.75em" }}
                        title={isExpanded ? "Свернуть" : "Показать перевозки"}
                      >
                        {isExpanded ? "▼" : "▶"}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "0.35rem 0.3rem", textAlign: "right", whiteSpace: "nowrap" }}>{summary.count}</td>
                  <td style={{ padding: "0.35rem 0.3rem", textAlign: "right", whiteSpace: "nowrap" }}>{formatSendingSummaryNum(summary.volume)}</td>
                  <td style={{ padding: "0.35rem 0.3rem", textAlign: "right", whiteSpace: "nowrap" }}>{formatSendingSummaryNum(summary.weight)}</td>
                  <td style={{ padding: "0.35rem 0.3rem", textAlign: "right", whiteSpace: "nowrap" }}>{formatSendingSummaryNum(summary.paidWeight)}</td>
                  <td
                    style={{
                      padding: "0.35rem 0.3rem",
                      textAlign: "right",
                      whiteSpace: "nowrap",
                      color: sendingSummaryDensityColor(summary.weight, summary.volume),
                      fontWeight: 600,
                    }}
                  >
                    {sendingSummaryDensityOf(summary.weight, summary.volume)}
                  </td>
                  <td style={{ padding: "0.35rem 0.3rem", whiteSpace: "nowrap" }}>
                    {(() => {
                      const planDates = summary.cargoNumbers
                        .flatMap((c) => [cargoPlanDateByNumber.get(normCargoKey(c)), cargoPlanDateByNumber.get(c)])
                        .filter((d): d is Date => !!d);
                      const planDate =
                        planDates.length > 0
                          ? planDates.reduce((min, d) => (d.getTime() < min.getTime() ? d : min), planDates[0])
                          : plannedArrivalDate;
                      return planDate ? <DateText value={planDate.toISOString()} /> : "нет";
                    })()}
                  </td>
                </tr>
                {isExpanded && (
                  <SendingsTableByCustomerCargoTable
                    rowKey={rowKey}
                    colSpan={detailColSpan}
                    sendingsSummaryGroupBy={sendingsSummaryGroupBy}
                    cargoRows={cargoRows}
                    cargoPlanDateByNumber={cargoPlanDateByNumber}
                    plannedArrivalDate={plannedArrivalDate}
                    handleOpenCargo={handleOpenCargo}
                  />
                )}
              </React.Fragment>
            );
          })}
          <tr>
            {canEditPlanDate && <td style={stickyTotalsCellBase} />}
            <td style={{ ...stickyTotalsCellBase, textAlign: "right" }} colSpan={2}>
              Итого
            </td>
            <td style={{ ...stickyTotalsCellBase, textAlign: "right", whiteSpace: "nowrap" }}>{totals.count}</td>
            <td style={{ ...stickyTotalsCellBase, textAlign: "right", whiteSpace: "nowrap" }}>{formatSendingSummaryNum(totals.volume)}</td>
            <td style={{ ...stickyTotalsCellBase, textAlign: "right", whiteSpace: "nowrap" }}>{formatSendingSummaryNum(totals.weight)}</td>
            <td style={{ ...stickyTotalsCellBase, textAlign: "right", whiteSpace: "nowrap" }}>{formatSendingSummaryNum(totals.paidWeight)}</td>
            <td
              style={{
                ...stickyTotalsCellBase,
                textAlign: "right",
                whiteSpace: "nowrap",
                color: sendingSummaryDensityColor(totals.weight, totals.volume),
              }}
            >
              {sendingSummaryDensityOf(totals.weight, totals.volume)}
            </td>
            <td style={{ ...stickyTotalsCellBase, whiteSpace: "nowrap" }}>
              {plannedArrivalDate ? <DateText value={plannedArrivalDate.toISOString()} /> : "нет"}
            </td>
          </tr>
        </tbody>
      </table>
      <Typography.Label
        style={{
          display: "block",
          marginTop: "0.5rem",
          fontSize: "0.75rem",
          color: "var(--color-text-secondary)",
        }}
      >
        Плотность (идеал 200): <span style={{ color: "#16a34a", fontWeight: 600 }}>зелёный 180-220</span>,{" "}
        <span style={{ color: "#ca8a04", fontWeight: 600 }}>жёлтый 150-179 / 221-260</span>,{" "}
        <span style={{ color: "#dc2626", fontWeight: 600 }}>красный &lt;150 / &gt;260</span>
      </Typography.Label>
    </>
  );
}
