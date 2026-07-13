import { FolderOpen, Pencil, Trash2 } from "lucide-react";
import { Button, Typography } from "@maxhub/max-ui";
import type { HaulzReturnsJobSummary } from "../../api/client/haulzReturns";
import { formatJobDate, haulzJobDisplayTitle } from "./haulzReturnsPageUtils";

type Props = {
  jobs: HaulzReturnsJobSummary[];
  loadingJobs: boolean;
  jobId: string | null;
  renamingJobId: string | null;
  renameDraft: string;
  renaming: boolean;
  setRenameDraft: (value: string) => void;
  loadJob: (id: string) => void;
  handleDeleteJob: (id: string) => void;
  startRenameJob: (job: HaulzReturnsJobSummary) => void;
  cancelRenameJob: () => void;
  saveRenameJob: () => void;
};

export function HaulzSessionList({
  jobs,
  loadingJobs,
  jobId,
  renamingJobId,
  renameDraft,
  renaming,
  setRenameDraft,
  loadJob,
  handleDeleteJob,
  startRenameJob,
  cancelRenameJob,
  saveRenameJob,
}: Props) {
  return (
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
  );
}
