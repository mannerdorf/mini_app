import React from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";

type Props = {
  open: boolean;
  submitting: boolean;
  error: string | null;
  periodFrom: string;
  periodTo: string;
  contract: string;
  contractOptions: string[];
  contractsLoading: boolean;
  onClose: () => void;
  onPeriodFromChange: (value: string) => void;
  onPeriodToChange: (value: string) => void;
  onContractChange: (value: string) => void;
  onSubmit: () => void;
};

export function SverkiOrderModal({
  open,
  submitting,
  error,
  periodFrom,
  periodTo,
  contract,
  contractOptions,
  contractsLoading,
  onClose,
  onPeriodFromChange,
  onPeriodToChange,
  onContractChange,
  onSubmit,
}: Props) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={() => !submitting && onClose()}
    >
      <div
        style={{
          width: "92%",
          maxWidth: 460,
          borderRadius: 12,
          background: "var(--color-bg-card, #fff)",
          padding: "1rem",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Typography.Body style={{ fontWeight: 600, marginBottom: "0.75rem" }}>Заказать Акт сверки</Typography.Body>
        <div style={{ display: "grid", gap: "0.55rem", marginBottom: "0.75rem" }}>
          <div>
            <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}>
              Период с
            </Typography.Body>
            <input
              type="date"
              className="admin-form-input"
              value={periodFrom}
              onChange={(e) => onPeriodFromChange(e.target.value)}
              style={{ width: "100%", padding: "0.45rem" }}
            />
          </div>
          <div>
            <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}>
              Период по
            </Typography.Body>
            <input
              type="date"
              className="admin-form-input"
              value={periodTo}
              onChange={(e) => onPeriodToChange(e.target.value)}
              style={{ width: "100%", padding: "0.45rem" }}
            />
          </div>
          <div>
            <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}>
              Договор
            </Typography.Body>
            <select
              className="admin-form-input"
              value={contract}
              onChange={(e) => onContractChange(e.target.value)}
              style={{ width: "100%", padding: "0.45rem" }}
              disabled={contractsLoading || contractOptions.length === 0}
            >
              {contractsLoading ? (
                <option value="">Загрузка договоров...</option>
              ) : contractOptions.length === 0 ? (
                <option value="">Нет договоров для выбранного заказчика</option>
              ) : (
                contractOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
        {error ? (
          <Typography.Body style={{ color: "#ef4444", fontSize: "0.78rem", marginBottom: "0.6rem" }}>{error}</Typography.Body>
        ) : null}
        <Flex justify="flex-end" gap="0.45rem" wrap="nowrap" style={{ flexWrap: "nowrap" }}>
          <Button
            className="filter-button"
            disabled={submitting}
            onClick={onClose}
            style={{ flex: 1, height: "3rem", marginTop: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            Отмена
          </Button>
          <Button
            className="button-primary"
            disabled={submitting}
            style={{ flex: 1, height: "3rem", marginTop: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            onClick={onSubmit}
          >
            {submitting ? "Заказываем..." : "Заказать"}
          </Button>
        </Flex>
      </div>
    </div>
  );
}
