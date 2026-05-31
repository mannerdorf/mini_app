import React, { useRef } from "react";
import { Button, Typography } from "@maxhub/max-ui";
import { ChevronDown } from "lucide-react";
import { FilterDropdownPortal } from "../../../components/ui/FilterDropdownPortal";
import { stripOoo } from "../../../lib/formatUtils";
import { CLAIM_STATUS_LABELS, type ClaimStatusKey } from "./claimStatusConstants";

type CloseOtherDropdowns = () => void;

type Props = {
  effectiveServiceMode: boolean;
  claimsStatusFilter: string;
  setClaimsStatusFilter: React.Dispatch<React.SetStateAction<string>>;
  claimsCustomerFilter: string;
  setClaimsCustomerFilter: React.Dispatch<React.SetStateAction<string>>;
  uniqueClaimsCustomers: string[];
  isClaimsStatusDropdownOpen: boolean;
  setIsClaimsStatusDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isClaimsCustomerDropdownOpen: boolean;
  setIsClaimsCustomerDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  closeOtherDropdowns: CloseOtherDropdowns;
};

export function ClaimsToolbarFilters({
  effectiveServiceMode,
  claimsStatusFilter,
  setClaimsStatusFilter,
  claimsCustomerFilter,
  setClaimsCustomerFilter,
  uniqueClaimsCustomers,
  isClaimsStatusDropdownOpen,
  setIsClaimsStatusDropdownOpen,
  isClaimsCustomerDropdownOpen,
  setIsClaimsCustomerDropdownOpen,
  closeOtherDropdowns,
}: Props) {
  const claimsStatusButtonRef = useRef<HTMLDivElement | null>(null);
  const claimsCustomerButtonRef = useRef<HTMLDivElement | null>(null);

  const statusLabel =
    claimsStatusFilter === "all"
      ? "Все"
      : CLAIM_STATUS_LABELS[claimsStatusFilter as ClaimStatusKey] || "Все";

  return (
    <>
      {effectiveServiceMode && (
        <>
          <div ref={claimsCustomerButtonRef} style={{ display: "inline-flex" }}>
            <Button
              className="filter-button"
              onClick={() => {
                closeOtherDropdowns();
                setIsClaimsStatusDropdownOpen(false);
                setIsClaimsCustomerDropdownOpen((open) => !open);
              }}
            >
              Заказчик: {claimsCustomerFilter ? stripOoo(claimsCustomerFilter) : "Все"}{" "}
              <ChevronDown className="w-4 h-4" />
            </Button>
          </div>
          <FilterDropdownPortal
            triggerRef={claimsCustomerButtonRef}
            isOpen={isClaimsCustomerDropdownOpen}
            onClose={() => setIsClaimsCustomerDropdownOpen(false)}
          >
            <div
              className="dropdown-item"
              onClick={() => {
                setClaimsCustomerFilter("");
                setIsClaimsCustomerDropdownOpen(false);
              }}
            >
              <Typography.Body>Все</Typography.Body>
            </div>
            {uniqueClaimsCustomers.map((c) => (
              <div
                key={c}
                className="dropdown-item"
                onClick={() => {
                  setClaimsCustomerFilter(c);
                  setIsClaimsCustomerDropdownOpen(false);
                }}
              >
                <Typography.Body>{stripOoo(c)}</Typography.Body>
              </div>
            ))}
          </FilterDropdownPortal>
        </>
      )}
      <div ref={claimsStatusButtonRef} style={{ display: "inline-flex" }}>
        <Button
          className="filter-button"
          onClick={() => {
            closeOtherDropdowns();
            setIsClaimsCustomerDropdownOpen(false);
            setIsClaimsStatusDropdownOpen((open) => !open);
          }}
        >
          Статус: {statusLabel}
          <ChevronDown className="w-4 h-4" />
        </Button>
      </div>
      <FilterDropdownPortal
        triggerRef={claimsStatusButtonRef}
        isOpen={isClaimsStatusDropdownOpen}
        onClose={() => setIsClaimsStatusDropdownOpen(false)}
      >
        <div
          className="dropdown-item"
          onClick={() => {
            setClaimsStatusFilter("all");
            setIsClaimsStatusDropdownOpen(false);
          }}
        >
          <Typography.Body>Все</Typography.Body>
        </div>
        {Object.entries(CLAIM_STATUS_LABELS).map(([value, label]) => (
          <div
            key={value}
            className="dropdown-item"
            onClick={() => {
              setClaimsStatusFilter(value);
              setIsClaimsStatusDropdownOpen(false);
            }}
          >
            <Typography.Body>{label}</Typography.Body>
          </div>
        ))}
      </FilterDropdownPortal>
    </>
  );
}
