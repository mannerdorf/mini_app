import React, { useCallback, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button, Typography } from "@maxhub/max-ui";
import type { AuthData } from "../../types";
import type { HaulzCarrier, HaulzWorkbook, PreviewColumn, TdDraft } from "../../lib/haulzReturns";
import {
  buildWriteoffInputs,
  isHolzCarrier,
  poruchenieInputs,
  proformaPreviewRows,
  PROFORMA_PREVIEW_COLUMNS,
  specificationPreviewRows,
  SPEC_EDITABLE_KEYS,
  SPEC_PREVIEW_COLUMNS,
  WRITEOFF_PREVIEW_COLUMNS,
} from "../../lib/haulzReturns";
import { downloadTdBlob, exportTdDocument } from "../../api/client/haulzReturnsTd";

type TabId = "specification" | "proforma" | "writeoff" | "poruchenie";

type Props = {
  auth: AuthData;
  jobId: string;
  workbook: HaulzWorkbook;
  carriers: HaulzCarrier[];
  open: boolean;
  onDraftChange: (draft: TdDraft) => void | Promise<void>;
  onError?: (msg: string) => void;
};

const TAB_LABELS: Record<TabId, string> = {
  specification: "Спецификация",
  proforma: "Проформа",
  writeoff: "Лист списания",
  poruchenie: "Поручение",
};

const SPEC_LABELS: Record<string, string> = {
  productEaeu: "ТОВАР ЕАЭС",
  exportPermit: "ВЫВОЗ РАЗРЕШЕН",
  zpu: "01 ЗПУ №",
  fts: "02 ФТС №",
  title: "Заголовок документа",
  headerTd: "Номер ТД в шапке",
};

export function HaulzCustomsPanel({ auth, jobId, workbook, carriers, open, onDraftChange, onError }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("specification");
  const [exporting, setExporting] = useState(false);
  const [activeWriteoffUl, setActiveWriteoffUl] = useState<string>("");

  const prepared = workbook.tdPrepared;
  const carriersById = useMemo(() => new Map(carriers.map((c) => [c.id, c])), [carriers]);

  const specDraft = useMemo(
    () => prepared?.draft?.specification ?? workbook.tdDraft?.specification ?? {},
    [prepared?.draft?.specification, workbook.tdDraft?.specification],
  );
  const proformaDraft = useMemo(
    () => prepared?.draft?.proforma ?? workbook.tdDraft?.proforma ?? {},
    [prepared?.draft?.proforma, workbook.tdDraft?.proforma],
  );

  const fixRows = useMemo(() => prepared?.fixRows ?? [], [prepared?.fixRows]);

  const writeoffSheets = useMemo(
    () =>
      prepared
        ? buildWriteoffInputs({ workbook: { ...workbook, tdPrepared: prepared }, carriersById, draft: prepared.draft })
        : [],
    [workbook, carriersById, prepared],
  );

  const poruchenieList = useMemo(
    () =>
      prepared
        ? poruchenieInputs({ workbook: { ...workbook, tdPrepared: prepared }, carriersById, draft: prepared.draft })
        : [],
    [workbook, carriersById, prepared],
  );

  const specPreview = useMemo(() => specificationPreviewRows(fixRows), [fixRows]);
  const proformaPreview = useMemo(() => proformaPreviewRows(fixRows), [fixRows]);

  const activeWriteoff = writeoffSheets.find((s) => s.ulNumber === activeWriteoffUl) ?? writeoffSheets[0];

  const updateSpecField = useCallback(
    (key: string, value: string) => {
      void onDraftChange({
        ...prepared?.draft,
        ...workbook.tdDraft,
        specification: { ...specDraft, [key]: value },
      });
    },
    [onDraftChange, prepared?.draft, specDraft, workbook.tdDraft],
  );

  const updateProformaField = useCallback(
    (key: string, value: string) => {
      void onDraftChange({
        ...prepared?.draft,
        ...workbook.tdDraft,
        proforma: { ...proformaDraft, [key]: value },
      });
    },
    [onDraftChange, prepared?.draft, proformaDraft, workbook.tdDraft],
  );

  const handleExport = async (docType: TabId | "all") => {
    if (!prepared) {
      onError?.("Сначала нажмите «Подготовить ТД» на вкладке итог.");
      return;
    }
    setExporting(true);
    try {
      const draft = { ...prepared.draft, ...workbook.tdDraft };
      const { blob, fileName } = await exportTdDocument(auth, jobId, docType, draft);
      downloadTdBlob(blob, fileName);
    } catch (e: unknown) {
      onError?.((e as Error)?.message || "Ошибка выгрузки");
    } finally {
      setExporting(false);
    }
  };

  if (!workbook.sheets.some((s) => s.id === "fix")) return null;

  return (
    <div className="hr-customs-panel">
      <div className="hr-customs-panel__head">
        <Typography.Body style={{ fontWeight: 700, fontSize: "1rem" }}>Таможенное оформление</Typography.Body>
        {prepared ? (
          <Typography.Body style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>
            Собрано {new Date(prepared.preparedAt).toLocaleString("ru-RU")}
          </Typography.Body>
        ) : (
          <Typography.Body style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>
            Нажмите «Подготовить ТД» на вкладке итог
          </Typography.Body>
        )}
      </div>

      {open && prepared ? (
        <>
          <div className="hr-tabs hr-customs-panel__tabs">
            {(Object.keys(TAB_LABELS) as TabId[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`hr-tab-btn ${activeTab === tab ? "active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>

          <div className="hr-customs-panel__actions">
            <Button type="button" className="filter-button" disabled={exporting} onClick={() => void handleExport(activeTab)}>
              <Download className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
              Скачать
            </Button>
            <Button type="button" className="filter-button" disabled={exporting} onClick={() => void handleExport("all")}>
              Скачать всё (ZIP)
            </Button>
          </div>

          {activeTab === "specification" ? (
            <div className="hr-customs-panel__body">
              <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
                Редактируемые поля (красные в шаблоне)
              </Typography.Body>
              <div className="hr-customs-form">
                {SPEC_EDITABLE_KEYS.map((key) => (
                  <label key={key} className="hr-customs-form__field">
                    <span>{SPEC_LABELS[key] ?? key}</span>
                    <input
                      type="text"
                      value={specDraft[key] ?? ""}
                      onChange={(e) => updateSpecField(key, e.target.value)}
                    />
                  </label>
                ))}
              </div>
              <PreviewTable columns={SPEC_PREVIEW_COLUMNS} rows={specPreview.slice(0, 50)} />
              {specPreview.length > 50 ? (
                <Typography.Body style={{ color: "var(--color-text-secondary)", fontSize: "0.8rem" }}>
                  Показаны первые 50 из {specPreview.length} строк
                </Typography.Body>
              ) : null}
            </div>
          ) : null}

          {activeTab === "proforma" ? (
            <div className="hr-customs-panel__body">
              <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
                Все поля доступны для редактирования
              </Typography.Body>
              <div className="hr-customs-form">
                {Object.keys(proformaDraft).map((key) => (
                  <label key={key} className="hr-customs-form__field">
                    <span>{SPEC_LABELS[key] ?? key}</span>
                    <input
                      type="text"
                      value={proformaDraft[key] ?? ""}
                      onChange={(e) => updateProformaField(key, e.target.value)}
                    />
                  </label>
                ))}
              </div>
              <PreviewTable columns={PROFORMA_PREVIEW_COLUMNS} rows={proformaPreview.slice(0, 50)} />
            </div>
          ) : null}

          {activeTab === "writeoff" ? (
            <div className="hr-customs-panel__body">
              {writeoffSheets.length === 0 ? (
                <Typography.Body>Нет строк с «В итоге» = 1</Typography.Body>
              ) : (
                <>
                  <div className="hr-tabs">
                    {writeoffSheets.map((s) => (
                      <button
                        key={s.ulNumber}
                        type="button"
                        className={`hr-tab-btn ${activeWriteoff?.ulNumber === s.ulNumber ? "active" : ""}`}
                        onClick={() => setActiveWriteoffUl(s.ulNumber)}
                      >
                        {s.ulNumber}
                      </button>
                    ))}
                  </div>
                  {activeWriteoff ? (
                    <PreviewTable
                      columns={WRITEOFF_PREVIEW_COLUMNS}
                      rows={activeWriteoff.rows.slice(0, 50)}
                    />
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {activeTab === "poruchenie" ? (
            <div className="hr-customs-panel__body">
              {poruchenieList.length === 0 ? (
                <Typography.Body style={{ color: "var(--color-text-secondary)" }}>
                  Не требуется — все УЛ с перевозчиком Холз или без строк «В итоге».
                </Typography.Body>
              ) : (
                <ul className="hr-customs-list">
                  {poruchenieList.map((p) => (
                    <li key={p.ulNumber}>
                      УЛ {p.ulNumber} · {p.carrier.name} · лист списания №{p.writeoffNumber} · {p.rows.length} строк
                      {!isHolzCarrier(p.carrier) ? "" : " (Холз)"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function PreviewTable({ columns, rows }: { columns: PreviewColumn[]; rows: Record<string, unknown>[] }) {
  if (rows.length === 0) {
    return <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет данных</Typography.Body>;
  }
  return (
    <div className="hr-table-wrap" style={{ maxHeight: "320px", marginTop: "0.75rem" }}>
      <table className="hr-table">
        <thead>
          <tr className="hr-table__header-row">
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td key={col.key}>{String(row[col.key] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
