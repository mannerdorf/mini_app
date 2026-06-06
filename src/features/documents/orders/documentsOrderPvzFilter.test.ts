import { describe, expect, it } from "vitest";
import type { PvzItem } from "../../../api/client/documentsOrders";
import { filterDocumentsOrderPvzList, isExcludedDocumentsOrderPvz } from "./documentsOrderPvzFilter";

const item = (name: string, city = ""): PvzItem => ({
  Ссылка: "1",
  Наименование: name,
  КодДляПечати: "",
  ГородНаименование: city,
  РегионНаименование: "",
  ВладелецИНН: "",
  ВладелецНаименование: "",
  ОтправительПолучательНаименование: "",
  КонтактноеЛицо: "",
});

describe("documentsOrderPvzFilter", () => {
  it("excludes Andreevskoye and Zheleznodorozhnaya 12 warehouse PVZ", () => {
    expect(isExcludedDocumentsOrderPvz(item("5 ПОСТ ООО", "Андреевское Терминал"))).toBe(true);
    expect(isExcludedDocumentsOrderPvz(item("Склад", "Железнодорожная 12к4, Калининград"))).toBe(true);
    expect(isExcludedDocumentsOrderPvz(item("ПВЗ Центр", "Москва"))).toBe(false);
  });

  it("filters list", () => {
    const out = filterDocumentsOrderPvzList([
      item("5 ПОСТ", "Андреевское"),
      item("Офис", "Москва"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].Наименование).toBe("Офис");
  });
});
