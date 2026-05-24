import React from "react";
import { getDateInfo } from "../../lib/dateUtils";

export const DateText = ({ value, className, style, omitYear }: { value?: string; className?: string; style?: React.CSSProperties; omitYear?: boolean }) => {
    const info = getDateInfo(value);
    const isRedDay = info.isWeekend || info.isHoliday;
    const displayText = omitYear && /^\d{2}\.\d{2}\.\d{4}$/.test(info.text)
        ? info.text.slice(0, 5)
        : info.text;
    return (
        <span className={className || undefined} style={style}>
            {info.dayShort ? (
                <>
                    <span style={isRedDay ? { color: "#ef4444" } : undefined}>{info.dayShort}</span>
                    {", "}
                    {displayText}
                </>
            ) : (
                displayText
            )}
        </span>
    );
};
