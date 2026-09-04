import React from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@maxhub/max-ui";
import { resetAllAppFilters } from "../../lib/resetAppFilters";

type Props = {
  /** Дополнительный сброс локальных фильтров страницы. */
  onReset?: () => void;
  className?: string;
};

export function ResetAllFiltersButton({ onReset, className }: Props) {
  return (
    <Button
      type="button"
      className={`filter-button filters-reset-button ${className ?? ""}`.trim()}
      style={{
        padding: "0.5rem",
        minWidth: "auto",
        color: "#dc2626",
        borderColor: "#fecaca",
        flexShrink: 0,
      }}
      onClick={() => {
        resetAllAppFilters();
        onReset?.();
      }}
      title="Сбросить все фильтры"
      aria-label="Сбросить все фильтры"
    >
      <RotateCcw className="w-4 h-4" style={{ color: "#dc2626" }} aria-hidden />
    </Button>
  );
}
