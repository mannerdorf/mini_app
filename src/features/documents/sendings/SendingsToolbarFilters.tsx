import React, { useRef } from "react";
import { Button, Typography } from "@maxhub/max-ui";
import { ChevronDown } from "lucide-react";
import { FilterDropdownPortal } from "../../../components/ui/FilterDropdownPortal";
import { routeKeyToCargoLabel, type RouteFilterKey } from "../../../lib/sharedListFilters";
import { STATUS_MAP } from "../../../lib/statusUtils";
import type { StatusFilter, TypeFilterKey } from "../../../types";

type CloseOtherDropdowns = () => void;

type Props = {
  typeFilterSet: Set<TypeFilterKey>;
  setTypeFilterSet: React.Dispatch<React.SetStateAction<Set<TypeFilterKey>>>;
  routeFilterSet: Set<RouteFilterKey>;
  setRouteFilterSet: React.Dispatch<React.SetStateAction<Set<RouteFilterKey>>>;
  deliveryStatusFilterSet: Set<StatusFilter>;
  setDeliveryStatusFilterSet: React.Dispatch<React.SetStateAction<Set<StatusFilter>>>;
  isTypeDropdownOpen: boolean;
  setIsTypeDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isRouteCargoDropdownOpen: boolean;
  setIsRouteCargoDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isDeliveryStatusDropdownOpen: boolean;
  setIsDeliveryStatusDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  closeOtherDropdowns: CloseOtherDropdowns;
};

export function SendingsToolbarFilters({
  typeFilterSet,
  setTypeFilterSet,
  routeFilterSet,
  setRouteFilterSet,
  deliveryStatusFilterSet,
  setDeliveryStatusFilterSet,
  isTypeDropdownOpen,
  setIsTypeDropdownOpen,
  isRouteCargoDropdownOpen,
  setIsRouteCargoDropdownOpen,
  isDeliveryStatusDropdownOpen,
  setIsDeliveryStatusDropdownOpen,
  closeOtherDropdowns,
}: Props) {
  const typeButtonRef = useRef<HTMLDivElement | null>(null);
  const routeCargoButtonRef = useRef<HTMLDivElement | null>(null);
  const deliveryStatusButtonRef = useRef<HTMLDivElement | null>(null);

  const closeAll = () => {
    setIsTypeDropdownOpen(false);
    setIsRouteCargoDropdownOpen(false);
    setIsDeliveryStatusDropdownOpen(false);
  };

  return (
    <>
      <div ref={typeButtonRef} style={{ display: "inline-flex" }}>
        <Button
          className="filter-button"
          onClick={() => {
            closeOtherDropdowns();
            setIsRouteCargoDropdownOpen(false);
            setIsDeliveryStatusDropdownOpen(false);
            setIsTypeDropdownOpen((open) => !open);
          }}
        >
          Тип:{" "}
          {typeFilterSet.size === 0
            ? "Все"
            : typeFilterSet.size === 2
              ? "Паром, Авто"
              : typeFilterSet.has("ferry")
                ? "Паром"
                : "Авто"}{" "}
          <ChevronDown className="w-4 h-4" />
        </Button>
      </div>
      <FilterDropdownPortal triggerRef={typeButtonRef} isOpen={isTypeDropdownOpen} onClose={() => setIsTypeDropdownOpen(false)}>
        <div
          className="dropdown-item"
          onClick={() => {
            setTypeFilterSet(new Set());
            closeAll();
          }}
        >
          <Typography.Body>Все</Typography.Body>
        </div>
        <div
          className="dropdown-item"
          onClick={(e) => {
            e.stopPropagation();
            setTypeFilterSet((prev) => {
              const next = new Set(prev);
              if (next.has("ferry")) next.delete("ferry");
              else next.add("ferry");
              return next;
            });
          }}
          style={{ background: typeFilterSet.has("ferry") ? "var(--color-bg-hover)" : undefined }}
        >
          <Typography.Body>Паром {typeFilterSet.has("ferry") ? "✓" : ""}</Typography.Body>
        </div>
        <div
          className="dropdown-item"
          onClick={(e) => {
            e.stopPropagation();
            setTypeFilterSet((prev) => {
              const next = new Set(prev);
              if (next.has("auto")) next.delete("auto");
              else next.add("auto");
              return next;
            });
          }}
          style={{ background: typeFilterSet.has("auto") ? "var(--color-bg-hover)" : undefined }}
        >
          <Typography.Body>Авто {typeFilterSet.has("auto") ? "✓" : ""}</Typography.Body>
        </div>
      </FilterDropdownPortal>
      <div ref={routeCargoButtonRef} style={{ display: "inline-flex" }}>
        <Button
          className="filter-button"
          onClick={() => {
            closeOtherDropdowns();
            setIsTypeDropdownOpen(false);
            setIsDeliveryStatusDropdownOpen(false);
            setIsRouteCargoDropdownOpen((open) => !open);
          }}
        >
          Маршрут:{" "}
          {routeFilterSet.size === 0
            ? "Все"
            : routeFilterSet.size === 2
              ? "Выбрано: 2"
              : routeKeyToCargoLabel([...routeFilterSet][0])}{" "}
          <ChevronDown className="w-4 h-4" />
        </Button>
      </div>
      <FilterDropdownPortal
        triggerRef={routeCargoButtonRef}
        isOpen={isRouteCargoDropdownOpen}
        onClose={() => setIsRouteCargoDropdownOpen(false)}
      >
        <div
          className="dropdown-item"
          onClick={() => {
            setRouteFilterSet(new Set());
            closeAll();
          }}
        >
          <Typography.Body>Все</Typography.Body>
        </div>
        {(["MSK-KGD", "KGD-MSK"] as const).map((key) => (
          <div
            key={key}
            className="dropdown-item"
            onClick={(e) => {
              e.stopPropagation();
              setRouteFilterSet((prev) => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              });
            }}
            style={{ background: routeFilterSet.has(key) ? "var(--color-bg-hover)" : undefined }}
          >
            <Typography.Body>
              {routeKeyToCargoLabel(key)} {routeFilterSet.has(key) ? "✓" : ""}
            </Typography.Body>
          </div>
        ))}
      </FilterDropdownPortal>
      <div ref={deliveryStatusButtonRef} style={{ display: "inline-flex" }}>
        <Button
          className="filter-button"
          onClick={() => {
            closeOtherDropdowns();
            setIsTypeDropdownOpen(false);
            setIsRouteCargoDropdownOpen(false);
            setIsDeliveryStatusDropdownOpen((open) => !open);
          }}
        >
          Статус перевозки:{" "}
          {deliveryStatusFilterSet.size === 0
            ? "Все"
            : deliveryStatusFilterSet.size === 1
              ? STATUS_MAP[[...deliveryStatusFilterSet][0]]
              : `Выбрано: ${deliveryStatusFilterSet.size}`}{" "}
          <ChevronDown className="w-4 h-4" />
        </Button>
      </div>
      <FilterDropdownPortal
        triggerRef={deliveryStatusButtonRef}
        isOpen={isDeliveryStatusDropdownOpen}
        onClose={() => setIsDeliveryStatusDropdownOpen(false)}
      >
        <div
          className="dropdown-item"
          onClick={() => {
            setDeliveryStatusFilterSet(new Set());
            closeAll();
          }}
        >
          <Typography.Body>Все</Typography.Body>
        </div>
        {(Object.keys(STATUS_MAP) as StatusFilter[])
          .filter((k) => k !== "favorites" && k !== "all")
          .map((key) => (
            <div
              key={key}
              className="dropdown-item"
              onClick={(e) => {
                e.stopPropagation();
                setDeliveryStatusFilterSet((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                });
              }}
              style={{ background: deliveryStatusFilterSet.has(key) ? "var(--color-bg-hover)" : undefined }}
            >
              <Typography.Body>
                {STATUS_MAP[key]} {deliveryStatusFilterSet.has(key) ? "✓" : ""}
              </Typography.Body>
            </div>
          ))}
      </FilterDropdownPortal>
    </>
  );
}
