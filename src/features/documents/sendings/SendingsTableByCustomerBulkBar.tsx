import React from "react";
import { Loader2 } from "lucide-react";
import { Button, Typography } from "@maxhub/max-ui";
import type { CounterpartySummaryRow } from "./sendingsByCustomerSummaryHelpers";

type Props = {
  sendingsSummaryGroupBy: "customer" | "receiver";
  selectedByCustomerCount: number;
  byCustomerActionLoading: boolean;
  byCustomerPlanDateOpen: boolean;
  setByCustomerPlanDateOpen: React.Dispatch<React.SetStateAction<boolean>>;
  byCustomerPlanDateValue: string;
  setByCustomerPlanDateValue: React.Dispatch<React.SetStateAction<string>>;
  byCustomerActionError: string | null;
  byCustomerActionInfo: string | null;
  selectedSummaryRows: CounterpartySummaryRow[];
  applyByCustomerPlanDate: (cargoNumbers: string[], groupBy: "customer" | "receiver") => void | Promise<void>;
};

export function SendingsTableByCustomerBulkBar(props: Props) {
  const {
    sendingsSummaryGroupBy,
    selectedByCustomerCount,
    byCustomerActionLoading,
    byCustomerPlanDateOpen,
    setByCustomerPlanDateOpen,
    byCustomerPlanDateValue,
    setByCustomerPlanDateValue,
    byCustomerActionError,
    byCustomerActionInfo,
    selectedSummaryRows,
    applyByCustomerPlanDate,
  } = props;

  return (
    <div
      className="cargo-card"
      style={{
        padding: "0.45rem 0.6rem",
        marginBottom: "0.5rem",
        overflow: "visible",
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "var(--color-bg-primary)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap" }}>
        <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
          Выбрано {sendingsSummaryGroupBy === "receiver" ? "получателей" : "заказчиков"}: {selectedByCustomerCount}
        </Typography.Body>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", position: "relative" }}>
          <Button
            type="button"
            className="filter-button"
            disabled={byCustomerActionLoading || selectedByCustomerCount === 0}
            onClick={() => setByCustomerPlanDateOpen((prev) => !prev)}
            style={{ minWidth: "auto", padding: "0.35rem 0.6rem" }}
          >
            {byCustomerActionLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: 4 }} /> : null}
            Плановая дата прибытия на терминал
          </Button>
          {byCustomerPlanDateOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0,
                zIndex: 12000,
                minWidth: 220,
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                background: "var(--color-bg-card)",
                boxShadow: "0 6px 18px rgba(0, 0, 0, 0.16)",
                padding: "0.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
              }}
            >
              <input
                type="date"
                value={byCustomerPlanDateValue}
                onChange={(e) => setByCustomerPlanDateValue(e.target.value)}
                className="admin-form-input"
              />
              <Button
                type="button"
                className="button-primary"
                style={{ minWidth: "auto", padding: "0.35rem 0.55rem" }}
                disabled={byCustomerActionLoading || !byCustomerPlanDateValue}
                onClick={() => {
                  void applyByCustomerPlanDate(
                    selectedSummaryRows.flatMap((summary) => summary.cargoNumbers.map((cargo) => String(cargo).trim())),
                    sendingsSummaryGroupBy,
                  );
                }}
              >
                Записать
              </Button>
            </div>
          )}
        </div>
      </div>
      {(byCustomerActionError || byCustomerActionInfo) && (
        <Typography.Body
          style={{
            marginTop: "0.35rem",
            fontSize: "0.78rem",
            color: byCustomerActionError ? "var(--color-error)" : "var(--color-text-secondary)",
          }}
        >
          {byCustomerActionError || byCustomerActionInfo}
        </Typography.Body>
      )}
    </div>
  );
}
