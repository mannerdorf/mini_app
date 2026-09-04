import React from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
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

    const chartHeight = 110;
    const paddingTop = 6;
    const paddingBottom = 6;
    const chartWidth = Math.max(280, Math.floor(outerWidthPx));
    const n = roundedData.length;
    const plotStep = n > 1 ? chartWidth / (n - 1) : chartWidth;
    const barWidth = n > 1
        ? Math.min(28, Math.max(4, plotStep * 0.55))
        : Math.min(28, chartWidth * 0.12);
    const availableHeight = chartHeight - paddingTop - paddingBottom;
    const baselineY = chartHeight - paddingBottom;
    const points = roundedData.map((d, idx) => {
        const barHeight = (d.value / scaleMax) * availableHeight;
        const xCenter = n <= 1 ? chartWidth / 2 : (idx / (n - 1)) * chartWidth;
        const y = baselineY - barHeight;
        return { xCenter, y, barHeight, value: d.value };
    });
    const linePoints = points.map((p) => `${p.xCenter},${p.y}`).join(' ');
    const areaPath = points.length > 1
        ? `M 0 ${baselineY} L ${points.map((p) => `${p.xCenter} ${p.y}`).join(' L ')} L ${chartWidth} ${baselineY} Z`
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
        <div className="dashboard-main-chart">
            <svg
                className="dashboard-main-chart__svg"
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                width="100%"
                height={chartHeight}
                preserveAspectRatio="none"
                aria-hidden
            >
                <defs>
                    <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor={lightColor} stopOpacity="0.9" />
                        <stop offset="100%" stopColor={darkColor} stopOpacity="0.6" />
                    </linearGradient>
                </defs>

                {(variant === 'columns' || variant === 'combo') && points.map((p, idx) => (
                    <rect
                        key={`bar-${idx}`}
                        x={p.xCenter - barWidth / 2}
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
                        <polyline points={linePoints} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    </>
                )}
                {(variant === 'line' || variant === 'combo') && (
                    <polyline points={linePoints} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                )}
                {variant === 'dot' && points.map((p, idx) => (
                    <circle key={`dot-main-${idx}`} cx={p.xCenter} cy={p.y} r="4" fill={color} opacity="0.9" />
                ))}
            </svg>
        </div>
    );
}
