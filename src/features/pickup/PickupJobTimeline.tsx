import { PickupTimelinePhotos } from "./PickupTimelinePhotos";
import { useEffect, useState } from "react";
import type { PickupCall } from "./client";
import { jobTimeline, type JobHistory } from "./jobTimeline";

export function PickupJobTimeline({ id, version, call, photoCount = 0 }: { id: string; version: number; call: PickupCall; photoCount?: number }) {
  const [history, setHistory] = useState<JobHistory | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setHistory(null); setError("");
    call<JobHistory>({ action: "job_history", id }).then((data) => {
      if (!cancelled) setHistory(data);
    }).catch((e) => { if (!cancelled) setError(e.message || "Не удалось загрузить историю"); });
    return () => { cancelled = true; };
  }, [id, version, call, attempt]);
  const entries = history ? jobTimeline(history) : [];
  const photoEntry = entries.find((entry) => entry.label === "Груз забран" || entry.label === "Частичный забор");
  return <section className="pk-job-timeline pk-card-section" aria-label="История статусов забора">
    <h3>История статусов</h3>
    {photoCount > 0 && !photoEntry && <PickupTimelinePhotos key={id} id={id} count={photoCount} call={call} />}
    <p className="pk-muted">Дата и время по Москве (МСК)</p>
    {error ? <p role="alert">{error} <button type="button" onClick={() => setAttempt(attempt + 1)}>Повторить</button></p>
      : !history ? <p role="status">Загрузка истории…</p>
      : <>
        {entries.length === 0 && <p className="pk-muted">Прибытие на точку ещё не зафиксировано.</p>}
        <ol>{entries.map((entry) => <li key={entry.id}>
          <strong>{entry.label}</strong>
          <time dateTime={entry.date}>{new Date(entry.date).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
          {entry.note && <p>{entry.note}</p>}
          {photoCount > 0 && entry.id === photoEntry?.id && <PickupTimelinePhotos key={id} id={id} count={photoCount} call={call} />}
        </li>)}</ol>
      </>}
  </section>;
}
