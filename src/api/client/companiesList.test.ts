import { afterEach, expect, it, vi } from "vitest";
import { fetchCompanies } from "./companiesList";
afterEach(() => vi.unstubAllGlobals());
it("sends separate credentials for each account in the body, never in the URL", async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ companies: [{ login: "one", inn: "111", name: "One" }] }) }));
  vi.stubGlobal("fetch", fetchMock);
  const accounts = [{ login: "one", password: "secret-one" }, { login: "two", password: "secret-two" }];
  expect(await fetchCompanies(accounts)).toHaveLength(1);
  expect(fetchMock).toHaveBeenCalledWith("/api/companies", expect.objectContaining({ method: "POST", body: JSON.stringify({ accounts }) }));
});
it("does not turn an authorization error into a successful empty directory", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: "Unauthorized" }) })));
  await expect(fetchCompanies([{ login: "one", password: "wrong" }])).rejects.toThrow("Unauthorized");
});
