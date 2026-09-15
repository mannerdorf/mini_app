import { describe, expect, it } from "vitest";
import { normalizeJob, pickupJobSearchColumns } from "./model";

describe("pickup job persistence", () => {
  it("keeps zayavka and address meta in normalized payload", () => {
    const data = normalizeJob({
      customerInn: "7700000000",
      customerName: "Заказчик ООО",
      senderInn: "7800000000",
      senderName: "Поставщик ООО",
      address: "Москва, ул. Тест, 1",
      windowFrom: "10:00",
      windowTo: "18:00",
      zayavkaNumber: "З-1001",
      cargoNumber: "П-2002",
      deliveryMode: "courier",
      addressKind: "pvz",
      pvzRef: "pvz-ref-1",
      contacts: [{ name: "Иван", phone: "+79991234567", extension: "", purpose: "Звонки" }],
      places: [{ kind: "Короб", count: 1, lengthCm: null, widthCm: null, heightCm: null }],
    });
    expect(data.zayavkaNumber).toBe("З-1001");
    expect(data.cargoNumber).toBe("П-2002");
    expect(data.pvzRef).toBe("pvz-ref-1");
    expect(data.addressKind).toBe("pvz");
    expect(pickupJobSearchColumns(data)).toEqual({
      zayavka_number: "З-1001",
      cargo_number: "П-2002",
      customer_inn: "7700000000",
      sender_inn: "7800000000",
    });
  });
});
