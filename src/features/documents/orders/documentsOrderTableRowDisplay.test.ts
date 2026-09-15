import { describe, expect, it } from "vitest";
import { resolveOrderTableRowDisplay } from "./documentsOrderTableRowDisplay";

describe("resolveOrderTableRowDisplay", () => {
  it("parses legacy posylka into separate columns", () => {
    const cells = resolveOrderTableRowDisplay({
      posylka: "Салфетки для настольных диспенсеров 200л (48шт/кор) · 3120 шт · 21,31 ₽",
    });
    expect(cells.name).toContain("Салфетки");
    expect(cells.name).not.toContain("3120 шт");
    expect(cells.quantity).toBe(3120);
    expect(cells.price).toBeCloseTo(21.31, 2);
    expect(cells.sum).toBeCloseTo(66487.2, 1);
  });

  it("uses structured items when present", () => {
    const cells = resolveOrderTableRowDisplay({
      posylka: "ignored",
      items: [{ name: "Товар А", quantity: 20, price: 50.82 }],
    });
    expect(cells.name).toBe("Товар А");
    expect(cells.quantity).toBe(20);
    expect(cells.price).toBe(50.82);
  });

  it("keeps UPD nomenclature names when several items share one place", () => {
    const cells = resolveOrderTableRowDisplay({
      posylka: "Место 1 (2 поз.)",
      items: [
        { name: "Конструктор Brick Shop JKG42", quantity: 96, price: 1564.55 },
        { name: "Игровой набор CARS JDJ02", quantity: 6, price: 1590.91 },
      ],
    });
    expect(cells.name).toBe("Конструктор Brick Shop JKG42; Игровой набор CARS JDJ02");
    expect(cells.name).not.toMatch(/Место \(\d+ поз\.\)/);
    expect(cells.quantity).toBe(102);
    expect(cells.price).toBeNull();
    expect(cells.sum).toBeCloseTo(96 * 1564.55 + 6 * 1590.91, 1);
  });
});
