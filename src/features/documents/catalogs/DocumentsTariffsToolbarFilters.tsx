import React, { useRef } from "react";
import { Button, Typography } from "@maxhub/max-ui";
import { ChevronDown } from "lucide-react";
import { FilterDropdownPortal } from "../../../components/ui/FilterDropdownPortal";
import { stripOoo } from "../../../lib/formatUtils";
import { TariffTransportTypeIcon } from "../views/documentsViewBlocks";

type Props = {
  effectiveServiceMode: boolean;
  tariffsCustomerFilter: string;
  setTariffsCustomerFilter: React.Dispatch<React.SetStateAction<string>>;
  tariffsCustomerSearchQuery: string;
  setTariffsCustomerSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  tariffsRouteFilter: string;
  setTariffsRouteFilter: React.Dispatch<React.SetStateAction<string>>;
  tariffsTypeFilter: string;
  setTariffsTypeFilter: React.Dispatch<React.SetStateAction<string>>;
  uniqueTariffsCustomers: string[];
  uniqueTariffsRoutes: string[];
  uniqueTariffsTypes: string[];
  isTariffsCustomerDropdownOpen: boolean;
  setIsTariffsCustomerDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isTariffsRouteDropdownOpen: boolean;
  setIsTariffsRouteDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isTariffsTypeDropdownOpen: boolean;
  setIsTariffsTypeDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onCloseOtherDropdowns: () => void;
};

export function DocumentsTariffsToolbarFilters({
  effectiveServiceMode,
  tariffsCustomerFilter,
  setTariffsCustomerFilter,
  tariffsCustomerSearchQuery,
  setTariffsCustomerSearchQuery,
  tariffsRouteFilter,
  setTariffsRouteFilter,
  tariffsTypeFilter,
  setTariffsTypeFilter,
  uniqueTariffsCustomers,
  uniqueTariffsRoutes,
  uniqueTariffsTypes,
  isTariffsCustomerDropdownOpen,
  setIsTariffsCustomerDropdownOpen,
  isTariffsRouteDropdownOpen,
  setIsTariffsRouteDropdownOpen,
  isTariffsTypeDropdownOpen,
  setIsTariffsTypeDropdownOpen,
  onCloseOtherDropdowns,
}: Props) {
  const tariffsCustomerButtonRef = useRef<HTMLDivElement | null>(null);
  const tariffsRouteButtonRef = useRef<HTMLDivElement | null>(null);
  const tariffsTypeButtonRef = useRef<HTMLDivElement | null>(null);

  return (
    <>
      {effectiveServiceMode ? (
        <>
          <div ref={tariffsCustomerButtonRef} style={{ display: "inline-flex" }}>
            <Button
              className="filter-button"
              onClick={() => {
                onCloseOtherDropdowns();
                setIsTariffsCustomerDropdownOpen(!isTariffsCustomerDropdownOpen);
                setIsTariffsRouteDropdownOpen(false);
                setIsTariffsTypeDropdownOpen(false);
              }}
            >
              Заказчик: {tariffsCustomerFilter ? stripOoo(tariffsCustomerFilter) : "Все"}{" "}
              <ChevronDown className="w-4 h-4" />
            </Button>
          </div>
          <FilterDropdownPortal
            triggerRef={tariffsCustomerButtonRef}
            isOpen={isTariffsCustomerDropdownOpen}
            onClose={() => {
              setIsTariffsCustomerDropdownOpen(false);
              setTariffsCustomerSearchQuery("");
            }}
          >
            <div className="dropdown-item" style={{ padding: "0.5rem" }} onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                placeholder="Поиск заказчика..."
                value={tariffsCustomerSearchQuery}
                onChange={(e) => setTariffsCustomerSearchQuery(e.target.value)}
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
                setTariffsCustomerFilter("");
                setIsTariffsCustomerDropdownOpen(false);
                setTariffsCustomerSearchQuery("");
              }}
            >
              <Typography.Body>Все</Typography.Body>
            </div>
            {uniqueTariffsCustomers
              .filter(
                (c) =>
                  !tariffsCustomerSearchQuery.trim() ||
                  c.toLowerCase().includes(tariffsCustomerSearchQuery.trim().toLowerCase())
              )
              .map((customer) => (
                <div
                  key={customer}
                  className="dropdown-item"
                  onClick={() => {
                    setTariffsCustomerFilter(customer);
                    setIsTariffsCustomerDropdownOpen(false);
                    setTariffsCustomerSearchQuery("");
                  }}
                >
                  <Typography.Body>{stripOoo(customer)}</Typography.Body>
                </div>
              ))}
          </FilterDropdownPortal>
        </>
      ) : null}
      <div ref={tariffsRouteButtonRef} style={{ display: "inline-flex" }}>
        <Button
          className="filter-button"
          onClick={() => {
            onCloseOtherDropdowns();
            setIsTariffsRouteDropdownOpen(!isTariffsRouteDropdownOpen);
            setIsTariffsCustomerDropdownOpen(false);
            setIsTariffsTypeDropdownOpen(false);
          }}
        >
          Маршрут: {tariffsRouteFilter === "all" ? "Все" : tariffsRouteFilter}{" "}
          <ChevronDown className="w-4 h-4" />
        </Button>
      </div>
      <FilterDropdownPortal
        triggerRef={tariffsRouteButtonRef}
        isOpen={isTariffsRouteDropdownOpen}
        onClose={() => setIsTariffsRouteDropdownOpen(false)}
      >
        <div
          className="dropdown-item"
          onClick={() => {
            setTariffsRouteFilter("all");
            setIsTariffsRouteDropdownOpen(false);
          }}
        >
          <Typography.Body>Все</Typography.Body>
        </div>
        {uniqueTariffsRoutes.map((route) => (
          <div
            key={route}
            className="dropdown-item"
            onClick={() => {
              setTariffsRouteFilter(route);
              setIsTariffsRouteDropdownOpen(false);
            }}
          >
            <Typography.Body>{route}</Typography.Body>
          </div>
        ))}
      </FilterDropdownPortal>
      <div ref={tariffsTypeButtonRef} style={{ display: "inline-flex" }}>
        <Button
          className="filter-button"
          onClick={() => {
            onCloseOtherDropdowns();
            setIsTariffsTypeDropdownOpen(!isTariffsTypeDropdownOpen);
            setIsTariffsCustomerDropdownOpen(false);
            setIsTariffsRouteDropdownOpen(false);
          }}
        >
          Тип: {tariffsTypeFilter === "all" ? "Все" : tariffsTypeFilter}{" "}
          <ChevronDown className="w-4 h-4" />
        </Button>
      </div>
      <FilterDropdownPortal
        triggerRef={tariffsTypeButtonRef}
        isOpen={isTariffsTypeDropdownOpen}
        onClose={() => setIsTariffsTypeDropdownOpen(false)}
      >
        <div
          className="dropdown-item"
          onClick={() => {
            setTariffsTypeFilter("all");
            setIsTariffsTypeDropdownOpen(false);
          }}
        >
          <Typography.Body>Все</Typography.Body>
        </div>
        {uniqueTariffsTypes.map((type) => (
          <div
            key={type}
            className="dropdown-item"
            onClick={() => {
              setTariffsTypeFilter(type);
              setIsTariffsTypeDropdownOpen(false);
            }}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <TariffTransportTypeIcon transportType={type} size={18} />
            <Typography.Body>{type}</Typography.Body>
          </div>
        ))}
      </FilterDropdownPortal>
    </>
  );
}
