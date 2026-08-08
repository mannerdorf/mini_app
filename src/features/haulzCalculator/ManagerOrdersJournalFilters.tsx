import React from "react";
import { stripOoo } from "../../lib/formatUtils";
import {
  HAULZ_CALC_DRAFT_STATUS_LABELS,
  type HaulzCalcDraftStatus,
} from "../../../lib/haulzCalculator/draftStatus";
import type { ManagerJournalFilters } from "./filterManagerJournalRows";

type FilterOptions = {
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

const selectStyle: React.CSSProperties = {
  fontSize: "0.82rem",
  padding: "0.35rem 0.45rem",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "var(--color-bg-primary)",
  maxWidth: 180,
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.2rem",
  fontSize: "0.75rem",
  color: "var(--color-text-secondary)",
  fontWeight: 600,
};

export function ManagerOrdersJournalFilters({ filters, onChange, options }: Props) {
  const set = (patch: Partial<ManagerJournalFilters>) => onChange({ ...filters, ...patch });

  return (
    <div
      className="haulz-calc-manager-journal-filters"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.65rem",
        marginBottom: "0.75rem",
        alignItems: "flex-end",
      }}
    >
      <label style={labelStyle}>
        Дата заявки
        <input
          type="date"
          value={filters.orderDate}
          onChange={(e) => set({ orderDate: e.target.value })}
          style={selectStyle}
        />
      </label>
      <label style={labelStyle}>
        Дата забора
        <input
          type="date"
          value={filters.pickupDate}
          onChange={(e) => set({ pickupDate: e.target.value })}
          style={selectStyle}
        />
      </label>
      <label style={labelStyle}>
        Заказчик
        <select
          value={filters.customer}
          onChange={(e) => set({ customer: e.target.value })}
          style={selectStyle}
        >
          <option value="">Все</option>
          {options.customers.map((value) => (
            <option key={value} value={value}>
              {stripOoo(value)}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        Отправитель
        <select
          value={filters.sender}
          onChange={(e) => set({ sender: e.target.value })}
          style={selectStyle}
        >
          <option value="">Все</option>
          {options.senders.map((value) => (
            <option key={value} value={value}>
              {stripOoo(value)}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        Получатель
        <select
          value={filters.receiver}
          onChange={(e) => set({ receiver: e.target.value })}
          style={selectStyle}
        >
          <option value="">Все</option>
          {options.receivers.map((value) => (
            <option key={value} value={value}>
              {stripOoo(value)}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        Маршрут
        <select value={filters.route} onChange={(e) => set({ route: e.target.value })} style={selectStyle}>
          <option value="">Все</option>
          {options.routes.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        Статус
        <select value={filters.status} onChange={(e) => set({ status: e.target.value })} style={selectStyle}>
          <option value="">Все</option>
          {options.statuses.map((status) => (
            <option key={status} value={status}>
              {HAULZ_CALC_DRAFT_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </label>
      {(filters.orderDate ||
        filters.pickupDate ||
        filters.customer ||
        filters.sender ||
        filters.receiver ||
        filters.route ||
        filters.status) && (
        <button
          type="button"
          className="haulz-calc-btn-secondary"
          style={{ fontSize: "0.82rem", padding: "0.4rem 0.65rem" }}
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
        </button>
      )}
    </div>
  );
}
