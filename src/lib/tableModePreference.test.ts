import { describe, expect, it, vi } from "vitest";
import {
  computeTableModeFlags,
  hasTableModePreference,
  readTableModePreference,
} from "./tableModePreference";

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

describe("computeTableModeFlags", () => {
  it("enables flat table on desktop without service mode", () => {
    const flags = computeTableModeFlags({
      tableModeByCustomer: true,
      showCustomerColumn: false,
      effectiveServiceMode: false,
      isDesktopLayout: true,
    });
    expect(flags.canShowTableModeToggle).toBe(true);
    expect(flags.tableModeEffective).toBe(true);
    expect(flags.tableModeFlatDirect).toBe(true);
    expect(flags.tableModeGroupedByCustomer).toBe(false);
  });

  it("keeps cards on mobile without service mode", () => {
    const flags = computeTableModeFlags({
      tableModeByCustomer: true,
      showCustomerColumn: false,
      effectiveServiceMode: false,
      isDesktopLayout: false,
    });
    expect(flags.canShowTableModeToggle).toBe(false);
    expect(flags.tableModeEffective).toBe(false);
  });

  it("groups by customer only in service mode", () => {
    const flags = computeTableModeFlags({
      tableModeByCustomer: true,
      showCustomerColumn: true,
      effectiveServiceMode: true,
      isDesktopLayout: true,
    });
    expect(flags.tableModeGroupedByCustomer).toBe(true);
    expect(flags.tableModeFlatDirect).toBe(false);
  });
});
