import React from "react";
import { Loader2 } from "lucide-react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import type { CargoItem, PerevozkaTimelineStep } from "../types";
import { formatTimelineDate, formatTimelineTime } from "../lib/dateUtils";
import { DateText } from "./ui/DateText";
import { formatCurrency, stripOoo } from "../lib/formatUtils";
import { ClickableCargoNumber, leafRowClickProps } from "./ui/EntityLinks";
import { RouteBadge, CargoTransportTypeIcon, getCargoItemRouteLabel } from "./shared/CargoTableDisplay";
import { getSlaPlanDeadlineMs } from "../lib/cargoUtils";
import type { WorkSchedule } from "../lib/slaWorkSchedule";
import { getDispatchStatusDateValue, rowIsOutsideSla } from "./haulzDispatchTableUtils";

export type HaulzDispatchShipmentRowsProps = {
    rows: CargoItem[];
    rowKeyPrefix: string;
    showCustomerColumn: boolean;
    workScheduleByInn: Record<string, WorkSchedule>;
    expandedDispatchNumber: string | null;
    expandedDispatchItem: CargoItem | null;
    onToggleDispatchRow: (num: string, row: CargoItem | null) => void;
    dispatchTableColCount: number;
    dispatchTimelineSteps: PerevozkaTimelineStep[];
    dispatchTimelineLoading: boolean;
    dispatchTimelineError: string | null;
    onOpenCargo: (cargoNumber: string, prefetchedItem?: CargoItem) => void;
    /** Отступ у № при вложенности под строкой заказчика. */
    nestedFirstColumn?: boolean;
};

export function HaulzDispatchShipmentRows({
    rows,
    rowKeyPrefix,
    showCustomerColumn,
    workScheduleByInn,
    expandedDispatchNumber,
    expandedDispatchItem,
    onToggleDispatchRow,
    dispatchTableColCount,
    dispatchTimelineSteps,
    dispatchTimelineLoading,
    dispatchTimelineError,
    onOpenCargo,
    nestedFirstColumn = false,
}: HaulzDispatchShipmentRowsProps) {
    return (
        <>
            {rows.map((row, ridx) => {
                const num = String(row.Number ?? "").trim();
                const cust = stripOoo(String(row.Customer ?? (row as { customer?: string }).customer ?? "—"));
                const statusDateIso = getDispatchStatusDateValue(row);
                const datePrihRaw = String(row.DatePrih ?? "").trim();
                const pw = typeof row.PW === "string" ? parseFloat(row.PW) || 0 : Number(row.PW) || 0;
                const sum = typeof row.Sum === "string" ? parseFloat(row.Sum) || 0 : Number(row.Sum) || 0;
                const slaLate = rowIsOutsideSla(row, workScheduleByInn);
                const expanded = !!num && expandedDispatchNumber === num;
                const rowBg = expanded
                    ? "var(--color-bg-hover)"
                    : slaLate
                      ? "var(--color-error-bg)"
                      : undefined;
                return (
                    <React.Fragment key={num ? `${rowKeyPrefix}-${num}` : `${rowKeyPrefix}-i-${ridx}`}>
                        <tr
                            className="haulz-dispatch-table__row"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!num) return;
                                if (expandedDispatchNumber === num) {
                                    onToggleDispatchRow(num, null);
                                } else {
                                    onToggleDispatchRow(num, row);
                                }
                            }}
                            style={{
                                borderBottom: "1px solid var(--color-border)",
                                cursor: num ? "pointer" : "default",
                                background: rowBg,
                            }}
                            title={num ? (expanded ? "Свернуть статусы" : "Показать статусы перевозки") : undefined}
                        >
                            <td
                                className={
                                    nestedFirstColumn
                                        ? "haulz-dispatch-table__cell haulz-dispatch-table__cell--num-nested"
                                        : "haulz-dispatch-table__cell haulz-dispatch-table__cell--num"
                                }
                            >
                                <ClickableCargoNumber number={num} onOpen={(n) => onOpenCargo(n, row)} />
                            </td>
                            {showCustomerColumn && (
                                <td className="haulz-dispatch-table__cell customer-col haulz-dispatch-table__cell--customer" title={cust}>
                                    {cust}
                                </td>
                            )}
                            <td className="haulz-dispatch-table__cell haulz-dispatch-table__cell--muted">
                                {statusDateIso ? <DateText value={statusDateIso} /> : "—"}
                            </td>
                            <td className="haulz-dispatch-table__cell">
                                {datePrihRaw ? <DateText value={datePrihRaw} /> : "—"}
                            </td>
                            <td className="haulz-dispatch-table__cell">
                                <RouteBadge route={getCargoItemRouteLabel(row)} />
                            </td>
                            <td className="haulz-dispatch-table__cell haulz-dispatch-table__cell--icon">
                                <CargoTransportTypeIcon item={row} />
                            </td>
                            <td className="haulz-dispatch-table__cell haulz-dispatch-table__cell--num-value">
                                {Math.round(pw).toLocaleString("ru-RU")}
                            </td>
                            <td className="haulz-dispatch-table__cell haulz-dispatch-table__cell--num-value">
                                {formatCurrency(sum, true)}
                            </td>
                        </tr>
                        {expanded && expandedDispatchItem && (
                            <tr className="haulz-dispatch-table__detail-row">
                                <td
                                    colSpan={dispatchTableColCount}
                                    className="haulz-dispatch-table__detail-cell"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <p className="haulz-dispatch-table__detail-title">Статусы перевозки</p>
                                    {dispatchTimelineLoading && (
                                        <Flex align="center" gap="0.5rem" className="haulz-dispatch-table__detail-loading">
                                            <Loader2 className="w-3 h-3 animate-spin haulz-dispatch-table__detail-spinner" aria-hidden />
                                            <span className="haulz-dispatch-table__detail-muted">Загрузка…</span>
                                        </Flex>
                                    )}
                                    {dispatchTimelineError && (
                                        <p className="haulz-dispatch-table__detail-muted">{dispatchTimelineError}</p>
                                    )}
                                    {!dispatchTimelineLoading &&
                                        dispatchTimelineSteps &&
                                        dispatchTimelineSteps.length > 0 &&
                                        (() => {
                                            const item = expandedDispatchItem;
                                            const planEndMs = getSlaPlanDeadlineMs(item);
                                            return (
                                                <table className="haulz-dispatch-table__timeline">
                                                    <thead>
                                                        <tr>
                                                            <th>Статус</th>
                                                            <th>Дата доставки</th>
                                                            <th>Время доставки</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {dispatchTimelineSteps.map((step, i) => {
                                                            const stepMs = step.date ? new Date(step.date).getTime() : 0;
                                                            const outOfSlaFromThisStep = planEndMs > 0 && stepMs > planEndMs;
                                                            const dateColor = outOfSlaFromThisStep
                                                                ? "#ef4444"
                                                                : planEndMs > 0 && stepMs > 0
                                                                  ? "#22c55e"
                                                                  : "var(--color-text-secondary)";
                                                            const stepRowOpen = num
                                                                ? leafRowClickProps(() => onOpenCargo(num, row), "Открыть карточку перевозки")
                                                                : null;
                                                            return (
                                                                <tr
                                                                    key={i}
                                                                    style={{ ...(stepRowOpen?.style ?? {}) }}
                                                                    onClick={stepRowOpen?.onClick}
                                                                    title={stepRowOpen?.title}
                                                                >
                                                                    <td style={{ color: outOfSlaFromThisStep ? "#ef4444" : undefined }}>
                                                                        {step.label}
                                                                    </td>
                                                                    <td style={{ color: dateColor }}>{formatTimelineDate(step.date)}</td>
                                                                    <td style={{ color: dateColor }}>{formatTimelineTime(step.date)}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            );
                                        })()}
                                    {!dispatchTimelineLoading &&
                                        dispatchTimelineSteps &&
                                        dispatchTimelineSteps.length === 0 &&
                                        !dispatchTimelineError && (
                                            <p className="haulz-dispatch-table__detail-muted">Нет шагов статуса.</p>
                                        )}
                                    <div className="haulz-dispatch-table__detail-actions">
                                        <Button
                                            type="button"
                                            className="filter-button haulz-dispatch-table__detail-open-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onOpenCargo(num, row);
                                            }}
                                        >
                                            Открыть карточку перевозки
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </React.Fragment>
                );
            })}
        </>
    );
}
