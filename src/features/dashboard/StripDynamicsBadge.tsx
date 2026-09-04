import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Flex, Typography } from "@maxhub/max-ui";

export type StripDynamics = { percent: number; delta: number };

export function calcStripDynamics(cur: number, prev: number, hasPrev: boolean): StripDynamics | null {
    if (!hasPrev) return null;
    const delta = cur - prev;
    if (prev === 0) return cur > 0 ? { percent: 100, delta } : null;
    return { percent: Math.round((delta / prev) * 100), delta };
}

export function StripDynamicsBadge({
    dynamics,
    formatDelta,
    lowerIsBetter = false,
}: {
    dynamics: StripDynamics;
    formatDelta: (delta: number) => string;
    lowerIsBetter?: boolean;
}) {
    const { percent, delta } = dynamics;
    const color =
        percent === 0
            ? "var(--color-text-secondary)"
            : lowerIsBetter
              ? percent < 0
                  ? "var(--color-success-status)"
                  : "#ef4444"
              : percent > 0
                ? "var(--color-success-status)"
                : "#ef4444";
    return (
        <Flex align="center" gap="0.2rem" style={{ flexShrink: 0 }}>
            {percent > 0 && <TrendingUp className="w-4 h-4" style={{ color }} />}
            {percent < 0 && <TrendingDown className="w-4 h-4" style={{ color }} />}
            {percent === 0 && <Minus className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />}
            <Typography.Body style={{ fontSize: "0.8rem", fontWeight: 600, color, whiteSpace: "nowrap" }}>
                {percent > 0 ? "+" : ""}
                {percent}% ({formatDelta(delta)})
            </Typography.Body>
        </Flex>
    );
}
