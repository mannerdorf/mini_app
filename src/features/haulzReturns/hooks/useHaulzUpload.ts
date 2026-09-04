import { useCallback, useState } from "react";
import type { AuthData } from "../../../types";
import {
  createHaulzReturnsJob,
  getHaulzReturnsJob,
  processHaulzReturnsJob,
  saveHaulzReturnsWorkbook,
  uploadHaulzReturnsFilesSequentially,
  type HaulzReturnsUploadItem,
} from "../../../api/client/haulzReturns";
import {
  buildWorkbook,
  normalizeWorkbookColumns,
  parseOtpravkaBuffer,
  parseUlBuffer,
  type HaulzWorkbook,
} from "../../../lib/haulzReturns";
import { uid, type FileSlot, type UploadProgress } from "../haulzReturnsPageUtils";

type UseHaulzUploadParams = {
  auth: AuthData | null;
  jobId: string | null;
  setJobId: React.Dispatch<React.SetStateAction<string | null>>;
  setStoredFiles: React.Dispatch<React.SetStateAction<import("../../../api/client/haulzReturns").HaulzReturnsFileMeta[]>>;
  setWorkbook: React.Dispatch<React.SetStateAction<HaulzWorkbook | null>>;
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
  setWorkbookTableCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  refreshJobs: () => Promise<void>;
  hydrateDeferredItogSheet: (currentWorkbook: HaulzWorkbook, currentJobId: string) => Promise<HaulzWorkbook>;
};

export function useHaulzUpload({
  auth,
  jobId,
  setJobId,
  setStoredFiles,
  setWorkbook,
  setActiveTab,
  setWorkbookTableCollapsed,
  setError,
  refreshJobs,
  hydrateDeferredItogSheet,
}: UseHaulzUploadParams) {
  const [otpravkaFile, setOtpravkaFile] = useState<File | null>(null);
  const [ulPrio1, setUlPrio1] = useState<FileSlot[]>([]);
  const [ulPrio2, setUlPrio2] = useState<FileSlot[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [processing, setProcessing] = useState(false);
  const [previewing, setPreviewing] = useState(false);

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

  const handleOtpravkaChange = useCallback(
    (list: FileList | null) => {
      const file = list?.[0] ?? null;
      setOtpravkaFile(file);
      setJobId(null);
      setStoredFiles([]);
      if (!file) setWorkbook(null);
      setWorkbookTableCollapsed(false);
      setError(null);
    },
    [setJobId, setStoredFiles, setWorkbook, setWorkbookTableCollapsed, setError],
  );

  const addUlFiles = useCallback(
    (list: FileList | null, prio: 1 | 2) => {
      if (!list?.length) return;
      const slots = Array.from(list).map((file) => ({ id: uid(), file }));
      if (prio === 1) setUlPrio1((prev) => [...prev, ...slots]);
      else setUlPrio2((prev) => [...prev, ...slots]);
      if (!jobId) {
        setWorkbookTableCollapsed(false);
      }
      setError(null);
    },
    [jobId, setWorkbookTableCollapsed, setError],
  );

  const removeUl = useCallback(
    (id: string, prio: 1 | 2) => {
      if (prio === 1) setUlPrio1((prev) => prev.filter((s) => s.id !== id));
      else setUlPrio2((prev) => prev.filter((s) => s.id !== id));
      setJobId(null);
      setWorkbookTableCollapsed(false);
    },
    [setJobId, setWorkbookTableCollapsed],
  );

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

      // Сначала локальная сборка — не зависит от загрузки Excel на сервер.
      setUploadProgress({ current: 0, total: uploadQueue.length, fileName: "сборка…" });
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
      setWorkbook(wbLocal);
      setActiveTab("itog");
      setWorkbookTableCollapsed(false);

      const newJobId = await createHaulzReturnsJob(auth, title);
      setJobId(newJobId);

      let uploadError: string | null = null;
      try {
        await uploadHaulzReturnsFilesSequentially(auth, newJobId, uploadQueue, (current, total, fileName) => {
          setUploadProgress({ current, total, fileName });
        });
      } catch (e: unknown) {
        uploadError = (e as Error)?.message || "Ошибка загрузки файлов";
      }
      setUploadProgress(null);

      if (!uploadError) {
        try {
          await processHaulzReturnsJob(auth, newJobId);
        } catch (e: unknown) {
          uploadError = (e as Error)?.message || "Ошибка обработки на сервере";
        }
      }

      // Если upload/process упали — всё равно сохраняем локальный workbook (как 5 POST).
      if (uploadError) {
        try {
          await saveHaulzReturnsWorkbook(auth, newJobId, wbLocal);
        } catch {
          // локальный wb уже на экране
        }
        setError(`${uploadError}. Показана локальная сборка — можно работать с таблицей.`);
      }

      try {
        const loaded = await getHaulzReturnsJob(auth, newJobId);
        setStoredFiles(loaded.files);
        let wb = loaded.workbook
          ? normalizeWorkbookColumns(await hydrateDeferredItogSheet(loaded.workbook, newJobId))
          : wbLocal;
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
  }, [
    auth,
    otpravkaFile,
    ulPrio1,
    ulPrio2,
    refreshJobs,
    hydrateDeferredItogSheet,
    setJobId,
    setStoredFiles,
    setWorkbook,
    setActiveTab,
    setWorkbookTableCollapsed,
    setError,
  ]);

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
  }, [
    auth,
    jobId,
    ulPrio1,
    ulPrio2,
    refreshJobs,
    hydrateDeferredItogSheet,
    setStoredFiles,
    setWorkbook,
    setActiveTab,
    setWorkbookTableCollapsed,
    setError,
  ]);

  const canProcess =
    Boolean(auth) && !jobId && Boolean(otpravkaFile) && (ulPrio1.length > 0 || ulPrio2.length > 0) && !processing;

  const canAddUlToSession =
    Boolean(auth) && Boolean(jobId) && (ulPrio1.length > 0 || ulPrio2.length > 0) && !processing;

  return {
    otpravkaFile,
    setOtpravkaFile,
    ulPrio1,
    setUlPrio1,
    ulPrio2,
    setUlPrio2,
    uploadProgress,
    processing,
    setProcessing,
    previewing,
    setPreviewing,
    buildLocalWorkbookPreview,
    handleOtpravkaChange,
    addUlFiles,
    removeUl,
    handleProcess,
    handleAddUlToSession,
    canProcess,
    canAddUlToSession,
  };
}
