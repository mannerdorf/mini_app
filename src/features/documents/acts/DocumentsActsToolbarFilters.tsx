import React, { useRef } from "react";
import { Button, Typography } from "@maxhub/max-ui";
import { ChevronDown } from "lucide-react";
import { FilterDropdownPortal } from "../../../components/ui/FilterDropdownPortal";
import { stripOoo } from "../../../lib/formatUtils";

type Props = {
  effectiveServiceMode: boolean;
  actCustomerFilter: string;
  setActCustomerFilter: React.Dispatch<React.SetStateAction<string>>;
  uniqueActCustomers: string[];
  isActCustomerDropdownOpen: boolean;
  setIsActCustomerDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onCloseOtherDropdowns: () => void;
};

export function DocumentsActsToolbarFilters({
  effectiveServiceMode,
  actCustomerFilter,
  setActCustomerFilter,
  uniqueActCustomers,
  isActCustomerDropdownOpen,
  setIsActCustomerDropdownOpen,
  onCloseOtherDropdowns,
}: Props) {
  const actCustomerButtonRef = useRef<HTMLDivElement | null>(null);

  if (!effectiveServiceMode) return null;

  return (
    <>
      <div ref={actCustomerButtonRef} style={{ display: "inline-flex" }}>
        <Button
          className="filter-button"
          onClick={() => {
            onCloseOtherDropdowns();
            setIsActCustomerDropdownOpen(!isActCustomerDropdownOpen);
          }}
        >
          Заказчик: {actCustomerFilter ? stripOoo(actCustomerFilter) : "Все"} <ChevronDown className="w-4 h-4" />
        </Button>
      </div>
      <FilterDropdownPortal
        triggerRef={actCustomerButtonRef}
        isOpen={isActCustomerDropdownOpen}
        onClose={() => setIsActCustomerDropdownOpen(false)}
      >
        <div
          className="dropdown-item"
          onClick={() => {
            setActCustomerFilter("");
            setIsActCustomerDropdownOpen(false);
          }}
        >
          <Typography.Body>Все</Typography.Body>
        </div>
        {uniqueActCustomers.map((c) => (
          <div
            key={c}
            className="dropdown-item"
            onClick={() => {
              setActCustomerFilter(c);
              setIsActCustomerDropdownOpen(false);
            }}
          >
            <Typography.Body>{stripOoo(c)}</Typography.Body>
          </div>
        ))}
      </FilterDropdownPortal>
    </>
  );
}
