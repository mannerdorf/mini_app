import { useState, useEffect, useCallback } from "react";
import { fetchAdminClaims } from "../../../api/client/admin/claims";

export type AdminClaimListItem = {
  id: number;
  claimNumber: string;
  customerCompanyName: string;
  customerInn: string;
  cargoNumber: string;
  description: string;
  requestedAmount: number | null;
  approvedAmount: number | null;
  status: string;
  daysInWork: number;
  createdAt: string;
};

type Params = {
  adminToken: string;
  isSuperAdmin: boolean;
};

export function useAdminClaimsList({ adminToken, isSuperAdmin }: Params) {
  const [adminClaims, setAdminClaims] = useState<AdminClaimListItem[]>([]);
  const [adminClaimsLoading, setAdminClaimsLoading] = useState(false);
  const [adminClaimsStatusFilter, setAdminClaimsStatusFilter] = useState("");
  const [adminClaimsSearch, setAdminClaimsSearch] = useState("");
  const [adminClaimsUpdatingId, setAdminClaimsUpdatingId] = useState<number | null>(null);
  const [adminClaimsView, setAdminClaimsView] = useState<"new" | "in_progress" | "all">("all");
  const [adminClaimsKpi, setAdminClaimsKpi] = useState<{ activeCount: number; overdueCount: number; requestedSum: number; approvedSum: number } | null>(null);
  const [adminClaimsChart, setAdminClaimsChart] = useState<{ day: string; count: number }[]>([]);

  const reloadAdminClaims = useCallback(async () => {
    if (!adminToken || !isSuperAdmin) {
      setAdminClaims([]);
      return;
    }
    setAdminClaimsLoading(true);
    try {
      const viewStatus = adminClaimsView === "new"
        ? "new"
        : adminClaimsView === "in_progress"
          ? "in_progress"
          : "";
      const effectiveStatus = adminClaimsStatusFilter || viewStatus;
      const data = await fetchAdminClaims(adminToken, {
        status: effectiveStatus || undefined,
        q: adminClaimsSearch,
      });
      setAdminClaims(data.claims);
      setAdminClaimsKpi(data.kpi);
      setAdminClaimsChart(data.chart);
    } catch {
      setAdminClaims([]);
      setAdminClaimsKpi(null);
      setAdminClaimsChart([]);
    } finally {
      setAdminClaimsLoading(false);
    }
  }, [adminToken, isSuperAdmin, adminClaimsStatusFilter, adminClaimsSearch, adminClaimsView]);

  useEffect(() => {
    if (isSuperAdmin) void reloadAdminClaims();
  }, [isSuperAdmin, reloadAdminClaims]);

  return {
    adminClaims,
    adminClaimsLoading,
    adminClaimsStatusFilter,
    setAdminClaimsStatusFilter,
    adminClaimsSearch,
    setAdminClaimsSearch,
    adminClaimsUpdatingId,
    setAdminClaimsUpdatingId,
    adminClaimsView,
    setAdminClaimsView,
    adminClaimsKpi,
    adminClaimsChart,
    reloadAdminClaims,
  };
}

export type AdminClaimsListState = ReturnType<typeof useAdminClaimsList>;
