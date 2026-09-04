import React from "react";
import { Flex, Panel, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { StatusBadge } from "../../../components/shared/StatusBadges";
import { RouteBadge } from "../../../components/shared/CargoTableDisplay";
import { formatCurrency, stripOoo } from "../../../lib/formatUtils";
import { getCargoNumberFromInvoiceRow } from "../lib/documentsPipeline";

export type DocumentDetailLineRow = {
    Name?: string;
    Operation?: string;
    Quantity?: string | number;
    Price?: string | number;
    Sum?: string | number;
};

type DocumentDetailLineCardsProps = {
    rows: DocumentDetailLineRow[];
    perevozkiLoading?: boolean;
    cargoStateByNumber?: Map<string, string>;
    cargoRouteByNumber?: Map<string, string>;
    renderServiceCell: (raw: string) => React.ReactNode;
};

function lookupNorm<T>(map: Map<string, T> | undefined, key: string): T | undefined {
    if (!map || !key) return undefined;
    const norm = (s: string) => String(s).replace(/^0+/, "") || s;
    return map.get(key) ?? map.get(norm(key));
}

/** Строки табличной части счёта/УПД — карточки как у перевозок (услуга, бейджи, цифры без пересечений). */
export function DocumentDetailLineCards({
    rows,
    perevozkiLoading,
    cargoStateByNumber,
    cargoRouteByNumber,
    renderServiceCell,
}: DocumentDetailLineCardsProps) {
    return (
        <div className="document-detail-line-cards">
            {rows.map((row, i) => {
                const serviceRaw = String(row.Operation ?? row.Name ?? "—");
                const cargoNum = getCargoNumberFromInvoiceRow(row);
                const deliveryState = cargoNum ? lookupNorm(cargoStateByNumber, cargoNum) : undefined;
                const route = cargoNum ? lookupNorm(cargoRouteByNumber, cargoNum) : undefined;
                return (
                    <Panel key={i} className="cargo-card document-detail-line-card">
                        <Typography.Body className="document-detail-line-card__service" title={stripOoo(serviceRaw)}>
                            {renderServiceCell(serviceRaw)}
                        </Typography.Body>
                        <Flex align="center" justify="space-between" gap="0.35rem" className="document-detail-line-card__badges">
                            {perevozkiLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--color-text-secondary)" }} />
                            ) : (
                                <>
                                    <StatusBadge status={deliveryState} />
                                    <RouteBadge route={route} className="document-detail-line-card__route-badge" />
                                </>
                            )}
                        </Flex>
                        <div className="document-detail-line-card__metrics">
                            <div className="document-detail-line-card__metric">
                                <Typography.Label className="document-detail-line-card__metric-label">Кол-во</Typography.Label>
                                <Typography.Body className="document-detail-line-card__metric-value">{row.Quantity ?? "—"}</Typography.Body>
                            </div>
                            <div className="document-detail-line-card__metric document-detail-line-card__metric--price">
                                <Typography.Label className="document-detail-line-card__metric-label">Цена</Typography.Label>
                                <Typography.Body className="document-detail-line-card__metric-value">
                                    {row.Price != null ? formatCurrency(row.Price) : "—"}
                                </Typography.Body>
                            </div>
                            <div className="document-detail-line-card__metric document-detail-line-card__metric--sum">
                                <Typography.Label className="document-detail-line-card__metric-label">Сумма</Typography.Label>
                                <Typography.Body className="document-detail-line-card__metric-value document-detail-line-card__metric-value--sum">
                                    {row.Sum != null ? formatCurrency(row.Sum) : "—"}
                                </Typography.Body>
                            </div>
                        </div>
                    </Panel>
                );
            })}
        </div>
    );
}
