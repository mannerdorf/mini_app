#!/usr/bin/env python3
"""Split DashboardPageView into section components."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / "src/pages"
SECTIONS = ROOT / "src/features/dashboard/sections"
VIEW = PAGES / "DashboardPageView.tsx"
HOOK = PAGES / "useDashboardPageState.ts"


def collect_exports(logic: str) -> list[str]:
    names: list[str] = []
    depth = 1
    buf: list[str] = []
    collecting = False

    def flush_destruct(block: str) -> None:
        m = re.search(r"const\s*\{([^}]+)\}", block, re.S)
        if not m:
            return
        for part in m.group(1).split(","):
            token = part.strip()
            if not token:
                continue
            name = token.split(":")[0].strip()
            if name:
                names.append(name)

    hook_patterns = (
        " useMemo(",
        " useCallback(",
        " useRef(",
        " useState(",
        " useEffect(",
        " useLayoutEffect(",
        " useListDateRange(",
        " usePerevozki(",
        " usePrevPeriodPerevozki(",
        " useInvoices(",
        " useAppRuntime(",
        " useReducedMotion(",
        " usePersistedDateFilter(",
    )

    for line in logic.splitlines(keepends=True):
        if collecting:
            buf.append(line)
            if re.search(r"\}\s*=\s*use", "".join(buf)):
                flush_destruct("".join(buf))
                collecting = False
                buf = []
            continue

        if re.match(r"    const \{", line) and "; " not in line and not re.search(r"\}\s*=\s*use.*;", line):
            collecting = True
            buf = [line]
            continue

        if re.match(r"    const \{", line) and "= use" in line:
            flush_destruct(line)
            continue

        open_depth = depth
        depth += line.count("{") - line.count("}")

        if open_depth != 1:
            continue

        m = re.match(r"    const \[(\w+), (\w+)\]", line)
        if m:
            names.extend([m.group(1), m.group(2)])
            continue

        m = re.match(r"    const (\w+) =", line)
        if not m:
            continue
        if any(s in line for s in hook_patterns):
            if " useMemo(" in line or " useCallback(" in line:
                names.append(m.group(1))
            continue
        if " async ()" in line:
            continue
        names.append(m.group(1))

    for p in (
        "auth",
        "onClose",
        "onOpenCargoFilters",
        "showSums",
        "useServiceRequest",
        "hasAnalytics",
        "hasDashboard",
        "saasDashboardMotion",
        "onOpenCargo",
        "onOpenInvoice",
        "onOpenDocumentsEdo",
        "onOpenDocumentsInvoices",
    ):
        names.append(p)

    seen: set[str] = set()
    out: list[str] = []
    for n in names:
        if n not in seen:
            seen.add(n)
            out.append(n)
    return out


def patch_hook_return(exports: list[str]) -> None:
    text = HOOK.read_text()
    start = text.index("\n    return {")
    end = text.index("\n    };\n}", start)
    new_return = "\n    return {\n" + "".join(f"        {n},\n" for n in exports) + "    };\n"
    text = text[:start] + new_return + text[end + len("\n    };") :]
    if "export type DashboardPageState" not in text:
        text = text.replace(
            "\nexport function useDashboardPageState({",
            "\nexport type DashboardPageState = ReturnType<typeof useDashboardPageState>;\n\nexport function useDashboardPageState({",
        )
    HOOK.write_text(text)


def prefix_page_vars(body: str, exports: list[str]) -> str:
    # longest first to avoid partial replacements
    skip = {
        "React", "motion", "Button", "Flex", "Grid", "Input", "Panel", "Typography",
        "Loader2", "DateText", "formatCurrency", "formatDate", "normalizeStatus",
        "STATUS_MAP", "true", "false", "null", "undefined", "String", "Math", "Array",
        "Date", "Number", "Object", "console", "window", "document", "page",
    }
    names = sorted(
        (n for n in exports if n not in skip and len(n) >= 3),
        key=len,
        reverse=True,
    )
    for name in names:
        body = re.sub(rf"(?<![.\w]){re.escape(name)}(?![.\w=:])", f"page.{name}", body)
    # restore local declarations accidentally prefixed
    body = re.sub(r"\bconst page\.(\w+) =", r"const \1 =", body)
    body = re.sub(r"\blet page\.(\w+) =", r"let \1 =", body)
    # fix prop values that became page.prop={page.prop}
    body = re.sub(r"(\s+)page\.(\w+)=\{page\.\2\}", r"\1\2={page.\2}", body)
    body = re.sub(r"(\s+)page\.(onClose|onApply|onReset|title|dateFrom|dateTo|isOpen)=\{", r"\1\2={", body)
    return body


SECTIONS.mkdir(parents=True, exist_ok=True)

SECTION_SPECS = [
    (
        "DashboardHeaderSection.tsx",
        "DashboardHeaderSection",
        174,
        219,
        '''import React from "react";
import { motion } from "motion/react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { DashboardFiltersBar } from "../widgets/DashboardFiltersBar";
import { HaulzDispatchSummary } from "../../../components/HaulzDispatchSummary";
import { cargoSummaryMotion } from "../../../pages/cargoMotion";
import type { DashboardPageState } from "../../../pages/useDashboardPageState";

type Props = { page: DashboardPageState };

export function DashboardHeaderSection({ page }: Props) {
    return (
''',
        "    );\n}\n",
    ),
    (
        "DashboardStripSection.tsx",
        "DashboardStripSection",
        223,
        336,
        '''import React from "react";
import { Loader2, Package, Scale, Weight, List, RussianRuble } from "lucide-react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { DateText } from "../../../components/ui/DateText";
import { formatCurrency } from "../../../lib/formatUtils";
import { DashboardMetricsStrip } from "../widgets/DashboardMetricsStrip";
import { DashboardChartBarH, DashboardMotionItem } from "../index";
import type { DashboardPageState } from "../../../pages/useDashboardPageState";

type Props = { page: DashboardPageState };

export function DashboardStripSection({ page }: Props) {
    return (
        <>
''',
        "        </>\n    );\n}\n",
    ),
    (
        "DashboardMonitorsSection.tsx",
        "DashboardMonitorsSection",
        338,
        356,
        '''import React from "react";
import { EdoHealthMonitor } from "../../../components/EdoHealthMonitor";
import { UnpaidInvoicesPlanMonitor } from "../../../components/UnpaidInvoicesPlanMonitor";
import type { DashboardPageState } from "../../../pages/useDashboardPageState";

type Props = { page: DashboardPageState };

export function DashboardMonitorsSection({ page }: Props) {
    return (
''',
        "    );\n}\n",
    ),
    (
        "DashboardTrendsSection.tsx",
        "DashboardTrendsSection",
        359,
        470,
        '''import React from "react";
import { Loader2, AlertTriangle, Package, Scale, Weight, List, RussianRuble } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { DashboardMainChart } from "../DashboardMainChart";
import type { DashboardPageState } from "../../../pages/useDashboardPageState";

type Props = { page: DashboardPageState };

export function DashboardTrendsSection({ page }: Props) {
    return (
''',
        "    );\n}\n",
    ),
    (
        "DashboardOperationsEarlySection.tsx",
        "DashboardOperationsEarlySection",
        471,
        910,
        '''import React from "react";
import { motion } from "motion/react";
import {
    Loader2, ArrowDown, ArrowUp, Package, Scale, Weight, List, RussianRuble,
    TrendingUp, TrendingDown, Ship, Truck, ChevronDown, Filter, Info,
} from "lucide-react";
import { Button, Flex, Grid, Panel, Typography } from "@maxhub/max-ui";
import * as dateUtils from "../../../lib/dateUtils";
import { normalizeStatus, STATUS_MAP } from "../../../lib/statusUtils";
import { formatCurrency, stripOoo } from "../../../lib/formatUtils";
import { ClickableCargoNumber, leafRowClickProps } from "../../../components/ui/EntityLinks";
import { RouteBadge, CargoTransportTypeIcon, getCargoItemRouteLabel } from "../../../components/shared/CargoTableDisplay";
import { DateText } from "../../../components/ui/DateText";
import {
    DASH_PLAN_FACT_TYPO,
    DashboardChartBarH,
    DashboardChartBarPixelHeight,
    CHART_BAR_FILL_DURATION,
    CHART_BAR_FILL_EASE,
} from "../index";
import type { DashboardPageState } from "../../../pages/useDashboardPageState";

const { formatDate } = dateUtils;

type Props = { page: DashboardPageState };

export function DashboardOperationsEarlySection({ page }: Props) {
    return (
''',
        "    );\n}\n",
    ),
    (
        "DashboardOperationsLateSection.tsx",
        "DashboardOperationsLateSection",
        911,
        1109,
        '''import React from "react";
import { motion } from "motion/react";
import {
    Loader2, ArrowDown, ArrowUp, Package, Scale, Weight, List, RussianRuble,
    TrendingUp, TrendingDown, Ship, Truck, ChevronDown, Filter, Info,
} from "lucide-react";
import { Button, Flex, Grid, Panel, Typography } from "@maxhub/max-ui";
import * as dateUtils from "../../../lib/dateUtils";
import { normalizeStatus, STATUS_MAP } from "../../../lib/statusUtils";
import { formatCurrency, stripOoo } from "../../../lib/formatUtils";
import { ClickableCargoNumber, leafRowClickProps } from "../../../components/ui/EntityLinks";
import { RouteBadge, CargoTransportTypeIcon, getCargoItemRouteLabel } from "../../../components/shared/CargoTableDisplay";
import { DateText } from "../../../components/ui/DateText";
import { DashboardCargoFlowWidget } from "../widgets/DashboardCargoFlowWidget";
import {
    DASH_PLAN_FACT_TYPO,
    DashboardChartBarH,
    DashboardChartBarPixelHeight,
    CHART_BAR_FILL_DURATION,
    CHART_BAR_FILL_EASE,
} from "../index";
import type { DashboardPageState } from "../../../pages/useDashboardPageState";

const { formatDate } = dateUtils;

type Props = { page: DashboardPageState };

export function DashboardOperationsLateSection({ page }: Props) {
    return (
''',
        "    );\n}\n",
    ),
    (
        "DashboardLogisticsSection.tsx",
        "DashboardLogisticsSection",
        1112,
        1128,
        '''import React from "react";
import { DashboardSlaMonitor } from "../widgets/DashboardSlaMonitor";
import { DashboardMotionItem } from "../index";
import type { DashboardPageState } from "../../../pages/useDashboardPageState";

type Props = { page: DashboardPageState };

export function DashboardLogisticsSection({ page }: Props) {
    return (
        <DashboardMotionItem enabled={page.dashboardMotionEnabled}>
''',
        "        </DashboardMotionItem>\n    );\n}\n",
    ),
    (
        "DashboardFinanceSection.tsx",
        "DashboardFinanceSection",
        1130,
        1526,
        '''import React from "react";
import { Loader2, RefreshCw, ArrowDown, ArrowUp, TrendingUp, TrendingDown } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { formatCurrency, stripOoo, normalizeInvoiceStatus } from "../../../lib/formatUtils";
import { ClickableCargoNumber } from "../../../components/ui/EntityLinks";
import { DateText } from "../../../components/ui/DateText";
import type { DashboardPageState } from "../../../pages/useDashboardPageState";

type Props = { page: DashboardPageState };

export function DashboardFinanceSection({ page }: Props) {
    return (
''',
        "    );\n}\n",
    ),
    (
        "DashboardClientAnalyticsSection.tsx",
        "DashboardClientAnalyticsSection",
        1527,
        1814,
        '''import React from "react";
import { motion } from "motion/react";
import { Loader2, ArrowDown, ArrowUp } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { formatCurrency, stripOoo } from "../../../lib/formatUtils";
import { ClickableCargoNumber } from "../../../components/ui/EntityLinks";
import { RouteBadge, CargoTransportTypeIcon, getCargoItemRouteLabel } from "../../../components/shared/CargoTableDisplay";
import { DateText } from "../../../components/ui/DateText";
import {
    DashboardChartBarH,
    CHART_BAR_FILL_DURATION,
    CHART_BAR_FILL_EASE,
} from "../index";
import type { DashboardPageState } from "../../../pages/useDashboardPageState";

type Props = { page: DashboardPageState };

export function DashboardClientAnalyticsSection({ page }: Props) {
    return (
''',
        "    );\n}\n",
    ),
    (
        "DashboardDialogsSection.tsx",
        "DashboardDialogsSection",
        1978,
        1997,
        '''import React from "react";
import { FilterDialog } from "../../../components/shared/FilterDialog";
import type { DashboardPageState } from "../../../pages/useDashboardPageState";

type Props = { page: DashboardPageState };

export function DashboardDialogsSection({ page }: Props) {
    return (
''',
        "    );\n}\n",
    ),
]


def main() -> None:
    hook_text = HOOK.read_text()
    logic_start = hook_text.index("}: DashboardPageProps) {") + len("}: DashboardPageProps) {")
    logic_end = hook_text.index("\n    return {")
    exports = collect_exports(hook_text[logic_start:logic_end])
    patch_hook_return(exports)

    view_lines = VIEW.read_text().splitlines(keepends=True)

    for filename, component, start, end, header, footer in SECTION_SPECS:
        chunk = "".join(view_lines[start - 1 : end])
        chunk = prefix_page_vars(chunk, exports)
        # fix corruption
        chunk = chunk.replace(
            "{/* === ВИДЖЕТ 4: Монитор SLA            {/* === ВИДЖЕТ 4: Монитор SLA (включить: WIDGET_4_SLA = true); в режиме \"только SLA\" показываем даже при 0 перевозок === */}",
            "{/* === ВИДЖЕТ 4: Монитор SLA (включить: WIDGET_4_SLA = true); в режиме \"только SLA\" показываем даже при 0 перевозок === */}",
        )
        chunk = chunk.replace(
            "{/* ═══════ ГРУППА 4: ФИНАНСЫ И КЛИЕНТЫ ═══════ */}            {/* ═══════ ГРУППА 4: ФИНАНСЫ И КЛИЕНТЫ ═══════ */}",
            "{/* ═══════ ГРУППА 4: ФИНАНСЫ И КЛИЕНТЫ ═══════ */}",
        )
        chunk = chunk.replace(
            "{/* Монитор доставки:            {/* Монитор доставки:",
            "{/* Монитор доставки:",
        )
        if component == "DashboardLogisticsSection":
            chunk = re.sub(r"^\s*<DashboardMotionItem[^>]*>\s*", "", chunk)
            chunk = re.sub(r"\s*</DashboardMotionItem>\s*$", "", chunk)
        if component in (
            "DashboardHeaderSection",
            "DashboardMonitorsSection",
            "DashboardTrendsSection",
            "DashboardOperationsEarlySection",
            "DashboardOperationsLateSection",
            "DashboardFinanceSection",
            "DashboardClientAnalyticsSection",
        ):
            chunk = chunk.lstrip()
            if not chunk.startswith("<"):
                header = header.rstrip("\n") + "\n        <>\n"
                footer = "        </>\n" + footer
        (SECTIONS / filename).write_text(header + chunk + footer)

    new_view = '''import React from "react";
import { Typography } from "@maxhub/max-ui";
import { DashboardMotionGroup } from "../features/dashboard";
import { DashboardMotionItem } from "../features/dashboard";
import type { DashboardPageState } from "./useDashboardPageState";
import { DashboardHeaderSection } from "../features/dashboard/sections/DashboardHeaderSection";
import { DashboardStripSection } from "../features/dashboard/sections/DashboardStripSection";
import { DashboardMonitorsSection } from "../features/dashboard/sections/DashboardMonitorsSection";
import { DashboardTrendsSection } from "../features/dashboard/sections/DashboardTrendsSection";
import { DashboardOperationsEarlySection } from "../features/dashboard/sections/DashboardOperationsEarlySection";
import { DashboardOperationsLateSection } from "../features/dashboard/sections/DashboardOperationsLateSection";
import { DashboardLogisticsSection } from "../features/dashboard/sections/DashboardLogisticsSection";
import { DashboardFinanceSection } from "../features/dashboard/sections/DashboardFinanceSection";
import { DashboardClientAnalyticsSection } from "../features/dashboard/sections/DashboardClientAnalyticsSection";
import { DashboardDialogsSection } from "../features/dashboard/sections/DashboardDialogsSection";

export type DashboardPageViewProps = {
    page: DashboardPageState;
};

export function DashboardPageView({ page }: DashboardPageViewProps) {
    if (!page.auth?.login || !page.auth?.password) {
        return (
            <div className="w-full p-4">
                <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Нет доступа к дашборду. Выберите аккаунт в профиле.</Typography.Body>
            </div>
        );
    }

    return (
        <div className={`w-full dashboard-page-offset${page.saasDashboardMotion ? " dashboard-page--saas-analytics" : ""}`} style={{ minWidth: 0, maxWidth: "100%" }}>
            <DashboardHeaderSection page={page} />
            <DashboardMotionGroup enabled={page.dashboardMotionEnabled}>
                <DashboardStripSection page={page} />
                <DashboardMonitorsSection page={page} />
                <DashboardMotionItem enabled={page.dashboardMotionEnabled}>
                    <DashboardTrendsSection page={page} />
                    <DashboardOperationsEarlySection page={page} />
                    <DashboardOperationsLateSection page={page} />
                </DashboardMotionItem>
                <DashboardLogisticsSection page={page} />
                <DashboardMotionItem enabled={page.dashboardMotionEnabled}>
                    <DashboardFinanceSection page={page} />
                    <DashboardClientAnalyticsSection page={page} />
                </DashboardMotionItem>
            </DashboardMotionGroup>
            <DashboardDialogsSection page={page} />
        </div>
    );
}
'''
    VIEW.write_text(new_view)

    index = ROOT / "src/features/dashboard/index.ts"
    index_text = index.read_text()
    if "DashboardHeaderSection" not in index_text:
        index_text += "\nexport { DashboardHeaderSection } from \"./sections/DashboardHeaderSection\";\n"
        index_text += "export { DashboardStripSection } from \"./sections/DashboardStripSection\";\n"
        index_text += "export { DashboardMonitorsSection } from \"./sections/DashboardMonitorsSection\";\n"
        index_text += "export { DashboardTrendsSection } from \"./sections/DashboardTrendsSection\";\n"
        index_text += "export { DashboardOperationsEarlySection } from \"./sections/DashboardOperationsEarlySection\";\n"
        index_text += "export { DashboardOperationsLateSection } from \"./sections/DashboardOperationsLateSection\";\n"
        index_text += "export { DashboardLogisticsSection } from \"./sections/DashboardLogisticsSection\";\n"
        index_text += "export { DashboardFinanceSection } from \"./sections/DashboardFinanceSection\";\n"
        index_text += "export { DashboardClientAnalyticsSection } from \"./sections/DashboardClientAnalyticsSection\";\n"
        index_text += "export { DashboardDialogsSection } from \"./sections/DashboardDialogsSection\";\n"
        index_text += "export type { DashboardPageState } from \"../../pages/useDashboardPageState\";\n"
        index.write_text(index_text)

    print(f"exports={len(exports)} sections={len(SECTION_SPECS)}")


if __name__ == "__main__":
    main()
