import React from 'react';

/** Retrying this state must only repeat a read, never a mutation. */
export function LoadError({ message, details, onRetry, stale = false, busy = false }: {
  message: string; details?: string | null; onRetry?: () => void; stale?: boolean; busy?: boolean;
}) {
  return <div role="alert" style={{ padding: '1rem', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', borderRadius: 12 }}>
    <p>{message}</p>
    {stale && <p>Показаны ранее загруженные данные. Они могут быть устаревшими.</p>}
    {onRetry && <button type="button" className="filter-button" disabled={busy} onClick={onRetry}>{busy ? 'Загрузка…' : 'Повторить загрузку'}</button>}
    {details && <details><summary>Технические сведения для поддержки</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{details}</pre></details>}
  </div>;
}
