import React from "react";

export function cacheFreshness(items: readonly unknown[], now = Date.now()) {
  const times = items.map(item => {
    const value = (item as { _cacheUpdatedAt?: unknown })?._cacheUpdatedAt;
    return typeof value === "string" ? Date.parse(value) : NaN;
  });
  const valid = times.filter(Number.isFinite);
  const oldest = valid.length ? Math.min(...valid) : null;
  return { oldest, unknown: times.length - valid.length, stale: oldest !== null && now - oldest > 24 * 60 * 60 * 1000 };
}

/** Conservative per-record freshness; never labels an entire history fresh after one chunk. */
export function CacheFreshness({ items }: { items: readonly unknown[] }) {
  if (!items.length) return null;
  const { oldest, unknown, stale } = cacheFreshness(items);
  const time = oldest === null ? null : new Date(oldest).toLocaleString("ru-RU");
  return <p role="status" style={{ fontSize: "0.8125rem", color: stale ? "var(--ux-status-warning-text)" : "var(--color-text-secondary)", margin: "8px 0" }}>
    {time ? `Самая ранняя сверка показанных документов с 1С: ${time}.` : "Время сверки с 1С неизвестно."}
    {stale && " Есть данные старше суток."}
    {unknown > 0 && time && ` Без времени сверки: ${unknown}.`}
  </p>;
}
