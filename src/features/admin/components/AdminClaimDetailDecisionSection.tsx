import React from "react";
import { Button, Flex, Input, Typography } from "@maxhub/max-ui";
import { claimSectionStyle } from "../lib/adminClaimStatusStyles";
import type { AdminClaimsState } from "../hooks/useAdminClaims";

type Detail = NonNullable<AdminClaimsState["adminClaimDetail"]>;

export function AdminClaimDetailDecisionSection({ detail, claims }: { detail: Detail; claims: AdminClaimsState }) {
  const {
    adminClaimApprovedAmountDraft,
    setAdminClaimApprovedAmountDraft,
    adminClaimNoteDraft,
    adminLeaderCommentDraft,
    adminClaimMaxDamageAmount,
    adminClaimMaxDamageLoading,
    adminClaimsUpdatingId,
    updateAdminClaimStatus,
  } = claims;

  const claim = detail.claim!;

  return (
    <div style={claimSectionStyle}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.45rem" }}>Решение</Typography.Body>
      <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)", marginBottom: "0.45rem" }}>
        Максимальная сумма ущерба: {adminClaimMaxDamageLoading
          ? "расчет..."
          : adminClaimMaxDamageAmount == null
            ? "— рублей"
            : `${Number(adminClaimMaxDamageAmount).toLocaleString("ru-RU")} рублей`}
      </Typography.Body>
      <Flex gap="0.45rem" wrap="wrap" align="center">
        <Input
          type="number"
          className="admin-form-input"
          placeholder="Одобренная сумма"
          value={adminClaimApprovedAmountDraft}
          onChange={(e) => setAdminClaimApprovedAmountDraft(e.target.value)}
          style={{ maxWidth: 220, height: 44, boxSizing: "border-box" }}
        />
        <Button
          type="button"
          className="filter-button"
          style={{ background: "#10b981", color: "white", height: 44, minWidth: 220 }}
          onClick={() => updateAdminClaimStatus(
            claim.id,
            "approved",
            Number(adminClaimApprovedAmountDraft || 0),
            { managerNote: adminClaimNoteDraft.trim(), leaderComment: adminLeaderCommentDraft.trim() },
          )}
          disabled={adminClaimsUpdatingId === claim.id}
        >
          Утвердить решение
        </Button>
        <Button
          type="button"
          className="filter-button"
          style={{ background: "#ef4444", color: "white", height: 44, minWidth: 160 }}
          onClick={() => updateAdminClaimStatus(
            claim.id,
            "rejected",
            Number(adminClaimApprovedAmountDraft || 0),
            { managerNote: adminClaimNoteDraft.trim(), leaderComment: adminLeaderCommentDraft.trim() },
          )}
          disabled={adminClaimsUpdatingId === claim.id}
        >
          Отказать
        </Button>
      </Flex>
    </div>
  );
}
