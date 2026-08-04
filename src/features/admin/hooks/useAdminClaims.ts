import { useState, useEffect } from "react";
import type { UseAdminEmployeeDirectoryReturn } from "./useAdminEmployeeDirectory";
import { useAdminClaimsList } from "./useAdminClaimsList";
import { useAdminClaimDetail } from "./useAdminClaimDetail";

export type { AdminClaimListItem } from "./useAdminClaimsList";

export type UseAdminClaimsParams = {
  adminToken: string;
  isSuperAdmin: boolean;
  onError: (msg: string | null) => void;
  employeeDir: UseAdminEmployeeDirectoryReturn;
};

export function useAdminClaims({
  adminToken,
  isSuperAdmin,
  onError,
  employeeDir,
}: UseAdminClaimsParams) {
  const [adminClaimDetailId, setAdminClaimDetailId] = useState<number | null>(null);

  const list = useAdminClaimsList({ adminToken, isSuperAdmin });
  const detail = useAdminClaimDetail({
    adminToken,
    adminClaimDetailId,
    setAdminClaimsUpdatingId: list.setAdminClaimsUpdatingId,
    reloadAdminClaims: list.reloadAdminClaims,
    onError,
    onDeleteDetail: () => setAdminClaimDetailId(null),
  });

  useEffect(() => {
    if (isSuperAdmin) {
      employeeDir.fetch();
    }
  }, [isSuperAdmin, employeeDir.fetch]);

  return {
    ...list,
    adminClaimDetailId,
    setAdminClaimDetailId,
    ...detail,
  };
}

export type AdminClaimsState = ReturnType<typeof useAdminClaims>;
