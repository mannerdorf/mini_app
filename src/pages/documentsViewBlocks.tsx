import React from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { Loader2, AlertTriangle } from "lucide-react";
import { formatCurrency } from "../lib/formatUtils";

type SummaryProps = {
  sum: number;
  count: number;
  showSums: boolean;
};

export function DocumentsSummaryCard({ sum, count, showSums }: SummaryProps) {
  return (
    <div className="cargo-card mb-4" style={{ padding: "0.75rem", marginBottom: "1rem" }}>
      <div className="summary-metrics">
        {showSums && (
          <Flex direction="column" align="center">
            <Typography.Label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
              Сумма
            </Typography.Label>
            <Typography.Body style={{ fontWeight: 600, fontSize: "0.9rem" }}>
              {formatCurrency(sum)}
            </Typography.Body>
          </Flex>
        )}
        <Flex direction="column" align="center">
          <Typography.Label
            style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", visibility: "hidden" }}
          >
            —
          </Typography.Label>
          <Typography.Body style={{ fontWeight: 600, fontSize: "0.9rem" }}>{count}</Typography.Body>
        </Flex>
      </div>
    </div>
  );
}

type StateProps = {
  loading: boolean;
  error?: string | null;
  emptyText: string;
};

export function DocumentsStateBlocks({ loading, error, emptyText }: StateProps) {
  if (loading) {
    return (
      <Flex justify="center" className="py-8">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--color-primary-blue)" }} />
      </Flex>
    );
  }

  if (error) {
    return (
      <Flex align="center" className="mt-4" style={{ color: "var(--color-error)" }}>
        <AlertTriangle className="w-5 h-5 mr-2" />
        <Typography.Body>{error}</Typography.Body>
      </Flex>
    );
  }

  return (
    <Typography.Body style={{ color: "var(--color-text-secondary)", padding: "2rem 0" }}>
      {emptyText}
    </Typography.Body>
  );
}

