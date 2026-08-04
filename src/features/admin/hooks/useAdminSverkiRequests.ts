import { useState, useEffect, useCallback } from "react";
import { fetchAdminSverkiRequests, deleteAdminSverkiRequest, updateAdminSverkiRequestStatus } from "../../../api/client/admin/sverki";
import type { AdminSverkiRequest } from "./useAdminExpenseRequests";

type Params = {
  adminToken: string;
  isSuperAdmin: boolean;
  enabled: boolean;
  onError: (msg: string | null) => void;
};

export function useAdminSverkiRequests({ adminToken, isSuperAdmin, enabled, onError }: Params) {
  const [sverkiRequests, setSverkiRequests] = useState<AdminSverkiRequest[]>([]);
  const [sverkiRequestsLoading, setSverkiRequestsLoading] = useState(false);
  const [sverkiRequestsUpdatingId, setSverkiRequestsUpdatingId] = useState<number | null>(null);

  const reloadSverkiRequests = useCallback(async () => {
    if (!adminToken || !isSuperAdmin) {
      setSverkiRequests([]);
      return;
    }
    setSverkiRequestsLoading(true);
    try {
      setSverkiRequests(await fetchAdminSverkiRequests(adminToken));
    } catch {
      setSverkiRequests([]);
    } finally {
      setSverkiRequestsLoading(false);
    }
  }, [adminToken, isSuperAdmin]);

  useEffect(() => {
    if (enabled && isSuperAdmin) void reloadSverkiRequests();
  }, [enabled, isSuperAdmin, reloadSverkiRequests]);

  const markSverkiRequestAsSent = useCallback(async (id: number) => {
    if (!adminToken) return;
    setSverkiRequestsUpdatingId(id);
    try {
      await updateAdminSverkiRequestStatus(adminToken, id, "edo_sent");
      setSverkiRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: "edo_sent", updatedAt: new Date().toISOString() } : r)));
    } catch (e: unknown) {
      onError((e as Error)?.message || "Ошибка обновления статуса заявки");
    } finally {
      setSverkiRequestsUpdatingId(null);
    }
  }, [adminToken, onError]);

  const deleteSverkiRequest = useCallback(async (id: number) => {
    if (!adminToken) return;
    const confirmed = typeof window !== "undefined" ? window.confirm("Удалить заявку акта сверки? Действие нельзя отменить.") : true;
    if (!confirmed) return;
    setSverkiRequestsUpdatingId(id);
    try {
      await deleteAdminSverkiRequest(adminToken, id);
      setSverkiRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (e: unknown) {
      onError((e as Error)?.message || "Ошибка удаления заявки");
    } finally {
      setSverkiRequestsUpdatingId(null);
    }
  }, [adminToken, onError]);

  return {
    sverkiRequests,
    sverkiRequestsLoading,
    sverkiRequestsUpdatingId,
    reloadSverkiRequests,
    markSverkiRequestAsSent,
    deleteSverkiRequest,
  };
}
