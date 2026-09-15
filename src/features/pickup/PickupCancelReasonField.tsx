import React, { useMemo, useState } from "react";
import {
  isPresetCancelReason,
  PICKUP_CANCEL_REASON_PRESETS,
} from "../../../lib/pickup/cancelReasonPresets";

const CUSTOM = "__custom__";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function PickupCancelReasonField({ value, onChange }: Props) {
  const trimmed = value.trim();
  const [customMode, setCustomMode] = useState(
    () => Boolean(trimmed) && !isPresetCancelReason(trimmed),
  );

  const selectValue = useMemo(() => {
    if (customMode) return CUSTOM;
    if (trimmed && isPresetCancelReason(trimmed)) return trimmed;
    return "";
  }, [customMode, trimmed]);

  return (
    <div className="pk-field pk-select-or-custom">
      <span>Причина отмены *</span>
      <select
        className="pk-select-or-custom__select"
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === CUSTOM) {
            setCustomMode(true);
            if (!trimmed || isPresetCancelReason(trimmed)) onChange("");
            return;
          }
          setCustomMode(false);
          onChange(v);
        }}
      >
        <option value="">— Выберите причину —</option>
        {PICKUP_CANCEL_REASON_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
        <option value={CUSTOM}>Свой вариант…</option>
      </select>
      {customMode && (
        <textarea
          rows={3}
          placeholder="Опишите причину отмены"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
