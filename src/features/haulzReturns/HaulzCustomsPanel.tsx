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
  collectFixRows,
  PROFORMA_PREVIEW_COLUMNS,
  PORUCHENIE_PREVIEW_COLUMNS,
  specificationPreviewRows,
  SPEC_PREVIEW_COLUMNS,
  computeProformaTotals,
  applyProformaFieldChange,
  applySpecificationFieldChange,
  syncProformaHeaderFromSpecification,
  mergeTdDraft,
  WRITEOFF_PREVIEW_COLUMNS,
  PORUCHENIE_MERGED_DRAFT_KEY,
} from "../../lib/haulzReturns";
import { downloadTdBlob, exportTdAllZip, exportTdDocument } from "../../api/client/haulzReturnsTd";
import { HaulzPoruchenieDraftForm } from "./HaulzPoruchenieDraftForm";
import { HaulzTdDraftForm } from "./HaulzTdDraftForm";
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

const PROFORMA_FIELD_ORDER = ["productEaeu", "exportPermit", "zpu", "fts", "title"] as const;
const SPEC_FIELD_ORDER = [...PROFORMA_FIELD_ORDER, "headerTd"] as const;

function formatTdTotalNumber(value: number): string {
  return value.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function HaulzCustomsPanel({ auth, jobId, workbook, carriers, open, onDraftChange, onError }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("specification");
  const [pendingExport, setPendingExport] = useState<TabId | "all" | null>(null);
  const [activeWriteoffUl, setActiveWriteoffUl] = useState<string>("");
  const [activePoruchenieCarrierId, setActivePoruchenieCarrierId] = useState<string>("");

  const prepared = workbook.tdPrepared;
  const carriersById = useMemo(() => new Map(carriers.map((c) => [c.id, c])), [carriers]);

  const mergedTdDraft = useMemo(
    () => mergeTdDraft(prepared?.draft, workbook.tdDraft),
    [prepared?.draft, workbook.tdDraft],
  );

  const specDraft = useMemo(() => mergedTdDraft?.specification ?? {}, [mergedTdDraft?.specification]);
  const proformaDraft = useMemo(() => mergedTdDraft?.proforma ?? {}, [mergedTdDraft?.proforma]);
  const effectiveProformaDraft = useMemo(
    () => syncProformaHeaderFromSpecification(specDraft, proformaDraft),
    [specDraft, proformaDraft],
  );

  const fixRows = useMemo(
    () => (prepared?.fixRows?.length ? prepared.fixRows : prepared ? collectFixRows(workbook) : []),
    [workbook, prepared],
  );

  const writeoffSheets = useMemo(
    () =>
      prepared
        ? buildWriteoffInputs({
            workbook: { ...workbook, tdPrepared: prepared },
            carriersById,
            draft: mergeTdDraft(prepared.draft, workbook.tdDraft),
          })
        : [],
    [workbook, carriersById, prepared],
  );

  const poruchenieList = useMemo(
    () =>
      prepared
        ? poruchenieInputs({
            workbook: { ...workbook, tdPrepared: prepared },
            carriersById,
            draft: mergeTdDraft(prepared.draft, workbook.tdDraft),
          })
        : [],
    [workbook, carriersById, prepared],
  );

  const specPreview = useMemo(() => specificationPreviewRows(fixRows), [fixRows]);
  const specSummary = useMemo(() => {
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
      tdNumber: "",
    };
  }, [fixRows]);
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
      weight: formatTdTotalNumber(totals.weight),
      cost: formatTdTotalNumber(totals.cost),
    };
  }, [fixRows]);

  const activeWriteoff = writeoffSheets.find((s) => s.ulNumber === activeWriteoffUl) ?? writeoffSheets[0];
  const activePoruchenie =
    poruchenieList.find((p) => p.carrier.id === activePoruchenieCarrierId) ?? poruchenieList[0];

  const updateSpecField = useCallback(
    (key: string, value: string) => {
      const specification = applySpecificationFieldChange(specDraft, key, value);
      const proforma = syncProformaHeaderFromSpecification(specification, proformaDraft);
      void onDraftChange({
        ...mergedTdDraft,
        specification,
        proforma,
      });
    },
    [mergedTdDraft, onDraftChange, proformaDraft, specDraft],
  );

  const updateProformaField = useCallback(
    (key: string, value: string) => {
      const proforma = applyProformaFieldChange(proformaDraft, key, value);
      const sharedKeys = new Set(["productEaeu", "exportPermit", "zpu", "fts"]);
      const specification = sharedKeys.has(key)
        ? applySpecificationFieldChange(specDraft, key, key === "fts" ? proforma.fts ?? value : value)
        : specDraft;
      void onDraftChange({
        ...mergedTdDraft,
        specification,
        proforma,
      });
    },
    [mergedTdDraft, onDraftChange, proformaDraft, specDraft],
  );

  const updatePoruchenieField = useCallback(
    (patch: { number?: string; date?: string; contractNumber?: string; contractDate?: string }) => {
      void onDraftChange({
        ...mergedTdDraft,
        poruchenie: {
          ...mergedTdDraft?.poruchenie,
          [PORUCHENIE_MERGED_DRAFT_KEY]: {
            ...mergedTdDraft?.poruchenie?.[PORUCHENIE_MERGED_DRAFT_KEY],
            ...patch,
          },
        },
      });
    },
    [mergedTdDraft, onDraftChange],
  );

  const handleExport = useCallback(
    (docType: TabId | "all") => {
      if (!prepared) {
        onError?.("Сначала нажмите «Подготовить ТД» на вкладке итог.");
        return;
      }
      if (pendingExport === docType) return;

      setPendingExport(docType);
      void (async () => {
        try {
          const draft = mergeTdDraft(prepared.draft, workbook.tdDraft) ?? prepared.draft;
          const { blob, fileName } =
            docType === "all"
              ? await exportTdAllZip(auth, jobId, draft, prepared)
              : await exportTdDocument(auth, {
                  jobId,
                  docType,
                  draft,
                  tdPrepared: prepared,
                });
          downloadTdBlob(blob, fileName);
        } catch (e: unknown) {
          onError?.((e as Error)?.message || "Ошибка выгрузки");
        } finally {
          setPendingExport((current) => (current === docType ? null : current));
        }
      })();
    },
    [auth, jobId, onError, pendingExport, prepared, workbook.tdDraft],
  );

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
          <div className="hr-customs-panel__toolbar">
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
              <Button
                type="button"
                className="filter-button filter-button--sm"
                disabled={pendingExport === activeTab}
                onClick={(e) => {
                  e.preventDefault();
                  handleExport(activeTab);
                }}
              >
                <Download className="w-4 h-4" style={{ marginRight: "0.25rem" }} />
                {pendingExport === activeTab ? "…" : "Скачать"}
              </Button>
              <Button
                type="button"
                className="filter-button filter-button--sm"
                disabled={pendingExport === "all"}
                onClick={(e) => {
                  e.preventDefault();
                  handleExport("all");
                }}
              >
                <Download className="w-4 h-4" style={{ marginRight: "0.25rem" }} />
                {pendingExport === "all" ? "…" : "Скачать все документы"}
              </Button>
            </div>
          </div>

          {activeTab === "specification" ? (
            <div className="hr-customs-panel__body">
              <HaulzTdDraftForm
                variant="specification"
                fieldOrder={SPEC_FIELD_ORDER}
                draft={specDraft}
                onFieldChange={updateSpecField}
              />
              <HaulzTdPreviewTable tableId="td-spec" columns={SPEC_PREVIEW_COLUMNS} rows={specPreview} summaryRow={specSummary} />
            </div>
          ) : null}

          {activeTab === "proforma" ? (
            <div className="hr-customs-panel__body">
              <HaulzTdDraftForm
                variant="proforma"
                fieldOrder={PROFORMA_FIELD_ORDER}
                draft={effectiveProformaDraft}
                onFieldChange={updateProformaField}
              />
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
                  {poruchenieList.length > 1 ? (
                    <div className="hr-tabs">
                      {poruchenieList.map((p) => (
                        <button
                          key={p.carrier.id}
                          type="button"
                          className={`hr-tab-btn ${activePoruchenie?.carrier.id === p.carrier.id ? "active" : ""}`}
                          onClick={() => setActivePoruchenieCarrierId(p.carrier.id)}
                        >
                          {p.carrier.name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {activePoruchenie ? (
                    <>
                      <Typography.Body style={{ margin: "0.5rem 0", color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>
                        {activePoruchenie.carrier.name} · {activePoruchenie.writeoffSheetCount} листов списания ·{" "}
                        {activePoruchenie.rows.length} строк
                      </Typography.Body>
                      <HaulzPoruchenieDraftForm
                        number={activePoruchenie.assignmentNumber}
                        date={activePoruchenie.date ?? ""}
                        contractNumber={activePoruchenie.contractNumber ?? "01/26"}
                        contractDate={activePoruchenie.contractDate ?? ""}
                        onNumberChange={(number) => updatePoruchenieField({ number })}
                        onDateChange={(date) => updatePoruchenieField({ date })}
                        onContractNumberChange={(contractNumber) => updatePoruchenieField({ contractNumber })}
                        onContractDateChange={(contractDate) => updatePoruchenieField({ contractDate })}
                      />
                      <HaulzTdPreviewTable
                        tableId="td-poruchenie-merged"
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
