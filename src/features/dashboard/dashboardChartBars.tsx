import React from "react";
import { motion } from "motion/react";

export const CHART_BAR_FILL_DURATION = 0.72;
export const CHART_BAR_FILL_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Горизонтальная полоса: ширина 0% → целевая (наполнение при монтировании). */
export function DashboardChartBarH({
    enabled,
    widthPercent,
    delay = 0,
    style,
    title,
}: {
    enabled: boolean;
    widthPercent: number;
    delay?: number;
    style?: React.CSSProperties;
    title?: string;
}) {
    const w = Math.max(0, Math.min(100, Number.isFinite(widthPercent) ? widthPercent : 0));
    if (!enabled) {
        return <div title={title} style={{ height: "100%", width: `${w}%`, boxSizing: "border-box", ...style }} />;
    }
    return (
        <motion.div
            title={title}
            initial={{ width: "0%" }}
            animate={{ width: `${w}%` }}
            transition={{ duration: CHART_BAR_FILL_DURATION, ease: CHART_BAR_FILL_EASE, delay }}
            style={{ height: "100%", boxSizing: "border-box", ...style }}
        />
    );
}

/** Высота столбца в px (мини-графики). */
export function DashboardChartBarPixelHeight({
    enabled,
    heightPx,
    delay = 0,
    style,
}: {
    enabled: boolean;
    heightPx: number;
    delay?: number;
    style?: React.CSSProperties;
}) {
    const h = Math.max(0, Math.round(heightPx));
    if (!enabled) {
        return <div style={{ width: "100%", height: Math.max(h, 2), ...style }} />;
    }
    return (
        <motion.div
            initial={{ height: 0 }}
            animate={{ height: Math.max(h, 2) }}
            transition={{ duration: CHART_BAR_FILL_DURATION, ease: CHART_BAR_FILL_EASE, delay }}
            style={{ width: "100%", boxSizing: "border-box", overflow: "hidden", ...style }}
        />
    );
}
