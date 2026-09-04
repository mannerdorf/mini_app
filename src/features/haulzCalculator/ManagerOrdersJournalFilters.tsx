import React, { useRef, useState, useCallback } from "react";
import { Button, Typography } from "@maxhub/max-ui";
import { ChevronDown } from "lucide-react";
import { FilterDropdownPortal } from "../../components/ui/FilterDropdownPortal";
import { ResetAllFiltersButton } from "../../components/ui/ResetAllFiltersButton";
import { useResetAllFiltersListener } from "../../hooks/useResetAllFiltersListener";
import { stripOoo } from "../../lib/formatUtils";
import {
  HAULZ_CALC_DRAFT_STATUS_LABELS,
  type HaulzCalcDraftStatus,
} from "../../../lib/haulzCalculator/draftStatus";
import type { ManagerJournalFilters } from "./filterManagerJournalRows";
import { EMPTY_MANAGER_JOURNAL_FILTERS } from "./filterManagerJournalRows";
import { haulzCalcDraftStatusBadgeClass } from "./haulzCalcDraftStatusBadge";

type FilterOptions = {
  orderDates: string[];
  pickupDates: string[];
  customers: string[];
  senders: string[];
  receivers: string[];
  routes: string[];
  statuses: HaulzCalcDraftStatus[];
};

type Props = {
  filters: ManagerJournalFilters;
  onChange: (next: ManagerJournalFilters) => void;
  options: FilterOptions;
};

function formatFilterDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}.${month}.${year}`;
}

function FilterDropdownButton({
  label,
  valueLabel,
  isOpen,
  onToggle,
  onClose,
  children,
}: {
  label: string;
  valueLabel: string;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const triggerRef = useRef<HTMLDivElement | null>(null);

  return (
    <>
      <div ref={triggerRef} style={{ display: "inline-flex" }}>
        <Button className="filter-button" onClick={onToggle}>
          {label}: {valueLabel} <ChevronDown className="w-4 h-4" />
        </Button>
      </div>
      <FilterDropdownPortal triggerRef={triggerRef} isOpen={isOpen} onClose={onClose}>
        {children}
      </FilterDropdownPortal>
    </>
  );
}

export function ManagerOrdersJournalFilters({ filters, onChange, options }: Props) {
  const set = (patch: Partial<ManagerJournalFilters>) => onChange({ ...filters, ...patch });

  const [openKey, setOpenKey] = useState<string | null>(null);
  const closeAll = () => setOpenKey(null);
  const toggle = (key: string) => setOpenKey((prev) => (prev === key ? null : key));

  const resetJournalFilters = useCallback(() => {
    onChange(EMPTY_MANAGER_JOURNAL_FILTERS);
    closeAll();
  }, [onChange]);
  useResetAllFiltersListener(resetJournalFilters);

  const hasActiveFilters = Boolean(
    filters.orderDate ||
      filters.pickupDate ||
      filters.customer ||
      filters.sender ||
      filters.receiver ||
      filters.route ||
      filters.status,
  );

  return (
    <div className="filters-container filters-row-scroll haulz-calc-manager-journal-filters">
      <div className="filter-group" style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexShrink: 0 }}>
        <ResetAllFiltersButton onReset={resetJournalFilters} />
        <FilterDropdownButton
          label="Дата заявки"
          valueLabel={filters.orderDate ? formatFilterDate(filters.orderDate) : "Все"}
          isOpen={openKey === "orderDate"}
          onToggle={() => toggle("orderDate")}
          onClose={closeAll}
        >
          <div
            className="dropdown-item"
            onClick={() => {
              set({ orderDate: "" });
              closeAll();
            }}
          >
            <Typography.Body>Все</Typography.Body>
          </div>
          {options.orderDates.map((date) => (
            <div
              key={date}
              className="dropdown-item"
              onClick={() => {
                set({ orderDate: date });
                closeAll();
              }}
            >
              <Typography.Body>{formatFilterDate(date)}</Typography.Body>
            </div>
          ))}
        </FilterDropdownButton>

        <FilterDropdownButton
          label="Дата забора"
          valueLabel={filters.pickupDate ? formatFilterDate(filters.pickupDate) : "Все"}
          isOpen={openKey === "pickupDate"}
          onToggle={() => toggle("pickupDate")}
          onClose={closeAll}
        >
          <div
            className="dropdown-item"
            onClick={() => {
              set({ pickupDate: "" });
              closeAll();
            }}
          >
            <Typography.Body>Все</Typography.Body>
          </div>
          {options.pickupDates.map((date) => (
            <div
              key={date}
              className="dropdown-item"
              onClick={() => {
                set({ pickupDate: date });
                closeAll();
              }}
            >
              <Typography.Body>{formatFilterDate(date)}</Typography.Body>
            </div>
          ))}
        </FilterDropdownButton>

        <FilterDropdownButton
          label="Заказчик"
          valueLabel={filters.customer ? stripOoo(filters.customer) : "Все"}
          isOpen={openKey === "customer"}
          onToggle={() => toggle("customer")}
          onClose={closeAll}
        >
          <div
            className="dropdown-item"
            onClick={() => {
              set({ customer: "" });
              closeAll();
            }}
          >
            <Typography.Body>Все</Typography.Body>
          </div>
          {options.customers.map((value) => (
            <div
              key={value}
              className="dropdown-item"
              onClick={() => {
                set({ customer: value });
                closeAll();
              }}
            >
              <Typography.Body>{stripOoo(value)}</Typography.Body>
            </div>
          ))}
        </FilterDropdownButton>

        <FilterDropdownButton
          label="Отправитель"
          valueLabel={filters.sender ? stripOoo(filters.sender) : "Все"}
          isOpen={openKey === "sender"}
          onToggle={() => toggle("sender")}
          onClose={closeAll}
        >
          <div
            className="dropdown-item"
            onClick={() => {
              set({ sender: "" });
              closeAll();
            }}
          >
            <Typography.Body>Все</Typography.Body>
          </div>
          {options.senders.map((value) => (
            <div
              key={value}
              className="dropdown-item"
              onClick={() => {
                set({ sender: value });
                closeAll();
              }}
            >
              <Typography.Body>{stripOoo(value)}</Typography.Body>
            </div>
          ))}
        </FilterDropdownButton>

        <FilterDropdownButton
          label="Получатель"
          valueLabel={filters.receiver ? stripOoo(filters.receiver) : "Все"}
          isOpen={openKey === "receiver"}
          onToggle={() => toggle("receiver")}
          onClose={closeAll}
        >
          <div
            className="dropdown-item"
            onClick={() => {
              set({ receiver: "" });
              closeAll();
            }}
          >
            <Typography.Body>Все</Typography.Body>
          </div>
          {options.receivers.map((value) => (
            <div
              key={value}
              className="dropdown-item"
              onClick={() => {
                set({ receiver: value });
                closeAll();
              }}
            >
              <Typography.Body>{stripOoo(value)}</Typography.Body>
            </div>
          ))}
        </FilterDropdownButton>

        <FilterDropdownButton
          label="Маршрут"
          valueLabel={filters.route || "Все"}
          isOpen={openKey === "route"}
          onToggle={() => toggle("route")}
          onClose={closeAll}
        >
          <div
            className="dropdown-item"
            onClick={() => {
              set({ route: "" });
              closeAll();
            }}
          >
            <Typography.Body>Все</Typography.Body>
          </div>
          {options.routes.map((value) => (
            <div
              key={value}
              className="dropdown-item"
              onClick={() => {
                set({ route: value });
                closeAll();
              }}
            >
              <Typography.Body>{value}</Typography.Body>
            </div>
          ))}
        </FilterDropdownButton>

        <FilterDropdownButton
          label="Статус"
          valueLabel={
            filters.status
              ? HAULZ_CALC_DRAFT_STATUS_LABELS[filters.status as HaulzCalcDraftStatus]
              : "Все"
          }
          isOpen={openKey === "status"}
          onToggle={() => toggle("status")}
          onClose={closeAll}
        >
          <div
            className="dropdown-item"
            onClick={() => {
              set({ status: "" });
              closeAll();
            }}
          >
            <Typography.Body>Все</Typography.Body>
          </div>
          {options.statuses.map((status) => (
            <div
              key={status}
              className="dropdown-item haulz-calc-manager-journal-filters__status-option"
              onClick={() => {
                set({ status });
                closeAll();
              }}
            >
              <span className={`haulz-calc-requests-badge ${haulzCalcDraftStatusBadgeClass(status)}`}>
                {HAULZ_CALC_DRAFT_STATUS_LABELS[status]}
              </span>
            </div>
          ))}
        </FilterDropdownButton>

        {hasActiveFilters && (
          <Button
            type="button"
            className="filter-button"
            onClick={() =>
              onChange({
                orderDate: "",
                pickupDate: "",
                customer: "",
                sender: "",
                receiver: "",
                route: "",
                status: "",
              })
            }
          >
            Сбросить
          </Button>
        )}
      </div>
    </div>
  );
}
