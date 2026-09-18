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

  const [jobId, setJobIdState] = useState<string | null>(null);
  const loadSequence = useRef(0);
  const listSequence = useRef(0);
  const authRef = useRef(auth);
  const loadedFor = useRef<typeof auth>(null);
  if (authRef.current?.login !== auth?.login || authRef.current?.password !== auth?.password) {
    authRef.current = auth;
    loadedFor.current = null;
    ++loadSequence.current; ++listSequence.current;
  }
  const setJobId = useCallback<React.Dispatch<React.SetStateAction<string | null>>>((value) => {
    ++loadSequence.current;
    setJobIdState(value);
    setProcessing(false);
  }, [setProcessing]);
  const [storedFiles, setStoredFiles] = useState<HaulzReturnsFileMeta[]>([]);
  const [jobs, setJobs] = useState<HaulzReturnsJobSummary[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [renamingJobId, setRenamingJobId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const autoLoadedSessionRef = useRef(false);

  useEffect(() => {
    autoLoadedSessionRef.current = false;
    setJobIdState(null); setStoredFiles([]); setJobs([]); setWorkbook(null);
    setOtpravkaFile(null); setUlPrio1([]); setUlPrio2([]); setProcessing(false);
    setJobsError(null); setRenamingJobId(null); setRenameDraft(""); setRenaming(false); setError(null);
    return () => { ++loadSequence.current; ++listSequence.current; };
  }, [auth?.login, auth?.password]);

  const refreshJobs = useCallback(async () => {
    if (!auth) return;
    const seq = ++listSequence.current;
    setLoadingJobs(true);setJobsError(null);
    try {
      const result = await listHaulzReturnsJobs(auth);
      if (seq === listSequence.current) { loadedFor.current = authRef.current; setJobs(result); }
    } catch (e: unknown) {
      if (seq === listSequence.current) setJobsError((e as Error)?.message || "Не удалось загрузить список сессий");
    } finally {
      if (seq === listSequence.current) setLoadingJobs(false);
    }
  }, [auth, setError]);

  useEffect(() => {
    void refreshJobs();
  }, [refreshJobs]);

  const loadJob = useCallback(
    async (id: string) => {
      if (!auth) return;
      const seq = ++loadSequence.current;
      const current = () => seq === loadSequence.current;
      setError(null);
      setProcessing(true);
      setJobIdState(null); setStoredFiles([]); setWorkbook(null);
      try {
        let data = await getHaulzReturnsJob(auth, id);
        if (!current()) return;

        if (!data.workbook && data.files.length > 0) {
          await processHaulzReturnsJob(auth, id);
          if (!current()) return;
          data = await getHaulzReturnsJob(auth, id);
          if (!current()) return;
        }

        if (data.workbook) {
          const savedTdMeta = {
            tdDraft: data.workbook.tdDraft,
            tdPrepared: data.workbook.tdPrepared,
          };
          let wb = await hydrateDeferredItogSheet(data.workbook, id);
          if (!current()) return;
          wb = normalizeWorkbookColumns(wb);
          wb = applyWorkbookTdMeta(savedTdMeta, wb);
          if (data.needsUlTdDatePersist) {
            await saveHaulzReturnsWorkbook(auth, id, wb);
            if (!current()) return;
          }
          setActiveTab("itog");
          setWorkbookTableCollapsed(false);
          setWorkbook(wb);
          setTdPanelOpen(Boolean(wb.tdPrepared));
        } else {
          setWorkbook(null);
          setWorkbookTableCollapsed(false);
        }
        setJobIdState(id); setStoredFiles(data.files);
        setOtpravkaFile(null); setUlPrio1([]); setUlPrio2([]);
        if (data.job.error_message) setError(data.job.error_message);
      } catch (e: unknown) {
        if (current()) setError((e as Error)?.message || "Ошибка загрузки сессии");
      } finally {
        if (current()) setProcessing(false);
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
    if (autoLoadedSessionRef.current || loadingJobs || !auth || loadedFor.current !== authRef.current) return;
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
      const seq = ++loadSequence.current;
      setProcessing(false);
      try {
        await deleteHaulzReturnsJob(auth, id);
        if (seq !== loadSequence.current) return;
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
        if (seq === loadSequence.current) setError((e as Error)?.message || "Ошибка удаления");
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
    const owner = authRef.current;
    try {
      const savedTitle = await renameHaulzReturnsJob(auth, renamingJobId, title);
      if (owner !== authRef.current) return;
      setJobs((prev) => prev.map((j) => (j.id === renamingJobId ? { ...j, title: savedTitle } : j)));
      cancelRenameJob();
      setError(null);
    } catch (e: unknown) {
      if (owner === authRef.current) setError((e as Error)?.message || "Ошибка переименования");
    } finally {
      if (owner === authRef.current) setRenaming(false);
    }
  }, [auth, renamingJobId, renameDraft, cancelRenameJob, setError]);

  return {
    jobId,
    setJobId,
    storedFiles,
    setStoredFiles,
    jobs,
    loadingJobs,
    jobsError,
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
