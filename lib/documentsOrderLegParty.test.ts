import { describe, expect, it } from "vitest";
import { resolveDocumentsOrderLegParty } from "./documentsOrderLegParty.js";

describe("resolveDocumentsOrderLegParty", () => {
  it("fills inn and company from PVZ directory item", () => {
    const party = resolveDocumentsOrderLegParty({
      deliveryMode: "courier",
      addressKind: "pvz",
      pvzItem: {
        ВладелецИНН: "390103058713",
        Наименование: "Шайдулин Р.Г. ИП",
        КонтактноеЛицо: "Рамиль",
      },
      addr: { point: { lat: 54.7, lon: 20.5 } },
    });
    expect(party.inn).toBe("390103058713");
    expect(party.companyName).toBe("Шайдулин Р.Г. ИП");
    expect(party.fullName).toBe("Рамиль");
  });

  it("fills inn from custom address contacts", () => {
    const party = resolveDocumentsOrderLegParty({
      deliveryMode: "courier",
      addressKind: "custom",
      addr: { point: { lat: 55.7, lon: 37.6 } },
      inn: "7701234567",
      companyName: "ООО Тест",
      contactName: "Иван",
    });
    expect(party.inn).toBe("7701234567");
    expect(party.companyName).toBe("ООО Тест");
  });
});
