import React, { useRef } from "react";
import { Button, Typography } from "@maxhub/max-ui";
import { ChevronDown } from "lucide-react";
import { FilterDropdownPortal } from "../../../components/ui/FilterDropdownPortal";

type Props = {
  transportFilter: string;
  setTransportFilter: React.Dispatch<React.SetStateAction<string>>;
  transportOptions: string[];
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  closeOtherDropdowns: () => void;
};

export function SendingsTransportFilter({
  transportFilter,
  setTransportFilter,
  transportOptions,
  isOpen,
  setIsOpen,
  searchQuery,
  setSearchQuery,
  closeOtherDropdowns,
}: Props) {
  const buttonRef = useRef<HTMLDivElement | null>(null);

  const close = () => {
    setIsOpen(false);
    setSearchQuery("");
  };

  const filteredOptions = transportOptions.filter(
    (v) => !searchQuery.trim() || v.toLowerCase().includes(searchQuery.trim().toLowerCase()),
  );

  return (
    <>
      <div ref={buttonRef} style={{ display: "inline-flex" }}>
        <Button
          className="filter-button"
          onClick={() => {
            closeOtherDropdowns();
            setIsOpen((open) => !open);
          }}
        >
          Транспортное средство: {transportFilter || "Все"} <ChevronDown className="w-4 h-4" />
        </Button>
      </div>
      <FilterDropdownPortal triggerRef={buttonRef} isOpen={isOpen} onClose={close}>
        <div className="dropdown-item" style={{ padding: "0.5rem" }} onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            placeholder="Поиск..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="filter-search-input"
            style={{
              width: "100%",
              padding: "0.35rem 0.5rem",
              borderRadius: 6,
              border: "1px solid var(--color-border)",
              fontSize: "0.875rem",
              outline: "none",
            }}
          />
        </div>
        <div
          className="dropdown-item"
          onClick={() => {
            setTransportFilter("");
            close();
          }}
        >
          <Typography.Body>Все</Typography.Body>
        </div>
        {filteredOptions.map((v) => (
          <div
            key={v}
            className="dropdown-item"
            onClick={() => {
              setTransportFilter(v);
              close();
            }}
          >
            <Typography.Body>{v}</Typography.Body>
          </div>
        ))}
      </FilterDropdownPortal>
    </>
  );
}
