import type { ProgramDashboard, ProgramTask, ProgramTaskStatus, ProgramTrack, ProgramChannelStatus } from "../../../../../lib/mediaMarketing/programTypes";
import contextDocument from "../../../../../docs/SEO_AEO_GEO.md?raw";
import fullPlanDocument from "../../../../../docs/seo-aeo-geo-content-factory-2026-09-30.md?raw";

export const TRACKS: { id: ProgramTrack; label: string; short: string; description: string; color: string }[] = [
  { id: "foundation", label: "Фундамент", short: "BASE", description: "Данные, доступы и измерения", color: "#7b8cff" },
  { id: "seo", label: "SEO", short: "SEO", description: "Видимость в поиске", color: "#38bdf8" },
  { id: "aeo", label: "AEO", short: "AEO", description: "Ответы на вопросы клиентов", color: "#2dd4bf" },
  { id: "geo", label: "GEO", short: "GEO", description: "Присутствие в ответах ИИ", color: "#c084fc" },
  { id: "factory", label: "Контент-завод", short: "CONTENT", description: "От идеи до проверенной публикации", color: "#fb923c" },
  { id: "distribution", label: "Дистрибуция", short: "REACH", description: "Сайт, Telegram, YouTube и VK", color: "#f472b6" },
];
export const STATUS: Record<ProgramTaskStatus, string> = { planned: "Запланировано", in_progress: "В работе", review: "На проверке", blocked: "Заблокировано", done: "Готово" };
export const CHANNEL_STATUS: Record<ProgramChannelStatus, string> = { not_connected: "Не подключён", configuring: "Настройка", connected: "Готов к работе", attention: "Требует внимания" };
export type ProgramView = "overview" | "map" | "tasks" | "channels" | "activity";
export const VIEWS: { id: ProgramView; label: string }[] = [
  { id: "overview", label: "Обзор" }, { id: "map", label: "Карта программы" }, { id: "tasks", label: "Задачи" }, { id: "channels", label: "Каналы" }, { id: "activity", label: "История" },
];
export const CONTEXT_PATH = "docs/SEO_AEO_GEO.md";
export const PLAN_PATH = "docs/seo-aeo-geo-content-factory-2026-09-30.md";
export function downloadProgramDocument(fullPlan = false) {
  downloadMarkdown(fullPlan ? fullPlanDocument : contextDocument, fullPlan ? "seo-aeo-geo-content-factory-2026-09-30.md" : "SEO_AEO_GEO.md");
}
function downloadMarkdown(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const UI_STORAGE_KEY = "haulz.mediaProgram.ui.v1";
export type ProgramUiState = { view: ProgramView; selected: string | null; track: ProgramTrack | "all"; status: ProgramTaskStatus | "all"; priority: string; search: string };
export const INITIAL_UI: ProgramUiState = { view: "overview", selected: null, track: "all", status: "all", priority: "all", search: "" };

export function initialProgramUi(): ProgramUiState {
  const state = { ...INITIAL_UI };
  if (typeof window === "undefined") return state;
  try {
    const saved = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") {
      if (VIEWS.some((v) => v.id === saved.view)) state.view = saved.view;
      if (typeof saved.selected === "string") state.selected = saved.selected;
      if (saved.track === "all" || TRACKS.some((t) => t.id === saved.track)) state.track = saved.track;
      if (saved.status === "all" || Object.hasOwn(STATUS, saved.status)) state.status = saved.status;
      if (["all", "P0", "P1", "P2", "P3"].includes(saved.priority)) state.priority = saved.priority;
      if (typeof saved.search === "string") state.search = saved.search;
    }
  } catch { /* Storage can be unavailable in private browsing. */ }
  const query = new URLSearchParams(window.location.search);
  const view = query.get("media_view");
  if (VIEWS.some((v) => v.id === view)) state.view = view as ProgramView;
  const selected = query.get("program_task");
  if (selected) { state.selected = selected; if (!view) state.view = "tasks"; }
  return state;
}

export function formatDate(value: string | null): string {
  if (!value) return "Ещё не обновлялось";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Дата неизвестна" : date.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
export function progress(tasks: ProgramTask[]) {
  const done = tasks.filter((t) => t.status === "done").length;
  return { done, total: tasks.length, percent: tasks.length ? Math.round(done / tasks.length * 100) : 0 };
}
export function safeExternalUrl(value: string): string | undefined {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
export function exportContext(data: ProgramDashboard) {
  const lines = ["# SEO / AEO / GEO — состояние программы", "", `Снимок: ${new Date().toISOString()}`, `Контекст: ${CONTEXT_PATH}`, `Хранилище: ${data.storage_ready ? "подключено" : "только чтение"}`, "", "## Задачи"];
  for (const task of data.tasks) {
    lines.push("", `### ${task.status === "done" ? "[x]" : "[ ]"} ${task.id} · ${task.title}`, `Статус: ${STATUS[task.status]} | Приоритет: ${task.priority} | Этап: ${task.phase}`, task.description, `Ответственный: ${task.owner || "не назначен"}`, `Обновлено: ${task.updated_at || "не обновлялось"} | Автор: ${task.updated_by || "нет"}`, `Критерий готовности: ${task.acceptance}`, `Зависимости: ${task.dependencies.join(", ") || "нет"}`, `Файлы: ${task.files.join(", ") || "нет"}`);
    if (task.notes) lines.push(`Заметки: ${task.notes}`);
    if (task.evidence) lines.push(`Подтверждение: ${task.evidence}`);
    task.links.forEach((link) => lines.push(`${link.label}: ${link.url}`));
  }
  lines.push("", "## Каналы — ручной реестр");
  for (const channel of data.channels) lines.push("", `### ${channel.name}`, `Статус: ${CHANNEL_STATUS[channel.status]}`, `URL: ${channel.url || "не указан"}`, `Обновлено: ${channel.updated_at || "не обновлялось"} | Автор: ${channel.updated_by || "нет"}`, channel.notes);
  lines.push("", "## Метрики");
  for (const metric of data.metrics) lines.push(`- ${metric.label}: ${metric.value ?? "нет данных"}. ${metric.note}`);
  lines.push("", "## Последние изменения");
  if (!data.activity.length) lines.push("Изменений ещё нет.");
  for (const item of data.activity) lines.push(`- ${item.created_at} | ${item.created_by} | ${item.entity_id} ${item.title}: ${item.from_status || "—"} → ${item.to_status}${item.note ? `. ${item.note}` : ""}`);
  downloadMarkdown(lines.join("\n"), `seo-aeo-geo-${new Date().toISOString().slice(0, 10)}.md`);
}
