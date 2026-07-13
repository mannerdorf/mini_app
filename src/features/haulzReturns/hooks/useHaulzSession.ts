import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthData } from "../../../types";
import {
  deleteHaulzReturnsJob,
  getHaulzReturnsJob,
  listHaulzReturnsJobs,
  processHaulzReturnsJob,
  renameHaulzReturnsJob,
  saveHaulzReturnsWorkbook,
  type HaulzReturnsFileMeta,
  type HaulzReturnsJobSummary,
} from "../../../api/client/haulzReturns";
import {
  applyWorkbookTdMeta,
  normalizeWorkbookColumns,
  type HaulzWorkbook,
} from "../../../lib/haulzReturns";
import { haulzJobDisplayTitle } from "../haulzReturnsPageUtils";
import type { FileSlot } from "../haulzReturnsPageUtils";

export type HaulzSessionSetters = {
  setOtpravkaFile: React.Dispatch<React.SetStateAction<File | null>>;
  setUlPrio1: React.Dispatch<React.SetStateAction<FileSlot[]>>;
  setUlPrio2: React.Dispatch<React.SetStateAction<FileSlot[]>>;
  setWorkbook: React.Dispatch<React.SetStateAction<HaulzWorkbook | null>>;
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
  setWorkbookTableCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  setTdPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setProcessing: React.Dispatch<React.SetStateAction<boolean>>;
};

type UseHaulzSessionParams = {
  auth: AuthData | null;
  hydrateDeferredItogSheet: (currentWorkbook: HaulzWorkbook, currentJobId: string) => Promise<HaulzWorkbook>;
  setters: HaulzSessionSetters;
  otpravkaFile: File | null;
  workbook: HaulzWorkbook | null;
};

export function useHaulzSession({
  auth,
  hydrateDeferredItogSheet,
  setters,
  otpravkaFile,
  workbook,
}: UseHaulzSessionParams) {
  const {
    setOtpravkaFile,
    setUlPrio1,
    setUlPrio2,
    setWorkbook,
    setActiveTab,
    setWorkbookTableCollapsed,
    setTdPanelOpen,
    setError,
    setProcessing,
  } = setters;

  const [jobId, setJobId] = useState<string | null>(null);
  const [storedFiles, setStoredFiles] = useState<HaulzReturnsFileMeta[]>([]);
  const [jobs, setJobs] = useState<HaulzReturnsJobSummary[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [renamingJobId, setRenamingJobId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const autoLoadedSessionRef = useRef(false);

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
  }, [auth, setError]);

  useEffect(() => {
    void refreshJobs();
  }, [refreshJobs]);

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
          const savedTdMeta = {
            tdDraft: data.workbook.tdDraft,
            tdPrepared: data.workbook.tdPrepared,
          };
          let wb = await hydrateDeferredItogSheet(data.workbook, id);
          wb = normalizeWorkbookColumns(wb);
          wb = applyWorkbookTdMeta(savedTdMeta, wb);
          setActiveTab("itog");
          setWorkbookTableCollapsed(false);
          setWorkbook(wb);
          if (data.needsUlTdDatePersist) {
            await saveHaulzReturnsWorkbook(auth, id, wb);
          }
          if (wb.tdPrepared) setTdPanelOpen(true);
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
    [
      auth,
      hydrateDeferredItogSheet,
      setError,
      setProcessing,
      setOtpravkaFile,
      setUlPrio1,
      setUlPrio2,
      setWorkbook,
      setActiveTab,
      setWorkbookTableCollapsed,
      setTdPanelOpen,
    ],
  );

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
    [auth, jobId, renamingJobId, refreshJobs, setError, setWorkbook, setWorkbookTableCollapsed],
  );

  const startRenameJob = useCallback(
    (job: HaulzReturnsJobSummary) => {
      setRenamingJobId(job.id);
      setRenameDraft(haulzJobDisplayTitle(job));
      setError(null);
    },
    [setError],
  );

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
  }, [auth, renamingJobId, renameDraft, cancelRenameJob, setError]);

  return {
    jobId,
    setJobId,
    storedFiles,
    setStoredFiles,
    jobs,
    loadingJobs,
    renamingJobId,
    renameDraft,
    setRenameDraft,
    renaming,
    refreshJobs,
    loadJob,
    handleDeleteJob,
    startRenameJob,
    cancelRenameJob,
    saveRenameJob,
  };
}
