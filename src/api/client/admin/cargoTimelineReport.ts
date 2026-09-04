import { adminAuthHeaders } from "./auth";
import type {
  CargoTimelineDelayFilter,
  CargoTimelineReport,
} from "../../../lib/adminCargoTimelineReport";

export async function fetchAdminCargoTimelineReport(
  adminToken: string,
  params: {
    dateFrom: string;
    dateTo: string;
    routeFilter?: "all" | "MSK-KGD" | "KGD-MSK";
    delayFilter?: CargoTimelineDelayFilter;
  },
): Promise<CargoTimelineReport> {
  const res = await fetch("/api/admin-cargo-timeline-report", {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof (data as { error?: string })?.error === "string"
        ? (data as { error: string }).error
        : "Ошибка загрузки отчёта таймлайна";
    throw new Error(msg);
  }
  return data as CargoTimelineReport;
}
