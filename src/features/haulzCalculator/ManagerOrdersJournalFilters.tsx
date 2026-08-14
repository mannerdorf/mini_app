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

export function ManagerOrdersJournalFilters({ filters, onChange, options }: Props) {
  const set = (patch: Partial<ManagerJournalFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className="haulz-calc-manager-journal-filters">
      <label className="haulz-calc-manager-journal-filters__field">
        Дата заявки
        <input
          type="date"
          className="haulz-calc-manager-journal-filters__control"
          value={filters.orderDate}
          onChange={(e) => set({ orderDate: e.target.value })}
        />
      </label>
      <label className="haulz-calc-manager-journal-filters__field">
        Дата забора
        <input
          type="date"
          className="haulz-calc-manager-journal-filters__control"
          value={filters.pickupDate}
          onChange={(e) => set({ pickupDate: e.target.value })}
        />
      </label>
      <label className="haulz-calc-manager-journal-filters__field">
        Заказчик
        <select
          className="haulz-calc-manager-journal-filters__control"
          value={filters.customer}
          onChange={(e) => set({ customer: e.target.value })}
        >
          <option value="">Все</option>
          {options.customers.map((value) => (
            <option key={value} value={value}>
              {stripOoo(value)}
            </option>
          ))}
        </select>
      </label>
      <label className="haulz-calc-manager-journal-filters__field">
        Отправитель
        <select
          className="haulz-calc-manager-journal-filters__control"
          value={filters.sender}
          onChange={(e) => set({ sender: e.target.value })}
        >
          <option value="">Все</option>
          {options.senders.map((value) => (
            <option key={value} value={value}>
              {stripOoo(value)}
            </option>
          ))}
        </select>
      </label>
      <label className="haulz-calc-manager-journal-filters__field">
        Получатель
        <select
          className="haulz-calc-manager-journal-filters__control"
          value={filters.receiver}
          onChange={(e) => set({ receiver: e.target.value })}
        >
          <option value="">Все</option>
          {options.receivers.map((value) => (
            <option key={value} value={value}>
              {stripOoo(value)}
            </option>
          ))}
        </select>
      </label>
      <label className="haulz-calc-manager-journal-filters__field">
        Маршрут
        <select
          className="haulz-calc-manager-journal-filters__control"
          value={filters.route}
          onChange={(e) => set({ route: e.target.value })}
        >
          <option value="">Все</option>
          {options.routes.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label className="haulz-calc-manager-journal-filters__field">
        Статус
        <select
          className="haulz-calc-manager-journal-filters__control"
          value={filters.status}
          onChange={(e) => set({ status: e.target.value })}
        >
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
          className="haulz-calc-btn-secondary haulz-calc-manager-journal-filters__reset"
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
