import { useCallback, useEffect, useState } from "react";
import { fetchAdminPresets } from "../../../api/client/admin/presets";
import type { PermissionPreset } from "../lib/permissions";

export function useAdminPermissionPresets(adminToken: string) {
  const [presets, setPresets] = useState<PermissionPreset[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    fetchAdminPresets(adminToken)
      .then(setPresets)
      .catch(() => setPresets([]))
      .finally(() => setLoading(false));
  }, [adminToken]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { presets, loading, reload };
}
