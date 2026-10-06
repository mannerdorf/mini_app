import React, { useEffect, useState } from "react";

/** Текстовое поле сохраняет десятичную запятую и промежуточный ввод «0,». */
export function ParcelVolumeInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText((current) => Number(current.replace(",", ".")) === value ? current : String(value));
  }, [value]);
  return <>
    <input
      type="text"
      inputMode="decimal"
      className="haulz-calc-input"
      value={text}
      onChange={(e) => {
        const next = e.target.value;
        if (!/^\d*(?:[.,]\d*)?$/.test(next)) return;
        const parsed = Number(next.replace(",", "."));
        if (next !== "" && next !== "," && next !== "." && !Number.isFinite(parsed)) return;
        setText(next);
        onChange(Number.isFinite(parsed) ? parsed : 0);
      }}
      onBlur={() => setText(String(value))}
    />
    <small className="haulz-calc-place-note">Можно ввести вручную. При изменении габаритов объём пересчитается.</small>
  </>;
}
