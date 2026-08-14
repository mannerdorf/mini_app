import React, { useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { FilterDropdownPortal } from "../../components/ui/FilterDropdownPortal";
import {
  HAULZ_CALC_DRAFT_STATUS_LABELS,
  MANAGER_JOURNAL_STATUSES,
  type HaulzCalcDraftStatus,
} from "../../../lib/haulzCalculator/draftStatus";
import { haulzCalcDraftStatusBadgeClass } from "./haulzCalcDraftStatusBadge";

type Props = {
  value: HaulzCalcDraftStatus;
  disabled?: boolean;
  loading?: boolean;
  onChange: (status: HaulzCalcDraftStatus) => void;
  className?: string;
};

export function ManagerJournalStatusSelect({
  value,
  disabled,
  loading,
  onChange,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`haulz-calc-manager-journal-status-select ${className ?? ""}`.trim()}
        disabled={disabled || loading}
        aria-label="Статус заявки"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        <span className={`haulz-calc-requests-badge ${haulzCalcDraftStatusBadgeClass(value)}`}>
          {HAULZ_CALC_DRAFT_STATUS_LABELS[value]}
        </span>
        <ChevronDown className="w-3.5 h-3.5 haulz-calc-manager-journal-status-select__chevron" />
        {loading && <Loader2 className="w-3 h-3 animate-spin haulz-calc-manager-journal-status-select__spinner" />}
      </button>
      <FilterDropdownPortal triggerRef={triggerRef} isOpen={open} onClose={() => setOpen(false)}>
        {MANAGER_JOURNAL_STATUSES.map((status) => (
          <div
            key={status}
            className="dropdown-item haulz-calc-manager-journal-status-select__option"
            role="option"
            aria-selected={status === value}
            onClick={(e) => {
              e.stopPropagation();
              onChange(status);
              setOpen(false);
            }}
          >
            <span className={`haulz-calc-requests-badge ${haulzCalcDraftStatusBadgeClass(status)}`}>
              {HAULZ_CALC_DRAFT_STATUS_LABELS[status]}
            </span>
          </div>
        ))}
      </FilterDropdownPortal>
    </>
  );
}
