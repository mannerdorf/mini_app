import React from "react";

/** Подсветка совпадения с поисковым запросом в тексте (журналы CMS). */
export function highlightMatch(text: string, query: string, keyPrefix: string): React.ReactNode {
  const q = query.trim();
  if (!q || !text) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${escaped})`, "gi");
  const parts = String(text).split(re);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={`${keyPrefix}-${i}`} style={{ background: "rgba(0, 113, 227, 0.25)", borderRadius: 2, padding: "0 1px" }}>
            {p}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  );
}

export function auditActionLabel(action: string): string {
  if (action === "admin_login") return "Вход в админку";
  if (action === "user_register") return "Регистрация";
  if (action === "user_update") return "Изменение";
  if (action === "email_settings_saved") return "Настройки почты";
  if (action === "preset_created") return "Пресет создан";
  if (action === "preset_updated") return "Пресет обновлён";
  if (action === "preset_deleted") return "Пресет удалён";
  if (action === "user_archived") return "Профиль в архиве";
  return action;
}

export function auditObjectCell(entry: {
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown> | null;
}): string {
  if (entry.target_type === "user" && entry.details && typeof entry.details.login === "string") {
    return entry.details.login;
  }
  return entry.target_id ?? "—";
}

export function auditDetailsCell(details: Record<string, unknown> | null): string {
  if (!details || typeof details !== "object" || Object.keys(details).filter((k) => k !== "login").length === 0) {
    return "—";
  }
  return Object.entries(details)
    .filter(([k]) => k !== "login")
    .map(([k, v]) => (v === true ? k : `${k}: ${String(v)}`))
    .join(", ");
}
