import { ChevronUp, Download, FileSpreadsheet, Trash2, Upload } from "lucide-react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import type { AuthData } from "../../types";
import type { HaulzReturnsFileMeta } from "../../api/client/haulzReturns";
import { downloadStoredFile, type FileSlot, type UploadProgress } from "./haulzReturnsPageUtils";

type Props = {
  auth: AuthData;
  jobId: string | null;
  otpravkaFile: File | null;
  ulPrio1: FileSlot[];
  ulPrio2: FileSlot[];
  storedFiles: HaulzReturnsFileMeta[];
  storedFilesCollapsed: boolean;
  setStoredFilesCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  canAddUlToSession: boolean;
  canProcess: boolean;
  processing: boolean;
  previewing: boolean;
  uploadProgress: UploadProgress | null;
  handleOtpravkaChange: (list: FileList | null) => void;
  addUlFiles: (list: FileList | null, prio: 1 | 2) => void;
  removeUl: (id: string, prio: 1 | 2) => void;
  handleAddUlToSession: () => void;
  handleProcess: () => void;
};

export function HaulzUploadPanel({
  auth,
  jobId,
  otpravkaFile,
  ulPrio1,
  ulPrio2,
  storedFiles,
  storedFilesCollapsed,
  setStoredFilesCollapsed,
  canAddUlToSession,
  canProcess,
  processing,
  previewing,
  uploadProgress,
  handleOtpravkaChange,
  addUlFiles,
  removeUl,
  handleAddUlToSession,
  handleProcess,
}: Props) {
  return (
    <>
      <div className="hr-upload-grid">
        <label className="hr-upload-card">
          <FileSpreadsheet className="hr-upload-icon" />
          <span className="hr-upload-title">Документ отправка</span>
          {otpravkaFile ? (
            <span className="hr-upload-file">{otpravkaFile.name}</span>
          ) : (
            <span className="hr-upload-hint">Один файл .xlsx</span>
          )}
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
      </Flex>

      {uploadProgress ? (
        <Typography.Body style={{ color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
          Загрузка {uploadProgress.current}/{uploadProgress.total}: {uploadProgress.fileName}
        </Typography.Body>
      ) : null}
    </>
  );
}
