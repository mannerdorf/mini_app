import React, { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Filter } from "lucide-react";
import type { HaulzColumn } from "../../lib/haulzReturns";
import { FilterDropdownPortal } from "../../components/ui/FilterDropdownPortal";
import { isColumnFilterActive } from "./columnFilterUtils";
import type { SortDirection } from "./columnSortUtils";

type Props = {
  col: HaulzColumn;
  uniqueValues: string[];
  selectedValues: Set<string> | null;
  onChange: (selected: Set<string> | null) => void;
  sortDirection?: SortDirection | null;
  onSortClick?: () => void;
};

export function HaulzColumnFilterHeader({
  col,
  uniqueValues,
  selectedValues,
  onChange,
  sortDirection = null,
  onSortClick,
}: Props) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const effectiveSelected = selectedValues ?? new Set(uniqueValues);
  const filterActive = isColumnFilterActive(col.key, { [col.key]: selectedValues }, uniqueValues);

  const visibleValues = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return uniqueValues;
    return uniqueValues.filter((v) => v.toLowerCase().includes(q));
  }, [uniqueValues, search]);

  const allVisibleChecked = visibleValues.length > 0 && visibleValues.every((v) => effectiveSelected.has(v));
  const someVisibleChecked = visibleValues.some((v) => effectiveSelected.has(v));

  const toggleValue = (value: string) => {
    const next = new Set(effectiveSelected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    if (next.size >= uniqueValues.length) onChange(null);
    else onChange(next);
  };

  const toggleAllVisible = () => {
    const next = new Set(effectiveSelected);
    if (allVisibleChecked) {
      for (const v of visibleValues) next.delete(v);
    } else {
      for (const v of visibleValues) next.add(v);
    }
    if (next.size >= uniqueValues.length) onChange(null);
    else onChange(next);
  };

  const clearFilter = () => {
    onChange(null);
    setOpen(false);
    setSearch("");
  };

  return (
    <div className="hr-col-header">
      <button
        type="button"
        className={`hr-col-sort${sortDirection ? " hr-col-sort--active" : ""}`}
        aria-label={
          sortDirection === "asc"
            ? `Сортировка по ${col.label}: по возрастанию`
            : sortDirection === "desc"
              ? `Сортировка по ${col.label}: по убыванию`
              : `Сортировать по ${col.label}`
        }
        onClick={(e) => {
          e.stopPropagation();
          onSortClick?.();
        }}
      >
        <span className="hr-col-sort__label">{col.label || col.key}</span>
        {sortDirection === "asc" ? (
          <ArrowUp className="hr-col-sort__icon" aria-hidden="true" />
        ) : sortDirection === "desc" ? (
          <ArrowDown className="hr-col-sort__icon" aria-hidden="true" />
        ) : (
          <span className="hr-col-sort__icon hr-col-sort__icon--idle" aria-hidden="true">
            ↕
          </span>
        )}
      </button>
      <FilterDropdownPortal triggerRef={triggerRef} isOpen={open} onClose={() => { setOpen(false); setSearch(""); }}>
        <div className="hr-col-filter-menu">
          <input
            type="search"
            className="hr-col-filter-menu__search"
            placeholder="Поиск…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
          <label className="hr-col-filter-menu__item hr-col-filter-menu__item--all">
            <input
              type="checkbox"
              checked={allVisibleChecked}
              ref={(el) => {
                if (el) el.indeterminate = !allVisibleChecked && someVisibleChecked;
              }}
              onChange={toggleAllVisible}
            />
            <span>Выбрать все</span>
          </label>
          <div className="hr-col-filter-menu__list">
            {visibleValues.map((value) => (
              <label key={value} className="hr-col-filter-menu__item">
                <input
                  type="checkbox"
                  checked={effectiveSelected.has(value)}
                  onChange={() => toggleValue(value)}
                />
                <span title={value}>{value}</span>
              </label>
            ))}
            {visibleValues.length === 0 ? (
              <div className="hr-col-filter-menu__empty">Нет значений</div>
            ) : null}
          </div>
          {filterActive ? (
            <button type="button" className="hr-col-filter-menu__clear" onClick={clearFilter}>
              Сбросить фильтр
            </button>
          ) : null}
        </div>
      </FilterDropdownPortal>
      <button
        ref={triggerRef}
        type="button"
        className={`hr-col-filter${filterActive ? " hr-col-filter--active" : ""}`}
        aria-label={`Фильтр: ${col.label || col.key}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Filter className="hr-col-filter__icon" aria-hidden="true" />
      </button>
    </div>
  );
}
