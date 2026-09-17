import { afterEach, expect, it, vi } from "vitest";
vi.mock("../constants/appVersion", () => ({ WEB_BUILD_INFO: { id: "current" } }));
import { checkWebBuild } from "./webBuildUpdate";
afterEach(() => vi.unstubAllGlobals());
it.each([["current", "current"], ["new-build", "available"], [null, "unavailable"]])("compares remote build %s", async (id, result) => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ id }) })));
  expect(await checkWebBuild()).toBe(result);
});
it("reports server failure without treating it as current", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  expect(await checkWebBuild()).toBe("unavailable");
});
