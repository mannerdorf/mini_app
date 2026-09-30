import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ pool: null as unknown, getPool: vi.fn() }));
vi.mock("../../api/_db.js", () => ({ getPool: () => { state.getPool(); return state.pool; } }));
vi.mock("../../api/_lib/observability.js", () => ({ initRequestContext: () => ({ requestId: "program-test" }), logError: vi.fn() }));

import handler from "../../api/admin-media-program.js";
import { createAdminToken } from "../adminAuth.js";
import { createProgramChannels, createProgramTasks } from "./programManifest.js";
import { getProgramDashboard, parseProgramPatch, patchProgramState, PROGRAM_SETUP_MESSAGE } from "./programStore.js";

const migration = readFileSync(new URL("../../migrations/122_media_program.sql", import.meta.url), "utf8");
let db: PGlite;
let pool: Pool;
let token: string;
const taskPatch = { entity: "task" as const, id: "T01", status: "in_progress" as const, owner: "Логист", notes: "Сверить источники заявок", evidence: "", expected_updated_at: null };

beforeAll(async () => {
  db = new PGlite();
  pool = { query: (sql: string, params?: unknown[]) => db.query(sql, params), connect: async () => ({ query: (sql: string, params?: unknown[]) => db.query(sql, params), release: () => {} }) } as unknown as Pool;
}, 30000);
beforeEach(async () => {
  vi.stubEnv("ADMIN_TOKEN_SECRET", "program-test-secret");
  vi.stubEnv("DATABASE_URL", "postgres://test.invalid/test");
  token = createAdminToken(false, "editor@haulz.test");
  state.pool = pool;
  state.getPool.mockClear();
  await db.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
});
afterAll(async () => { vi.unstubAllEnvs(); await db.close(); });

async function invoke(method: string, body?: unknown, auth = token) {
  const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await handler({ method, body, headers: auth ? { authorization: `Bearer ${auth}` } : {} } as never, res as never);
  return { status: res.status.mock.calls[0][0], data: res.json.mock.calls[0][0], res };
}

describe("media program HTTP boundary", () => {
  it.each(["GET", "PATCH"])("requires a valid administrator token before %s touches storage", async (method) => {
    const response = await invoke(method, taskPatch, "invalid.token");
    expect(response.status).toBe(401);
    expect(state.getPool).not.toHaveBeenCalled();
    expect(response.res.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });

  it("rejects unsupported methods and malformed or metadata-changing requests before storage", async () => {
    expect((await invoke("POST", taskPatch)).status).toBe(405);
    expect((await invoke("PATCH", "{broken")).status).toBe(400);
    expect((await invoke("PATCH", { ...taskPatch, title: "replace manifest" })).status).toBe(400);
    expect(state.getPool).not.toHaveBeenCalled();
  });

  it("shows explicit read-only migration guidance and rejects saves when the schema is missing", async () => {
    const response = await invoke("GET");
    expect(response.status).toBe(200);
    expect(response.data.storage_ready).toBe(false);
    expect(response.data.setup_message).toBe(PROGRAM_SETUP_MESSAGE);
    expect(response.data.tasks).toHaveLength(16);
    expect(response.data.tasks.filter((task: { status: string }) => task.status !== "planned")).toEqual([expect.objectContaining({ id: "T00", status: "review" })]);
    expect(response.data.metrics.every((metric: { value: unknown }) => metric.value === null)).toBe(true);
    expect((await invoke("PATCH", taskPatch)).status).toBe(503);
  });

  it("does not fake saved state when DATABASE_URL is absent", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect((await invoke("GET")).data.storage_ready).toBe(false);
    expect((await invoke("PATCH", taskPatch)).status).toBe(503);
    expect(state.getPool).not.toHaveBeenCalled();
  });

  it("persists an authenticated edit with its actor and returns the refreshed dashboard", async () => {
    await db.exec(migration);
    const response = await invoke("PATCH", taskPatch);
    expect(response.status).toBe(200);
    expect(response.data.tasks.find((task: { id: string }) => task.id === "T01")).toMatchObject({ status: "in_progress", owner: "Логист", updated_by: "editor@haulz.test" });
    expect(response.data.activity).toEqual([expect.objectContaining({ entity_id: "T01", from_status: "planned", to_status: "in_progress", created_by: "editor@haulz.test" })]);
    const fresh = await invoke("GET");
    expect(fresh.data.tasks).toEqual(response.data.tasks);
  });
});

describe("program persistence", () => {
  it("reapplying seed does not overwrite edits; code metadata and manifest paths remain grounded", async () => {
    await db.exec(migration);
    await patchProgramState(pool, { ...taskPatch, notes: "'; DROP TABLE media_program_tasks; --" }, "editor");
    await db.exec(migration);
    const dashboard = await getProgramDashboard(pool);
    expect(dashboard.tasks.find((task) => task.id === "T01")).toMatchObject({ title: createProgramTasks().find((task) => task.id === "T01")!.title, notes: "'; DROP TABLE media_program_tasks; --", status: "in_progress" });
    expect(dashboard.tasks.flatMap((task) => task.files).filter((path) => !existsSync(resolve(path)))).toEqual([]);
    expect(dashboard.channels.every((channel) => channel.status === "not_connected" && channel.url === "")).toBe(true);
    expect(new Set(createProgramChannels().map((channel) => channel.id)).size).toBe(10);
  });

  it("rejects a stale editor snapshot and keeps the first edit and audit event", async () => {
    await db.exec(migration);
    await patchProgramState(pool, taskPatch, "first-editor");
    await expect(patchProgramState(pool, { ...taskPatch, owner: "Second editor" }, "second-editor")).rejects.toMatchObject({ status: 409 });
    const current = await getProgramDashboard(pool);
    expect(current.activity).toHaveLength(1);
    const task = current.tasks.find((item) => item.id === "T01")!;
    expect(task.updated_by).toBe("first-editor");
    await patchProgramState(pool, { ...taskPatch, owner: "Second editor", expected_updated_at: task.updated_at }, "second-editor");
    const next = await getProgramDashboard(pool);
    expect(next.activity).toHaveLength(2);
    expect(next.tasks.find((item) => item.id === "T01")!.updated_at).not.toBe(task.updated_at);
  });

  it("rolls state back if writing the audit event fails", async () => {
    await db.exec(migration);
    const failingPool = { connect: async () => ({ query: async (sql: string, params?: unknown[]) => {
      if (sql.includes("insert into media_program_activity")) throw new Error("audit unavailable");
      return db.query(sql, params);
    }, release: () => {} }) } as unknown as Pool;
    await expect(patchProgramState(failingPool, taskPatch, "editor")).rejects.toThrow("audit unavailable");
    const dashboard = await getProgramDashboard(pool);
    expect(dashboard.tasks.find((task) => task.id === "T01")).toMatchObject({ status: "planned", owner: "", updated_at: null });
    expect(dashboard.activity).toHaveLength(0);
  });

  it("logs note-only changes, and does not create a misleading event for a no-op save", async () => {
    await db.exec(migration);
    const patch = { entity: "channel" as const, id: "telegram", status: "not_connected" as const, url: "", notes: "Ожидаем адрес канала", expected_updated_at: null };
    await patchProgramState(pool, patch, "editor");
    const dashboard = await getProgramDashboard(pool);
    expect(dashboard.activity[0]).toMatchObject({ from_status: "not_connected", to_status: "not_connected", note: "Изменены: заметки" });
    const channel = dashboard.channels.find((item) => item.id === "telegram")!;
    await patchProgramState(pool, { ...patch, expected_updated_at: channel.updated_at }, "editor");
    expect((await getProgramDashboard(pool)).activity).toHaveLength(1);
  });

  it("counts actual CMS records independently of program migration and leaves external metrics unknown", async () => {
    await db.exec("CREATE TABLE media_content_plans (status TEXT); INSERT INTO media_content_plans VALUES ('planned'), ('draft'), ('published'), ('published');");
    const dashboard = await getProgramDashboard(pool);
    expect(dashboard.storage_ready).toBe(false);
    expect(Object.fromEntries(dashboard.metrics.map((metric) => [metric.key, metric.value]))).toEqual({ content_total: 4, content_published: 2, content_draft: 1, content_planned: 1, organic_clicks: null, ai_citations: null, qualified_leads: null });
    await db.exec("DELETE FROM media_content_plans;");
    expect((await getProgramDashboard(pool)).metrics[0].value).toBe(0);
  });
});

describe("program validation", () => {
  it.each([
    { ...taskPatch, id: "T99" }, { ...taskPatch, status: "published" }, { ...taskPatch, status: "done", evidence: "  " },
    { ...taskPatch, owner: "x".repeat(161) }, { ...taskPatch, notes: "x".repeat(10001) }, { ...taskPatch, evidence: 42 },
    { ...taskPatch, expected_updated_at: "not-a-date" }, { ...taskPatch, entity: "article" },
  ])("rejects invalid or incomplete task edits %#", (value) => { expect(() => parseProgramPatch(value)).toThrow(); });

  it.each(["javascript:alert(1)", "data:text/html,test", "//evil.test", "https://user:password@example.test", "https://example.test/\npath"])("rejects unsafe channel URL %s", (url) => {
    expect(() => parseProgramPatch({ entity: "channel", id: "telegram", status: "connected", url, notes: "" })).toThrow();
  });

  it("accepts an evidenced completion and plain https channel URL", () => {
    expect(parseProgramPatch({ ...taskPatch, status: "done", evidence: "docs/acceptance.md — проверено 30.09.2026" }).status).toBe("done");
    expect(parseProgramPatch({ entity: "channel", id: "telegram", status: "configuring", url: "https://t.me/haulz_test", notes: "Права ещё проверяются" })).toMatchObject({ url: "https://t.me/haulz_test" });
  });
});
