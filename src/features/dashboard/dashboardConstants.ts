import type { CargoRoleFilterKey } from "../../lib/cargoUtils";

export const DASH_ROLE_FILTER_KEY = "haulz.dashboard.roleFilter";

export function loadDashboardRoleFilter(): CargoRoleFilterKey {
    try {
        const v = localStorage.getItem(DASH_ROLE_FILTER_KEY);
        if (v === "customer" || v === "sender" || v === "receiver" || v === "all") return v;
    } catch { /* ignore */ }
    return "all";
}

/** Единая типографика панелей «План-Факт», «Грузовой поток» и аналогичных блоков */
export const DASH_PLAN_FACT_TYPO = {
    title: { fontSize: "var(--dash-section-title-size)", fontWeight: 600, marginBottom: "0.25rem" } as const,
    desc: { fontSize: "var(--dash-section-desc-size)", color: "var(--color-text-secondary)", marginBottom: "0.75rem" } as const,
    badge: {
        fontSize: "var(--dash-badge-size)",
        padding: "var(--control-padding-badge-y) var(--control-padding-badge-x)",
        borderRadius: "999px",
        minHeight: "var(--control-height-badge)",
        display: "inline-flex",
        alignItems: "center",
        boxSizing: "border-box",
        lineHeight: 1,
    } as const,
    subhead: { fontSize: "var(--dash-subhead-size)", fontWeight: 600, marginBottom: "0.35rem" } as const,
    meta: { fontSize: "var(--dash-meta-size)", color: "var(--color-text-secondary)" } as const,
    tile: {
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: "0.38rem 0.42rem",
        background: "var(--color-bg-hover)",
    } as const,
    tileDate: { fontSize: "var(--dash-tile-date-size)", color: "var(--color-text-secondary)", marginBottom: "0.18rem" } as const,
    tileLine: { fontSize: "var(--dash-tile-line-size)", display: "block" as const },
    table: { fontSize: "var(--dash-table-size)" } as const,
    tableTh: { padding: "0.4rem 0.45rem", fontWeight: 600 } as const,
    statusPill: {
        fontSize: "var(--dash-status-pill-size)",
        padding: "var(--control-padding-badge-y) var(--control-padding-badge-x)",
        borderRadius: 999,
        fontWeight: 600,
        whiteSpace: "nowrap" as const,
        minHeight: "var(--control-height-badge)",
        display: "inline-flex",
        alignItems: "center",
        boxSizing: "border-box",
        lineHeight: 1,
    },
};
