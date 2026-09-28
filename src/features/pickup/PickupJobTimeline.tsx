import { useEffect, useState } from "react";
import type { PickupCall } from "./client";
import { jobTimeline, type JobHistory } from "./jobTimeline";

export function PickupJobTimeline({ id, version, call }: { id: string; version: number; call: PickupCall }) {
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
  return <section className="pk-job-timeline" aria-label="История статусов забора">
    <p className="pk-muted">Дата и время по Москве (МСК)</p>
    {error ? <p role="alert">{error} <button type="button" onClick={() => setAttempt(attempt + 1)}>Повторить</button></p>
      : !history ? <p role="status">Загрузка истории…</p>
      : <>
        <ol>{jobTimeline(history).map((entry) => <li key={entry.id}>
          <strong>{entry.label}</strong>
          <time dateTime={entry.date}>{new Date(entry.date).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
          {entry.note && <p>{entry.note}</p>}
        </li>)}</ol>
        <details className="pk-card-help"><summary>О полноте истории</summary><p className="pk-muted">Показаны сохранённые события. Для старых заборов отдельные переходы могли не записываться.</p></details>
      </>}
  </section>;
}
