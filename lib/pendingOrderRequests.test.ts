import { describe, expect, it } from "vitest";
import { mergeOrdersWithPending, pendingOrderToListItem } from "./pendingOrderRequests";

describe("pendingOrderToListItem", () => {
  it("maps db row to orders list shape", () => {
    const item = pendingOrderToListItem({
      id: 1,
      login: "user@test.ru",
      inn: "7722461620",
      punkt_otpravki: "MSK-PVZ-1",
      punkt_naznacheniya: "KGD-PVZ-2",
      nomer_zayavki: "HAULZ-DOC-123",
      data_zabora: "2026-08-09",
      created_at: "2026-08-09T12:00:00.000Z",
      table_rows: [
        { type: "source", customerName: "5 POST", customerInn: "7722461620" },
        {
          type: "contacts",
          from: { fullName: "Отправитель Тест" },
          to: { fullName: "Получатель Тест" },
        },
      ],
    });

    expect(item.НомерЗаявки).toBe("HAULZ-DOC-123");
    expect(item.Дата).toBe("2026-08-09");
    expect(item.ЗаказчикИНН).toBe("7722461620");
    expect(item._pendingOrder).toBe(true);
    expect(item.Комментарий).toContain("1С");
  });
});

describe("mergeOrdersWithPending", () => {
  it("prepends pending items not yet in 1C cache", () => {
    const merged = mergeOrdersWithPending(
      [{ НомерЗаявки: "Z-1" }],
      [{ НомерЗаявки: "HAULZ-DOC-123" }, { НомерЗаявки: "Z-1" }],
    );
    expect(merged).toHaveLength(2);
    expect((merged[0] as Record<string, unknown>).НомерЗаявки).toBe("HAULZ-DOC-123");
  });
});
