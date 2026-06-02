import React, { useCallback, useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { Button, Typography } from "@maxhub/max-ui";
import type { AuthData } from "../../types";
import type { HaulzCarrier } from "../../lib/haulzReturns";
import {
  buildWriteoffInputs,
  collectFixRows,
  defaultProformaDraft,
  defaultSpecificationDraft,
  isHolzCarrier,
  poruchenieInputs,
  proformaPreviewRows,
  specificationPreviewRows,
  SPEC_EDITABLE_KEYS,
  type TdDraft,
  validateTdPrep,
} from "../../lib/haulzReturns";
import { downloadTdBlob, exportTdDocument } from "../../api/client/haulzReturnsTd";

type TabId = "specification" | "proforma" | "writeoff" | "poruchenie";

type Props = {
  auth: AuthData;
  jobId: string;
  workbook: HaulzWorkbook;
  carriers: HaulzCarrier[];
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

export function HaulzCustomsPanel({ auth, jobId, workbook, carriers, onDraftChange, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("specification");
  const [exporting, setExporting] = useState(false);
  const [activeWriteoffUl, setActiveWriteoffUl] = useState<string>("");

  const validationErrors = useMemo(() => validateTdPrep(workbook), [workbook]);
  const fixRows = useMemo(() => collectFixRows(workbook), [workbook]);
  const specDraft = useMemo(
    () => workbook.tdDraft?.specification ?? defaultSpecificationDraft(),
    [workbook.tdDraft?.specification],
  );
  const proformaDraft = useMemo(
    () => workbook.tdDraft?.proforma ?? defaultProformaDraft(),
    [workbook.tdDraft?.proforma],
  );

  const carriersById = useMemo(() => new Map(carriers.map((c) => [c.id, c])), [carriers]);

  const writeoffSheets = useMemo(
    () => buildWriteoffInputs({ workbook, carriersById, draft: workbook.tdDraft }),
    [workbook, carriersById],
  );

  const poruchenieList = useMemo(
    () => poruchenieInputs({ workbook, carriersById, draft: workbook.tdDraft }),
    [workbook, carriersById],
  );

  const specPreview = useMemo(() => specificationPreviewRows(fixRows), [fixRows]);
  const proformaPreview = useMemo(() => proformaPreviewRows(fixRows), [fixRows]);

  const activeWriteoff = writeoffSheets.find((s) => s.ulNumber === activeWriteoffUl) ?? writeoffSheets[0];

  const updateSpecField = useCallback(
    (key: string, value: string) => {
      void onDraftChange({
        ...workbook.tdDraft,
        specification: { ...specDraft, [key]: value },
      });
    },
    [onDraftChange, specDraft, workbook.tdDraft],
  );

  const updateProformaField = useCallback(
    (key: string, value: string) => {
      void onDraftChange({
        ...workbook.tdDraft,
        proforma: { ...proformaDraft, [key]: value },
      });
    },
    [onDraftChange, proformaDraft, workbook.tdDraft],
  );

  const handlePrepare = () => {
    if (validationErrors.length) {
      onError?.(validationErrors.join("\n"));
      return;
    }
    setOpen(true);
    if (writeoffSheets[0] && !activeWriteoffUl) setActiveWriteoffUl(writeoffSheets[0].ulNumber);
  };

  const handleExport = async (docType: TabId | "all") => {
    setExporting(true);
    try {
      const { blob, fileName } = await exportTdDocument(auth, jobId, docType, workbook.tdDraft);
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
        <Typography.Body style={{ fontWeight: 700, fontSize: "1rem" }}>
          <FileText className="w-4 h-4" style={{ display: "inline", verticalAlign: "middle", marginRight: "0.35rem" }} />
          Таможенное оформление
        </Typography.Body>
        <Button type="button" className="button-primary" disabled={exporting} onClick={handlePrepare}>
          Подготовить ТД
        </Button>
      </div>

      {open ? (
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
              <PreviewTable
                columns={["num", "id", "parcel", "name", "qty", "weight", "cost", "tdNumber", "ul"]}
                rows={specPreview.slice(0, 50)}
              />
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
              <PreviewTable
                columns={["num", "id", "parcel", "name", "qty", "weight", "cost", "ul"]}
                rows={proformaPreview.slice(0, 50)}
              />
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
                      columns={["num", "rowNum", "id", "parcel", "airport", "weight", "volume", "name", "qty", "cost"]}
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

function PreviewTable({ columns, rows }: { columns: string[]; rows: Record<string, unknown>[] }) {
  if (rows.length === 0) {
    return <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет данных</Typography.Body>;
  }
  return (
    <div className="hr-table-wrap" style={{ maxHeight: "320px", marginTop: "0.75rem" }}>
      <table className="hr-table">
        <thead>
          <tr className="hr-table__header-row">
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c}>{String(row[c] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
