import React from "react";
import { Button, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { EOR_STATUS_OPTIONS, type EorStatus } from "./sendingsTypes";

type Props = {
  selectedCount: number;
  canEditEor: boolean;
  canEditPlanDate: boolean;
  canRunSanctionsCheck: boolean;
  actionLoading: boolean;
  eorMenuOpen: boolean;
  setEorMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  planDateOpen: boolean;
  setPlanDateOpen: React.Dispatch<React.SetStateAction<boolean>>;
  planDateValue: string;
  setPlanDateValue: React.Dispatch<React.SetStateAction<string>>;
  actionError: string | null;
  actionInfo: string | null;
  onApplyEorStatus: (status: EorStatus) => void;
  onApplyPlanDate: () => void;
  onApplySanctionsCheck: () => void;
};

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  zIndex: 12000,
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  background: "var(--color-bg-card)",
  boxShadow: "0 6px 18px rgba(0, 0, 0, 0.16)",
  padding: "0.35rem",
};

export function SendingsBulkActionsBar({
  selectedCount,
  canEditEor,
  canEditPlanDate,
  canRunSanctionsCheck,
  actionLoading,
  eorMenuOpen,
  setEorMenuOpen,
  planDateOpen,
  setPlanDateOpen,
  planDateValue,
  setPlanDateValue,
  actionError,
  actionInfo,
  onApplyEorStatus,
  onApplyPlanDate,
  onApplySanctionsCheck,
}: Props) {
  if (!canEditPlanDate && !canRunSanctionsCheck) return null;

  return (
    <div className="cargo-card sendings-bulk-actions-bar" style={{ overflow: "visible" }}>
      <div className="sendings-bulk-actions-bar__row">
        <Typography.Body
          className="sendings-bulk-actions-bar__label"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Выбрано отправок: {selectedCount}
        </Typography.Body>
        {canEditEor && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", position: "relative" }}>
            <Button
              type="button"
              className="filter-button"
              disabled={actionLoading || selectedCount === 0}
              onClick={() => {
                setPlanDateOpen(false);
                setEorMenuOpen((prev) => !prev);
              }}
              style={{ minWidth: "auto", padding: "0.35rem 0.6rem" }}
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: 4 }} /> : null}
              EOR
            </Button>
            {eorMenuOpen && (
              <div style={{ ...dropdownStyle, minWidth: 190 }}>
                {EOR_STATUS_OPTIONS.map((option, index) => (
                  <button
                    key={option.value}
                    type="button"
                    className="filter-button"
                    style={{
                      width: "100%",
                      justifyContent: "flex-start",
                      marginBottom: index < EOR_STATUS_OPTIONS.length - 1 ? "0.25rem" : undefined,
                    }}
                    onClick={() => onApplyEorStatus(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {canEditPlanDate && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", position: "relative" }}>
            <Button
              type="button"
              className="filter-button"
              disabled={actionLoading || selectedCount === 0}
              onClick={() => {
                setEorMenuOpen(false);
                setPlanDateOpen((prev) => !prev);
              }}
              style={{ minWidth: "auto", padding: "0.35rem 0.6rem" }}
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: 4 }} /> : null}
              Плановая дата прибытия на терминал
            </Button>
            {planDateOpen && (
              <div
                style={{
                  ...dropdownStyle,
                  minWidth: 220,
                  padding: "0.5rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.4rem",
                }}
              >
                <input
                  type="date"
                  value={planDateValue}
                  onChange={(e) => setPlanDateValue(e.target.value)}
                  className="admin-form-input"
                />
                <Button
                  type="button"
                  className="button-primary"
                  style={{ minWidth: "auto", padding: "0.35rem 0.55rem" }}
                  disabled={actionLoading || !planDateValue}
                  onClick={onApplyPlanDate}
                >
                  Записать
                </Button>
              </div>
            )}
          </div>
        )}
        {canRunSanctionsCheck && (
          <Button
            type="button"
            className="filter-button"
            disabled={selectedCount === 0}
            onClick={onApplySanctionsCheck}
            style={{ minWidth: "auto", padding: "0.35rem 0.6rem" }}
          >
            Санкции
          </Button>
        )}
      </div>
      {(actionError || actionInfo) && (
        <Typography.Body
          style={{
            marginTop: "0.35rem",
            fontSize: "0.78rem",
            color: actionError ? "var(--color-error)" : "var(--color-text-secondary)",
          }}
        >
          {actionError || actionInfo}
        </Typography.Body>
      )}
    </div>
  );
}
