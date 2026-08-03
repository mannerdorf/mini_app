/**
 * Секретный дашборд: виджеты перевозок, SLA, платёжный календарь, таймшит.
 */
import { useDashboardPageState, type DashboardPageProps } from "./useDashboardPageState";
import { DashboardPageView } from "./DashboardPageView";

export type { DashboardPageProps };

export function DashboardPage(props: DashboardPageProps) {
    const page = useDashboardPageState(props);
    return <DashboardPageView page={page} />;
}
