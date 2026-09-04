import { adminAuthHeaders } from "./auth";

export type LastMileTripRow = {
  cargoNumber: string;
  receiver: string;
  cityReceiver: string;
  scheduledAt: string | null;
  deliveredAt: string | null;
  pw: number;
  weight: number;
  volume: number;
  places: number;
};

export type LastMileVehicleDayRow = {
  date: string;
  vehicleKey: string;
  autoReg: string;
  autoType: string;
  driver: string;
  driverTel: string;
  firstAt: string | null;
  lastAt: string | null;
  workMinutes: number | null;
  trips: LastMileTripRow[];
  totals: {
    tripCount: number;
    pw: number;
    weight: number;
    volume: number;
    places: number;
  };
};

export type LastMileVehicleReport = {
  dateFrom: string;
  dateTo: string;
  rows: LastMileVehicleDayRow[];
  summary: {
    vehicleDays: number;
    tripCount: number;
    pw: number;
    weight: number;
    volume: number;
    places: number;
  };
};

export async function fetchAdminLastMileReport(
  adminToken: string,
  dateRange: { dateFrom: string; dateTo: string },
): Promise<LastMileVehicleReport> {
  const res = await fetch("/api/admin-last-mile-report", {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(dateRange),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof (data as { error?: string })?.error === "string"
        ? (data as { error: string }).error
        : "Ошибка загрузки отчёта последней мили";
    throw new Error(msg);
  }
  return data as LastMileVehicleReport;
}
