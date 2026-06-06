import React, { useState } from "react";
import { Loader2, Plus, Upload, FileText } from "lucide-react";
import type { ParcelPlace } from "../../../../lib/haulzCalculator/types";
import { parseUpdToTableRows, type OrderTableRow } from "./documentsOrderUpdParse";

const BOX_PRESETS: { label: string; weightKg: number; volumeM3: number }[] = [
  { label: "XS", weightKg: 1, volumeM3: 0.005 },
  { label: "S", weightKg: 3, volumeM3: 0.02 },
  { label: "M", weightKg: 10, volumeM3: 0.08 },
  { label: "L", weightKg: 25, volumeM3: 0.2 },
  { label: "XL", weightKg: 50, volumeM3: 0.5 },
];

const ATTACH_MODE = ["file", "upd"] as const;
type AttachMode = (typeof ATTACH_MODE)[number];

export type DocumentsOrderCargoState = {
  attachEnabled: boolean;
  attachMode: AttachMode | "";
  kolvoMest: string;
  fileZayavki: File | null;
  fileUpd: File | null;
  tableRows: OrderTableRow[];
  places: ParcelPlace[];
  activePresetIdx: Record<number, string>;
  declaredValue: string;
};

type Props = {
  state: DocumentsOrderCargoState;
  onChange: (next: DocumentsOrderCargoState) => void;
  chargeableHint: { w: number; v: number; volW: number; ch: number };
};

export function createDefaultCargoState(): DocumentsOrderCargoState {
  return {
    attachEnabled: false,
    attachMode: "",
    kolvoMest: "",
    fileZayavki: null,
    fileUpd: null,
    tableRows: [],
    places: [{ weightKg: 100, volumeM3: 0.5 }],
    activePresetIdx: { 0: "XL" },
    declaredValue: "",
  };
}

export function DocumentsOrderCargoSection({ state, onChange, chargeableHint }: Props) {
  const [createMestaLoading, setCreateMestaLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setPlaces = (updater: (prev: ParcelPlace[]) => ParcelPlace[]) => {
    onChange({ ...state, places: updater(state.places) });
  };

  const handleCreateMesta = async () => {
    const count = parseInt(state.kolvoMest, 10);
    if (!state.fileUpd) {
      setError("Загрузите файл УПД");
      return;
    }
    setCreateMestaLoading(true);
    setError(null);
    try {
      const rows = await parseUpdToTableRows(state.fileUpd, count);
      onChange({ ...state, tableRows: rows });
    } catch (e) {
      setError((e as Error)?.message || "Ошибка чтения файла УПД");
    } finally {
      setCreateMestaLoading(false);
    }
  };

  return (
    <div className="haulz-calc-card">
      <h2 className="haulz-calc-card__title">Груз</h2>

      <div className="haulz-calc-extra">
        <div className="haulz-calc-extra__text">
          <strong>Прикрепить заявку</strong>
          <span className="haulz-calc-extra__desc">УПД или файл загрузки для формирования мест</span>
        </div>
        <label className="haulz-calc-switch">
          <input
            type="checkbox"
            checked={state.attachEnabled}
            onChange={(e) =>
              onChange({
                ...state,
                attachEnabled: e.target.checked,
                attachMode: e.target.checked ? state.attachMode || "upd" : "",
                tableRows: e.target.checked ? state.tableRows : [],
              })
            }
          />
          <span className="haulz-calc-switch__track" />
        </label>
      </div>

      {state.attachEnabled ? (
        <div style={{ marginTop: "1rem" }}>
          <label className="haulz-calc-field">
            <span className="haulz-calc-label">Тип вложения</span>
            <select
              className="haulz-calc-input"
              value={state.attachMode}
              onChange={(e) =>
                onChange({
                  ...state,
                  attachMode: (e.target.value || "") as AttachMode | "",
                })
              }
            >
              <option value="">— Выберите —</option>
              <option value="upd">УПД (Excel)</option>
              <option value="file">Файл заявки</option>
            </select>
          </label>

          {state.attachMode === "file" && (
            <div style={{ marginTop: "0.75rem" }}>
              <label className="haulz-calc-file-btn">
                <Upload className="w-4 h-4" />
                {state.fileZayavki ? state.fileZayavki.name : "Загрузить файл"}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf"
                  onChange={(e) => onChange({ ...state, fileZayavki: e.target.files?.[0] ?? null })}
                  style={{ display: "none" }}
                />
              </label>
              <p className="haulz-calc-hint">Файл будет передан менеджеру при оформлении</p>
            </div>
          )}

          {state.attachMode === "upd" && (
            <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "var(--color-bg-hover)", borderRadius: 8 }}>
              <label className="haulz-calc-field">
                <span className="haulz-calc-label">Кол-во мест</span>
                <input
                  type="number"
                  min={1}
                  className="haulz-calc-input"
                  value={state.kolvoMest}
                  onChange={(e) => onChange({ ...state, kolvoMest: e.target.value })}
                  placeholder="Укажите кол-во мест"
                />
              </label>
              <label className="haulz-calc-file-btn" style={{ marginTop: "0.5rem" }}>
                <FileText className="w-4 h-4" />
                {state.fileUpd ? state.fileUpd.name : "Загрузить УПД"}
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => onChange({ ...state, fileUpd: e.target.files?.[0] ?? null })}
                  style={{ display: "none" }}
                />
              </label>
              <button
                type="button"
                className="haulz-calc-btn-secondary"
                style={{ marginTop: "0.5rem" }}
                onClick={() => void handleCreateMesta()}
                disabled={!state.kolvoMest || !state.fileUpd || createMestaLoading}
              >
                {createMestaLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Создать места
              </button>
            </div>
          )}

          {state.tableRows.length > 0 && (
            <div style={{ marginTop: "1rem", overflowX: "auto" }}>
              <p className="haulz-calc-label">Табличная часть ({state.tableRows.length} мест)</p>
              <table className="haulz-calc-mini-table">
                <thead>
                  <tr>
                    <th>N</th>
                    <th>Посылка</th>
                  </tr>
                </thead>
                <tbody>
                  {state.tableRows.map((row) => (
                    <tr key={row.n}>
                      <td>{row.n}</td>
                      <td>{row.posylka || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <>
          {state.places.map((p, idx) => (
            <div key={idx} className="haulz-calc-place">
              <div className="haulz-calc-place__head">
                <span>Место {idx + 1}</span>
                {state.places.length > 1 && (
                  <button
                    type="button"
                    className="haulz-calc-text-btn"
                    onClick={() => setPlaces((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    Удалить
                  </button>
                )}
              </div>
              <div className="haulz-calc-size-row">
                {BOX_PRESETS.map((b) => (
                  <button
                    key={b.label}
                    type="button"
                    className={`haulz-calc-size-chip${state.activePresetIdx[idx] === b.label ? " haulz-calc-size-chip--active" : ""}`}
                    onClick={() => {
                      onChange({
                        ...state,
                        activePresetIdx: { ...state.activePresetIdx, [idx]: b.label },
                        places: state.places.map((pl, i) =>
                          i === idx ? { weightKg: b.weightKg, volumeM3: b.volumeM3 } : pl,
                        ),
                      });
                    }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              <div className="haulz-calc-place-fields">
                <label className="haulz-calc-field">
                  <span className="haulz-calc-label">Вес, кг</span>
                  <input
                    type="number"
                    className="haulz-calc-input"
                    value={String(p.weightKg)}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 0;
                      setPlaces((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], weightKg: v };
                        return next;
                      });
                    }}
                  />
                </label>
                <label className="haulz-calc-field">
                  <span className="haulz-calc-label">Объём, м³</span>
                  <input
                    type="number"
                    step="0.01"
                    className="haulz-calc-input"
                    value={String(p.volumeM3)}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 0;
                      setPlaces((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], volumeM3: v };
                        return next;
                      });
                    }}
                  />
                </label>
              </div>
            </div>
          ))}

          <button
            type="button"
            className="haulz-calc-link-btn"
            onClick={() => {
              const nextIdx = state.places.length;
              onChange({
                ...state,
                places: [...state.places, { weightKg: 10, volumeM3: 0.1 }],
                activePresetIdx: { ...state.activePresetIdx, [nextIdx]: "M" },
              });
            }}
          >
            <Plus className="w-4 h-4" />
            Добавить место
          </button>

          <p className="haulz-calc-place-note">
            Вес {chargeableHint.w.toFixed(0)} кг · объём {chargeableHint.v.toFixed(2)} м³ · объёмный вес{" "}
            {chargeableHint.volW.toFixed(0)} кг · <strong>платный вес {chargeableHint.ch.toFixed(0)} кг</strong>
          </p>

          <label className="haulz-calc-field" style={{ marginTop: "1rem" }}>
            <span className="haulz-calc-label">Объявленная стоимость, ₽</span>
            <input
              type="number"
              className="haulz-calc-input"
              placeholder="Необязательно"
              value={state.declaredValue}
              onChange={(e) => onChange({ ...state, declaredValue: e.target.value })}
            />
          </label>
        </>
      )}

      {error && <p className="haulz-calc-hint haulz-calc-hint--error">{error}</p>}
    </div>
  );
}
