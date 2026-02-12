import React from "react";
import { getDateInfo } from "../lib/dateUtils";

export function DateText({
    value,
    className,
    style,
}: {
    value?: string;
    className?: string;
    style?: React.CSSProperties;
}) {
    const info = getDateInfo(value);
    const isRedDay = info.isWeekend || info.isHoliday;
    return (
        <span className={className || undefined} style={style}>
            {info.dayShort ? (
                <>
                    <span style={isRedDay ? { color: "#ef4444" } : undefined}>{info.dayShort}</span>
                    {", "}
                    {info.text}
                </>
            ) : (
                info.text
            )}
        </span>
    );
}
