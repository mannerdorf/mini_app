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
    expect(payload.Посылки[0].Товары[0].Name).toBe("Товар");
    expect(payload.Посылки[0].Товары[0].Количество).toBe(2);
    expect(payload.Посылки[0].Товары[0].ОбъявленнаяСтоимостьТовара).toBe(3000);
  });

  it("uses structured items for Name, quantity and declared value", () => {
    const longName =
      "Салфетки бумажные БигПак 400л желтый упаковка для настольных диспенсеров большой";
    const payload = buildDocumentsOrderZayavkaPayload({
      ...base,
      declaredValueRub: 1000,
      tableRows: [
        {
          posylka: `${longName} · 54 шт · 119,67 ₽`,
          idOtpravleniya: "8017NBO5ZQYRTQCM",
          items: [{ name: longName, quantity: 54, price: 119.67 }],
        },
      ],
    });
    const parcel = payload.Посылки[0];
    const good = parcel.Товары[0];
    expect(parcel.ШтрихкодЗаказчика).toBe("8017NBO5ZQYRTQCM");
    expect(good.Name).toBe(longName.slice(0, 49));
    expect(good.ТМЦ).toBe(longName.slice(0, 49));
    expect(good.Name.length).toBe(49);
    expect(good.Количество).toBe(54);
    expect(good.ОбъявленнаяСтоимостьТовара).toBeCloseTo(6462.18, 2);
    expect(good.Name).not.toContain("шт");
    expect(good.Name).not.toContain("₽");
  });

  it("truncates UPD cell text in Name and ТМЦ to 49 characters for 1C", () => {
    const updName =
      "Листовые полотенца V- 2сл. (целлюлоза), (200л), 22х23см; (20шт./кор)";
    const payload = buildDocumentsOrderZayavkaPayload({
      ...base,
      tableRows: [
        {
          posylka: `${updName} · 800 шт · 50,82 ₽`,
          idOtpravleniya: "8017OYN7C418008I",
          items: [{ name: updName, quantity: 800, price: 50.82 }],
        },
      ],
    });
    const good = payload.Посылки[0].Товары[0];
    expect(good.Name).toBe(updName.slice(0, 49));
    expect(good.ТМЦ).toBe(updName.slice(0, 49));
    expect(good.Name.length).toBeLessThanOrEqual(49);
    expect(good.Количество).toBe(800);
    expect(good.ОбъявленнаяСтоимостьТовара).toBeCloseTo(40656, 0);
  });

  it("passes idOtpravleniya into goods rows", () => {
    const payload = buildDocumentsOrderZayavkaPayload({
      ...base,
      declaredValueRub: 1000,
      tableRows: [{ posylka: "Место 1", idOtpravleniya: "1620ABCD1234EFGH" }],
    });
    expect(payload.Посылки[0].Товары[0].ИДОтправления).toBe("1620ABCD1234EFGH");
    expect(payload.Посылки[0].ШтрихкодЗаказчика).toBe("1620ABCD1234EFGH");
  });
});
