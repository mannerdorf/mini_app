import { describe, expect, it } from "vitest";
import { getOrderStatusLabel } from "./orderCustomerScope";
import {
  mergeOrdersWithPending,
  pendingOrderToListItem,
  fivepostBatchIdFromTableRows,
  resolvePendingOrderStatusLabel,
  upsertManagerStatusInTableRows,
  PENDING_ORDER_MANAGER_STATUS_ROW_TYPE,
} from "./pendingOrderRequests";

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
    expect(item.НомерЗаявкиКлиента).toBe("");
    expect(item.Дата).toBe("2026-08-09");
    expect(item.ЗаказчикИНН).toBe("7722461620");
    expect(item._pendingOrder).toBe(true);
    expect(item.Комментарий).toContain("1С");
    expect(item.Статус).toBe("Ожидает обработки");
  });

  it("maps manager status from table_rows", () => {
    const item = pendingOrderToListItem({
      id: 4,
      login: "user@test.ru",
      inn: "7722461620",
      punkt_otpravki: "MSK-PVZ-1",
      punkt_naznacheniya: "KGD-PVZ-2",
      nomer_zayavki: "HAULZ-DOC-777",
      data_zabora: "2026-08-09",
      created_at: "2026-08-09T12:00:00.000Z",
      table_rows: [
        { type: PENDING_ORDER_MANAGER_STATUS_ROW_TYPE, status: "agreed", label: "Согласовано" },
      ],
    });

    expect(item.Статус).toBe("Согласовано");
    expect(item.State).toBe("Согласовано");
  });

  it("maps customer request number from source block", () => {
    const item = pendingOrderToListItem({
      id: 2,
      login: "user@test.ru",
      inn: "7722461620",
      punkt_otpravki: "MSK-PVZ-1",
      punkt_naznacheniya: "KGD-PVZ-2",
      nomer_zayavki: "HAULZ-DOC-999",
      data_zabora: "2026-08-09",
      created_at: "2026-08-09T12:00:00.000Z",
      table_rows: [
        {
          type: "source",
          customerName: "5 POST",
          customerInn: "7722461620",
          customerRequestNumber: "423423",
        },
      ],
    });

    expect(item.НомерЗаявки).toBe("HAULZ-DOC-999");
    expect(item.НомерЗаявкиКлиента).toBe("423423");
    expect(item.ClientRequestNumber).toBe("423423");
  });

  it("maps warehouse refs to MSK – KGD route", () => {
    const item = pendingOrderToListItem({
      id: 3,
      login: "user@test.ru",
      inn: "7722461620",
      punkt_otpravki: "WH_MSK",
      punkt_naznacheniya: "WH_KGD",
      nomer_zayavki: "HAULZ-DOC-456",
      data_zabora: "2026-08-09",
      created_at: "2026-08-08T21:00:00.000Z",
      table_rows: [
        {
          type: "pvz",
          from: {
            ref: "WH_MSK",
            address: {
              label: "Склад HAULZ, Москва",
              fullAddress:
                "территория Индустриальный парк Андреевское, вл14А, деревня Андреевское, Ленинский городской округ, Московская область",
            },
          },
          to: {
            ref: "WH_KGD",
            address: {
              label: "Склад HAULZ, Калининград",
              fullAddress: "Железнодорожная улица, 12к4, Калининград, 236039",
            },
          },
        },
        { type: "quote_lines", direction: "mow_kgd" },
        {
          type: "contacts",
          customer: { companyName: "5 POST" },
          from: { companyName: "5 POST", fullName: "Иван Иванов" },
          to: { companyName: "Получатель ООО" },
        },
      ],
    });

    expect(item.CitySender).toBe("MSK");
    expect(item.CityReceiver).toBe("KGD");
    expect(item.ПунктОтправкиНаименование).toContain("Андреевское");
    expect(item.АдресНазначения).toContain("Калининград");
    expect(item.ОтправительНаименование).toBe("5 POST");
    expect(item.ПолучательНаименование).toBe("Получатель ООО");
  });

  it("uses Moscow date for late-night UTC timestamps", () => {
    const item = pendingOrderToListItem({
      id: 2,
      login: "user@test.ru",
      inn: "7722461620",
      punkt_otpravki: "A",
      punkt_naznacheniya: "B",
      nomer_zayavki: "HAULZ-DOC-999",
      data_zabora: "2026-08-09",
      created_at: "2026-08-08T21:30:00.000Z",
      table_rows: [],
    });
    expect(item.Дата).toBe("2026-08-09");
    expect(item.ДатаЗабораПлан).toBe("2026-08-09");
  });

  it("reads fivepost batch id from table rows", () => {
    expect(
      fivepostBatchIdFromTableRows([{ type: "fivepost", batchId: 42 }, { type: "source" }]),
    ).toBe(42);
  });

  it("does not infer fivepost batch from legacy UPD rows alone", () => {
    expect(
      fivepostBatchIdFromTableRows([
        { type: "legacy_parcels", rows: [{ n: 1, posylka: "UPD-1", perevozka: "T-1" }] },
        { type: "source" },
      ]),
    ).toBeNull();
  });
});

describe("manager status helpers", () => {
  it("upserts manager_status row without duplicates", () => {
    const rows = upsertManagerStatusInTableRows(
      [{ type: "source" }, { type: PENDING_ORDER_MANAGER_STATUS_ROW_TYPE, status: "new", label: "Новая" }],
      "agreed",
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({
      type: PENDING_ORDER_MANAGER_STATUS_ROW_TYPE,
      status: "agreed",
      label: "Согласовано",
    });
  });

  it("resolvePendingOrderStatusLabel prefers stored label", () => {
    expect(
      resolvePendingOrderStatusLabel([
        { type: PENDING_ORDER_MANAGER_STATUS_ROW_TYPE, status: "agreed", label: "Согласовано" },
      ]),
    ).toBe("Согласовано");
    expect(resolvePendingOrderStatusLabel([])).toBe("Ожидает обработки");
  });

  it("getOrderStatusLabel uses pending order status when set", () => {
    expect(
      getOrderStatusLabel({ _pendingOrder: true, Статус: "Согласовано" }),
    ).toBe("Согласовано");
    expect(getOrderStatusLabel({ _pendingOrder: true })).toBe("Ожидает обработки");
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
