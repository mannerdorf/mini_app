import React, { useRef } from "react";
import { Button, Typography } from "@maxhub/max-ui";
import { ChevronDown } from "lucide-react";
import { FilterDropdownPortal } from "../../../components/ui/FilterDropdownPortal";
import { stripOoo } from "../../../lib/formatUtils";

type Props = {
  orderReceiverFilter: string;
  setOrderReceiverFilter: React.Dispatch<React.SetStateAction<string>>;
  orderSenderFilter: string;
  setOrderSenderFilter: React.Dispatch<React.SetStateAction<string>>;
  orderRouteFilter: string;
  setOrderRouteFilter: React.Dispatch<React.SetStateAction<string>>;
  uniqueOrderReceivers: string[];
  uniqueOrderSenders: string[];
  uniqueOrderRoutes: string[];
  isReceiverDropdownOpen: boolean;
  setIsReceiverDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isOrderSenderDropdownOpen: boolean;
  setIsOrderSenderDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isOrderRouteDropdownOpen: boolean;
  setIsOrderRouteDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onCloseOtherDropdowns: () => void;
};

export function DocumentsOrdersToolbarFilters({
  orderReceiverFilter,
  setOrderReceiverFilter,
  orderSenderFilter,
  setOrderSenderFilter,
  orderRouteFilter,
  setOrderRouteFilter,
  uniqueOrderReceivers,
  uniqueOrderSenders,
  uniqueOrderRoutes,
  isReceiverDropdownOpen,
  setIsReceiverDropdownOpen,
  isOrderSenderDropdownOpen,
  setIsOrderSenderDropdownOpen,
  isOrderRouteDropdownOpen,
  setIsOrderRouteDropdownOpen,
  onCloseOtherDropdowns,
}: Props) {
  const receiverButtonRef = useRef<HTMLDivElement | null>(null);
  const orderSenderButtonRef = useRef<HTMLDivElement | null>(null);
  const orderRouteButtonRef = useRef<HTMLDivElement | null>(null);

  return (
    <>
      <div ref={receiverButtonRef} style={{ display: "inline-flex" }}>
        <Button
          className="filter-button"
          onClick={() => {
            onCloseOtherDropdowns();
            setIsReceiverDropdownOpen(!isReceiverDropdownOpen);
            setIsOrderSenderDropdownOpen(false);
            setIsOrderRouteDropdownOpen(false);
          }}
        >
          Получатель: {orderReceiverFilter ? stripOoo(orderReceiverFilter) : "Все"} <ChevronDown className="w-4 h-4" />
        </Button>
      </div>
      <FilterDropdownPortal
        triggerRef={receiverButtonRef}
        isOpen={isReceiverDropdownOpen}
        onClose={() => setIsReceiverDropdownOpen(false)}
      >
        <div
          className="dropdown-item"
          onClick={() => {
            setOrderReceiverFilter("");
            setIsReceiverDropdownOpen(false);
          }}
        >
          <Typography.Body>Все</Typography.Body>
        </div>
        {uniqueOrderReceivers.map((receiver) => (
          <div
            key={receiver}
            className="dropdown-item"
            onClick={() => {
              setOrderReceiverFilter(receiver);
              setIsReceiverDropdownOpen(false);
            }}
          >
            <Typography.Body>{stripOoo(receiver)}</Typography.Body>
          </div>
        ))}
      </FilterDropdownPortal>
      <div ref={orderSenderButtonRef} style={{ display: "inline-flex" }}>
        <Button
          className="filter-button"
          onClick={() => {
            onCloseOtherDropdowns();
            setIsOrderSenderDropdownOpen(!isOrderSenderDropdownOpen);
            setIsReceiverDropdownOpen(false);
            setIsOrderRouteDropdownOpen(false);
          }}
        >
          Отправитель: {orderSenderFilter ? stripOoo(orderSenderFilter) : "Все"} <ChevronDown className="w-4 h-4" />
        </Button>
      </div>
      <FilterDropdownPortal
        triggerRef={orderSenderButtonRef}
        isOpen={isOrderSenderDropdownOpen}
        onClose={() => setIsOrderSenderDropdownOpen(false)}
      >
        <div
          className="dropdown-item"
          onClick={() => {
            setOrderSenderFilter("");
            setIsOrderSenderDropdownOpen(false);
          }}
        >
          <Typography.Body>Все</Typography.Body>
        </div>
        {uniqueOrderSenders.map((sender) => (
          <div
            key={sender}
            className="dropdown-item"
            onClick={() => {
              setOrderSenderFilter(sender);
              setIsOrderSenderDropdownOpen(false);
            }}
          >
            <Typography.Body>{stripOoo(sender)}</Typography.Body>
          </div>
        ))}
      </FilterDropdownPortal>
      <div ref={orderRouteButtonRef} style={{ display: "inline-flex" }}>
        <Button
          className="filter-button"
          onClick={() => {
            onCloseOtherDropdowns();
            setIsOrderRouteDropdownOpen(!isOrderRouteDropdownOpen);
            setIsReceiverDropdownOpen(false);
            setIsOrderSenderDropdownOpen(false);
          }}
        >
          Маршрут: {orderRouteFilter === "all" ? "Все" : orderRouteFilter} <ChevronDown className="w-4 h-4" />
        </Button>
      </div>
      <FilterDropdownPortal
        triggerRef={orderRouteButtonRef}
        isOpen={isOrderRouteDropdownOpen}
        onClose={() => setIsOrderRouteDropdownOpen(false)}
      >
        <div
          className="dropdown-item"
          onClick={() => {
            setOrderRouteFilter("all");
            setIsOrderRouteDropdownOpen(false);
          }}
        >
          <Typography.Body>Все</Typography.Body>
        </div>
        {uniqueOrderRoutes.map((route) => (
          <div
            key={route}
            className="dropdown-item"
            onClick={() => {
              setOrderRouteFilter(route);
              setIsOrderRouteDropdownOpen(false);
            }}
          >
            <Typography.Body>{route}</Typography.Body>
          </div>
        ))}
      </FilterDropdownPortal>
    </>
  );
}
