import React, { useRef } from "react";
import { Button, Typography } from "@maxhub/max-ui";
import { ChevronDown } from "lucide-react";
import { FilterDropdownPortal } from "../../../components/ui/FilterDropdownPortal";
import { stripOoo } from "../../../lib/formatUtils";

type Props = {
  effectiveServiceMode: boolean;
  dogovorsCustomerFilter: string;
  setDogovorsCustomerFilter: React.Dispatch<React.SetStateAction<string>>;
  uniqueDogovorsCustomers: string[];
  isDogovorsCustomerDropdownOpen: boolean;
  setIsDogovorsCustomerDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onCloseOtherDropdowns: () => void;
};

export function DocumentsDogovorsToolbarFilters({
  effectiveServiceMode,
  dogovorsCustomerFilter,
  setDogovorsCustomerFilter,
  uniqueDogovorsCustomers,
  isDogovorsCustomerDropdownOpen,
  setIsDogovorsCustomerDropdownOpen,
  onCloseOtherDropdowns,
}: Props) {
  const dogovorsCustomerButtonRef = useRef<HTMLDivElement | null>(null);

  if (!effectiveServiceMode) return null;

  return (
    <>
      <div ref={dogovorsCustomerButtonRef} style={{ display: "inline-flex" }}>
        <Button
          className="filter-button"
          onClick={() => {
            onCloseOtherDropdowns();
            setIsDogovorsCustomerDropdownOpen(!isDogovorsCustomerDropdownOpen);
          }}
        >
          Заказчик: {dogovorsCustomerFilter ? stripOoo(dogovorsCustomerFilter) : "Все"}{" "}
          <ChevronDown className="w-4 h-4" />
        </Button>
      </div>
      <FilterDropdownPortal
        triggerRef={dogovorsCustomerButtonRef}
        isOpen={isDogovorsCustomerDropdownOpen}
        onClose={() => setIsDogovorsCustomerDropdownOpen(false)}
      >
        <div
          className="dropdown-item"
          onClick={() => {
            setDogovorsCustomerFilter("");
            setIsDogovorsCustomerDropdownOpen(false);
          }}
        >
          <Typography.Body>Все</Typography.Body>
        </div>
        {uniqueDogovorsCustomers.map((c) => (
          <div
            key={c}
            className="dropdown-item"
            onClick={() => {
              setDogovorsCustomerFilter(c);
              setIsDogovorsCustomerDropdownOpen(false);
            }}
          >
            <Typography.Body>{stripOoo(c)}</Typography.Body>
          </div>
        ))}
      </FilterDropdownPortal>
    </>
  );
}
