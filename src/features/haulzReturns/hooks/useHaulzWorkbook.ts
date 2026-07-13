import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthData } from "../../../types";
import { translateAndPersistItogWorkbook } from "../../../api/client/haulzReturnsTranslate";
import { saveHaulzReturnsWorkbook, type HaulzReturnsFileMeta } from "../../../api/client/haulzReturns";
import { listHaulzCarriers } from "../../../api/client/haulzReturnsCarriers";
import {
  deleteGlobalStopWord,
  patchGlobalStopWordMatchMode,
  upsertGlobalStopWord,
} from "../../../api/client/haulzReturnsStopWords";
import type { UlTdMetaPatch } from "../HaulzUlTdField";
import {
  addStopWord,
  parseGlobalStopRowId,
  buildFixSheetFromItog,
  buildTdPrepared,
  downloadBlob,
  exportSheetToExcel,
  countSheetDataRows,
  countItogStopRowsInWorkbook,
  collectUlNumbersInItog,
  syncAllUlSheetsFromControlKeys,
  ulNumbersWithInItog,
  ulSheetNeedsHydration,
  itogRowsForTranslation,
  removeItogRowsFromWorkbook,
  removeItogStopRowsFromWorkbook,
  setItogRowsMarkColorInWorkbook,
  setSheetRowsMarkColor,
  rebuildItogFromKgd,
  removeKgdDuplicates,
  removeStopWord,
  updateStopWordMatchMode,
  removeUlRow,
  removeUlSheetFromWorkbook,
  recalcWorkbookAfterItogChange,
  type HaulzWorkbook,
  type HaulzCarrier,
  type StopMatchMode,
  type TdDraft,
  applyWorkbookTdMeta,
  mergeTdDraft,
  validateTdPrep,
} from "../../../lib/haulzReturns";
import { haulzJobDisplayTitle } from "../haulzReturnsPageUtils";
import type { FileSlot } from "../haulzReturnsPageUtils";
import type { HaulzReturnsJobSummary } from "../../../api/client/haulzReturns";

type UseHaulzWorkbookParams = {
  auth: AuthData | null;
  jobId: string | null;
  jobs: HaulzReturnsJobSummary[];
  storedFiles: HaulzReturnsFileMeta[];
  processing: boolean;
  otpravkaFile: File | null;
  ulPrio1: FileSlot[];
  ulPrio2: FileSlot[];
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  previewing: boolean;
  setPreviewing: React.Dispatch<React.SetStateAction<boolean>>;
  buildLocalWorkbookPreview: () => Promise<HaulzWorkbook | null>;
  ensureUlSheetLoaded: (
    tabId: string,
    currentWorkbook: HaulzWorkbook,
    currentJobId: string,
    files: HaulzReturnsFileMeta[],
  ) => Promise<((latestWorkbook: HaulzWorkbook) => HaulzWorkbook) | null>;
  hydrateAllUlSheets: (currentWorkbook: HaulzWorkbook, currentJobId: string) => Promise<HaulzWorkbook>;
};

export function useHaulzWorkbook({
  auth,
  jobId,
  jobs,
  storedFiles,
  processing,
  otpravkaFile,
  ulPrio1,
  ulPrio2,
  setError,
  setProcessing,
  previewing,
  setPreviewing,
  buildLocalWorkbookPreview,
  ensureUlSheetLoaded,
  hydrateAllUlSheets,
}: UseHaulzWorkbookParams) {
  const [workbook, setWorkbook] = useState<HaulzWorkbook | null>(null);
  const [activeTab, setActiveTab] = useState<string>("itog");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [newStopWord, setNewStopWord] = useState("");
  const [newStopMatchMode, setNewStopMatchMode] = useState<StopMatchMode>("exact");
  const [workbookTableCollapsed, setWorkbookTableCollapsed] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState<{ done: number; total: number } | null>(null);
  const [carriers, setCarriers] = useState<HaulzCarrier[]>([]);
  const [tdPanelOpen, setTdPanelOpen] = useState(false);

  const workbookRef = useRef<HaulzWorkbook | null>(null);
  workbookRef.current = workbook ?? null;
  const tdDraftPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tdDraftPersistWorkbookRef = useRef<HaulzWorkbook | null>(null);

  const tabs = useMemo(
    () =>
      workbook?.sheets
        .filter((s) => s.id !== "__workbook_meta__")
        .map((s) => ({ id: s.id, label: s.name })) ?? [],
    [workbook],
  );

  const activeSheet =
    workbook?.sheets.find((s) => s.id === activeTab && s.id !== "__workbook_meta__") ??
    workbook?.sheets.find((s) => s.id !== "__workbook_meta__");

  useEffect(() => {
    if (jobId || processing) return;
    if (!otpravkaFile || (ulPrio1.length === 0 && ulPrio2.length === 0)) {
      setWorkbook(null);
      return;
    }
    let cancelled = false;
    setPreviewing(true);
    void (async () => {
      try {
        const wb = await buildLocalWorkbookPreview();
        if (cancelled || !wb) return;
        setWorkbook(wb);
        setActiveTab("itog");
        setWorkbookTableCollapsed(false);
        setError(null);
      } catch (e: unknown) {
        if (!cancelled) {
          setError((e as Error)?.message || "Не удалось собрать таблицу из файлов");
        }
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, processing, otpravkaFile, ulPrio1, ulPrio2, buildLocalWorkbookPreview, setPreviewing, setError]);

  const persistWorkbook = useCallback(
    async (next: HaulzWorkbook, currentJobId: string) => {
      if (!auth) return next;
      setSaving(true);
      try {
        const saved = await saveHaulzReturnsWorkbook(auth, currentJobId, next);
        setWorkbook(saved);
        return saved;
      } catch (e: unknown) {
        const msg = (e as Error)?.message || "";
        const versionConflict =
          msg.includes("workbook_version_conflict") ||
          msg.includes("haulz_returns_workbooks_job_version") ||
          msg.includes("параллельных сохранений");
        if (!versionConflict) {
          setError(msg || "Ошибка сохранения в БД");
        }
        return next;
      } finally {
        setSaving(false);
      }
    },
    [auth, setError],
  );

  const runItogTranslation = useCallback(
    async (currentWorkbook: HaulzWorkbook, currentJobId: string, includeFilled = false): Promise<HaulzWorkbook> => {
      if (!auth) return currentWorkbook;
      const itog = currentWorkbook.sheets.find((s) => s.id === "itog");
      const pendingCount = itog ? itogRowsForTranslation(itog.rows, { includeFilled }).length : 0;
      if (pendingCount === 0) return currentWorkbook;

      setTranslating(true);
      setTranslateProgress({ done: 0, total: pendingCount });
      try {
        const { workbook: next } = await translateAndPersistItogWorkbook(
          auth,
          currentJobId,
          currentWorkbook,
          {
            includeFilled,
            onProgress: (done, total) => setTranslateProgress({ done, total }),
          },
        );
        return next;
      } finally {
        setTranslating(false);
        setTranslateProgress(null);
      }
    },
    [auth],
  );

  const commitWorkbook = useCallback(
    async (next: HaulzWorkbook) => {
      const merged = applyWorkbookTdMeta(workbookRef.current, next);
      setWorkbook(merged);
      if (jobId && auth) {
        return persistWorkbook(merged, jobId);
      }
      return merged;
    },
    [auth, jobId, persistWorkbook],
  );

  const handleUlCarrierChange = useCallback(
    async (tabId: string, carrierId: string | null) => {
      if (!workbook) return;
      const next: HaulzWorkbook = {
        ...workbook,
        sheets: workbook.sheets.map((s) => (s.id === tabId ? { ...s, carrierId } : s)),
      };
      await commitWorkbook(next);
    },
    [workbook, commitWorkbook],
  );

  const handleUlTdMetaChange = useCallback(
    async (tabId: string, patch: UlTdMetaPatch) => {
      if (!workbook) return;
      const next: HaulzWorkbook = {
        ...workbook,
        sheets: workbook.sheets.map((s) => {
          if (s.id !== tabId) return s;
          const ulNumber = patch.ulNumber.trim();
          return {
            ...s,
            name: ulNumber || s.name,
            tdNumber: patch.tdNumber.trim() || null,
            tdDate: patch.tdDate?.trim() || null,
          };
        }),
      };
      await commitWorkbook(next);
    },
    [workbook, commitWorkbook],
  );

  const flushTdDraftPersist = useCallback(async () => {
    const pending = tdDraftPersistWorkbookRef.current;
    tdDraftPersistWorkbookRef.current = null;
    if (!pending || !jobId || !auth) return;
    await persistWorkbook(pending, jobId);
  }, [auth, jobId, persistWorkbook]);

  useEffect(() => {
    return () => {
      if (tdDraftPersistTimerRef.current) {
        clearTimeout(tdDraftPersistTimerRef.current);
        tdDraftPersistTimerRef.current = null;
      }
      void flushTdDraftPersist();
    };
  }, [flushTdDraftPersist]);

  const handleTdDraftChange = useCallback(
    (draft: TdDraft) => {
      const current = workbookRef.current;
      if (!current) return;
      const mergedDraft = mergeTdDraft(current.tdDraft, current.tdPrepared?.draft, draft) ?? draft;
      const tdPrepared = current.tdPrepared
        ? { ...current.tdPrepared, draft: mergedDraft }
        : undefined;
      const next = applyWorkbookTdMeta(current, { ...current, tdDraft: mergedDraft, tdPrepared });
      setWorkbook(next);
      tdDraftPersistWorkbookRef.current = next;
      if (tdDraftPersistTimerRef.current) clearTimeout(tdDraftPersistTimerRef.current);
      tdDraftPersistTimerRef.current = setTimeout(() => {
        tdDraftPersistTimerRef.current = null;
        void flushTdDraftPersist();
      }, 450);
    },
    [flushTdDraftPersist],
  );

  const handlePrepareTd = useCallback(async () => {
    if (!workbook) return;
    setError(null);
    if (tdDraftPersistTimerRef.current) {
      clearTimeout(tdDraftPersistTimerRef.current);
      tdDraftPersistTimerRef.current = null;
    }
    await flushTdDraftPersist();
    let current = syncAllUlSheetsFromControlKeys(workbookRef.current ?? workbook);
    const ulInItog = ulNumbersWithInItog(current);

    if (jobId && auth) {
      for (const sheet of current.sheets) {
        if (!ulSheetNeedsHydration(sheet, ulInItog)) continue;
        const applyLoaded = await ensureUlSheetLoaded(sheet.id, current, jobId, storedFiles);
        if (applyLoaded) current = applyLoaded(current);
      }
    }
    current = syncAllUlSheetsFromControlKeys(current);

    const errors = validateTdPrep(current);
    if (errors.length) {
      setError(errors.join("\n"));
      return;
    }
    try {
      const carriersById = new Map(carriers.map((c) => [c.id, c]));
      const prepared = buildTdPrepared(current, carriersById);
      await commitWorkbook({ ...current, tdDraft: prepared.draft, tdPrepared: prepared });
      setTdPanelOpen(true);
    } catch (e: unknown) {
      setError((e as Error)?.message || "Ошибка подготовки ТД");
    }
  }, [workbook, carriers, commitWorkbook, flushTdDraftPersist, jobId, auth, storedFiles, ensureUlSheetLoaded, setError]);

  useEffect(() => {
    if (workbook?.tdPrepared) setTdPanelOpen(true);
  }, [workbook?.tdPrepared?.preparedAt]);

  useEffect(() => {
    if (!auth) return;
    void listHaulzCarriers(auth)
      .then(setCarriers)
      .catch(() => setCarriers([]));
  }, [auth]);

  const handleDeleteItogRow = useCallback(
    (rowId: string) => {
      void (async () => {
        const current = workbookRef.current;
        if (!current) return;
        const { workbook: next, removed } = removeItogRowsFromWorkbook(current, [rowId]);
        if (removed === 0) return;
        await commitWorkbook(next);
      })();
    },
    [commitWorkbook],
  );

  const handleBulkDeleteRows = useCallback(
    (rowIds: string[]) => {
      if (rowIds.length === 0) return;
      void (async () => {
        const current = workbookRef.current;
        if (!current || !activeSheet) return;
        let next = current;

        if (activeSheet.id === "itog" || activeSheet.id === "fix") {
          const result = removeItogRowsFromWorkbook(current, rowIds);
          if (result.removed === 0) return;
          next = result.workbook;
        } else if (activeSheet.id === "stop") {
          if (auth) {
            for (const rowId of rowIds) {
              const globalId = parseGlobalStopRowId(rowId);
              if (globalId) await deleteGlobalStopWord(auth, { id: globalId }).catch(() => undefined);
            }
          }
          next = rowIds.reduce((wb, rowId) => removeStopWord(wb, rowId), current);
        } else if (activeSheet.id.startsWith("ul-")) {
          const sheetId = activeSheet.id;
          let sheet = current.sheets.find((s) => s.id === sheetId);
          if (!sheet) return;
          for (const rowId of rowIds) {
            sheet = removeUlRow(sheet, rowId);
          }
          next = recalcWorkbookAfterItogChange({
            ...current,
            sheets: current.sheets.map((s) => (s.id === sheetId ? sheet! : s)),
          });
        } else {
          return;
        }

        await commitWorkbook(next);
      })();
    },
    [activeSheet, commitWorkbook, auth],
  );

  const handleBulkMarkRows = useCallback(
    (rowIds: string[], color: string | null) => {
      if (rowIds.length === 0) return;
      void (async () => {
        const current = workbookRef.current;
        if (!current || !activeSheet) return;
        let next = current;

        if (activeSheet.id === "itog" || activeSheet.id === "fix") {
          next = setItogRowsMarkColorInWorkbook(current, rowIds, color);
        } else {
          const sheetId = activeSheet.id;
          const sheet = current.sheets.find((s) => s.id === sheetId);
          if (!sheet) return;
          next = {
            ...current,
            sheets: current.sheets.map((s) =>
              s.id === sheetId ? setSheetRowsMarkColor(sheet, rowIds, color) : s,
            ),
          };
          if (sheetId.startsWith("ul-")) {
            next = recalcWorkbookAfterItogChange(next);
          }
        }

        await commitWorkbook(next);
      })();
    },
    [activeSheet, commitWorkbook],
  );

  const handleTranslateItog = useCallback(() => {
    if (!auth || !workbook) return;
    if (!jobId) {
      setError("Сначала сохраните сессию (обработайте файлы)");
      return;
    }
    const itog = workbook.sheets.find((s) => s.id === "itog");
    if (!itog) return;
    if (itogRowsForTranslation(itog.rows, { includeFilled: true }).length === 0) {
      setError("Нет строк с английским текстом для перевода");
      return;
    }
    void (async () => {
      setError(null);
      try {
        const next = await runItogTranslation(workbook, jobId, true);
        setWorkbook(next);
      } catch (e: unknown) {
        setError((e as Error)?.message || "Ошибка перевода");
      }
    })();
  }, [auth, workbook, jobId, runItogTranslation, setError]);

  const handleRemoveItogStopRows = useCallback(() => {
    const current = workbookRef.current;
    if (!current) return;
    void (async () => {
      setProcessing(true);
      const { workbook: next, removed } = removeItogStopRowsFromWorkbook(current);
      if (removed === 0) {
        setError("STOP строки не найдены — в колонке STOP должно быть значение STOP");
        setProcessing(false);
        return;
      }
      setError(null);
      try {
        await commitWorkbook(next);
      } catch (e: unknown) {
        setError((e as Error)?.message || "Ошибка удаления STOP строк");
      } finally {
        setProcessing(false);
      }
    })();
  }, [commitWorkbook, setError, setProcessing]);

  const handleRemoveKgdDuplicates = useCallback(() => {
    if (!workbook) return;
    void (async () => {
      const kgdBefore = workbook.sheets.find((s) => s.id === "kgd")?.rows.length ?? 0;
      const next = removeKgdDuplicates(workbook);
      const kgdAfter = next.sheets.find((s) => s.id === "kgd")?.rows.length ?? 0;
      if (kgdAfter === kgdBefore) {
        setError("Дубликаты посылок не найдены");
        return;
      }
      setError(null);
      await commitWorkbook(next);
    })();
  }, [workbook, commitWorkbook, setError]);

  const handleRecalcItogFromKgd = useCallback(() => {
    if (!workbook || !jobId) return;
    void (async () => {
      setError(null);
      setProcessing(true);
      try {
        let wb = await hydrateAllUlSheets(workbook, jobId);
        const next = rebuildItogFromKgd(wb);
        await commitWorkbook(next);
        setActiveTab("itog");
      } catch (e: unknown) {
        setError((e as Error)?.message || "Ошибка пересчёта итога");
      } finally {
        setProcessing(false);
      }
    })();
  }, [workbook, jobId, hydrateAllUlSheets, commitWorkbook, setError, setProcessing]);

  const handleAddStopWord = useCallback(() => {
    if (!workbook || !auth) return;
    const word = newStopWord.trim();
    if (!word) {
      setError("Введите наименование для STOP");
      return;
    }
    void (async () => {
      try {
        await upsertGlobalStopWord(auth, word, newStopMatchMode, "STOP");
        const { workbook: next, added } = addStopWord(workbook, word, "STOP", newStopMatchMode);
        if (!added) {
          setError(`«${word}» уже есть в справочнике STOP`);
          return;
        }
        setNewStopWord("");
        setNewStopMatchMode("exact");
        setError(null);
        await commitWorkbook(next);
      } catch (e: unknown) {
        setError((e as Error)?.message || "Не удалось сохранить STOP-слово");
      }
    })();
  }, [workbook, auth, newStopWord, newStopMatchMode, commitWorkbook, setError]);

  const handleStopMatchModeChange = useCallback(
    (rowId: string, matchMode: StopMatchMode) => {
      if (!workbook || !auth) return;
      void (async () => {
        try {
          const globalId = parseGlobalStopRowId(rowId);
          const stopSheet = workbook.sheets.find((s) => s.id === "stop");
          const row = stopSheet?.rows.find((r) => r._rowId === rowId);
          const word = String(row?.word ?? "").trim();
          if (globalId) {
            await patchGlobalStopWordMatchMode(auth, globalId, matchMode);
          } else if (word) {
            await upsertGlobalStopWord(auth, word, matchMode, String(row?.result ?? "STOP"));
          }
          const next = updateStopWordMatchMode(workbook, rowId, matchMode);
          await commitWorkbook(next);
        } catch (e: unknown) {
          setError((e as Error)?.message || "Не удалось сохранить режим совпадения");
        }
      })();
    },
    [workbook, auth, commitWorkbook, setError],
  );

  const handleDeleteStopRow = useCallback(
    (rowId: string) => {
      if (!workbook) return;
      void (async () => {
        setError(null);
        try {
          const globalId = parseGlobalStopRowId(rowId);
          if (auth && globalId) {
            await deleteGlobalStopWord(auth, { id: globalId });
          }
          const next = removeStopWord(workbook, rowId);
          await commitWorkbook(next);
        } catch (e: unknown) {
          setError((e as Error)?.message || "Не удалось удалить STOP-слово");
        }
      })();
    },
    [workbook, auth, commitWorkbook, setError],
  );

  const handleDeleteUlSheet = useCallback(() => {
    if (!workbook || !activeSheet?.id.startsWith("ul-")) return;
    const ulLabel = activeSheet.name || activeSheet.id.slice(3);
    if (!window.confirm(`Удалить упаковочный лист «${ulLabel}» и строки итога по этому УЛ?`)) return;
    void (async () => {
      setError(null);
      const next = removeUlSheetFromWorkbook(workbook, activeSheet.id);
      if (next.sheets.length === workbook.sheets.length) {
        setError("Лист УЛ не найден");
        return;
      }
      await commitWorkbook(next);
      setActiveTab("itog");
    })();
  }, [workbook, activeSheet, commitWorkbook, setError]);

  const handleDeleteUlRow = useCallback(
    (rowId: string) => {
      if (!workbook || !activeSheet?.id.startsWith("ul-")) return;
      void (async () => {
        setError(null);
        const next = {
          ...workbook,
          sheets: workbook.sheets.map((sheet) =>
            sheet.id === activeSheet.id ? removeUlRow(sheet, rowId) : sheet,
          ),
        };
        await commitWorkbook(next);
      })();
    },
    [workbook, activeSheet, commitWorkbook, setError],
  );

  const handleCreateFix = useCallback(() => {
    if (!workbook) return;
    void (async () => {
      const itog = workbook.sheets.find((s) => s.id === "itog");
      if (!itog) return;
      const fix = buildFixSheetFromItog(itog);
      const withoutFix = workbook.sheets.filter((s) => s.id !== "fix");
      const next = { ...workbook, sheets: [...withoutFix, fix] };
      setActiveTab("fix");
      await commitWorkbook(next);
    })();
  }, [workbook, commitWorkbook]);

  const handleExport = useCallback(async () => {
    if (!activeSheet) return;
    setExporting(true);
    try {
      const blob = await exportSheetToExcel(activeSheet);
      downloadBlob(blob, `${activeSheet.name}.xlsx`);
    } catch (e: unknown) {
      setError((e as Error)?.message || "Ошибка экспорта");
    } finally {
      setExporting(false);
    }
  }, [activeSheet, setError]);

  const activeDataRowCount = activeSheet ? countSheetDataRows(activeSheet) : 0;

  const itogStopRowCount = useMemo(() => {
    if (!workbook) return 0;
    return countItogStopRowsInWorkbook(workbook);
  }, [workbook]);

  const itogPendingTranslateCount = useMemo(() => {
    if (!workbook) return 0;
    const itog = workbook.sheets.find((s) => s.id === "itog");
    return itog ? itogRowsForTranslation(itog.rows, { includeFilled: true }).length : 0;
  }, [workbook]);

  const activeJobTitle = useMemo(() => {
    if (!jobId) return null;
    const job = jobs.find((j) => j.id === jobId);
    return job ? haulzJobDisplayTitle(job) : null;
  }, [jobId, jobs]);

  const ulNumbersInItog = useMemo(
    () => (workbook ? collectUlNumbersInItog(workbook) : new Set<string>()),
    [workbook],
  );

  return {
    workbook,
    setWorkbook,
    activeTab,
    setActiveTab,
    workbookRef,
    saving,
    exporting,
    translating,
    translateProgress,
    newStopWord,
    setNewStopWord,
    newStopMatchMode,
    setNewStopMatchMode,
    workbookTableCollapsed,
    setWorkbookTableCollapsed,
    carriers,
    tdPanelOpen,
    setTdPanelOpen,
    tabs,
    activeSheet,
    activeDataRowCount,
    itogStopRowCount,
    itogPendingTranslateCount,
    activeJobTitle,
    ulNumbersInItog,
    handleUlCarrierChange,
    handleUlTdMetaChange,
    handleTdDraftChange,
    handlePrepareTd,
    handleDeleteItogRow,
    handleBulkDeleteRows,
    handleBulkMarkRows,
    handleTranslateItog,
    handleRemoveItogStopRows,
    handleRemoveKgdDuplicates,
    handleRecalcItogFromKgd,
    handleAddStopWord,
    handleStopMatchModeChange,
    handleDeleteStopRow,
    handleDeleteUlSheet,
    handleDeleteUlRow,
    handleCreateFix,
    handleExport,
  };
}
