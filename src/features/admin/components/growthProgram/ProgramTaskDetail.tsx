import React, { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, FileText, Link2, Loader2, Save } from "lucide-react";
import type { ProgramTask, ProgramTaskPatch } from "../../../../../lib/mediaMarketing/programTypes";
import { formatDate, safeExternalUrl, STATUS, TRACKS } from "./programUi";
import { ProgramConflictReview } from "./ProgramConflictReview";

type Draft = ProgramTaskPatch & { expected_updated_at: string | null };
type Props = {
  task: ProgramTask | null;
  tasks: ProgramTask[];
  readOnly: boolean;
  mutationPending: boolean;
  drafts: Record<string, Draft>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, Draft>>>;
  onSelect: (id: string) => void;
  onSave: (draft: Draft) => Promise<void>;
  onNavigateMedia?: (tab: "checklist" | "mediaplan" | "ads") => void;
};

export function ProgramTaskDetail({ task, tasks, readOnly, mutationPending, drafts, setDrafts, onSelect, onSave, onNavigateMedia }: Props) {
  const [saving, setSaving] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, { error?: string; saved?: boolean }>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(null), 2200); return () => clearTimeout(timer); }, [copied]);
  useEffect(() => { if (!task || !window.matchMedia("(max-width: 820px)").matches) return; const frame = requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })); return () => cancelAnimationFrame(frame); }, [task?.id]);
  if (!task) return <aside className="gp-card gp-detail gp-empty"><FileText size={28} /><h3>Откройте задачу</h3><p>Здесь появятся критерии готовности, зависимости, файлы и история работы.</p></aside>;
  const draft = drafts[task.id];
  const values = draft ?? task;
  const message = messages[task.id];
  const busy = mutationPending || saving !== null;
  const stale = Boolean(draft && draft.expected_updated_at !== task.updated_at);
  const track = TRACKS.find((item) => item.id === task.track)!;
  const update = (patch: Partial<ProgramTaskPatch>) => {
    const { id, status, owner, notes, evidence, updated_at } = task;
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] ?? { id, status, owner, notes, evidence, expected_updated_at: updated_at }), ...patch } }));
    setMessages((current) => ({ ...current, [id]: {} }));
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || readOnly || busy || stale) return;
    const id = task.id;
    setSaving(id);
    try {
      await onSave(draft);
      setDrafts((current) => { const next = { ...current }; delete next[id]; return next; });
      setMessages((current) => ({ ...current, [id]: { saved: true } }));
    } catch (error) { setMessages((current) => ({ ...current, [id]: { error: error instanceof Error ? error.message : "Не удалось сохранить задачу" } })); }
    finally { setSaving(null); }
  };
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(value); }
    catch { setMessages((current) => ({ ...current, [task.id]: { error: "Буфер обмена недоступен. Выделите и скопируйте путь вручную." } })); }
  };
  const dependencies = task.dependencies.map((id) => tasks.find((item) => item.id === id)).filter((item): item is ProgramTask => Boolean(item));
  const dependents = tasks.filter((item) => item.dependencies.includes(task.id));
  return <aside ref={detailRef} className="gp-card gp-detail" aria-label="Детали задачи">
    <div className="gp-detail-heading"><span className="gp-eyebrow" style={{ color: track.color }}>{track.label} / Этап {task.phase}</span><span className={`gp-priority gp-priority-${task.priority.toLowerCase()}`}>{task.priority}</span></div>
    <h3>{task.title}</h3>
    <code className="gp-task-id">{task.id}</code>
    <p className="gp-description">{task.description}</p>
    <div className="gp-acceptance"><Check size={16} /><div><strong>Критерий готовности</strong><p>{task.acceptance}</p></div></div>
    <form onSubmit={save} className="gp-form">
      <fieldset disabled={readOnly || busy}>
        <div className="gp-form-pair"><label>Статус<select value={values.status} onChange={(event) => update({ status: event.target.value as ProgramTask["status"] })}>{Object.entries(STATUS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>Ответственный<input value={values.owner} maxLength={160} onChange={(event) => update({ owner: event.target.value })} placeholder="Имя или команда" /></label></div>
        <label>Заметки<textarea value={values.notes} maxLength={10000} rows={3} onChange={(event) => update({ notes: event.target.value })} placeholder="Решения, текущий шаг, причины блокировки" /></label>
        <label>Подтверждение результата{values.status === "done" ? " · обязательно" : ""}<textarea value={values.evidence} required={values.status === "done"} maxLength={10000} rows={2} onChange={(event) => update({ evidence: event.target.value })} placeholder="Ссылки, результаты проверки, путь к отчёту" /></label>
        {stale && draft && <ProgramConflictReview disabled={busy || readOnly} fields={[{ label: "Статус", server: STATUS[task.status], draft: STATUS[draft.status] }, { label: "Ответственный", server: task.owner, draft: draft.owner }, { label: "Заметки", server: task.notes, draft: draft.notes }, { label: "Подтверждение", server: task.evidence, draft: draft.evidence }]} onAccept={() => { update({}); setDrafts((current) => ({ ...current, [task.id]: { ...current[task.id], expected_updated_at: task.updated_at } })); }} />}
        <div className="gp-save-row"><button type="submit" className="gp-button gp-button-primary" disabled={!draft || busy || stale}>{busy ? <Loader2 size={15} className="gp-spin" /> : <Save size={15} />}{busy ? "Сохраняем…" : "Сохранить"}</button>
          {draft && <button type="button" className="gp-button gp-button-quiet" onClick={() => { setDrafts((current) => { const next = { ...current }; delete next[task.id]; return next; }); setMessages((current) => ({ ...current, [task.id]: {} })); }}>Отменить правки</button>}</div>
      </fieldset>
      <div className="gp-save-feedback" aria-live="polite">{message?.error ? <span className="gp-error-text" role="alert">{message.error}</span> : message?.saved ? <span className="gp-success-text">Сохранено на сервере</span> : draft ? <span>Есть несохранённые изменения</span> : <span>{readOnly ? "Доступен просмотр. Сохранение появится после настройки хранилища." : `Обновлено: ${formatDate(task.updated_at)}`}</span>}</div>
    </form>
    <div className="gp-detail-section"><h4><Link2 size={15} />Зависимости <span>{dependencies.length}</span></h4>{dependencies.length ? <div className="gp-dependencies">{dependencies.map((dependency) => <button key={dependency.id} type="button" onClick={() => onSelect(dependency.id)}><span className={`gp-status-dot gp-status-${dependency.status}`} /><span>{dependency.title}<small>{STATUS[dependency.status]}</small></span><ArrowUpRight size={14} /></button>)}</div> : <p className="gp-muted">Можно начать независимо от других задач.</p>}
      {dependents.length > 0 && <><h4 className="gp-dependents-title">Открывает следующие задачи</h4><div className="gp-dependencies">{dependents.map((dependent) => <button key={dependent.id} type="button" onClick={() => onSelect(dependent.id)}><span className={`gp-status-dot gp-status-${dependent.status}`} /><span>{dependent.title}</span><ArrowUpRight size={14} /></button>)}</div></>}
    </div>
    <div className="gp-detail-section"><h4><FileText size={15} />Файлы и контекст</h4><div className="gp-file-list">{task.files.map((file) => <div key={file}><code>{file}</code><button type="button" title="Скопировать путь" aria-label={`Скопировать путь ${file}`} onClick={() => copy(file)}>{copied === file ? <Check size={14} /> : <Copy size={14} />}</button></div>)}{!task.files.length && <p className="gp-muted">Файлы пока не указаны.</p>}</div>
      {task.links.map((link) => { const href = safeExternalUrl(link.url); return href ? <a className="gp-resource-link" key={link.url} href={href} target="_blank" rel="noopener noreferrer">{link.label}<ArrowUpRight size={14} /></a> : <span className="gp-muted" key={link.url}>{link.label}: {link.url}</span>; })}
    </div>
    {onNavigateMedia && <div className="gp-detail-section gp-related-tools"><h4>Рабочие инструменты</h4><button type="button" onClick={() => onNavigateMedia("mediaplan")}>Медиаплан <ArrowUpRight size={14} /></button><button type="button" onClick={() => onNavigateMedia("checklist")}>SEO чек-лист <ArrowUpRight size={14} /></button><button type="button" onClick={() => onNavigateMedia("ads")}>Рекламные интеграции <ArrowUpRight size={14} /></button></div>}
  </aside>;
}
