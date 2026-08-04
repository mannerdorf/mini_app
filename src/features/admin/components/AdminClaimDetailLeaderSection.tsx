import React from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { claimSectionStyle } from "../lib/adminClaimStatusStyles";
import type { AdminClaimsState } from "../hooks/useAdminClaims";

type Detail = NonNullable<AdminClaimsState["adminClaimDetail"]>;

export function AdminClaimDetailLeaderSection({ detail, claims }: { detail: Detail; claims: AdminClaimsState }) {
  const {
    adminLeaderCommentDraft,
    setAdminLeaderCommentDraft,
    adminClaimApprovedAmountDraft,
    setAdminClaimApprovedAmountDraft,
    adminClaimsUpdatingId,
    updateAdminClaimStatus,
  } = claims;

  const claim = detail.claim!;

  return (
    <div style={claimSectionStyle}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.45rem" }}>Резолюция руководителя</Typography.Body>
      <textarea
        className="admin-form-input"
        rows={2}
        placeholder="Комментарий руководителя"
        value={adminLeaderCommentDraft}
        onChange={(e) => setAdminLeaderCommentDraft(e.target.value)}
        style={{ width: "100%", marginBottom: "0.45rem" }}
      />
      <div style={{ marginBottom: "0.45rem" }}>
        <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}>Удовлетворённая сумма</Typography.Body>
        <input
          type="number"
          className="admin-form-input"
          placeholder="0"
          min={0}
          step={0.01}
          value={adminClaimApprovedAmountDraft}
          onChange={(e) => setAdminClaimApprovedAmountDraft(e.target.value)}
          style={{ width: "100%", maxWidth: 200, padding: "0.35rem 0.45rem" }}
        />
      </div>
      <Flex gap="0.45rem" wrap="wrap" align="center">
        <Button
          type="button"
          className="filter-button"
          style={{ background: "#10b981", color: "white" }}
          onClick={() => updateAdminClaimStatus(claim.id, "approved", Number(adminClaimApprovedAmountDraft || 0), { leaderComment: adminLeaderCommentDraft.trim() })}
          disabled={adminClaimsUpdatingId === claim.id}
        >
          Удовлетворить
        </Button>
        <Button
          type="button"
          className="filter-button"
          style={{ background: "#f59e0b", color: "white" }}
          onClick={() => updateAdminClaimStatus(claim.id, "approved", Number(adminClaimApprovedAmountDraft || 0), { leaderComment: adminLeaderCommentDraft.trim() })}
          disabled={adminClaimsUpdatingId === claim.id}
        >
          Удовлетворить частично
        </Button>
        <Button
          type="button"
          className="filter-button"
          style={{ background: "#ef4444", color: "white" }}
          onClick={() => updateAdminClaimStatus(claim.id, "rejected", 0, { leaderComment: adminLeaderCommentDraft.trim() })}
          disabled={adminClaimsUpdatingId === claim.id}
        >
          Отказать
        </Button>
      </Flex>
    </div>
  );
}
