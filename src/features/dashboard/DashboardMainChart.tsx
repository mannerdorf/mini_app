import React from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { getDateTextColor } from "../../lib/dateUtils";
import type { DashboardChartPoint, DashboardMainChartVariant } from "./dashboardTypes";

export type DashboardMainChartProps = {
    data: DashboardChartPoint[];
    title: string;
    color: string;
    formatValue: (val: number) => string;
    variant: DashboardMainChartVariant;
    outerWidthPx: number;
    onQuickDateFilter: (key: "месяц" | "все") => void;
};

export function DashboardMainChart({
    data,
    title,
    color,
    formatValue: _formatValue,
    variant,
    outerWidthPx,
    onQuickDateFilter,
}: DashboardMainChartProps) {
    if (data.length === 0) {
        return (
            <Panel className="cargo-card" style={{ marginBottom: '1rem' }}>
                <Typography.Headline style={{ marginBottom: '1rem', fontSize: '1rem' }}>{title}</Typography.Headline>
                <Typography.Body className="text-theme-secondary">Нет данных для отображения</Typography.Body>
                <Flex style={{ gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                    <Button className="filter-button" type="button" onClick={() => onQuickDateFilter("месяц")} style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}>
                        За месяц
                    </Button>
                    <Button className="filter-button" type="button" onClick={() => onQuickDateFilter("все")} style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}>
                        За всё время
                    </Button>
                </Flex>
            </Panel>
        );
    }

    const roundedData = data.map((d) => {
        const numericValue = Number(d?.value);
        const normalizedValue = Number.isFinite(numericValue) ? Math.round(numericValue) : 0;
        const rawDate = String(d?.date ?? d?.dateKey ?? "").trim();
        return {
            ...d,
            value: normalizedValue,
            date: rawDate || "—",
        };
    });
    const maxValue = Math.max(...roundedData.map(d => d.value), 1);
    const scaleMax = maxValue * 1.1;

    const chartHeight = 125;
    const paddingLeft = 60;
    const paddingRight = 30;
    const paddingTop = 16;
    const paddingBottom = 45;
    const chartWidth = Math.max(280, Math.floor(outerWidthPx));
    const innerPlotW = Math.max(80, chartWidth - paddingLeft - paddingRight);
    const n = roundedData.length;
    const barSpacing = 6;
    const barWidth = n > 0
        ? Math.max(4, (innerPlotW - Math.max(0, n - 1) * barSpacing) / n)
        : 12;
    const availableHeight = chartHeight - paddingTop - paddingBottom;
    const points = roundedData.map((d, idx) => {
        const barHeight = (d.value / scaleMax) * availableHeight;
        const x = paddingLeft + idx * (barWidth + barSpacing);
        const y = chartHeight - paddingBottom - barHeight;
        return { x, y, barHeight, value: d.value };
    });
    const linePoints = points.map((p) => `${p.x + barWidth / 2},${p.y}`).join(' ');
    const areaPath = points.length > 1
        ? `M ${points[0].x + barWidth / 2} ${chartHeight - paddingBottom} L ${points.map((p) => `${p.x + barWidth / 2} ${p.y}`).join(' L ')} L ${points[points.length - 1].x + barWidth / 2} ${chartHeight - paddingBottom} Z`
        : '';

    const gradientId = `gradient-${color.replace('#', '')}`;
    const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    };
    const rgb = hexToRgb(color);
    const lightColor = rgb ? `rgb(${Math.min(255, rgb.r + 40)}, ${Math.min(255, rgb.g + 40)}, ${Math.min(255, rgb.b + 40)})` : color;
    const darkColor = rgb ? `rgb(${Math.max(0, rgb.r - 30)}, ${Math.max(0, rgb.g - 30)}, ${Math.max(0, rgb.b - 30)})` : color;

    return (
        <div>
            <div style={{ overflowX: 'auto', width: '100%', minWidth: 0 }}>
                <svg
                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                    width="100%"
                    height={chartHeight}
                    preserveAspectRatio="xMinYMid meet"
                    style={{ display: 'block', maxWidth: '100%' }}
                >
                    <defs>
                        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor={lightColor} stopOpacity="0.9" />
                            <stop offset="100%" stopColor={darkColor} stopOpacity="0.6" />
                        </linearGradient>
                    </defs>

                    <line
                        x1={paddingLeft}
                        y1={chartHeight - paddingBottom}
                        x2={chartWidth - paddingRight}
                        y2={chartHeight - paddingBottom}
                        stroke="var(--color-border)"
                        strokeWidth="1.5"
                        opacity="0.5"
                    />

                    <line
                        x1={paddingLeft}
                        y1={paddingTop}
                        x2={paddingLeft}
                        y2={chartHeight - paddingBottom}
                        stroke="var(--color-border)"
                        strokeWidth="1.5"
                        opacity="0.5"
                    />

                    {(variant === 'columns' || variant === 'combo') && points.map((p, idx) => (
                        <rect
                            key={`bar-${idx}`}
                            x={p.x}
                            y={p.y}
                            width={barWidth}
                            height={p.barHeight}
                            fill={`url(#${gradientId})`}
                            opacity={variant === 'combo' ? 0.38 : 1}
                            rx="4"
                            style={{ transition: 'all 0.3s ease' }}
                        />
                    ))}
                    {variant === 'area' && areaPath && (
                        <>
                            <path d={areaPath} fill={lightColor} opacity="0.22" />
                            <polyline points={linePoints} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </>
                    )}
                    {(variant === 'line' || variant === 'combo') && (
                        <polyline points={linePoints} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    )}
                    {variant === 'dot' && points.map((p, idx) => (
                        <circle key={`dot-main-${idx}`} cx={p.x + barWidth / 2} cy={p.y} r="4" fill={color} opacity="0.9" />
                    ))}

                    {roundedData.map((d, idx) => {
                        const { x, barWidth: bw } = points[idx];
                        return (
                            <g key={idx}>
                                <text
                                    x={x + bw / 2}
                                    y={chartHeight - paddingBottom + 20}
                                    fontSize="10"
                                    fill={getDateTextColor((d as { dateKey?: string }).dateKey || d.date)}
                                    textAnchor="middle"
                                    transform={`rotate(-45 ${x + bw / 2} ${chartHeight - paddingBottom + 20})`}
                                >
                                    {(() => {
                                        const raw = String(d?.date ?? "").trim();
                                        if (!raw || raw === "—") return "—";
                                        if (raw.includes(".")) return raw.split(".").slice(0, 2).join(".");
                                        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(8, 10) + "." + raw.slice(5, 7);
                                        return raw;
                                    })()}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
}
