export type ClaimStatusBadgeStyle = { background: string; color: string };

const CLAIM_STATUS_BADGE_STYLES: Record<string, ClaimStatusBadgeStyle> = {
  draft: { background: "rgba(148,163,184,0.2)", color: "#64748b" },
  new: { background: "rgba(59,130,246,0.15)", color: "#2563eb" },
  under_review: { background: "rgba(59,130,246,0.15)", color: "#2563eb" },
  waiting_docs: { background: "rgba(245,158,11,0.2)", color: "#d97706" },
  in_progress: { background: "rgba(59,130,246,0.2)", color: "#1d4ed8" },
  awaiting_leader: { background: "rgba(139,92,246,0.2)", color: "#7c3aed" },
  sent_to_accounting: { background: "rgba(6,182,212,0.2)", color: "#0891b2" },
  approved: { background: "rgba(34,197,94,0.2)", color: "#16a34a" },
  rejected: { background: "rgba(239,68,68,0.2)", color: "#dc2626" },
  paid: { background: "rgba(34,197,94,0.2)", color: "#16a34a" },
  offset: { background: "rgba(34,197,94,0.15)", color: "#15803d" },
  closed: { background: "rgba(148,163,184,0.2)", color: "#64748b" },
};

const CLAIM_EVENT_STATUS_BG: Record<string, string> = {
  draft: "rgba(148,163,184,0.2)",
  new: "rgba(59,130,246,0.15)",
  in_progress: "rgba(59,130,246,0.2)",
  waiting_docs: "rgba(245,158,11,0.2)",
  approved: "rgba(34,197,94,0.2)",
  rejected: "rgba(239,68,68,0.2)",
  paid: "rgba(34,197,94,0.2)",
  closed: "rgba(148,163,184,0.2)",
};

const CLAIM_EVENT_STATUS_COLOR: Record<string, string> = {
  draft: "#64748b",
  new: "#2563eb",
  in_progress: "#1d4ed8",
  waiting_docs: "#d97706",
  approved: "#16a34a",
  rejected: "#dc2626",
  paid: "#16a34a",
  closed: "#64748b",
};

export function getClaimStatusBadgeStyle(status: string): ClaimStatusBadgeStyle {
  return CLAIM_STATUS_BADGE_STYLES[status] ?? CLAIM_STATUS_BADGE_STYLES.draft;
}

export function getClaimEventStatusBadgeBg(statusKey: string): string {
  return CLAIM_EVENT_STATUS_BG[statusKey] ?? "rgba(148,163,184,0.2)";
}

export function getClaimEventStatusBadgeColor(statusKey: string): string {
  return CLAIM_EVENT_STATUS_COLOR[statusKey] ?? "#64748b";
}

export const claimSectionStyle = {
  marginBottom: "0.75rem",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  padding: "0.65rem",
} as const;

export const claimTimelineSectionStyle = {
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  padding: "0.65rem",
} as const;
