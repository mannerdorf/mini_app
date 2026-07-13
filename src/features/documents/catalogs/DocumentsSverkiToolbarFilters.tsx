import React, { useRef } from "react";
import { Button, Typography } from "@maxhub/max-ui";
import { ChevronDown } from "lucide-react";
import { FilterDropdownPortal } from "../../../components/ui/FilterDropdownPortal";
import { stripOoo } from "../../../lib/formatUtils";

type Props = {
  effectiveServiceMode: boolean;
  sverkiCustomerFilter: string;
  setSverkiCustomerFilter: React.Dispatch<React.SetStateAction<string>>;
  uniqueSverkiCustomers: string[];
  isSverkiCustomerDropdownOpen: boolean;
  setIsSverkiCustomerDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onCloseOtherDropdowns: () => void;
};

export function DocumentsSverkiToolbarFilters({
  effectiveServiceMode,
  sverkiCustomerFilter,
  setSverkiCustomerFilter,
  uniqueSverkiCustomers,
  isSverkiCustomerDropdownOpen,
  setIsSverkiCustomerDropdownOpen,
  onCloseOtherDropdowns,
}: Props) {
  const sverkiCustomerButtonRef = useRef<HTMLDivElement | null>(null);

  if (!effectiveServiceMode) return null;

  return (
    <>
      <div ref={sverkiCustomerButtonRef} style={{ display: "inline-flex" }}>
        <Button
          className="filter-button"
          onClick={() => {
            onCloseOtherDropdowns();
            setIsSverkiCustomerDropdownOpen(!isSverkiCustomerDropdownOpen);
          }}
        >
          Заказчик: {sverkiCustomerFilter ? stripOoo(sverkiCustomerFilter) : "Все"}{" "}
          <ChevronDown className="w-4 h-4" />
        </Button>
      </div>
      <FilterDropdownPortal
        triggerRef={sverkiCustomerButtonRef}
        isOpen={isSverkiCustomerDropdownOpen}
        onClose={() => setIsSverkiCustomerDropdownOpen(false)}
      >
        <div
          className="dropdown-item"
          onClick={() => {
            setSverkiCustomerFilter("");
            setIsSverkiCustomerDropdownOpen(false);
          }}
        >
          <Typography.Body>Все</Typography.Body>
        </div>
        {uniqueSverkiCustomers.map((c) => (
          <div
            key={c}
            className="dropdown-item"
            onClick={() => {
              setSverkiCustomerFilter(c);
              setIsSverkiCustomerDropdownOpen(false);
            }}
          >
            <Typography.Body>{stripOoo(c)}</Typography.Body>
          </div>
        ))}
      </FilterDropdownPortal>
    </>
  );
}
