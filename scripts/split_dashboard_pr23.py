#!/usr/bin/env python3
"""Apply Dashboard PR2 widget extraction + PR3 state/view split."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / "src/pages"
DASH = PAGES / "DashboardPage.tsx"


def apply_pr2(text: str) -> str:
    if "DashboardFiltersBar" not in text:
        text = text.replace(
            "    DashboardMainChart,\n    cargoFlowSelectionEqual,",
            "    DashboardMainChart,\n    DashboardFiltersBar,\n    DashboardMetricsStrip,\n    DashboardCargoFlowWidget,\n    DashboardSlaMonitor,\n    cargoFlowSelectionEqual,",
        )

    start = text.index('            <div className="cargo-page-sticky-header dashboard-sticky-filters">')
    end = text.index('            </motion.div>\n            )}\n\n            {/* Выдача грузов (HAULZ)')
    filters = '''            <DashboardFiltersBar
                useServiceRequest={useServiceRequest}
                dateFilter={dateFilter}
                setDateFilter={setDateFilter}
                apiDateRange={apiDateRange}
                selectedMonthForFilter={selectedMonthForFilter}
                setSelectedMonthForFilter={setSelectedMonthForFilter}
                selectedYearForFilter={selectedYearForFilter}
                setSelectedYearForFilter={setSelectedYearForFilter}
                selectedWeekForFilter={selectedWeekForFilter}
                setSelectedWeekForFilter={setSelectedWeekForFilter}
                customDateFrom={customDateFrom}
                setCustomDateFrom={setCustomDateFrom}
                customDateTo={customDateTo}
                setCustomDateTo={setCustomDateTo}
                onOpenCustomPeriod={() => setIsCustomModalOpen(true)}
                billStatusFilterSet={billStatusFilterSet}
                setBillStatusFilterSet={setBillStatusFilterSet}
                typeFilterSet={typeFilterSet}
                setTypeFilterSet={setTypeFilterSet}
                routeFilterSet={routeFilterSet}
                setRouteFilterSet={setRouteFilterSet}
                roleFilter={roleFilter}
                setRoleFilter={setRoleFilter}
            />
            </motion.div>
            )}

            {/* Выдача грузов (HAULZ)'''
    text = text[:start] + filters + text[end + len('            </motion.div>\n            )}\n\n            {/* Выдача грузов (HAULZ)'):]

    start = text.index('            {/* Раскрывающаяся полоска:')
    end = text.index('            {/* Монитор доставки:')
    strip = '''            <DashboardMetricsStrip
                showSums={showSums}
                useServiceRequest={useServiceRequest}
                apiDateRange={apiDateRange}
                comparePeriodRange={comparePeriodRange}
                comparePeriodOverride={!!comparePeriodOverride}
                prevPeriodLoading={prevPeriodLoading}
                onOpenComparePeriod={() => setIsComparePeriodDialogOpen(true)}
                chartType={chartType}
                setChartType={setChartType}
                dateFilter={dateFilter}
                stripValueLabel={formatStripValue()}
                periodToPeriodTrend={periodToPeriodTrend}
                stripTrend={stripTrend}
                chartDataLength={chartData.length}
                stripTab={stripTab}
                setStripTab={setStripTab}
                stripDiagramByType={stripDiagramByType}
                stripDiagramBySender={stripDiagramBySender}
                stripDiagramByReceiver={stripDiagramByReceiver}
                stripDiagramByCustomer={stripDiagramByCustomer}
                stripShowAsPercent={stripShowAsPercent}
                setStripShowAsPercent={setStripShowAsPercent}
                formatStripDelta={formatStripDelta}
                stripLineChartData={stripLineChartData}
                chartBarFillEnabled={chartBarFillEnabled}
            />

            {/* Монитор доставки:'''
    text = text[:start] + strip + text[end:]

    start = text.index('                        Грузовой поток')
    start = text.rfind('{!showOnlySla && !loading && !error && (', 0, start)
    end = text.index('            {/* === ВИДЖЕТ 4: Монитор SLA')
    cargo = '''            {!showOnlySla && !loading && !error && (
                <DashboardCargoFlowWidget
                    cargoFlowByPlan={cargoFlowByPlan}
                    cargoFlowTableExpanded={cargoFlowTableExpanded}
                    cargoFlowTableSelection={cargoFlowTableSelection}
                    onCargoFlowPick={onCargoFlowPick}
                    onCollapseCargoFlow={() => { setCargoFlowTableExpanded(false); setCargoFlowTableSelection(null); }}
                    cargoFlowDetailSorted={cargoFlowDetailSorted}
                    showSums={showSums}
                    onOpenCargo={onOpenCargo}
                    getItemSum={getItemSum}
                    getEffectivePlannedDate={getEffectivePlannedDate}
                    getLastStatusDateKey={getLastStatusDateKey}
                />
            )}

            </DashboardMotionItem>
            <DashboardMotionItem enabled={dashboardMotionEnabled}>
            {/* === ВИДЖЕТ 4: Монитор SLA'''
    text = text[:start] + cargo + text[end:]

    start = text.index('                <Panel className="cargo-card sla-monitor-panel"')
    start = text.rfind('{WIDGET_4_SLA &&', 0, start)
    end = text.index('            {/* ═══════ ГРУППА 4: ФИНАНСЫ И КЛИЕНТЫ ═══════ */}')
    sla = '''            {WIDGET_4_SLA && !loading && !error && (slaStats.total > 0 || showOnlySla) && (
                <DashboardSlaMonitor
                    auth={auth}
                    useServiceRequest={useServiceRequest}
                    chartBarFillEnabled={chartBarFillEnabled}
                    slaStats={slaStats}
                    slaStatsByType={slaStatsByType}
                    slaTrend={slaTrend}
                    outOfSlaByType={outOfSlaByType}
                    onOpenCargo={onOpenCargo}
                    normalizeTimelineErrorMessage={normalizeTimelineErrorMessage}
                />
            )}

            </DashboardMotionItem>
            <DashboardMotionItem enabled={dashboardMotionEnabled}>
            {/* ═══════ ГРУППА 4: ФИНАНСЫ И КЛИЕНТЫ ═══════ */}'''
    text = text[:start] + sla + text[end:]

    for pat in [
        r"    const \[isDateDropdownOpen[^\n]+\n",
        r"    const \[dateDropdownMode[^\n]+\n",
        r"    const monthLongPressTimerRef[^\n]+\n",
        r"    const monthWasLongPressRef[^\n]+\n",
        r"    const yearLongPressTimerRef[^\n]+\n",
        r"    const yearWasLongPressRef[^\n]+\n",
        r"    const weekLongPressTimerRef[^\n]+\n",
        r"    const weekWasLongPressRef[^\n]+\n",
        r"    const \[isBillStatusDropdownOpen[^\n]+\n",
        r"    const \[isTypeDropdownOpen[^\n]+\n",
        r"    const \[isRouteDropdownOpen[^\n]+\n",
        r"    const \[isRoleDropdownOpen[^\n]+\n",
        r"    const dateButtonRef[^\n]+\n",
        r"    const billStatusButtonRef[^\n]+\n",
        r"    const typeButtonRef[^\n]+\n",
        r"    const routeButtonRef[^\n]+\n",
        r"    const roleButtonRef[^\n]+\n",
        r"    const \[slaDetailsOpen[^\n]+\n",
        r"    const \[expandedSlaCargoNumber[^\n]+\n",
        r"    const \[expandedSlaItem[^\n]+\n",
        r"    const \[slaTimelineSteps[^\n]+\n",
        r"    const \[slaTimelineLoading[^\n]+\n",
        r"    const \[slaTimelineError[^\n]+\n",
        r"    const \[slaTableSortColumn[^\n]+\n",
        r"    const \[slaTableSortOrder[^\n]+\n",
    ]:
        text = re.sub(pat, "", text)

    text = re.sub(r"\n    const handleSlaTableSort = \(column: string\) => \{[\s\S]*?\n    \};\n", "\n", text, count=1)
    text = re.sub(r"\n    const sortOutOfSlaRows = <T extends[\s\S]*?\n    \};\n", "\n", text, count=1)
    text = re.sub(r"\n    // Загрузка статусов перевозки[\s\S]*?\n    \}, \[expandedSlaCargoNumber[\s\S]*?\]\);\n", "\n", text, count=1)
    text = re.sub(
        r"\n    const sortedOutOfSlaAuto = useMemo\([\s\S]*?\n    const sortedOutOfSlaFerry = useMemo\([^\n]+\n",
        "\n",
        text,
        count=1,
    )
    return text


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

    for line in logic.splitlines(keepends=True):
        if collecting:
            buf.append(line)
            if ";" in line or ( "}" in line and "= use" in "".join(buf)):
                flush_destruct("".join(buf))
                collecting = False
                buf = []
            continue

        if re.match(r"    const \{", line) and "= use" in line and ";" not in line:
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
        if any(
            s in line
            for s in (
                " useMemo(",
                " useCallback(",
                " useEffect(",
                " useLayoutEffect(",
                " useRef(",
                " useState(",
                " useListDateRange(",
                " usePerevozki(",
                " usePrevPeriodPerevozki(",
                " useInvoices(",
                " useAppRuntime(",
                " useReducedMotion(",
                " async ()",
            )
        ):
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


def hook_header(lines: list[str], func_line_idx: int) -> str:
    header = "".join(lines[:func_line_idx])
    header = re.sub(r'import React, \{([^}]+)\} from "react";', r'import {\1} from "react";', header)
    header = header.replace("import { motion, useReducedMotion }", "import { useReducedMotion }")
    header = re.sub(r'import \{ cargoSummaryMotion \} from "\./cargoMotion";\n', "", header)
    for pat in (
        r'import \{ Button, Flex, Grid, Input, Panel, Typography \} from "@maxhub/max-ui";\n',
        r'import \{ ClickableCargoNumber, leafRowClickProps \} from "../components/ui/EntityLinks";\n',
        r'import \{ RouteBadge, CargoTransportTypeIcon, getCargoItemRouteLabel \} from "../components/shared/CargoTableDisplay";\n',
        r'import \{ DateText \} from "../components/ui/DateText";\n',
        r'import \{ FilterDialog \} from "../components/shared/FilterDialog";\n',
        r'import \{ HaulzDispatchSummary \} from "../components/HaulzDispatchSummary";\n',
        r'import \{ EdoHealthMonitor \} from "../components/EdoHealthMonitor";\n',
        r'import \{ UnpaidInvoicesPlanMonitor \} from "../components/UnpaidInvoicesPlanMonitor";\n',
        r'import \{ fetchPerevozkaTimeline \} from "../lib/perevozkaDetails";\n',
        r'import \{ FilterDropdownPortal \} from "../components/ui/FilterDropdownPortal";\n',
        r'import \{ CustomPeriodModal \} from "../components/modals/CustomPeriodModal";\n',
    ):
        header = re.sub(pat, "", header)
    for remove in (
        "    DashboardMotionGroup,\n    DashboardMotionItem,\n",
        "    DashboardMainChart,\n",
        "    DashboardFiltersBar,\n",
        "    DashboardMetricsStrip,\n",
        "    DashboardCargoFlowWidget,\n",
        "    DashboardSlaMonitor,\n",
    ):
        header = header.replace(remove, "")
    header = header.replace("Секретный дашборд", "Dashboard page state hook.")
    return header


def split_pr3(text: str) -> None:
    lines = text.splitlines(keepends=True)
    func_idx = next(i for i, l in enumerate(lines) if l.startswith("export function DashboardPage"))
    body_start = next(i for i, l in enumerate(lines) if i > func_idx and l.strip() == "}: DashboardPageProps) {") + 1
    auth_idx = next(i for i, l in enumerate(lines) if l.strip().startswith("if (!auth?.login || !auth?.password)"))
    logic_lines = lines[body_start:auth_idx]
    view_lines = lines[auth_idx:]
    func_end = next(i for i in range(len(lines) - 1, -1, -1) if lines[i].strip() == "}")
    view_lines = lines[auth_idx:func_end]

    logic = "".join(logic_lines)
    exports = collect_exports(logic)

    hook = hook_header(lines, func_idx)
    hook += "\nexport function useDashboardPageState({\n"
    hook += "    auth,\n    onClose,\n    onOpenCargoFilters,\n    showSums = true,\n    useServiceRequest = false,\n    hasAnalytics = false,\n    hasDashboard = true,\n    saasDashboardMotion = false,\n    onOpenCargo,\n    onOpenInvoice,\n    onOpenDocumentsEdo,\n    onOpenDocumentsInvoices,\n}: DashboardPageProps) {\n"
    hook += logic
    hook += "\n    return {\n"
    for n in exports:
        hook += f"        {n},\n"
    hook += "    };\n}\n"
    (PAGES / "useDashboardPageState.ts").write_text(hook)

    view = '''import React from "react";
import { motion } from "motion/react";
import {
    Loader2, X, Calendar, Filter, Package, Scale, Weight, Maximize, CreditCard, Check,
    AlertTriangle, Info, Ship, Truck, ArrowDown, ArrowUp, ArrowLeft, TrendingUp, TrendingDown, Minus, RussianRuble, List, RefreshCw,
} from "lucide-react";
import { Button, Flex, Grid, Input, Panel, Typography } from "@maxhub/max-ui";
import * as dateUtils from "../lib/dateUtils";
import { normalizeStatus, STATUS_MAP } from "../lib/statusUtils";
import { formatCurrency, formatInvoiceNumber, stripOoo, cityToCode, normalizeInvoiceStatus } from "../lib/formatUtils";
import { ClickableCargoNumber, leafRowClickProps } from "../components/ui/EntityLinks";
import { RouteBadge, CargoTransportTypeIcon, getCargoItemRouteLabel } from "../components/shared/CargoTableDisplay";
import { DateText } from "../components/ui/DateText";
import { FilterDialog } from "../components/shared/FilterDialog";
import { HaulzDispatchSummary } from "../components/HaulzDispatchSummary";
import { EdoHealthMonitor } from "../components/EdoHealthMonitor";
import { UnpaidInvoicesPlanMonitor } from "../components/UnpaidInvoicesPlanMonitor";
import { cargoSummaryMotion } from "./cargoMotion";
import {
    DASH_PLAN_FACT_TYPO,
    DashboardMotionGroup,
    DashboardMotionItem,
    DashboardChartBarH,
    DashboardChartBarPixelHeight,
    CHART_BAR_FILL_DURATION,
    CHART_BAR_FILL_EASE,
    DashboardMainChart,
    DashboardFiltersBar,
    DashboardMetricsStrip,
    DashboardCargoFlowWidget,
    DashboardSlaMonitor,
} from "../features/dashboard";
import type { useDashboardPageState } from "./useDashboardPageState";

const { formatDate, getDateTextColor } = dateUtils;

export type DashboardPageViewProps = {
    page: ReturnType<typeof useDashboardPageState>;
};

export function DashboardPageView({ page }: DashboardPageViewProps) {
'''
    view += "    const {\n"
    for n in exports:
        view += f"        {n},\n"
    view += "    } = page;\n\n"
    view += "".join(view_lines)
    view += "}\n"
    (PAGES / "DashboardPageView.tsx").write_text(view)

    page = '''/**
 * Секретный дашборд: виджеты перевозок, SLA, платёжный календарь, таймшит.
 */
import { useDashboardPageState, type DashboardPageProps } from "./useDashboardPageState";
import { DashboardPageView } from "./DashboardPageView";

export type { DashboardPageProps };

export function DashboardPage(props: DashboardPageProps) {
    const page = useDashboardPageState(props);
    return <DashboardPageView page={page} />;
}
'''
    (PAGES / "DashboardPage.tsx").write_text(page)
    print(f"split done: {len(exports)} exports")


def main() -> None:
    text = DASH.read_text()
    if "useDashboardPageState" in text and len(text.splitlines()) < 50:
        # already thin shell; rebuild from git
        import subprocess

        subprocess.run(["git", "checkout", "HEAD", "--", str(DASH.relative_to(ROOT))], cwd=ROOT, check=True)
        text = DASH.read_text()
    text = apply_pr2(text)
    split_pr3(text)


if __name__ == "__main__":
    main()
