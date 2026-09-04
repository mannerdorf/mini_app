import { describe, expect, it, vi } from "vitest";
import { hasTableModePreference, readTableModePreference } from "./tableModePreference";

describe("readTableModePreference", () => {
  it("returns false when unset", () => {
    const getItem = vi.fn(() => null);
    vi.stubGlobal("localStorage", { getItem, setItem: vi.fn(), removeItem: vi.fn() });
    expect(readTableModePreference("haulz.cargo.tableMode")).toBe(false);
    expect(hasTableModePreference("haulz.cargo.tableMode")).toBe(false);
    vi.unstubAllGlobals();
  });

  it("returns stored boolean", () => {
    const getItem = vi.fn(() => "true");
    vi.stubGlobal("localStorage", { getItem, setItem: vi.fn(), removeItem: vi.fn() });
    expect(readTableModePreference("haulz.cargo.tableMode")).toBe(true);
    expect(hasTableModePreference("haulz.cargo.tableMode")).toBe(true);
    vi.unstubAllGlobals();
  });
});
