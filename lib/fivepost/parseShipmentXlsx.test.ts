import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseFivepostShipmentBuffer } from "./parseShipmentXlsx";

const SAMPLE_FILE = "/Users/aleksandr/Downloads/Отгрузка Калининград 060826.xlsx";

function buildSampleBuffer(rows: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parseFivepostShipmentBuffer", () => {
  it("parses synthetic 5 POST shipment rows", () => {
    const buffer = buildSampleBuffer([
      [
        "Номер заказа клиента",
        "Номер заказа партнёра",
        "ШК ТЕ",
        "Количество мест",
        "ШК OMNI грузового места",
        "Артикул вложения (название)",
        "Стоимость вложения",
        "Стоимость общая",
        "Вес заказа физический",
        "Длина грузового места",
        "Ширина грузового места",
        "Высота грузового места",
      ],
      [
        "CL-1",
        "PR-1",
        "TE-1",
        2,
        "OMNI-1",
        "Blue T-shirt",
        100,
        200,
        500,
        300,
        200,
        100,
      ],
    ]);

    const parsed = parseFivepostShipmentBuffer(buffer, "Отгрузка Калининград test.xlsx");
    expect(parsed.route).toBe("kgd_mow");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      clientOrderNo: "CL-1",
      partnerOrderNo: "PR-1",
      teBarcode: "TE-1",
      placesCount: 2,
      omniBarcode: "OMNI-1",
      itemName: "Blue T-shirt",
      unitCost: 100,
      totalCost: 200,
      weightG: 500,
      lengthMm: 300,
      widthMm: 200,
      heightMm: 100,
    });
  });

  it("parses real Kaliningrad shipment file when available", () => {
    if (!existsSync(SAMPLE_FILE)) return;
    const buffer = readFileSync(SAMPLE_FILE);
    const parsed = parseFivepostShipmentBuffer(buffer, "Отгрузка Калининград 060826.xlsx");
    expect(parsed.route).toBe("kgd_mow");
    expect(parsed.rows.length).toBeGreaterThan(900);
    expect(parsed.rows[0].itemName.length).toBeGreaterThan(0);
  });
});
