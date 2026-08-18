import { describe, expect, it } from "vitest";
import { extractZayavkaBody, normalizeZayavkaUploadPayload } from "./post1cZayavkaUpload.js";

const SAMPLE = {
  ЗаказчикИНН: "7701234567",
  ОтправительИНН: "",
  ПолучательИНН: "5401123456",
  ПунктОтправки: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  ПунктНазначения: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  ДатаЗабораПлан: "2026-08-20",
  ОГ: false,
  НомерЗаявкиКлиента: "ORD-2026-00041",
  Посылки: [
    {
      ШтрихкодЗаказчика: "1234567890123",
      ШтрихкодЗаказчика2: "ABC-002",
      Ид: "OZON-7788",
      Товары: [
        {
          ИДОтправления: "POST-9001",
          ID: "sku-001",
          Name: "Футболка",
          ТМЦ: "Футболка хлопок 48",
          Количество: 2,
          ОбъявленнаяСтоимостьТовара: 1500,
        },
      ],
    },
  ],
};

describe("extractZayavkaBody", () => {
  it("reads root payload", () => {
    expect(extractZayavkaBody(SAMPLE)?.ЗаказчикИНН).toBe("7701234567");
  });

  it("reads nested order wrapper", () => {
    expect(extractZayavkaBody({ order: SAMPLE })?.НомерЗаявкиКлиента).toBe("ORD-2026-00041");
  });
});

describe("normalizeZayavkaUploadPayload", () => {
  it("accepts user sample format", () => {
    const r = normalizeZayavkaUploadPayload(SAMPLE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.ЗаказчикИНН).toBe("7701234567");
    expect(r.payload.ПолучательИНН).toBe("5401123456");
    expect(r.payload.Посылки).toHaveLength(1);
    expect(r.payload.Посылки[0].Товары[0].Количество).toBe(2);
    expect(r.payload.ОГ).toBe(false);
  });

  it("rejects missing customer inn", () => {
    const r = normalizeZayavkaUploadPayload({ ...SAMPLE, ЗаказчикИНН: "" });
    expect(r.ok).toBe(false);
  });

  it("rejects empty parcels", () => {
    const r = normalizeZayavkaUploadPayload({ ...SAMPLE, Посылки: [] });
    expect(r.ok).toBe(false);
  });
});
