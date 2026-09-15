import React, { useMemo, useState } from "react";
import type { VehiclePresetOption } from "../../../lib/pickup/vehiclePresets";
import { isVehiclePresetValue } from "../../../lib/pickup/vehiclePresets";

const CUSTOM = "__custom__";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  presets: VehiclePresetOption[];
  required?: boolean;
  placeholder?: string;
  inputType?: "text" | "number";
  min?: string;
  step?: string;
};

export function PickupVehicleSelectOrCustomField({
  label,
  value,
  onChange,
  presets,
  required = false,
  placeholder,
  inputType = "text",
  min,
  step,
}: Props) {
  const trimmed = value?.trim() ?? "";
  const [customMode, setCustomMode] = useState(
    () => Boolean(trimmed) && !isVehiclePresetValue(presets, trimmed),
  );

  const selectValue = useMemo(() => {
    if (customMode) return CUSTOM;
    if (trimmed && isVehiclePresetValue(presets, trimmed)) return trimmed;
    return "";
  }, [customMode, trimmed, presets]);

  return (
    <div className="pk-field pk-select-or-custom">
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <select
        className="pk-select-or-custom__select"
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === CUSTOM) {
            setCustomMode(true);
            if (!trimmed || isVehiclePresetValue(presets, trimmed)) onChange("");
            return;
          }
          setCustomMode(false);
          onChange(v);
        }}
      >
        <option value="">— Выберите из списка —</option>
        {presets.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
        <option value={CUSTOM}>Свой вариант…</option>
      </select>
      {customMode && (
        <input
          type={inputType}
          required={required}
          min={min}
          step={step}
          placeholder={placeholder}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
