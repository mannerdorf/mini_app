import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, FileSpreadsheet, FolderOpen, Trash2, Upload } from "lucide-react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import type { AuthData } from "../types";
import {
  createHaulzReturnsJob,
  deleteHaulzReturnsJob,
  getHaulzReturnsJob,
  listHaulzReturnsJobs,
  processHaulzReturnsJob,
  saveHaulzReturnsWorkbook,
  uploadHaulzReturnsFilesSequentially,
  type HaulzReturnsUploadItem,
  type HaulzReturnsFileMeta,
  type HaulzReturnsJobSummary,
} from "../api/client/haulzReturns";
import { HaulzReturnsWorkbookView } from "../features/haulzReturns/HaulzReturnsWorkbookView";
import {
  buildFixSheetFromItog,
  buildUlSheetForParsedFile,
  buildWorkbook,
  downloadBlob,
  exportSheetToExcel,
  parseOtpravkaBuffer,
  parseUlBuffer,
  recalcWorkbookAfterItogChange,
  type HaulzWorkbook,
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
  onBack: () => void;
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

export function HaulzReturnsPage({ auth, onBack }: Props) {
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

  const tabs = useMemo(
    () => workbook?.sheets.map((s) => ({ id: s.id, label: s.name })) ?? [],
    [workbook],
  );

  const activeSheet = workbook?.sheets.find((s) => s.id === activeTab) ?? workbook?.sheets[0];

  const ensureUlSheetLoaded = useCallback(
    async (tabId: string, currentWorkbook: HaulzWorkbook, currentJobId: string, files: HaulzReturnsFileMeta[]) => {
      if (!auth || !tabId.startsWith("ul-")) return currentWorkbook;
      const sheet = currentWorkbook.sheets.find((s) => s.id === tabId);
      if (!sheet || (sheet.rows.length > 0 && !sheet.ulDeferred)) return currentWorkbook;

      const ulNumber = tabId.slice(3);
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

  const loadJob = useCallback(
    async (id: string) => {
      if (!auth) return;
      setError(null);
      setProcessing(true);
      try {
        const data = await getHaulzReturnsJob(auth, id);
        setJobId(id);
        setStoredFiles(data.files);
        setOtpravkaFile(null);
        setUlPrio1([]);
        setUlPrio2([]);
        if (data.workbook) {
          setWorkbook(data.workbook);
          setActiveTab("itog");
        } else {
          setWorkbook(null);
        }
        if (data.job.error_message) setError(data.job.error_message);
      } catch (e: unknown) {
        setError((e as Error)?.message || "Ошибка загрузки сессии");
      } finally {
        setProcessing(false);
      }
    },
    [auth],
  );

  const handleOtpravkaChange = useCallback((list: FileList | null) => {
    setOtpravkaFile(list?.[0] ?? null);
    setWorkbook(null);
    setJobId(null);
    setStoredFiles([]);
    setError(null);
  }, []);

  const addUlFiles = useCallback((list: FileList | null, prio: 1 | 2) => {
    if (!list?.length) return;
    const slots = Array.from(list).map((file) => ({ id: uid(), file }));
    if (prio === 1) setUlPrio1((prev) => [...prev, ...slots]);
    else setUlPrio2((prev) => [...prev, ...slots]);
    setWorkbook(null);
    setJobId(null);
    setError(null);
  }, []);

  const removeUl = useCallback((id: string, prio: 1 | 2) => {
    if (prio === 1) setUlPrio1((prev) => prev.filter((s) => s.id !== id));
    else setUlPrio2((prev) => prev.filter((s) => s.id !== id));
    setWorkbook(null);
    setJobId(null);
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
      const title = otpravkaFile.name.replace(/\.(xlsx|xls)$/i, "") || "Возвраты";
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
      const wbLocal = buildWorkbook({ otpravka, ulPrio1: ulPrio1Parsed, ulPrio2: ulPrio2Parsed });

      // #region agent log
      fetch("http://127.0.0.1:7764/ingest/18d9aceb-93ca-4e52-bbe7-c56dcb1cd38e", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e39252" },
        body: JSON.stringify({
          sessionId: "e39252",
          location: "HaulzReturnsPage.tsx:handleProcess",
          message: "before_server_process",
          hypothesisId: "G",
          data: {
            jobId: newJobId,
            itogRows: wbLocal.sheets.find((s) => s.id === "itog")?.rows.length ?? 0,
            sheetCount: wbLocal.sheets.length,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      await processHaulzReturnsJob(auth, newJobId);
      setJobId(newJobId);
      setWorkbook(wbLocal);
      setActiveTab("itog");
      try {
        const loaded = await getHaulzReturnsJob(auth, newJobId);
        setStoredFiles(loaded.files);
        await refreshJobs();
      } catch {
        /* результат уже на экране; обновление списка необязательно */
      }
    } catch (e: unknown) {
      setError((e as Error)?.message || "Ошибка обработки");
    } finally {
      setProcessing(false);
      setUploadProgress(null);
    }
  }, [auth, otpravkaFile, ulPrio1, ulPrio2, refreshJobs]);

  const handleDeleteItogRow = useCallback(
    (rowId: string) => {
      if (!workbook || !jobId) return;
      void (async () => {
        const sheets = workbook.sheets.map((sheet) => {
          if (sheet.id !== "itog") return sheet;
          return { ...sheet, rows: sheet.rows.filter((r) => r._rowId !== rowId) };
        });
        let next = recalcWorkbookAfterItogChange({ ...workbook, sheets });
        const fixIdx = next.sheets.findIndex((s) => s.id === "fix");
        if (fixIdx >= 0) {
          const itog = next.sheets.find((s) => s.id === "itog")!;
          const fix = buildFixSheetFromItog(itog);
          const updated = [...next.sheets];
          updated[fixIdx] = fix;
          next = { ...next, sheets: updated };
        }
        await persistWorkbook(next, jobId);
      })();
    },
    [workbook, jobId, persistWorkbook],
  );

  const handleCreateFix = useCallback(() => {
    if (!workbook || !jobId) return;
    void (async () => {
      const itog = workbook.sheets.find((s) => s.id === "itog");
      if (!itog) return;
      const fix = buildFixSheetFromItog(itog);
      const withoutFix = workbook.sheets.filter((s) => s.id !== "fix");
      const next = { ...workbook, sheets: [...withoutFix, fix] };
      setActiveTab("fix");
      await persistWorkbook(next, jobId);
    })();
  }, [workbook, jobId, persistWorkbook]);

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
        }
        await refreshJobs();
      } catch (e: unknown) {
        setError((e as Error)?.message || "Ошибка удаления");
      }
    },
    [auth, jobId, refreshJobs],
  );

  const canProcess =
    Boolean(auth) && Boolean(otpravkaFile) && (ulPrio1.length > 0 || ulPrio2.length > 0) && !processing;

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
        <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }} aria-label="Назад">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Typography.Headline className="text-page-title">Возвраты</Typography.Headline>
        {jobId ? (
          <Typography.Body style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>
            Сессия #{jobId}
            {saving ? " · сохранение…" : " · в БД"}
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
                <button type="button" className="hr-sessions-list__open" onClick={() => void loadJob(j.id)}>
                  <span className="hr-sessions-list__title">{j.otpravka_filename || j.title || `Сессия ${j.id}`}</span>
                  <span className="hr-sessions-list__meta">
                    {formatJobDate(j.created_at)} · {j.status} · файлов: {j.file_count}
                    {j.has_workbook ? " · результат" : ""}
                  </span>
                </button>
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
          <span className="hr-upload-hint">Можно несколько файлов</span>
          <input type="file" accept=".xlsx,.xls" multiple hidden onChange={(e) => addUlFiles(e.target.files, 1)} />
        </label>

        <label className="hr-upload-card">
          <Upload className="hr-upload-icon" />
          <span className="hr-upload-title">УЛ — приоритет 2</span>
          <span className="hr-upload-hint">Можно несколько файлов</span>
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
        <div className="hr-stored-files">
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Файлы в БД (исходники)</Typography.Body>
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
      ) : null}

      <Flex gap="0.5rem" wrap="wrap" style={{ marginTop: "1rem", marginBottom: "1rem" }}>
        <Button type="button" className="button-primary" disabled={!canProcess} onClick={() => void handleProcess()}>
          {processing ? "Обработка…" : "Обработать и сохранить"}
        </Button>
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
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`hr-tab-btn ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => handleTabSelect(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <Flex gap="0.5rem" wrap="wrap" style={{ margin: "0.75rem 0" }}>
            <Button type="button" className="filter-button" disabled={exporting} onClick={() => void handleExport()}>
              <Download className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
              {exporting ? "Экспорт…" : "Скачать Excel"}
            </Button>
            {activeSheet.id === "itog" ? (
              <Button type="button" className="filter-button" onClick={handleCreateFix}>
                Создать FIX
              </Button>
            ) : null}
            <Typography.Body style={{ color: "var(--color-text-secondary)", alignSelf: "center" }}>
              {loadingUlTab === activeSheet.id
                ? "Загрузка листа…"
                : `${activeSheet.rows.length} строк`}
            </Typography.Body>
          </Flex>

          <HaulzReturnsWorkbookView
            sheet={activeSheet}
            canDelete={activeSheet.id === "itog"}
            onDeleteRow={activeSheet.id === "itog" ? handleDeleteItogRow : undefined}
          />
        </>
      ) : null}
    </div>
  );
}
