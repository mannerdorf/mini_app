import { describe, expect, it } from "vitest";
import { buildDocumentsOrderZayavkaPayload } from "./documentsOrderZayavkaPayload.js";

describe("buildDocumentsOrderZayavkaPayload", () => {
  const base = {
    customerInn: "7701234567",
    punktOtpravki: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    punktNaznacheniya: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    dataZabora: "2026-08-20",
    nomerZayavkiKlienta: "ORD-1",
  };

  it("builds synthetic parcel when no cargo rows", () => {
    const payload = buildDocumentsOrderZayavkaPayload({
      ...base,
      declaredValueRub: 5000,
      placeCount: 2,
    });
    expect(payload.Посылки).toHaveLength(1);
    expect(payload.Посылки[0].ШтрихкодЗаказчика).toBe("ORD-1");
    expect(payload.Посылки[0].Товары[0].Количество).toBe(2);
  });

  it("maps fivepost rows", () => {
    const payload = buildDocumentsOrderZayavkaPayload({
      ...base,
      fivepostRows: [
        {
          omniBarcode: "123",
          teBarcode: "TE-1",
          clientOrderNo: "OZON-1",
          itemNameRu: "Футболка",
          totalCost: 1500,
        },
      ],
    });
    expect(payload.Посылки).toHaveLength(1);
    expect(payload.Посылки[0].ШтрихкодЗаказчика).toBe("123");
    expect(payload.Посылки[0].ШтрихкодЗаказчика2).toBe("TE-1");
    expect(payload.Посылки[0].Ид).toBe("OZON-1");
    expect(payload.Посылки[0].Товары[0].Name).toBe("Футболка");
  });

  it("maps UPD table rows", () => {
    const payload = buildDocumentsOrderZayavkaPayload({
      ...base,
      declaredValueRub: 3000,
      tableRows: [{ posylka: "Товар · 2 шт · 1 500 ₽", perevozka: "TR-9" }],
    });
    expect(payload.Посылки).toHaveLength(1);
    expect(payload.Посылки[0].Ид).toBe("TR-9");
    expect(payload.Посылки[0].Товары[0].ОбъявленнаяСтоимостьТовара).toBe(3000);
  });
});
