import React from "react";
import clsx from "clsx";

export type AppBadgeTone =
    | "default"
    | "info"
    | "success"
    | "warning"
    | "danger"
    | "purple"
    | "role"
    | "neutral";

type AppBadgeProps = {
    tone?: AppBadgeTone;
    className?: string;
    style?: React.CSSProperties;
    title?: string;
    children: React.ReactNode;
};

const TONE_CLASS: Record<AppBadgeTone, string> = {
    default: "app-badge--default",
    info: "app-badge--info",
    success: "app-badge--success",
    warning: "app-badge--warning",
    danger: "app-badge--danger",
    purple: "app-badge--purple",
    role: "app-badge--role",
    neutral: "app-badge--neutral",
};

/** Единый pill-badge для статусов, ролей и меток во всём приложении. */
export function AppBadge({
    tone = "default",
    className,
    style,
    title,
    children,
}: AppBadgeProps) {
    return (
        <span
            className={clsx("app-badge", "role-badge", TONE_CLASS[tone], className)}
            style={style}
            title={title}
        >
            {children}
        </span>
    );
}
