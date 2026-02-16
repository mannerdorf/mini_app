import React from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Loader2, Package } from "lucide-react";
import type { DateFilter } from "../types";
import { formatCurrency } from "../lib/formatUtils";

type CargoSummary = {
  sum: number;
  mest: number;
  pw: number;
  w: number;
  vol: number;
};

type CargoSummaryCardProps = {
  summary: CargoSummary;
  showSums: boolean;
  useServiceRequest: boolean;
};

export function CargoSummaryCard({
  summary,
  showSums,
  useServiceRequest,
}: CargoSummaryCardProps) {
  return (
    <div className="cargo-card mb-4" style={{ padding: "0.75rem" }}>
      <div className="summary-metrics">
        {showSums && (
          <Flex direction="column" align="center">
            <Typography.Label
              style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}
            >
              Сумма
            </Typography.Label>
            <Typography.Body style={{ fontWeight: 600, fontSize: "0.9rem" }}>
              {formatCurrency(summary.sum, true)}
            </Typography.Body>
          </Flex>
        )}
        <Flex direction="column" align="center">
          <Typography.Label
            style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}
          >
            Мест
          </Typography.Label>
          <Typography.Body style={{ fontWeight: 600, fontSize: "0.9rem" }}>
            {Math.round(summary.mest)}
          </Typography.Body>
        </Flex>
        <Flex direction="column" align="center">
          <Typography.Label
            style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}
          >
            Плат. вес
          </Typography.Label>
          <Typography.Body style={{ fontWeight: 600, fontSize: "0.9rem" }}>
            {Math.round(summary.pw)} кг
          </Typography.Body>
        </Flex>
        {useServiceRequest && (
          <>
            <Flex direction="column" align="center">
              <Typography.Label
                style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}
              >
                Вес
              </Typography.Label>
              <Typography.Body style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                {Math.round(summary.w)} кг
              </Typography.Body>
            </Flex>
            <Flex direction="column" align="center">
              <Typography.Label
                style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}
              >
                Объём
              </Typography.Label>
              <Typography.Body style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                {Math.round(summary.vol)} м³
              </Typography.Body>
            </Flex>
          </>
        )}
      </div>
    </div>
  );
}

type CargoStateBlocksProps = {
  loading: boolean;
  error?: string | null;
  hasItems: boolean;
  onRetry: () => void;
  onSetDateFilter: (value: DateFilter) => void;
};

export function CargoStateBlocks({
  loading,
  error,
  hasItems,
  onRetry,
  onSetDateFilter,
}: CargoStateBlocksProps) {
  return (
    <>
      {loading && (
        <Flex justify="center" className="text-center py-8">
          <Loader2 className="animate-spin w-6 h-6 mx-auto text-theme-primary" />
        </Flex>
      )}

      {!loading && error && (
        <Panel className="empty-state-card" style={{ marginBottom: "1rem" }}>
          <Flex direction="column" align="center">
            <Typography.Body
              style={{
                color: "var(--color-error)",
                textAlign: "center",
                marginBottom: "0.75rem",
              }}
            >
              {error}
            </Typography.Body>
            <Button className="filter-button" type="button" onClick={onRetry}>
              Повторить
            </Button>
          </Flex>
        </Panel>
      )}

      {!loading && !error && !hasItems && (
        <Panel className="empty-state-card">
          <Flex direction="column" align="center">
            <Package className="w-12 h-12 mx-auto mb-4 text-theme-secondary opacity-50" />
            <Typography.Body className="text-theme-secondary">Ничего не найдено</Typography.Body>
            <Typography.Body
              className="text-theme-secondary"
              style={{ fontSize: "0.85rem", marginTop: "0.25rem", textAlign: "center" }}
            >
              Попробуйте изменить период или сбросить фильтры
            </Typography.Body>
            <Flex
              style={{
                gap: "0.5rem",
                marginTop: "0.75rem",
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <Button
                className="filter-button"
                type="button"
                onClick={() => onSetDateFilter("месяц")}
                style={{ fontSize: "0.85rem", padding: "0.5rem 0.75rem" }}
              >
                За месяц
              </Button>
              <Button
                className="filter-button"
                type="button"
                onClick={() => onSetDateFilter("все")}
                style={{ fontSize: "0.85rem", padding: "0.5rem 0.75rem" }}
              >
                За всё время
              </Button>
            </Flex>
          </Flex>
        </Panel>
      )}
    </>
  );
}
