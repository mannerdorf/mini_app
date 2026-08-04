import { Button, Flex, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import type { AdminClaimsState } from "../hooks/useAdminClaims";
import { AdminClaimDetailInfoSection } from "./AdminClaimDetailInfoSection";
import { AdminClaimDetailResponseSection } from "./AdminClaimDetailResponseSection";
import { AdminClaimDetailDecisionSection } from "./AdminClaimDetailDecisionSection";
import { AdminClaimDetailLeaderSection } from "./AdminClaimDetailLeaderSection";
import { AdminClaimDetailTimelineSection } from "./AdminClaimDetailTimelineSection";

export type AdminClaimDetailPanelProps = {
  isSuperAdmin: boolean;
  claims: AdminClaimsState;
};

export function AdminClaimDetailPanel({ isSuperAdmin, claims }: AdminClaimDetailPanelProps) {
  const {
    adminClaimDetailId,
    setAdminClaimDetailId,
    adminClaimDetailLoading,
    adminClaimDetail,
    adminClaimsUpdatingId,
    deleteAdminClaim,
  } = claims;

  if (!adminClaimDetailId) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={() => setAdminClaimDetailId(null)}
    >
      <div
        style={{ width: "94%", maxWidth: 820, maxHeight: "90vh", overflowY: "auto", borderRadius: 12, background: "var(--color-bg-card, #fff)", padding: "1rem" }}
        onClick={(e) => e.stopPropagation()}
      >
        <Flex align="center" justify="space-between" style={{ marginBottom: "0.65rem" }}>
          <Typography.Body style={{ fontWeight: 700 }}>
            Претензия {adminClaimDetail?.claim?.claimNumber || `#${adminClaimDetailId}`}
          </Typography.Body>
          <Flex gap="0.45rem" align="center">
            {isSuperAdmin && adminClaimDetail?.claim?.id && (
              <Button
                type="button"
                className="filter-button"
                style={{ borderColor: "#b91c1c", color: "#b91c1c" }}
                onClick={() => deleteAdminClaim(Number(adminClaimDetail.claim.id))}
                disabled={adminClaimsUpdatingId === Number(adminClaimDetail.claim.id)}
              >
                Удалить
              </Button>
            )}
            <Button type="button" className="filter-button" onClick={() => setAdminClaimDetailId(null)}>Закрыть</Button>
          </Flex>
        </Flex>
        {adminClaimDetailLoading ? (
          <Flex align="center" gap="0.5rem">
            <Loader2 className="w-4 h-4 animate-spin" />
            <Typography.Body>Загрузка карточки...</Typography.Body>
          </Flex>
        ) : !adminClaimDetail?.claim ? (
          <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Данные не загружены</Typography.Body>
        ) : (
          <>
            <AdminClaimDetailInfoSection detail={adminClaimDetail} />
            <AdminClaimDetailResponseSection detail={adminClaimDetail} claims={claims} />
            {!isSuperAdmin && (
              <AdminClaimDetailDecisionSection detail={adminClaimDetail} claims={claims} />
            )}
            <AdminClaimDetailLeaderSection detail={adminClaimDetail} claims={claims} />
            <AdminClaimDetailTimelineSection detail={adminClaimDetail} />
          </>
        )}
      </div>
    </div>
  );
}
