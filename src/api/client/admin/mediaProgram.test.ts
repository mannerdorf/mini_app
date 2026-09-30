import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMediaProgram } from "./mediaProgram";

afterEach(() => vi.unstubAllGlobals());

describe("program API version compatibility", () => {
  it.each([
    new Response("<!doctype html><html>Old deployment</html>", { status: 200 }),
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  ])("reports an old or misrouted API without handing invalid state to the UI", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(fetchMediaProgram("test-token")).rejects.toThrow("backend обновлён");
  });
  it("keeps server errors visible", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Сессия истекла" }), { status: 401 })));
    await expect(fetchMediaProgram("test-token")).rejects.toThrow("Сессия истекла");
  });
});
