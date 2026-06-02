import React, { useCallback, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button, Typography } from "@maxhub/max-ui";
import type { AuthData } from "../../types";
import type { HaulzCarrier, HaulzWorkbook, TdDraft } from "../../lib/haulzReturns";
import {
  buildWriteoffInputs,
  poruchenieInputs,
  porucheniePreviewRows,
  proformaPreviewRows,
  PROFORMA_PREVIEW_COLUMNS,
  PORUCHENIE_PREVIEW_COLUMNS,
  specificationPreviewRows,
  SPEC_EDITABLE_KEYS,
  SPEC_PREVIEW_COLUMNS,
  computeProformaTotals,
  syncTitleDateFromFts,
  WRITEOFF_PREVIEW_COLUMNS,
} from "../../lib/haulzReturns";
import { downloadTdBlob, exportTdAllZip, exportTdDocument } from "../../api/client/haulzReturnsTd";
import { HaulzTdDraftField } from "./HaulzTdDraftField";
import { HaulzTdPreviewTable } from "./HaulzTdPreviewTable";

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
  const [activePoruchenieUl, setActivePoruchenieUl] = useState<string>("");

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
  const proformaSummary = useMemo(() => {
    if (fixRows.length === 0) return undefined;
    const totals = computeProformaTotals(fixRows);
    return {
      num: "",
      id: "",
      parcel: "",
      name: `Итого: грузовых мест ${totals.places}`,
      qty: totals.qty,
      weight: totals.weight,
      cost: totals.cost,
    };
  }, [fixRows]);

  const activeWriteoff = writeoffSheets.find((s) => s.ulNumber === activeWriteoffUl) ?? writeoffSheets[0];
  const activePoruchenie = poruchenieList.find((p) => p.ulNumber === activePoruchenieUl) ?? poruchenieList[0];

  const updateSpecField = useCallback(
    (key: string, value: string) => {
      let specification = { ...specDraft, [key]: value };
      if (key === "fts") {
        specification = {
          ...specification,
          title: syncTitleDateFromFts(specDraft.title ?? "", value),
        };
      }
      void onDraftChange({
        ...prepared?.draft,
        ...workbook.tdDraft,
        specification,
      });
    },
    [onDraftChange, prepared?.draft, specDraft, workbook.tdDraft],
  );

  const updateProformaField = useCallback(
    (key: string, value: string) => {
      let proforma = { ...proformaDraft, [key]: value };
      if (key === "fts") {
        proforma = {
          ...proforma,
          title: syncTitleDateFromFts(proformaDraft.title ?? "", value),
        };
      }
      void onDraftChange({
        ...prepared?.draft,
        ...workbook.tdDraft,
        proforma,
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
      if (docType === "all") {
        const { blob, fileName } = await exportTdAllZip(auth, jobId, draft);
        downloadTdBlob(blob, fileName);
      } else {
        const { blob, fileName } = await exportTdDocument(auth, jobId, docType, draft);
        downloadTdBlob(blob, fileName);
      }
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
                  <HaulzTdDraftField
                    key={key}
                    fieldKey={key}
                    label={SPEC_LABELS[key] ?? key}
                    value={specDraft[key] ?? ""}
                    ftsValue={key === "title" ? specDraft.fts : undefined}
                    onChange={(v) => updateSpecField(key, v)}
                  />
                ))}
              </div>
              <HaulzTdPreviewTable tableId="td-spec" columns={SPEC_PREVIEW_COLUMNS} rows={specPreview} />
            </div>
          ) : null}

          {activeTab === "proforma" ? (
            <div className="hr-customs-panel__body">
              <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
                Все поля доступны для редактирования
              </Typography.Body>
              <div className="hr-customs-form">
                {Object.keys(proformaDraft).map((key) => (
                  <HaulzTdDraftField
                    key={key}
                    fieldKey={key}
                    label={SPEC_LABELS[key] ?? key}
                    value={proformaDraft[key] ?? ""}
                    ftsValue={key === "title" ? proformaDraft.fts : undefined}
                    onChange={(v) => updateProformaField(key, v)}
                  />
                ))}
              </div>
              <HaulzTdPreviewTable
                tableId="td-proforma"
                columns={PROFORMA_PREVIEW_COLUMNS}
                rows={proformaPreview}
                summaryRow={proformaSummary}
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
                    <HaulzTdPreviewTable
                      tableId={`td-writeoff-${activeWriteoff.ulNumber}`}
                      columns={WRITEOFF_PREVIEW_COLUMNS}
                      rows={activeWriteoff.rows}
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
                <>
                  <div className="hr-tabs">
                    {poruchenieList.map((p) => (
                      <button
                        key={p.ulNumber}
                        type="button"
                        className={`hr-tab-btn ${activePoruchenie?.ulNumber === p.ulNumber ? "active" : ""}`}
                        onClick={() => setActivePoruchenieUl(p.ulNumber)}
                      >
                        {p.ulNumber}
                      </button>
                    ))}
                  </div>
                  {activePoruchenie ? (
                    <>
                      <Typography.Body style={{ margin: "0.5rem 0", color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>
                        {activePoruchenie.carrier.name} · лист списания №{activePoruchenie.writeoffNumber} · ТД {activePoruchenie.tdNumber || "—"}
                      </Typography.Body>
                      <HaulzTdPreviewTable
                        tableId={`td-poruchenie-${activePoruchenie.ulNumber}`}
                        columns={PORUCHENIE_PREVIEW_COLUMNS}
                        rows={porucheniePreviewRows(activePoruchenie.rows)}
                      />
                    </>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
