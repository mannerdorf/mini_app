import type { Pool } from "pg";
import { createProgramChannels, createProgramTasks } from "./programManifest.js";
import type { ProgramActivity, ProgramChannelPatch, ProgramDashboard, ProgramMetric, ProgramTaskPatch } from "./programTypes.js";

export const PROGRAM_SETUP_MESSAGE = "Хранилище программы не готово. Примените migrations/122_media_program.sql к базе приложения и обновите панель. Показан исходный план; изменения пока не сохраняются.";
export class ProgramError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
type Revision = { expected_updated_at?: string | null };
export type ProgramPatch = ({ entity: "task" } & ProgramTaskPatch & Revision) | ({ entity: "channel" } & ProgramChannelPatch & Revision);
type Queryable = Pick<Pool, "query">;

function textField(body: Record<string, unknown>, key: string, max: number): string {
  if (typeof body[key] !== "string") throw new ProgramError(400, `Поле ${key} должно быть строкой`);
  const value = body[key].trim();
  if (value.length > max) throw new ProgramError(400, `Поле ${key}: не больше ${max} символов`);
  return value;
}

/** Validate before accessing storage; never accept executable URLs or metadata edits. */
export function parseProgramPatch(input: unknown): ProgramPatch {
  let body = input;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { throw new ProgramError(400, "Некорректный JSON"); }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ProgramError(400, "Ожидается объект изменений");
  const data = body as Record<string, unknown>;
  if (data.entity !== "task" && data.entity !== "channel") throw new ProgramError(400, "Неизвестный тип записи");
  const allowed = data.entity === "task" ? ["entity", "id", "status", "owner", "notes", "evidence", "expected_updated_at"] : ["entity", "id", "status", "url", "notes", "expected_updated_at"];
  if (Object.keys(data).some((key) => !allowed.includes(key))) throw new ProgramError(400, "Запрос содержит недоступные для изменения поля");
  const id = textField(data, "id", 80);
  const status = textField(data, "status", 30);
  const notes = textField(data, "notes", 10000);
  const revision: Revision = {};
  if (Object.hasOwn(data, "expected_updated_at")) {
    if (data.expected_updated_at !== null && (typeof data.expected_updated_at !== "string" || data.expected_updated_at.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(data.expected_updated_at) || !Number.isFinite(Date.parse(data.expected_updated_at)))) {
      throw new ProgramError(400, "Некорректная версия записи; обновите панель");
    }
    revision.expected_updated_at = data.expected_updated_at as string | null;
  }
  if (data.entity === "task") {
    if (!createProgramTasks().some((task) => task.id === id)) throw new ProgramError(400, "Неизвестная задача программы");
    if (!["planned", "in_progress", "review", "blocked", "done"].includes(status)) throw new ProgramError(400, "Недопустимый статус задачи");
    const owner = textField(data, "owner", 160);
    const evidence = textField(data, "evidence", 10000);
    if (status === "done" && !evidence) throw new ProgramError(400, "Для завершения задачи укажите доказательство результата: проверку, файл или ссылку");
    return { entity: "task", id, status: status as ProgramTaskPatch["status"], owner, notes, evidence, ...revision };
  }
  if (!createProgramChannels().some((channel) => channel.id === id)) throw new ProgramError(400, "Неизвестный канал программы");
  if (!["not_connected", "configuring", "connected", "attention"].includes(status)) throw new ProgramError(400, "Недопустимый статус канала");
  const url = textField(data, "url", 2048);
  if (url) {
    try {
      const parsed = new URL(url);
      if (!/^https?:\/\//i.test(url) || !["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || /[\u0000-\u0020\u007f]/.test(url)) throw new Error("unsafe URL");
    } catch { throw new ProgramError(400, "Адрес канала должен быть ссылкой http(s) без логина и пароля"); }
  }
  return { entity: "channel", id, status: status as ProgramChannelPatch["status"], url, notes, ...revision };
}

function dateString(value: unknown): string | null {
  if (value == null) return null;
  return new Date(value as string | Date).toISOString();
}

function metrics(rows?: { total: string; published: string; draft: string; planned: string }): ProgramMetric[] {
  const note = rows ? "Текущие записи существующего медиаплана; статус в CMS не подтверждает индексацию, отправку в канал или результат продвижения." : "Таблица media_content_plans недоступна; данных пока нет.";
  return [
    { key: "content_total", label: "Материалы в CMS", value: rows ? Number(rows.total) : null, note },
    { key: "content_published", label: "Со статусом «Опубликован»", value: rows ? Number(rows.published) : null, note },
    { key: "content_draft", label: "Черновики CMS", value: rows ? Number(rows.draft) : null, note },
    { key: "content_planned", label: "Запланировано в CMS", value: rows ? Number(rows.planned) : null, note },
    { key: "organic_clicks", label: "Переходы из поиска", value: null, note: "Нужны подключённый источник, согласованный период и загрузка отчёта. Статус канала сам по себе данных не добавляет." },
    { key: "ai_citations", label: "Цитаты со ссылкой в ИИ", value: null, note: "Нужна контрольная выборка с датой, режимом поиска и проверяемыми ответами. Упоминания бренда считаются отдельно." },
    { key: "qualified_leads", label: "Квалифицированные заявки", value: null, note: "Нужны события, источники обращений и проверка квалификации; подтверждённых данных пока нет." },
  ];
}

export function createReadOnlyProgram(setupMessage = PROGRAM_SETUP_MESSAGE): ProgramDashboard {
  return { tasks: createProgramTasks(), channels: createProgramChannels(), activity: [], metrics: metrics(), storage_ready: false, setup_message: setupMessage, updated_at: new Date().toISOString() };
}

async function storageState(db: Queryable) {
  const { rows } = await db.query(`select
    to_regclass('media_program_tasks') is not null and
    to_regclass('media_program_channels') is not null and
    to_regclass('media_program_activity') is not null as ready,
    to_regclass('media_content_plans') is not null as content_ready`);
  return rows[0] as { ready: boolean; content_ready: boolean };
}

export async function getProgramDashboard(db: Queryable): Promise<ProgramDashboard> {
  const state = await storageState(db);
  const dashboard = createReadOnlyProgram();
  if (state.content_ready) {
    const { rows } = await db.query(`select count(*)::text as total,
      count(*) filter (where status = 'published')::text as published,
      count(*) filter (where status = 'draft')::text as draft,
      count(*) filter (where status = 'planned')::text as planned from media_content_plans`);
    dashboard.metrics = metrics(rows[0]);
  }
  if (!state.ready) return dashboard;
  const [tasks, channels, activity] = await Promise.all([
    db.query("select id, status, owner, notes, evidence, updated_at, updated_by from media_program_tasks"),
    db.query("select id, status, url, notes, updated_at, updated_by from media_program_channels"),
    db.query(`select id::text, entity_type, entity_id, from_status, to_status, note, created_at, created_by
      from media_program_activity order by created_at desc, id desc limit 100`),
  ]);
  const taskStates = new Map(tasks.rows.map((row) => [row.id, row]));
  const channelStates = new Map(channels.rows.map((row) => [row.id, row]));
  dashboard.tasks = dashboard.tasks.map((task) => {
    const row = taskStates.get(task.id);
    return row ? { ...task, status: row.status, owner: row.owner, notes: row.notes, evidence: row.evidence, updated_at: dateString(row.updated_at), updated_by: row.updated_by } : task;
  });
  dashboard.channels = dashboard.channels.map((channel) => {
    const row = channelStates.get(channel.id);
    return row ? { ...channel, status: row.status, url: row.url, notes: row.notes, updated_at: dateString(row.updated_at), updated_by: row.updated_by } : channel;
  });
  dashboard.activity = activity.rows.map((row) => ({
    ...row,
    title: row.entity_type === "task" ? dashboard.tasks.find((task) => task.id === row.entity_id)?.title ?? row.entity_id : dashboard.channels.find((channel) => channel.id === row.entity_id)?.name ?? row.entity_id,
    created_at: dateString(row.created_at)!,
  })) as ProgramActivity[];
  dashboard.storage_ready = true;
  delete dashboard.setup_message;
  return dashboard;
}

/** State and immutable audit event are committed together on one connection. */
export async function patchProgramState(pool: Pool, patch: ProgramPatch, actor: string): Promise<void> {
  // Revalidate direct callers as well as the HTTP boundary.
  const value = parseProgramPatch(patch);
  const client = await pool.connect();
  let releaseError: Error | undefined;
  try {
    await client.query("BEGIN");
    if (!(await storageState(client)).ready) throw new ProgramError(503, PROGRAM_SETUP_MESSAGE);
    const table = value.entity === "task" ? "media_program_tasks" : "media_program_channels";
    const initialStatus = value.entity === "task" ? createProgramTasks().find((task) => task.id === value.id)!.status : "not_connected";
    await client.query(`insert into ${table} (id, status) values ($1, $2) on conflict (id) do nothing`, [value.id, initialStatus]);
    const { rows } = await client.query(`select * from ${table} where id = $1 for update`, [value.id]);
    const before = rows[0];
    if (Object.hasOwn(value, "expected_updated_at") && dateString(before.updated_at) !== dateString(value.expected_updated_at)) {
      throw new ProgramError(409, "Запись уже изменена другим администратором. Обновите панель и повторите изменение с учётом новой версии.");
    }
    const editableFields = value.entity === "task" ? ["status", "owner", "notes", "evidence"] as const : ["status", "url", "notes"] as const;
    const newState = value as unknown as Record<string, string>;
    const changes = editableFields.filter((key) => before[key] !== newState[key]);
    if (changes.length > 0) {
      const result = value.entity === "task"
        ? await client.query(`update media_program_tasks set status = $2, owner = $3, notes = $4, evidence = $5,
            updated_at = greatest(date_trunc('milliseconds', clock_timestamp()), coalesce(updated_at + interval '1 millisecond', 'epoch'::timestamptz)),
            updated_by = $6 where id = $1 returning *`, [value.id, value.status, value.owner, value.notes, value.evidence, actor])
        : await client.query(`update media_program_channels set status = $2, url = $3, notes = $4,
            updated_at = greatest(date_trunc('milliseconds', clock_timestamp()), coalesce(updated_at + interval '1 millisecond', 'epoch'::timestamptz)),
            updated_by = $5 where id = $1 returning *`, [value.id, value.status, value.url, value.notes, actor]);
      const labels: Record<string, string> = { status: "статус", owner: "ответственный", notes: "заметки", evidence: "доказательство", url: "адрес" };
      await client.query(`insert into media_program_activity
        (entity_type, entity_id, from_status, to_status, note, before_state, after_state, created_by)
        values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`, [value.entity, value.id, before.status, value.status,
        `Изменены: ${changes.map((key) => labels[key]).join(", ")}`, JSON.stringify(before), JSON.stringify(result.rows[0]), actor]);
    }
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch (rollbackError) { releaseError = rollbackError instanceof Error ? rollbackError : new Error("Rollback failed"); }
    throw error;
  } finally {
    client.release(releaseError);
  }
}
