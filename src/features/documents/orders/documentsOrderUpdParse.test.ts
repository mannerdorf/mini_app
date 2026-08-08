import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  distributeUpdLineItems,
  parseUpdLineItemsFromSheet,
  parseUpdToTableRows,
} from "./documentsOrderUpdParse";

const SAMPLE_FILES = [
  "/Users/aleksandr/Downloads/УПД Планета Импорт.xls",
  "/Users/aleksandr/Downloads/упд1.xls",
  "/Users/aleksandr/Downloads/упд2.xls",
];

function readSheetRows(path: string): unknown[][] {
  const wb = XLSX.read(readFileSync(path), { type: "buffer" });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true }) as unknown[][];
}

describe("documentsOrderUpdParse", () => {
  it("extracts name, quantity and price from standard UPD layout", () => {
    const rows = readSheetRows(SAMPLE_FILES[0]);
    const items = parseUpdLineItemsFromSheet(rows);
    expect(items.length).toBeGreaterThan(10);
    expect(items[0].name).toContain("Обруч");
    expect(items[0].quantity).toBe(10);
    expect(items[0].price).toBeCloseTo(314.75, 2);
  });

  it("extracts line items from compact Mystery UPD files", () => {
    for (const path of SAMPLE_FILES.slice(1)) {
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
    expect(places.reduce((sum, p) => sum + (p.posylka.match(/Товар/g)?.length ?? 0), 0)).toBe(40);
  });

  it("parses uploaded File into table rows", async () => {
    const path = SAMPLE_FILES[1];
    if (!existsSync(path)) return;
    const buffer = readFileSync(path);
    const file = new File([buffer], "upd1.xls", {
      type: "application/vnd.ms-excel",
    });
    const rows = await parseUpdToTableRows(file, 8);
    expect(rows).toHaveLength(8);
    expect(rows.some((r) => r.posylka.includes("Мешок"))).toBe(true);
  });
});
