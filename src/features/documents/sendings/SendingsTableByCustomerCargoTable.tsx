import React from "react";
import { DateText } from "../../../components/ui/DateText";
import { ClickableCargoNumber } from "../../../components/ui/EntityLinks";
import { StatusBadge } from "../../../components/shared/StatusBadges";
import { stripOoo } from "../../../lib/formatUtils";
import { formatSendingSummaryNum, resolveSendingPlanDate, type CargoSummaryRow } from "./sendingsByCustomerSummaryHelpers";

type Props = {
  rowKey: string;
  colSpan: number;
  sendingsSummaryGroupBy: "customer" | "receiver";
  cargoRows: CargoSummaryRow[];
  cargoPlanDateByNumber: Map<string, Date | string>;
  plannedArrivalDate: Date | null;
  handleOpenCargo: (cargoNumber: string, prefetched?: Record<string, unknown>) => void;
};

export function SendingsTableByCustomerCargoTable(props: Props) {
  const {
    rowKey,
    colSpan,
    sendingsSummaryGroupBy,
    cargoRows,
    cargoPlanDateByNumber,
    plannedArrivalDate,
    handleOpenCargo,
  } = props;

  if (cargoRows.length === 0) return null;

  return (
    <tr>
      <td
        colSpan={colSpan}
        style={{
          padding: 0,
          borderBottom: "1px solid var(--color-border)",
          verticalAlign: "top",
          background: "var(--color-bg-primary)",
        }}
      >
        <div style={{ padding: "0.35rem 0.5rem 0.5rem", paddingLeft: "1.5rem" }}>
          <table className="doc-inner-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
                <th style={{ padding: "0.3rem 0.25rem", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>№ пп</th>
                <th style={{ padding: "0.3rem 0.25rem", textAlign: "left", fontWeight: 600 }}>Консолидация</th>
                <th style={{ padding: "0.3rem 0.25rem", textAlign: "left", fontWeight: 600 }}>Статус</th>
                <th style={{ padding: "0.3rem 0.25rem", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>Кол-во</th>
                <th style={{ padding: "0.3rem 0.25rem", textAlign: "right", fontWeight: 600 }}>Объем</th>
                <th style={{ padding: "0.3rem 0.25rem", textAlign: "right", fontWeight: 600 }}>Вес</th>
                <th style={{ padding: "0.3rem 0.25rem", textAlign: "right", fontWeight: 600 }}>Платный вес</th>
                <th style={{ padding: "0.3rem 0.25rem", textAlign: "left", fontWeight: 600 }}>
                  {sendingsSummaryGroupBy === "receiver" ? "Получатель" : "Заказчик"}
                </th>
                <th style={{ padding: "0.3rem 0.25rem", textAlign: "left", fontWeight: 600, lineHeight: 1.15 }}>
                  Плановая дата прибытия
                  <br />
                  на терминал
                </th>
              </tr>
            </thead>
            <tbody>
              {cargoRows.map((cr, crIdx) => (
                <tr key={`${rowKey}-cargo-${cr.cargo}-${crIdx}`} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.3rem 0.25rem", textAlign: "right", whiteSpace: "nowrap" }}>{cr._idx}</td>
                  <td style={{ padding: "0.3rem 0.25rem", whiteSpace: "nowrap" }}>
                    <ClickableCargoNumber
                      number={cr.cargo}
                      onOpen={(n) =>
                        handleOpenCargo(n, {
                          State: cr.status,
                          Customer: cr.partyName,
                          PW: cr.paidWeight,
                          W: cr.weight,
                          Value: cr.volume,
                          Mest: cr.count,
                        })
                      }
                      title="Открыть карточку перевозки"
                    />
                  </td>
                  <td style={{ padding: "0.3rem 0.25rem" }}>
                    <StatusBadge status={cr.status || "—"} />
                  </td>
                  <td style={{ padding: "0.3rem 0.25rem", textAlign: "right", whiteSpace: "nowrap" }}>{cr.count}</td>
                  <td style={{ padding: "0.3rem 0.25rem", textAlign: "right", whiteSpace: "nowrap" }}>{formatSendingSummaryNum(cr.volume)}</td>
                  <td style={{ padding: "0.3rem 0.25rem", textAlign: "right", whiteSpace: "nowrap" }}>{formatSendingSummaryNum(cr.weight)}</td>
                  <td style={{ padding: "0.3rem 0.25rem", textAlign: "right", whiteSpace: "nowrap" }}>{formatSendingSummaryNum(cr.paidWeight)}</td>
                  <td style={{ padding: "0.3rem 0.25rem" }}>{stripOoo(cr.partyName) || "—"}</td>
                  <td style={{ padding: "0.3rem 0.25rem", whiteSpace: "nowrap" }}>
                    {(() => {
                      const planDate = resolveSendingPlanDate(cr.cargo, cargoPlanDateByNumber, plannedArrivalDate);
                      return planDate ? (
                        <DateText value={planDate instanceof Date ? planDate.toISOString() : String(planDate)} />
                      ) : (
                        "нет"
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}
