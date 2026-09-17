import { afterEach, beforeEach, expect, it, vi } from "vitest";

let entries: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  entries = new Map();
  vi.stubGlobal("window", { localStorage: {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  } });
});
afterEach(() => vi.unstubAllGlobals());

it("does not restore the last removed account, including legacy auth, after reload", async () => {
  const account = { id: "a", login: "review@example.invalid", password: "test-only" };
  entries.set("haulz.accounts", JSON.stringify([account]));
  entries.set("haulz.auth", JSON.stringify(account));
  entries.set("haulz.activeAccountId", "a");
  entries.set("haulz.selectedAccountIds", '["a"]');
  const auth = await import("./authState");
  expect(auth.getInitialAuthState().accounts).toHaveLength(1);
  auth.persistAuthState({ accounts: [], activeAccountId: null, selectedAccountIds: [] });
  expect(auth.getInitialAuthState().accounts).toEqual([]);
  expect(entries.size).toBe(0);
  vi.resetModules();
  expect((await import("./authState")).getInitialAuthState().accounts).toEqual([]);
});

it("preserves a migrated legacy account and removes the legacy credential copy", async () => {
  entries.set("haulz.auth", JSON.stringify({ id: "a", login: "review@example.invalid", password: "test-only" }));
  const auth = await import("./authState");
  const state = auth.getInitialAuthState();
  auth.persistAuthState(state);
  expect(entries.has("haulz.auth")).toBe(false);
  vi.resetModules();
  expect((await import("./authState")).getInitialAuthState()).toEqual(state);
});
