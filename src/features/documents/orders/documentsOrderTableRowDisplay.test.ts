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
});
