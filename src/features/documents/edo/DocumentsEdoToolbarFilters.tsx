import React, { useRef } from "react";
import { Button, Typography } from "@maxhub/max-ui";
import { ChevronDown } from "lucide-react";
import { FilterDropdownPortal } from "../../../components/ui/FilterDropdownPortal";
import type { EdoCounterpartyFilter } from "../../../lib/edoCounterpartyStatus";

type Props = {
  edoCounterpartyFilter: EdoCounterpartyFilter;
  setEdoCounterpartyFilter: React.Dispatch<React.SetStateAction<EdoCounterpartyFilter>>;
  edoCounterpartyFilterLabel: string;
  isEdoCounterpartyDropdownOpen: boolean;
  setIsEdoCounterpartyDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onCloseOtherDropdowns: () => void;
};

export function DocumentsEdoToolbarFilters({
  edoCounterpartyFilter,
  setEdoCounterpartyFilter,
  edoCounterpartyFilterLabel,
  isEdoCounterpartyDropdownOpen,
  setIsEdoCounterpartyDropdownOpen,
  onCloseOtherDropdowns,
}: Props) {
  const edoCounterpartyButtonRef = useRef<HTMLDivElement | null>(null);

  return (
    <>
      <div ref={edoCounterpartyButtonRef} style={{ display: "inline-flex" }}>
        <Button
          className="filter-button"
          onClick={() => {
            onCloseOtherDropdowns();
            setIsEdoCounterpartyDropdownOpen(!isEdoCounterpartyDropdownOpen);
          }}
        >
          Контрагент: {edoCounterpartyFilterLabel} <ChevronDown className="w-4 h-4" />
        </Button>
      </div>
      <FilterDropdownPortal
        triggerRef={edoCounterpartyButtonRef}
        isOpen={isEdoCounterpartyDropdownOpen}
        onClose={() => setIsEdoCounterpartyDropdownOpen(false)}
      >
        <div
          className="dropdown-item"
          onClick={() => {
            setEdoCounterpartyFilter("all");
            setIsEdoCounterpartyDropdownOpen(false);
          }}
          style={{ background: edoCounterpartyFilter === "all" ? "var(--color-bg-hover)" : undefined }}
        >
          <Typography.Body>Все {edoCounterpartyFilter === "all" ? "✓" : ""}</Typography.Body>
        </div>
        <div
          className="dropdown-item"
          onClick={() => {
            setEdoCounterpartyFilter("with");
            setIsEdoCounterpartyDropdownOpen(false);
          }}
          style={{ background: edoCounterpartyFilter === "with" ? "var(--color-bg-hover)" : undefined }}
        >
          <Typography.Body>С ЭДО {edoCounterpartyFilter === "with" ? "✓" : ""}</Typography.Body>
        </div>
        <div
          className="dropdown-item"
          onClick={() => {
            setEdoCounterpartyFilter("without");
            setIsEdoCounterpartyDropdownOpen(false);
          }}
          style={{ background: edoCounterpartyFilter === "without" ? "var(--color-bg-hover)" : undefined }}
        >
          <Typography.Body>Без ЭДО {edoCounterpartyFilter === "without" ? "✓" : ""}</Typography.Body>
        </div>
      </FilterDropdownPortal>
    </>
  );
}
