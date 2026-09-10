import React from "react";
import { Plus } from "lucide-react";
import type { ParcelPlace } from "../../../lib/haulzCalculator/types";
import { HAULZ_BOX_PRESETS, boxPresetToPlace } from "../../../lib/haulzCalculator/boxPresets";
import { volumeM3FromCm } from "../../../lib/haulzCalculator/placeDimensions";

type Props = {
  places: ParcelPlace[];
  onChange: (next: ParcelPlace[]) => void;
  activePresetIdx: Record<number, string>;
  onPresetIdxChange: (next: Record<number, string>) => void;
  defaultNewPlace?: ParcelPlace;
  defaultNewPreset?: string;
};

function updateDim(
  places: ParcelPlace[],
  idx: number,
  field: "lengthCm" | "widthCm" | "heightCm",
  value: number,
): ParcelPlace[] {
  const next = [...places];
  const current = { ...next[idx], [field]: value };
  const lengthCm = Number(current.lengthCm) || 0;
  const widthCm = Number(current.widthCm) || 0;
  const heightCm = Number(current.heightCm) || 0;
  next[idx] = {
    ...current,
    volumeM3: volumeM3FromCm(lengthCm, widthCm, heightCm) || current.volumeM3,
  };
  return next;
}

export function ParcelPlaceEditor({
  places,
  onChange,
  activePresetIdx,
  onPresetIdxChange,
  defaultNewPlace = { weightKg: 10, volumeM3: 0.1, lengthCm: 40, widthCm: 40, heightCm: 50 },
  defaultNewPreset = "M",
}: Props) {
  return (
    <>
      {places.map((p, idx) => (
        <div key={idx} className="haulz-calc-place">
          <div className="haulz-calc-place__head">
            <span>Место {idx + 1}</span>
            {places.length > 1 && (
              <button
                type="button"
                className="haulz-calc-text-btn"
                onClick={() => onChange(places.filter((_, i) => i !== idx))}
              >
                Удалить
              </button>
            )}
          </div>
          <div className="haulz-calc-size-row">
            {HAULZ_BOX_PRESETS.map((b) => (
              <button
                key={b.label}
                type="button"
                className={`haulz-calc-size-chip${activePresetIdx[idx] === b.label ? " haulz-calc-size-chip--active" : ""}`}
                onClick={() => {
                  onPresetIdxChange({ ...activePresetIdx, [idx]: b.label });
                  const next = [...places];
                  next[idx] = boxPresetToPlace(b);
                  onChange(next);
                }}
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="haulz-calc-place-fields">
            <label className="haulz-calc-field">
              <span className="haulz-calc-label">Длина, см</span>
              <input
                type="number"
                className="haulz-calc-input"
                value={String(p.lengthCm ?? "")}
                onChange={(e) => onChange(updateDim(places, idx, "lengthCm", Number(e.target.value) || 0))}
              />
            </label>
            <label className="haulz-calc-field">
              <span className="haulz-calc-label">Ширина, см</span>
              <input
                type="number"
                className="haulz-calc-input"
                value={String(p.widthCm ?? "")}
                onChange={(e) => onChange(updateDim(places, idx, "widthCm", Number(e.target.value) || 0))}
              />
            </label>
            <label className="haulz-calc-field">
              <span className="haulz-calc-label">Высота, см</span>
              <input
                type="number"
                className="haulz-calc-input"
                value={String(p.heightCm ?? "")}
                onChange={(e) => onChange(updateDim(places, idx, "heightCm", Number(e.target.value) || 0))}
              />
            </label>
            <label className="haulz-calc-field">
              <span className="haulz-calc-label">Вес, кг</span>
              <input
                type="number"
                className="haulz-calc-input"
                value={String(p.weightKg)}
                onChange={(e) => {
                  const next = [...places];
                  next[idx] = { ...next[idx], weightKg: Number(e.target.value) || 0 };
                  onChange(next);
                }}
              />
            </label>
            <label className="haulz-calc-field">
              <span className="haulz-calc-label">Объём, м³</span>
              <input
                type="number"
                step="0.01"
                className="haulz-calc-input"
                readOnly
                value={String(p.volumeM3)}
              />
            </label>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="haulz-calc-link-btn"
        onClick={() => {
          const nextIdx = places.length;
          onChange([...places, defaultNewPlace]);
          onPresetIdxChange({ ...activePresetIdx, [nextIdx]: defaultNewPreset });
        }}
      >
        <Plus className="w-4 h-4" />
        Добавить место
      </button>
    </>
  );
}
