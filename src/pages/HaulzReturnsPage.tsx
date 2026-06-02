import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Download, FileSpreadsheet, FolderOpen, Languages, Pencil, Trash2, Upload } from "lucide-react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import type { AuthData } from "../types";
import {
  createHaulzReturnsJob,
  deleteHaulzReturnsJob,
  getHaulzReturnsJob,
  getHaulzReturnsJobSheet,
  listHaulzReturnsJobs,
  processHaulzReturnsJob,
  renameHaulzReturnsJob,
  saveHaulzReturnsWorkbook,
  uploadHaulzReturnsFilesSequentially,
  type HaulzReturnsUploadItem,
  type HaulzReturnsFileMeta,
  type HaulzReturnsJobSummary,
} from "../api/client/haulzReturns";
import { translateAndPersistItogWorkbook } from "../api/client/haulzReturnsTranslate";
import { HaulzReturnsWorkbookView } from "../features/haulzReturns/HaulzReturnsWorkbookView";
import { HaulzUlCarrierPanel } from "../features/haulzReturns/HaulzUlCarrierPanel";
import { HaulzUlTdField } from "../features/haulzReturns/HaulzUlTdField";
import { HaulzCustomsPanel } from "../features/haulzReturns/HaulzCustomsPanel";
import { listHaulzCarriers } from "../api/client/haulzReturnsCarriers";
import {
  addStopWord,
  buildFixSheetFromItog,
  buildUlSheetForParsedFile,
  buildWorkbook,
  downloadBlob,
  exportSheetToExcel,
  countSheetDataRows,
  collectUlNumbersInItog,
  isUlTabInItog,
  itogRowsNeedingTranslation,
  itogRowsForTranslation,
  removeItogRow,
  removeItogStopRowsFromWorkbook,
  normalizeWorkbookColumns,
  parseOtpravkaBuffer,
  parseUlBuffer,
  recalcWorkbookAfterItogChange,
  rebuildItogFromKgd,
  removeKgdDuplicates,
  removeStopWord,
  removeUlRow,
  removeUlSheetFromWorkbook,
  type HaulzWorkbook,
  type HaulzCarrier,
  type TdDraft,
} from "../lib/haulzReturns";

type UploadProgress = {
  current: number;
  total: number;
  fileName: string;
};

type FileSlot = {
  id: string;
  file: File;
};

type Props = {
  auth: AuthData | null;
  onBack?: () => void;
  pageTitle?: string;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatJobDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function haulzJobDisplayTitle(job: { id: string; title: string; otpravka_filename: string | null }): string {
  return job.title.trim() || job.otpravka_filename || `Сессия ${job.id}`;
}

async function downloadStoredFile(auth: AuthData, jobId: string, fileId: string, fileName: string) {
  const res = await fetch(
    `/api/haulz-returns/job-file-download?jobId=${encodeURIComponent(jobId)}&fileId=${encodeURIComponent(fileId)}`,
    { headers: { "x-login": auth.login, "x-password": auth.password } },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof (data as { error?: string }).error === "string" ? (data as { error: string }).error : `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  downloadBlob(blob, fileName);
}

export function HaulzReturnsPage({ auth, onBack, pageTitle = "Возврат из КГД" }: Props) {
  const [otpravkaFile, setOtpravkaFile] = useState<File | null>(null);
  const [ulPrio1, setUlPrio1] = useState<FileSlot[]>([]);
  const [ulPrio2, setUlPrio2] = useState<FileSlot[]>([]);
  const [workbook, setWorkbook] = useState<HaulzWorkbook | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [storedFiles, setStoredFiles] = useState<HaulzReturnsFileMeta[]>([]);
  const [jobs, setJobs] = useState<HaulzReturnsJobSummary[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("itog");
  const [processing, setProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingUlTab, setLoadingUlTab] = useState<string | null>(null);
  const [newStopWord, setNewStopWord] = useState("");
  const [workbookTableCollapsed, setWorkbookTableCollapsed] = useState(false);
  const [storedFilesCollapsed, setStoredFilesCollapsed] = useState(true);
  const [translating, setTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState<{ done: number; total: number } | null>(null);
  const [renamingJobId, setRenamingJobId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const autoLoadedSessionRef = useRef(false);
  const workbookRef = useRef<HaulzWorkbook | null>(null);
  workbookRef.current = workbook ?? null;

  const [carriers, setCarriers] = useState<HaulzCarrier[]>([]);

  const tabs = useMemo(
    () =>
      workbook?.sheets
        .filter((s) => s.id !== "__workbook_meta__")
        .map((s) => ({ id: s.id, label: s.name })) ?? [],
    [workbook],
  );

  const activeSheet = workbook?.sheets.find((s) => s.id === activeTab && s.id !== "__workbook_meta__") ?? workbook?.sheets.find((s) => s.id !== "__workbook_meta__");

  const ensureUlSheetLoaded = useCallback(
    async (tabId: string, currentWorkbook: HaulzWorkbook, currentJobId: string, files: HaulzReturnsFileMeta[]) => {
      if (!auth || !tabId.startsWith("ul-")) return currentWorkbook;
      const ulNumber = tabId.slice(3);
      if (currentWorkbook.excludedUlNumbers?.has(ulNumber)) return currentWorkbook;
      const sheet = currentWorkbook.sheets.find((s) => s.id === tabId);
      if (!sheet || sheet.ulLocallyEdited || (sheet.rows.length > 0 && !sheet.ulDeferred)) return currentWorkbook;

      const fileMeta = files.find(
        (f) =>
          (f.file_role === "ul_prio1" || f.file_role === "ul_prio2") &&
          (f.ul_number === ulNumber || f.original_filename.includes(ulNumber)),
      );
      if (!fileMeta) return currentWorkbook;

      setLoadingUlTab(tabId);
      try {
        const res = await fetch(
          `/api/haulz-returns/job-file-download?jobId=${encodeURIComponent(currentJobId)}&fileId=${encodeURIComponent(fileMeta.id)}`,
          { headers: { "x-login": auth.login, "x-password": auth.password } },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = parseUlBuffer(await res.arrayBuffer(), fileMeta.original_filename);
        const ulSheet = buildUlSheetForParsedFile(parsed, currentWorkbook.itogControlKeys);
        return {
          ...currentWorkbook,
          sheets: currentWorkbook.sheets.map((s) => (s.id === tabId ? ulSheet : s)),
        };
      } catch (e: unknown) {
        setError((e as Error)?.message || `Не удалось загрузить УЛ ${ulNumber}`);
        return currentWorkbook;
      } finally {
        setLoadingUlTab(null);
      }
    },
    [auth],
  );

  const hydrateDeferredItogSheet = useCallback(
    async (currentWorkbook: HaulzWorkbook, currentJobId: string): Promise<HaulzWorkbook> => {
      if (!auth) return currentWorkbook;
      const itog = currentWorkbook.sheets.find((s) => s.id === "itog");
      if (!itog?.itogDeferred) return currentWorkbook;
      const sheet = await getHaulzReturnsJobSheet(auth, currentJobId, "itog");
      return {
        ...currentWorkbook,
        sheets: currentWorkbook.sheets.map((s) => (s.id === "itog" ? sheet : s)),
      };
    },
    [auth],
  );

  const handleTabSelect = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
      if (!workbook || !jobId) return;
      void (async () => {
        const next = await ensureUlSheetLoaded(tabId, workbook, jobId, storedFiles);
        if (next !== workbook) setWorkbook(next);
      })();
    },
    [workbook, jobId, storedFiles, ensureUlSheetLoaded],
  );

  const refreshJobs = useCallback(async () => {
    if (!auth) return;
    setLoadingJobs(true);
    try {
      setJobs(await listHaulzReturnsJobs(auth));
    } catch (e: unknown) {
      setError((e as Error)?.message || "Не удалось загрузить список сессий");
    } finally {
      setLoadingJobs(false);
    }
  }, [auth]);

  useEffect(() => {
    void refreshJobs();
  }, [refreshJobs]);

  const buildLocalWorkbookPreview = useCallback(async (): Promise<HaulzWorkbook | null> => {
    if (!otpravkaFile || (ulPrio1.length === 0 && ulPrio2.length === 0)) return null;
    const otpravka = parseOtpravkaBuffer(await otpravkaFile.arrayBuffer(), otpravkaFile.name);
    const ulPrio1Parsed = [];
    for (const slot of ulPrio1) {
      ulPrio1Parsed.push(await parseUlBuffer(await slot.file.arrayBuffer(), slot.file.name));
    }
    const ulPrio2Parsed = [];
    for (const slot of ulPrio2) {
      ulPrio2Parsed.push(await parseUlBuffer(await slot.file.arrayBuffer(), slot.file.name));
    }
    return normalizeWorkbookColumns(
      buildWorkbook({ otpravka, ulPrio1: ulPrio1Parsed, ulPrio2: ulPrio2Parsed }),
    );
  }, [otpravkaFile, ulPrio1, ulPrio2]);

  /** Без сохранённой сессии — сразу показываем собранную таблицу из прикреплённых файлов. */
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
  }, [jobId, processing, otpravkaFile, ulPrio1, ulPrio2, buildLocalWorkbookPreview]);

  const persistWorkbook = useCallback(
    async (next: HaulzWorkbook, currentJobId: string) => {
      if (!auth) return next;
      setSaving(true);
      try {
        const saved = await saveHaulzReturnsWorkbook(auth, currentJobId, next);
        setWorkbook(saved);
        return saved;
      } catch (e: unknown) {
        setError((e as Error)?.message || "Ошибка сохранения в БД");
        return next;
      } finally {
        setSaving(false);
      }
    },
    [auth],
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

  const loadJob = useCallback(
    async (id: string) => {
      if (!auth) return;
      setError(null);
      setProcessing(true);
      try {
        let data = await getHaulzReturnsJob(auth, id);
        setJobId(id);
        setStoredFiles(data.files);
        setOtpravkaFile(null);
        setUlPrio1([]);
        setUlPrio2([]);

        if (!data.workbook && data.files.length > 0) {
          await processHaulzReturnsJob(auth, id);
          data = await getHaulzReturnsJob(auth, id);
          setStoredFiles(data.files);
        }

        if (data.workbook) {
          let wb = await hydrateDeferredItogSheet(data.workbook, id);
          wb = normalizeWorkbookColumns(wb);
          setActiveTab("itog");
          setWorkbookTableCollapsed(false);
          try {
            wb = await runItogTranslation(wb, id);
          } catch (e: unknown) {
            setError((e as Error)?.message || "Ошибка перевода");
          }
          setWorkbook(wb);
        } else {
          setWorkbook(null);
          setWorkbookTableCollapsed(false);
        }
        if (data.job.error_message) setError(data.job.error_message);
      } catch (e: unknown) {
        setError((e as Error)?.message || "Ошибка загрузки сессии");
      } finally {
        setProcessing(false);
      }
    },
    [auth, runItogTranslation, hydrateDeferredItogSheet],
  );

  /** При открытии страницы — загрузить последнюю сессию, если пользователь не начал новую загрузку. */
  useEffect(() => {
    if (autoLoadedSessionRef.current || loadingJobs || !auth) return;
    if (jobId || workbook || otpravkaFile) {
      autoLoadedSessionRef.current = true;
      return;
    }
    if (jobs.length > 0) {
      autoLoadedSessionRef.current = true;
      void loadJob(jobs[0]!.id);
      return;
    }
    autoLoadedSessionRef.current = true;
  }, [loadingJobs, jobs, auth, jobId, workbook, otpravkaFile, loadJob]);

  const commitWorkbook = useCallback(
    async (next: HaulzWorkbook) => {
      setWorkbook(next);
      if (jobId && auth) {
        return persistWorkbook(next, jobId);
      }
      return next;
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

  const handleUlTdChange = useCallback(
    async (tabId: string, tdNumber: string) => {
      if (!workbook) return;
      const next: HaulzWorkbook = {
        ...workbook,
        sheets: workbook.sheets.map((s) => (s.id === tabId ? { ...s, tdNumber: tdNumber.trim() || null } : s)),
      };
      await commitWorkbook(next);
    },
    [workbook, commitWorkbook],
  );

  const handleTdDraftChange = useCallback(
    async (draft: TdDraft) => {
      if (!workbook) return;
      await commitWorkbook({ ...workbook, tdDraft: draft });
    },
    [workbook, commitWorkbook],
  );

  useEffect(() => {
    if (!auth) return;
    void listHaulzCarriers(auth)
      .then(setCarriers)
      .catch(() => setCarriers([]));
  }, [auth]);

  const handleOtpravkaChange = useCallback((list: FileList | null) => {
    const file = list?.[0] ?? null;
    setOtpravkaFile(file);
    setJobId(null);
    setStoredFiles([]);
    if (!file) setWorkbook(null);
    setWorkbookTableCollapsed(false);
    setError(null);
  }, []);

  const addUlFiles = useCallback((list: FileList | null, prio: 1 | 2) => {
    if (!list?.length) return;
    const slots = Array.from(list).map((file) => ({ id: uid(), file }));
    if (prio === 1) setUlPrio1((prev) => [...prev, ...slots]);
    else setUlPrio2((prev) => [...prev, ...slots]);
    if (!jobId) {
      setWorkbookTableCollapsed(false);
    }
    setError(null);
  }, [jobId]);

  const removeUl = useCallback((id: string, prio: 1 | 2) => {
    if (prio === 1) setUlPrio1((prev) => prev.filter((s) => s.id !== id));
    else setUlPrio2((prev) => prev.filter((s) => s.id !== id));
    setJobId(null);
    setWorkbookTableCollapsed(false);
  }, []);

  const handleProcess = useCallback(async () => {
    if (!auth) {
      setError("Нет авторизации");
      return;
    }
    if (!otpravkaFile) {
      setError("Прикрепите документ отправка");
      return;
    }
    if (ulPrio1.length === 0 && ulPrio2.length === 0) {
      setError("Прикрепите хотя бы один упаковочный лист");
      return;
    }
    setProcessing(true);
    setError(null);
    setUploadProgress(null);
    try {
      const title = otpravkaFile.name.replace(/\.(xlsx|xls)$/i, "") || "Возврат из КГД";
      const uploadQueue: HaulzReturnsUploadItem[] = [
        { role: "otpravka", file: otpravkaFile },
        ...ulPrio1.map((slot) => ({ role: "ul_prio1" as const, file: slot.file })),
        ...ulPrio2.map((slot) => ({ role: "ul_prio2" as const, file: slot.file })),
      ];

      const newJobId = await createHaulzReturnsJob(auth, title);

      await uploadHaulzReturnsFilesSequentially(auth, newJobId, uploadQueue, (current, total, fileName) => {
        setUploadProgress({ current, total, fileName });
      });
      setUploadProgress(null);

      const otpravka = parseOtpravkaBuffer(await otpravkaFile.arrayBuffer(), otpravkaFile.name);
      const ulPrio1Parsed = [];
      for (const slot of ulPrio1) {
        ulPrio1Parsed.push(await parseUlBuffer(await slot.file.arrayBuffer(), slot.file.name));
      }
      const ulPrio2Parsed = [];
      for (const slot of ulPrio2) {
        ulPrio2Parsed.push(await parseUlBuffer(await slot.file.arrayBuffer(), slot.file.name));
      }
      const wbLocal = normalizeWorkbookColumns(
        buildWorkbook({ otpravka, ulPrio1: ulPrio1Parsed, ulPrio2: ulPrio2Parsed }),
      );

      await processHaulzReturnsJob(auth, newJobId);
      setJobId(newJobId);
      setActiveTab("itog");
      setWorkbookTableCollapsed(false);
      try {
        const loaded = await getHaulzReturnsJob(auth, newJobId);
        setStoredFiles(loaded.files);
        let wb = loaded.workbook
          ? normalizeWorkbookColumns(await hydrateDeferredItogSheet(loaded.workbook, newJobId))
          : (await buildLocalWorkbookPreview()) ?? wbLocal;
        try {
          wb = await runItogTranslation(wb, newJobId);
        } catch (e: unknown) {
          setError((e as Error)?.message || "Ошибка перевода");
        }
        setWorkbook(wb);
        await refreshJobs();
      } catch {
        setWorkbook(wbLocal);
      }
    } catch (e: unknown) {
      setError((e as Error)?.message || "Ошибка обработки");
    } finally {
      setProcessing(false);
      setUploadProgress(null);
    }
  }, [auth, otpravkaFile, ulPrio1, ulPrio2, refreshJobs, runItogTranslation, buildLocalWorkbookPreview, hydrateDeferredItogSheet]);

  const handleAddUlToSession = useCallback(async () => {
    if (!auth || !jobId) return;
    if (ulPrio1.length === 0 && ulPrio2.length === 0) {
      setError("Выберите УЛ для добавления в сессию");
      return;
    }
    setProcessing(true);
    setError(null);
    setUploadProgress(null);
    try {
      const uploadQueue: HaulzReturnsUploadItem[] = [
        ...ulPrio1.map((slot) => ({ role: "ul_prio1" as const, file: slot.file })),
        ...ulPrio2.map((slot) => ({ role: "ul_prio2" as const, file: slot.file })),
      ];
      await uploadHaulzReturnsFilesSequentially(auth, jobId, uploadQueue, (current, total, fileName) => {
        setUploadProgress({ current, total, fileName });
      });
      setUploadProgress(null);
      await processHaulzReturnsJob(auth, jobId);
      const data = await getHaulzReturnsJob(auth, jobId);
      setStoredFiles(data.files);
      if (data.workbook) {
        let wb = normalizeWorkbookColumns(await hydrateDeferredItogSheet(data.workbook, jobId));
        try {
          wb = await runItogTranslation(wb, jobId);
        } catch (e: unknown) {
          setError((e as Error)?.message || "Ошибка перевода");
        }
        setWorkbook(wb);
        setActiveTab("kgd");
        setWorkbookTableCollapsed(false);
      }
      setUlPrio1([]);
      setUlPrio2([]);
      await refreshJobs();
    } catch (e: unknown) {
      setError((e as Error)?.message || "Ошибка добавления УЛ");
    } finally {
      setProcessing(false);
      setUploadProgress(null);
    }
  }, [auth, jobId, ulPrio1, ulPrio2, runItogTranslation, refreshJobs, hydrateDeferredItogSheet]);

  const handleDeleteItogRow = useCallback(
    (rowId: string) => {
      void (async () => {
        const current = workbookRef.current;
        if (!current) return;
        const sheets = current.sheets.map((sheet) =>
          sheet.id === "itog" ? removeItogRow(sheet, rowId) : sheet,
        );
        let next = recalcWorkbookAfterItogChange({ ...current, sheets });
        const fixIdx = next.sheets.findIndex((s) => s.id === "fix");
        if (fixIdx >= 0) {
          const itog = next.sheets.find((s) => s.id === "itog")!;
          const fix = buildFixSheetFromItog(itog);
          const updated = [...next.sheets];
          updated[fixIdx] = fix;
          next = { ...next, sheets: updated };
        }
        await commitWorkbook(next);
      })();
    },
    [commitWorkbook],
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
  }, [auth, workbook, jobId, runItogTranslation]);

  const handleRemoveItogStopRows = useCallback(() => {
    if (!workbook) return;
    void (async () => {
      const { workbook: next, removed } = removeItogStopRowsFromWorkbook(workbook);
      if (removed === 0) {
        setError("STOP строки не найдены");
        return;
      }
      setError(null);
      await commitWorkbook(next);
    })();
  }, [workbook, commitWorkbook]);

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
  }, [workbook, commitWorkbook]);

  const handleRecalcItogFromKgd = useCallback(() => {
    if (!workbook) return;
    void (async () => {
      setError(null);
      const next = rebuildItogFromKgd(workbook);
      await commitWorkbook(next);
      setActiveTab("itog");
    })();
  }, [workbook, commitWorkbook]);

  const handleAddStopWord = useCallback(() => {
    if (!workbook) return;
    const word = newStopWord.trim();
    if (!word) {
      setError("Введите наименование для STOP");
      return;
    }
    void (async () => {
      const { workbook: next, added } = addStopWord(workbook, word);
      if (!added) {
        setError(`«${word}» уже есть в справочнике STOP`);
        return;
      }
      setNewStopWord("");
      setError(null);
      await commitWorkbook(next);
    })();
  }, [workbook, newStopWord, commitWorkbook]);

  const handleDeleteStopRow = useCallback(
    (rowId: string) => {
      if (!workbook) return;
      void (async () => {
        setError(null);
        const next = removeStopWord(workbook, rowId);
        await commitWorkbook(next);
      })();
    },
    [workbook, commitWorkbook],
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
  }, [workbook, activeSheet, commitWorkbook]);

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
    [workbook, activeSheet, commitWorkbook],
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
  }, [activeSheet]);

  const handleDeleteJob = useCallback(
    async (id: string) => {
      if (!auth || !window.confirm("Удалить сессию и все файлы из БД?")) return;
      try {
        await deleteHaulzReturnsJob(auth, id);
        if (jobId === id) {
          setJobId(null);
          setWorkbook(null);
          setStoredFiles([]);
          setWorkbookTableCollapsed(false);
        }
        if (renamingJobId === id) {
          setRenamingJobId(null);
          setRenameDraft("");
        }
        await refreshJobs();
      } catch (e: unknown) {
        setError((e as Error)?.message || "Ошибка удаления");
      }
    },
    [auth, jobId, renamingJobId, refreshJobs],
  );

  const startRenameJob = useCallback((job: HaulzReturnsJobSummary) => {
    setRenamingJobId(job.id);
    setRenameDraft(haulzJobDisplayTitle(job));
    setError(null);
  }, []);

  const cancelRenameJob = useCallback(() => {
    setRenamingJobId(null);
    setRenameDraft("");
  }, []);

  const saveRenameJob = useCallback(async () => {
    if (!auth || !renamingJobId) return;
    const title = renameDraft.trim();
    if (!title) {
      setError("Введите название сессии");
      return;
    }
    setRenaming(true);
    try {
      const savedTitle = await renameHaulzReturnsJob(auth, renamingJobId, title);
      setJobs((prev) => prev.map((j) => (j.id === renamingJobId ? { ...j, title: savedTitle } : j)));
      cancelRenameJob();
      setError(null);
    } catch (e: unknown) {
      setError((e as Error)?.message || "Ошибка переименования");
    } finally {
      setRenaming(false);
    }
  }, [auth, renamingJobId, renameDraft, cancelRenameJob]);

  const canProcess =
    Boolean(auth) && !jobId && Boolean(otpravkaFile) && (ulPrio1.length > 0 || ulPrio2.length > 0) && !processing;

  const canAddUlToSession =
    Boolean(auth) && Boolean(jobId) && (ulPrio1.length > 0 || ulPrio2.length > 0) && !processing;

  const activeDataRowCount = activeSheet ? countSheetDataRows(activeSheet) : 0;

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

  if (!auth) {
    return (
      <div className="w-full hr-page">
        <Typography.Body>Нет авторизации для работы с возвратами.</Typography.Body>
      </div>
    );
  }

  return (
    <div className="w-full hr-page">
      <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem", flexWrap: "wrap" }}>
        {onBack ? (
          <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }} aria-label="Назад">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        ) : null}
        <Typography.Headline className="text-page-title">{pageTitle}</Typography.Headline>
        {jobId ? (
          <Typography.Body style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>
            {activeJobTitle ?? `Сессия ${jobId}`}
            {saving ? " · сохранение…" : " · в БД"}
          </Typography.Body>
        ) : workbook ? (
          <Typography.Body style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>
            {previewing ? "Сборка таблицы…" : "Предпросмотр · нажмите «Обработать и сохранить» для записи в БД"}
          </Typography.Body>
        ) : null}
      </Flex>

      <div className="hr-sessions-panel">
        <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
          <FolderOpen className="w-4 h-4" style={{ display: "inline", verticalAlign: "middle", marginRight: "0.35rem" }} />
          Сохранённые сессии
        </Typography.Body>
        {loadingJobs ? (
          <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Загрузка…</Typography.Body>
        ) : jobs.length === 0 ? (
          <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Пока нет сохранённых обработок</Typography.Body>
        ) : (
          <ul className="hr-sessions-list">
            {jobs.map((j) => (
              <li key={j.id} className={jobId === j.id ? "hr-sessions-list__item hr-sessions-list__item--active" : "hr-sessions-list__item"}>
                {renamingJobId === j.id ? (
                  <div className="hr-sessions-list__rename">
                    <input
                      type="text"
                      className="hr-sessions-list__rename-input"
                      value={renameDraft}
                      disabled={renaming}
                      autoFocus
                      maxLength={200}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void saveRenameJob();
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          cancelRenameJob();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      className="filter-button"
                      disabled={renaming || !renameDraft.trim()}
                      onClick={() => void saveRenameJob()}
                    >
                      {renaming ? "…" : "OK"}
                    </Button>
                    <button type="button" className="hr-file-remove" onClick={cancelRenameJob} aria-label="Отмена">
                      ×
                    </button>
                  </div>
                ) : (
                  <button type="button" className="hr-sessions-list__open" onClick={() => void loadJob(j.id)}>
                    <span className="hr-sessions-list__title">{haulzJobDisplayTitle(j)}</span>
                    <span className="hr-sessions-list__meta">
                      {formatJobDate(j.created_at)} · {j.status} · файлов: {j.file_count}
                      {j.has_workbook ? " · результат" : ""}
                      {j.owner_login ? ` · ${j.owner_login}` : ""}
                    </span>
                  </button>
                )}
                {renamingJobId !== j.id ? (
                  <button
                    type="button"
                    className="hr-file-remove"
                    onClick={() => startRenameJob(j)}
                    aria-label="Переименовать сессию"
                  >
                    <Pencil size={14} />
                  </button>
                ) : null}
                <button type="button" className="hr-file-remove" onClick={() => void handleDeleteJob(j.id)} aria-label="Удалить сессию">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="hr-upload-grid">
        <label className="hr-upload-card">
          <FileSpreadsheet className="hr-upload-icon" />
          <span className="hr-upload-title">Документ отправка</span>
          <span className="hr-upload-hint">Один файл .xlsx</span>
          {otpravkaFile ? <span className="hr-upload-file">{otpravkaFile.name}</span> : null}
          <input type="file" accept=".xlsx,.xls" hidden onChange={(e) => handleOtpravkaChange(e.target.files)} />
        </label>

        <label className="hr-upload-card">
          <Upload className="hr-upload-icon" />
          <span className="hr-upload-title">УЛ — приоритет 1</span>
          <span className="hr-upload-hint">
            {jobId ? "Добавить в текущую сессию" : "Можно несколько файлов"}
          </span>
          <input type="file" accept=".xlsx,.xls" multiple hidden onChange={(e) => addUlFiles(e.target.files, 1)} />
        </label>

        <label className="hr-upload-card">
          <Upload className="hr-upload-icon" />
          <span className="hr-upload-title">УЛ — приоритет 2</span>
          <span className="hr-upload-hint">
            {jobId ? "Недостающие позиции → сюда" : "Можно несколько файлов"}
          </span>
          <input type="file" accept=".xlsx,.xls" multiple hidden onChange={(e) => addUlFiles(e.target.files, 2)} />
        </label>
      </div>

      {(ulPrio1.length > 0 || ulPrio2.length > 0) && (
        <div className="hr-file-lists">
          {ulPrio1.length > 0 && (
            <div>
              <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Приоритет 1</Typography.Body>
              <ul className="hr-file-list">
                {ulPrio1.map((s) => (
                  <li key={s.id}>
                    {s.file.name}
                    <button type="button" className="hr-file-remove" onClick={() => removeUl(s.id, 1)} aria-label="Удалить">
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {ulPrio2.length > 0 && (
            <div>
              <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Приоритет 2</Typography.Body>
              <ul className="hr-file-list">
                {ulPrio2.map((s) => (
                  <li key={s.id}>
                    {s.file.name}
                    <button type="button" className="hr-file-remove" onClick={() => removeUl(s.id, 2)} aria-label="Удалить">
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {storedFiles.length > 0 && jobId ? (
        storedFilesCollapsed ? (
          <button
            type="button"
            className="hr-table-collapsed hr-stored-files-collapsed"
            onClick={() => setStoredFilesCollapsed(false)}
          >
            <span className="hr-table-collapsed__title">Файлы в БД (исходники)</span>
            <span className="hr-table-collapsed__meta">
              {storedFiles.length} файлов · нажмите, чтобы развернуть
            </span>
          </button>
        ) : (
          <div className="hr-stored-files">
            <Flex align="center" justify="space-between" style={{ marginBottom: "0.35rem", gap: "0.5rem", flexWrap: "wrap" }}>
              <Typography.Body style={{ fontWeight: 600 }}>Файлы в БД (исходники)</Typography.Body>
              <Button type="button" className="filter-button" onClick={() => setStoredFilesCollapsed(true)}>
                <ChevronUp className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
                Свернуть
              </Button>
            </Flex>
            <ul className="hr-file-list">
              {storedFiles.map((f) => (
                <li key={f.id}>
                  <span>
                    [{f.file_role}] {f.original_filename}
                    {f.ul_number ? ` · УЛ ${f.ul_number}` : ""}
                  </span>
                  <button
                    type="button"
                    className="hr-file-download"
                    onClick={() => void downloadStoredFile(auth, jobId, f.id, f.original_filename)}
                  >
                    <Download size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}

      <Flex gap="0.5rem" wrap="wrap" style={{ marginTop: "1rem", marginBottom: "1rem" }}>
        {canAddUlToSession ? (
          <Button type="button" className="button-primary" disabled={processing} onClick={() => void handleAddUlToSession()}>
            {processing ? "Добавление…" : "Добавить УЛ в сессию и пересобрать"}
          </Button>
        ) : null}
        {canProcess ? (
          <Button type="button" className="button-primary" disabled={processing} onClick={() => void handleProcess()}>
            {processing ? "Обработка…" : previewing ? "Сборка…" : "Обработать и сохранить"}
          </Button>
        ) : null}
        {jobId && !canAddUlToSession && !canProcess ? (
          <Typography.Body style={{ color: "var(--color-text-secondary)" }}>
            Сессия «{activeJobTitle}» открыта — прикрепите УЛ выше и нажмите «Добавить УЛ в сессию»
          </Typography.Body>
        ) : null}
      </Flex>

      {uploadProgress ? (
        <Typography.Body style={{ color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
          Загрузка {uploadProgress.current}/{uploadProgress.total}: {uploadProgress.fileName}
        </Typography.Body>
      ) : null}

      {error ? (
        <Typography.Body style={{ color: "var(--color-danger, #c0392b)", marginBottom: "0.75rem", whiteSpace: "pre-wrap" }}>
          {error}
        </Typography.Body>
      ) : null}

      {workbook && activeSheet ? (
        <>
          <div className="hr-tabs">
            {tabs.map((tab) => {
              const inItog = isUlTabInItog(tab.id, ulNumbersInItog);
              return (
              <button
                key={tab.id}
                type="button"
                className={`hr-tab-btn ${activeTab === tab.id ? "active" : ""}${inItog ? " hr-tab-btn--in-itog" : ""}`}
                onClick={() => handleTabSelect(tab.id)}
              >
                {tab.label}
                {inItog ? " ✓" : ""}
              </button>
              );
            })}
          </div>

          <Flex gap="0.5rem" wrap="wrap" style={{ margin: "0.75rem 0" }}>
            <Button type="button" className="filter-button" disabled={exporting} onClick={() => void handleExport()}>
              <Download className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
              {exporting ? "Экспорт…" : "Скачать Excel"}
            </Button>
            {activeSheet.id === "itog" ? (
              <>
                <Button type="button" className="filter-button" onClick={handleCreateFix}>
                  Создать FIX
                </Button>
                <Button
                  type="button"
                  className="filter-button"
                  disabled={saving || translating || itogPendingTranslateCount === 0}
                  onClick={handleTranslateItog}
                >
                  <Languages className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
                  {translating
                    ? translateProgress
                      ? `Перевод ${translateProgress.done}/${translateProgress.total}…`
                      : "Перевод…"
                    : itogPendingTranslateCount > 0
                      ? `Перевести (${itogPendingTranslateCount})`
                      : "Перевести"}
                </Button>
                <Button
                  type="button"
                  className="filter-button"
                  disabled={saving || translating}
                  onClick={handleRemoveItogStopRows}
                >
                  Удалить STOP строки
                </Button>
              </>
            ) : null}
            {activeSheet.id === "kgd" ? (
              <>
                <Button type="button" className="filter-button" disabled={saving} onClick={handleRemoveKgdDuplicates}>
                  Удалить дубли
                </Button>
                <Button type="button" className="filter-button" disabled={saving} onClick={handleRecalcItogFromKgd}>
                  Пересчитать итог
                </Button>
              </>
            ) : null}
            {activeSheet.id.startsWith("ul-") ? (
              <Button
                type="button"
                className="filter-button"
                disabled={saving}
                onClick={handleDeleteUlSheet}
              >
                <Trash2 className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
                Удалить УЛ
              </Button>
            ) : null}
            {activeSheet.id === "stop" ? (
              <div className="hr-stop-add">
                <input
                  type="text"
                  className="hr-stop-add__input"
                  placeholder="Наименование…"
                  value={newStopWord}
                  onChange={(e) => setNewStopWord(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddStopWord();
                    }
                  }}
                />
                <Button
                  type="button"
                  className="filter-button"
                  disabled={saving || !newStopWord.trim()}
                  onClick={handleAddStopWord}
                >
                  Добавить STOP
                </Button>
              </div>
            ) : null}
            <Typography.Body style={{ color: "var(--color-text-secondary)", alignSelf: "center" }}>
              {loadingUlTab === activeSheet.id
                ? "Загрузка листа…"
                : `${activeDataRowCount} строк`}
            </Typography.Body>
            <Button
              type="button"
              className="filter-button"
              onClick={() => setWorkbookTableCollapsed((v) => !v)}
            >
              {workbookTableCollapsed ? (
                <>
                  <ChevronDown className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
                  Показать таблицу
                </>
              ) : (
                <>
                  <ChevronUp className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
                  Свернуть
                </>
              )}
            </Button>
          </Flex>

          {workbookTableCollapsed ? (
            <button
              type="button"
              className="hr-table-collapsed"
              onClick={() => setWorkbookTableCollapsed(false)}
            >
              <span className="hr-table-collapsed__title">Лист «{activeSheet.name}»</span>
              <span className="hr-table-collapsed__meta">
                {loadingUlTab === activeSheet.id ? "Загрузка…" : `${activeDataRowCount} строк · нажмите, чтобы развернуть`}
              </span>
            </button>
          ) : (
            <>
              {activeSheet.id.startsWith("ul-") && auth ? (
                <div className="hr-ul-meta-panels">
                  <HaulzUlCarrierPanel
                    auth={auth}
                    sheetId={activeSheet.id}
                    carrierId={activeSheet.carrierId}
                    onCarrierChange={(carrierId) => handleUlCarrierChange(activeSheet.id, carrierId)}
                    onError={setError}
                  />
                  <HaulzUlTdField
                    sheetId={activeSheet.id}
                    tdNumber={activeSheet.tdNumber}
                    onTdChange={(tdNumber) => handleUlTdChange(activeSheet.id, tdNumber)}
                    disabled={saving}
                  />
                </div>
              ) : null}
              <HaulzReturnsWorkbookView
              sheet={activeSheet}
              canDelete={
                activeSheet.id === "itog" ||
                activeSheet.id === "stop" ||
                activeSheet.id === "fix" ||
                activeSheet.id.startsWith("ul-")
              }
              onDeleteRow={
                activeSheet.id === "itog" || activeSheet.id === "fix"
                  ? handleDeleteItogRow
                  : activeSheet.id === "stop"
                    ? handleDeleteStopRow
                    : activeSheet.id.startsWith("ul-")
                      ? handleDeleteUlRow
                      : undefined
              }
            />
            </>
          )}

          {workbook && jobId && auth ? (
            <HaulzCustomsPanel
              auth={auth}
              jobId={jobId}
              workbook={workbook}
              carriers={carriers}
              onDraftChange={handleTdDraftChange}
              onError={setError}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
