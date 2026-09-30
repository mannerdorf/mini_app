import React from "react";
import { ArrowDown, ArrowUpRight, CheckCircle2, GitBranch, Network } from "lucide-react";
import type { ProgramTask, ProgramTrack } from "../../../../../lib/mediaMarketing/programTypes";
import { progress, STATUS, TRACKS } from "./programUi";

export function ProgramMap({ tasks, track, selectedId, onTrack, onSelect }: {
  tasks: ProgramTask[]; track: ProgramTrack | "all"; selectedId: string | null;
  onTrack: (track: ProgramTrack | "all") => void; onSelect: (id: string) => void;
}) {
  const selected = tasks.find((task) => task.id === selectedId);
  const visible = tasks.filter((task) => track === "all" || task.track === track);
  const dependencies = selected?.dependencies.map((id) => tasks.find((task) => task.id === id)).filter((task): task is ProgramTask => Boolean(task)) ?? [];
  const dependents = selected ? tasks.filter((task) => task.dependencies.includes(selected.id)) : [];
  return <section className="gp-card gp-map-card">
    <div className="gp-section-heading"><div><span className="gp-eyebrow">PROGRAM MAP</span><h2>Из стратегии — в действие</h2><p>Выберите направление, затем задачу. Карта ниже покажет её зависимости.</p></div><span className="gp-outline-badge"><Network size={14} />6 направлений</span></div>
    <div className="gp-map">
      <svg className="gp-map-connectors" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true"><path d="M500 150 C380 150 380 45 230 45 M500 150 H230 M500 150 C380 150 380 255 230 255 M500 150 C620 150 620 45 770 45 M500 150 H770 M500 150 C620 150 620 255 770 255" /></svg>
      <button type="button" className={`gp-map-hub ${track === "all" ? "is-selected" : ""}`} onClick={() => onTrack("all")} aria-pressed={track === "all"}><Network size={27} /><strong>SEO / AEO / GEO</strong><span>Система роста HAULZ</span><small>{tasks.length} задач в программе</small></button>
      {TRACKS.map((item, index) => { const summary = progress(tasks.filter((task) => task.track === item.id)); return <button type="button" style={{ "--track-color": item.color, gridArea: `track${index}` } as React.CSSProperties} className={`gp-map-node ${track === item.id ? "is-selected" : ""}`} key={item.id} onClick={() => onTrack(item.id)} aria-pressed={track === item.id}><span className="gp-map-node-top"><strong>{item.label}</strong><ArrowUpRight size={15} /></span><span>{item.description}</span><span className="gp-map-node-bottom"><span>{summary.done}/{summary.total} готово</span><b>{summary.percent}%</b></span><span className="gp-progress"><span style={{ width: `${summary.percent}%`, background: item.color }} /></span></button>; })}
    </div>
    <div className="gp-map-tasks-heading"><h3>{track === "all" ? "Все задачи программы" : TRACKS.find((item) => item.id === track)?.label}</h3><span className="gp-muted">{visible.length} задач · нажмите, чтобы открыть</span></div>
    <div className="gp-map-tasks">{visible.map((task) => <button key={task.id} type="button" className={`gp-map-task ${selectedId === task.id ? "is-selected" : ""}`} onClick={() => onSelect(task.id)} aria-pressed={selectedId === task.id}><span className={`gp-status-dot gp-status-${task.status}`} /><span><small><b>{task.id}</b> · {task.priority} · Этап {task.phase}</small>{task.title}</span>{task.status === "done" ? <CheckCircle2 size={15} /> : <ArrowUpRight size={15} />}</button>)}</div>
    {selected && <div className="gp-dependency-map"><h3><GitBranch size={17} />Связи выбранной задачи</h3><div className="gp-dependency-columns"><div><span className="gp-eyebrow">СНАЧАЛА</span>{dependencies.length ? dependencies.map((task) => <button type="button" key={task.id} onClick={() => onSelect(task.id)}><span className={`gp-status-dot gp-status-${task.status}`} /><span>{task.title}<small>{STATUS[task.status]}</small></span></button>) : <p className="gp-muted">Нет входящих зависимостей</p>}</div><ArrowDown size={19} className="gp-dependency-arrow" /><div className="gp-dependency-current"><span className="gp-eyebrow">ВЫБРАНО</span><strong>{selected.title}</strong><span className={`gp-status-label gp-status-${selected.status}`}>{STATUS[selected.status]}</span></div><ArrowDown size={19} className="gp-dependency-arrow" /><div><span className="gp-eyebrow">ЗАТЕМ</span>{dependents.length ? dependents.map((task) => <button type="button" key={task.id} onClick={() => onSelect(task.id)}><span className={`gp-status-dot gp-status-${task.status}`} /><span>{task.title}<small>{STATUS[task.status]}</small></span></button>) : <p className="gp-muted">Нет следующих задач</p>}</div></div></div>}
  </section>;
}
