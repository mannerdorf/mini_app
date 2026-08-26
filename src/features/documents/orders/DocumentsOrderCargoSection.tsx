import React, { useEffect, useState } from "react";
import { Loader2, Plus, Upload, FileText } from "lucide-react";
import type { ParcelPlace } from "../../../../lib/haulzCalculator/types";
import type { Direction } from "../../../../lib/haulzCalculator/types";
import type { DocumentsAuthScope, DocumentsFivepostRow } from "../../../api/client/documentsOrder";
import { saveDocumentsFivepostRows, translateDocumentsFivepostBatch } from "../../../api/client/documentsOrder";
import { parseFivepostShipmentFile } from "../../../../lib/fivepost/parseShipmentXlsx";
import { parseUpdToTableRows, type OrderTableRow } from "./documentsOrderUpdParse";
import { allocateDocumentsSendingIds } from "../../../api/client/documentsOrder";

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
  fivepostRows: DocumentsFivepostRow[];
  fivepostBatchId: number | null;
  fivepostNeedsTranslation: number;
  places: ParcelPlace[];
  activePresetIdx: Record<number, string>;
  declaredValue: string;
};

type Props = {
  authScope: DocumentsAuthScope;
  direction: Direction;
  isFivepostCustomer: boolean;
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
    fivepostRows: [],
    fivepostBatchId: null,
    fivepostNeedsTranslation: 0,
    places: [{ weightKg: 100, volumeM3: 0.5 }],
    activePresetIdx: { 0: "XL" },
    declaredValue: "",
  };
}

function isExcelFile(file: File): boolean {
  const name = (file.name || "").toLowerCase();
  return name.endsWith(".xlsx") || name.endsWith(".xls");
}

function fivepostRowsToTableRows(rows: DocumentsFivepostRow[]): OrderTableRow[] {
  return rows.map((row, idx) => ({
    n: idx + 1,
    posylka: [row.omniBarcode, row.itemNameRu || row.itemName].filter(Boolean).join(" · "),
    otskanirvano: false,
    dataSkanirovaniya: "",
    perevozka: row.clientOrderNo || row.partnerOrderNo || "",
  }));
}

export function DocumentsOrderCargoSection({
  authScope,
  direction,
  isFivepostCustomer,
  state,
  onChange,
  chargeableHint,
}: Props) {
  const [createMestaLoading, setCreateMestaLoading] = useState(false);
  const [fileImportLoading, setFileImportLoading] = useState(false);
  const [translateLoading, setTranslateLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isFivepostCustomer || state.attachMode !== "file") return;
    onChange({
      ...state,
      attachMode: "upd",
      fileZayavki: null,
      fivepostRows: [],
      fivepostBatchId: null,
      fivepostNeedsTranslation: 0,
      tableRows: [],
    });
    setImportMessage(null);
    setError(null);
  }, [isFivepostCustomer, state.attachMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isFivepostCustomer || !state.fivepostRows.length) return;
    onChange({
      ...state,
      attachMode: "upd",
      fileZayavki: null,
      fivepostRows: [],
      fivepostBatchId: null,
      fivepostNeedsTranslation: 0,
      tableRows: [],
    });
    setImportMessage(null);
    setError(null);
  }, [isFivepostCustomer, state.fivepostRows.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const ids = await allocateDocumentsSendingIds(authScope, { count: rows.length });
      const withIds: OrderTableRow[] = rows.map((row, idx) => ({
        ...row,
        idOtpravleniya: ids[idx] || row.idOtpravleniya,
      }));
      onChange({ ...state, tableRows: withIds, fivepostRows: [], fivepostBatchId: null, fivepostNeedsTranslation: 0 });
    } catch (e) {
      setError((e as Error)?.message || "Ошибка чтения файла УПД");
    } finally {
      setCreateMestaLoading(false);
    }
  };

  const handleFileZayavki = async (file: File | null) => {
    if (!file) {
      onChange({
        ...state,
        fileZayavki: null,
        fivepostRows: [],
        fivepostBatchId: null,
        fivepostNeedsTranslation: 0,
        tableRows: [],
      });
      setImportMessage(null);
      setError(null);
      return;
    }

    onChange({
      ...state,
      fileZayavki: file,
      fivepostRows: [],
      fivepostBatchId: null,
      fivepostNeedsTranslation: 0,
      tableRows: [],
    });
    setImportMessage(null);
    setError(null);

    if (!isExcelFile(file)) {
      setImportMessage("Файл будет передан менеджеру при оформлении");
      return;
    }

    if (!isFivepostCustomer) {
      setImportMessage("Файл будет передан менеджеру при оформлении");
      return;
    }

    setFileImportLoading(true);
    try {
      setImportMessage("Читаем Excel…");
      const parsed = await parseFivepostShipmentFile(file);
      const previewRows: DocumentsFivepostRow[] = parsed.rows.map((row, idx) => ({
        lineNo: idx + 1,
        clientOrderNo: row.clientOrderNo,
        partnerOrderNo: row.partnerOrderNo,
        teBarcode: row.teBarcode,
        placesCount: row.placesCount,
        omniBarcode: row.omniBarcode,
        itemName: row.itemName,
        itemNameRu: row.itemName,
        unitCost: row.unitCost,
        totalCost: row.totalCost,
        weightG: row.weightG,
        lengthMm: row.lengthMm,
        widthMm: row.widthMm,
        heightMm: row.heightMm,
      }));
      onChange({
        ...state,
        fileZayavki: file,
        fivepostRows: previewRows,
        fivepostBatchId: null,
        fivepostNeedsTranslation: 0,
        tableRows: fivepostRowsToTableRows(previewRows),
      });
      setImportMessage(`Распознано ${previewRows.length} строк, сохранение в базу…`);

      const result = await saveDocumentsFivepostRows(authScope, {
        filename: file.name,
        route: direction,
        rows: parsed.rows,
      });
      const tableRows = fivepostRowsToTableRows(result.rows);
      onChange({
        ...state,
        fileZayavki: file,
        fivepostRows: result.rows,
        fivepostBatchId: result.batchId,
        fivepostNeedsTranslation: result.needsTranslationCount,
        tableRows,
      });
      setImportMessage(
        result.needsTranslationCount > 0
          ? `5 POST: ${result.rowCount} строк сохранено. Нажмите «Перевести названия» (${result.needsTranslationCount}).`
          : `5 POST: ${result.rowCount} строк сохранено, перевод не требуется.`,
      );
    } catch (e) {
      setError((e as Error)?.message || "Ошибка импорта файла 5 POST");
      onChange({
        ...state,
        fileZayavki: file,
        fivepostRows: [],
        fivepostBatchId: null,
        fivepostNeedsTranslation: 0,
        tableRows: [],
      });
    } finally {
      setFileImportLoading(false);
    }
  };

  const applyTranslateResult = (
    result: Awaited<ReturnType<typeof translateDocumentsFivepostBatch>>,
    batchId: number,
    baseState: DocumentsOrderCargoState,
  ) => {
    const tableRows = fivepostRowsToTableRows(result.rows);
    onChange({
      ...baseState,
      fivepostRows: result.rows,
      fivepostBatchId: batchId,
      fivepostNeedsTranslation: result.needsTranslationCount,
      tableRows,
    });
    setImportMessage(
      result.translatedCount > 0 && result.needsTranslationCount > 0
        ? `Переведено ${result.translatedCount} наименований. Не переведено: ${result.needsTranslationCount}. Нажмите «Перевести названия» ещё раз.`
        : result.translatedCount > 0
          ? `Переведено ${result.translatedCount} наименований.`
          : result.needsTranslationCount > 0
            ? `Перевод не выполнен (${result.needsTranslationCount} строк). Проверьте YANDEX_TRANSLATE_API_KEY на сервере API.`
            : "Перевод не требуется.",
    );
  };

  const runTranslateFivepost = async (batchId: number, baseState: DocumentsOrderCargoState = state) => {
    setTranslateLoading(true);
    setError(null);
    setImportMessage("Перевод названий, подождите 1–3 мин…");
    try {
      const result = await translateDocumentsFivepostBatch(authScope, batchId);
      applyTranslateResult(result, batchId, baseState);
    } catch (e) {
      setError((e as Error)?.message || "Ошибка перевода названий");
      setImportMessage(null);
    } finally {
      setTranslateLoading(false);
    }
  };

  const handleTranslateFivepost = async () => {
    if (!state.fivepostBatchId) return;
    await runTranslateFivepost(state.fivepostBatchId);
  };

  return (
    <div className="haulz-calc-card">
      <h2 className="haulz-calc-card__title">Груз</h2>

      <div className="haulz-calc-extra">
        <div className="haulz-calc-extra__text">
          <strong>Прикрепить заявку</strong>
          <span className="haulz-calc-extra__desc">
            {isFivepostCustomer
              ? "Файл 5 POST (Excel) или УПД для формирования мест"
              : "УПД или файл заявки для оформления"}
          </span>
        </div>
        <label className="haulz-calc-switch">
          <input
            type="checkbox"
            checked={state.attachEnabled}
            onChange={(e) =>
              onChange({
                ...state,
                attachEnabled: e.target.checked,
                attachMode: e.target.checked ? state.attachMode || (isFivepostCustomer ? "file" : "upd") : "",
                tableRows: e.target.checked ? state.tableRows : [],
                fivepostRows: e.target.checked ? state.fivepostRows : [],
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
                  tableRows: [],
                  fivepostRows: [],
                  fivepostBatchId: null,
                  fivepostNeedsTranslation: 0,
                  fileZayavki: null,
                  fileUpd: null,
                })
              }
            >
              <option value="">— Выберите —</option>
              {isFivepostCustomer && <option value="file">Файл заявки (5 POST)</option>}
              <option value="upd">УПД (Excel)</option>
            </select>
          </label>

          {state.attachMode === "file" && isFivepostCustomer && (
            <div style={{ marginTop: "0.75rem" }}>
              <label className="haulz-calc-file-btn">
                {fileImportLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {state.fileZayavki ? state.fileZayavki.name : "Загрузить файл"}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf"
                  disabled={fileImportLoading}
                  onChange={(e) => void handleFileZayavki(e.target.files?.[0] ?? null)}
                  style={{ display: "none" }}
                />
              </label>
              <p className="haulz-calc-hint">
                Excel 5 POST — сначала парсинг и таблица, затем кнопка «Перевести названия» (Yandex). PDF/CSV — только приложение.
              </p>
              {state.fivepostRows.length > 0 && state.fivepostNeedsTranslation > 0 && (
                <button
                  type="button"
                  className="haulz-calc-btn-secondary"
                  style={{ marginTop: "0.5rem" }}
                  disabled={translateLoading || !state.fivepostBatchId}
                  onClick={() => void handleTranslateFivepost()}
                >
                  {translateLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Перевести названия ({state.fivepostNeedsTranslation})
                </button>
              )}
              {translateLoading && (
                <p className="haulz-calc-hint" style={{ marginTop: "0.35rem" }}>
                  Перевод названий, подождите 1–3 мин…
                </p>
              )}
              {importMessage && (
                <p className="haulz-calc-hint" style={{ marginTop: "0.35rem" }}>
                  {importMessage}
                </p>
              )}
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

          {isFivepostCustomer && state.fivepostRows.length > 0 && (
            <div style={{ marginTop: "1rem", overflowX: "auto", maxHeight: "55vh", overflowY: "auto" }}>
              <p className="haulz-calc-label">5 POST ({state.fivepostRows.length} строк)</p>
              <table className="haulz-calc-mini-table" style={{ fontSize: "0.78rem" }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Заказ клиента</th>
                    <th>Заказ партнёра</th>
                    <th>ШК ТЕ</th>
                    <th>Мест</th>
                    <th>ШК OMNI</th>
                    <th>Наименование</th>
                    <th>RU</th>
                    <th>Цена</th>
                    <th>Сумма</th>
                    <th>Вес</th>
                    <th>Д×Ш×В</th>
                  </tr>
                </thead>
                <tbody>
                  {state.fivepostRows.map((r) => (
                    <tr key={r.lineNo}>
                      <td>{r.lineNo}</td>
                      <td>{r.clientOrderNo}</td>
                      <td>{r.partnerOrderNo}</td>
                      <td>{r.teBarcode}</td>
                      <td>{r.placesCount}</td>
                      <td>{r.omniBarcode}</td>
                      <td>{r.itemName}</td>
                      <td>{r.itemNameRu}</td>
                      <td>{r.unitCost ?? "—"}</td>
                      <td>{r.totalCost ?? "—"}</td>
                      <td>{r.weightG ?? "—"}</td>
                      <td>{[r.lengthMm, r.widthMm, r.heightMm].map((v) => v ?? "—").join("×")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {state.tableRows.length > 0 && state.fivepostRows.length === 0 && (
            <div style={{ marginTop: "1rem", overflowX: "auto" }}>
              <p className="haulz-calc-label">Табличная часть ({state.tableRows.length} мест)</p>
              <table className="haulz-calc-mini-table">
                <thead>
                  <tr>
                    <th>N</th>
                    <th>ИД отправления</th>
                    <th>Посылка</th>
                  </tr>
                </thead>
                <tbody>
                  {state.tableRows.map((row) => (
                    <tr key={row.n}>
                      <td>{row.n}</td>
                      <td style={{ fontFamily: "ui-monospace, monospace", whiteSpace: "nowrap" }}>
                        {row.idOtpravleniya || "—"}
                      </td>
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
