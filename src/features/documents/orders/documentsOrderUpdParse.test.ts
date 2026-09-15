import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  distributeUpdLineItems,
  parseUpdLineItemsFromSheet,
  parseUpdToTableRows,
} from "./documentsOrderUpdParse";
import { resolveOrderTableRowDisplay } from "./documentsOrderTableRowDisplay";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const UT_831_FIXTURE = join(FIXTURE_DIR, "upd-ut-831-2026-09-14.xlsx");

const OPTIONAL_SAMPLE_FILES = [
  "/Users/aleksandr/Downloads/УПД Планета Импорт.xls",
  "/Users/aleksandr/Downloads/упд1.xls",
  "/Users/aleksandr/Downloads/упд2.xls",
];

function readSheetRows(path: string): unknown[][] {
  const wb = XLSX.read(readFileSync(path), { type: "buffer" });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true }) as unknown[][];
}

describe("documentsOrderUpdParse", () => {
  it("extracts product names from UT-831 UPD nomenclature column", () => {
    const items = parseUpdLineItemsFromSheet(readSheetRows(UT_831_FIXTURE));
    expect(items.length).toBe(42);
    expect(items[0].name).toBe("Конструктор Brick Shop JKG42");
    expect(items[0].quantity).toBe(96);
    expect(items[0].price).toBeCloseTo(1564.55, 2);
    expect(items.some((item) => item.name.includes("Место"))).toBe(false);
    expect(items.some((item) => /Monster High/.test(item.name))).toBe(true);
  });

  it("shows nomenclature names in table display after place distribution", async () => {
    const buffer = readFileSync(UT_831_FIXTURE);
    const file = new File([buffer], "upd-ut-831.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const rows = await parseUpdToTableRows(file, 2);
    expect(rows).toHaveLength(2);

    for (const row of rows) {
      const cells = resolveOrderTableRowDisplay(row);
      expect(cells.name).not.toMatch(/Место \(\d+ поз\.\)/);
      expect(cells.name.length).toBeGreaterThan(20);
      expect(row.items.every((item) => item.name.trim().length > 0)).toBe(true);
    }
  });

  it("extracts name, quantity and price from standard UPD layout when local sample exists", () => {
    const path = OPTIONAL_SAMPLE_FILES[0];
    if (!existsSync(path)) return;
    const items = parseUpdLineItemsFromSheet(readSheetRows(path));
    expect(items.length).toBeGreaterThan(10);
    expect(items[0].name).toContain("Обруч");
    expect(items[0].quantity).toBe(10);
    expect(items[0].price).toBeCloseTo(314.75, 2);
  });

  it("extracts line items from compact Mystery UPD files when local samples exist", () => {
    for (const path of OPTIONAL_SAMPLE_FILES.slice(1)) {
      if (!existsSync(path)) continue;
      const items = parseUpdLineItemsFromSheet(readSheetRows(path));
      expect(items).toHaveLength(1);
      expect(items[0].name.length).toBeGreaterThan(5);
      expect(items[0].quantity).toBeGreaterThan(0);
      expect(items[0].price).toBeGreaterThan(0);
    }
  });

  it("randomly distributes nomenclature across cargo places", () => {
    const items = Array.from({ length: 40 }, (_, i) => ({
      name: `Товар ${i + 1}`,
      quantity: i + 1,
      price: (i + 1) * 10,
    }));
    const places = distributeUpdLineItems(items, 16, () => 0.42);
    expect(places).toHaveLength(16);
    expect(places.every((p) => p.posylka.includes("шт"))).toBe(true);
    expect(places.every((p) => p.items.length > 0)).toBe(true);
    expect(places.reduce((sum, p) => sum + p.items.length, 0)).toBe(40);
  });
});
