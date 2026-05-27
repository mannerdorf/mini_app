import React from "react";
import {
    edoDocButtonMiniBadgeStyle,
    getEdoDocButtonDisplayLines,
    SHOW_EDO_DOC_DOWNLOAD_BADGES,
    type EdoStatusInfo,
} from "../../lib/edoStatus";

type EdoDocMiniBadgeProps = {
    info: EdoStatusInfo;
};

/** Статус ЭДО на кнопках скачивания в модалках счёта и УПД. */
export function EdoDocMiniBadge({ info }: EdoDocMiniBadgeProps) {
    if (!SHOW_EDO_DOC_DOWNLOAD_BADGES) return null;
    const lines = getEdoDocButtonDisplayLines(info);
    return (
        <span className="edo-doc-mini-badge" title={info.label} style={edoDocButtonMiniBadgeStyle(info.tone)}>
            {lines.map((line, index) => (
                <React.Fragment key={index}>
                    {index > 0 ? <br /> : null}
                    {line}
                </React.Fragment>
            ))}
        </span>
    );
}
