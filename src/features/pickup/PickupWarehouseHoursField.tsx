import React, { useMemo, useState } from "react";
import {
  isPresetWarehouseHours,
  PICKUP_WAREHOUSE_HOURS_PRESETS,
} from "../../../lib/pickup/jobSiteInstructions";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function PickupWarehouseHoursField({ value, onChange }: Props) {
  const initialCustom = value && !isPresetWarehouseHours(value);
  const [customMode, setCustomMode] = useState(initialCustom);

  const selectValue = useMemo(() => {
    if (customMode) return "__custom__";
    if (value && isPresetWarehouseHours(value)) return value;
    return "";
  }, [customMode, value]);

  return (
    <div className="pk-field pk-warehouse-hours">
      <span>График склада отправителя: дни, часы, перерывы</span>
      <select
        className="pk-warehouse-hours__select"
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__custom__") {
            setCustomMode(true);
            if (!value || isPresetWarehouseHours(value)) onChange("");
            return;
          }
          setCustomMode(false);
          onChange(v);
        }}
      >
        <option value="">— Выберите график —</option>
        {PICKUP_WAREHOUSE_HOURS_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
        <option value="__custom__">Свой вариант…</option>
      </select>
      {customMode && (
        <input
          type="text"
          placeholder="Например: Пн–Чт 8:00–16:00, обед 12:00–13:00"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
