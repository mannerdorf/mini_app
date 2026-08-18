import { describe, expect, it } from "vitest";
import type { PvzItem } from "../../../api/client/documentsOrders";
import {
  filterDocumentsOrderPvzByCity,
  filterDocumentsOrderPvzByOwnerInn,
  filterDocumentsOrderPvzList,
  inferPvzCityCode,
  isExcludedDocumentsOrderPvz,
} from "./documentsOrderPvzFilter";

const item = (name: string, city = "", ownerInn = ""): PvzItem => ({
  Ссылка: "1",
  Наименование: name,
  КодДляПечати: "",
  ГородНаименование: city,
  РегионНаименование: "",
  ВладелецИНН: ownerInn,
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

  it("infers PVZ city", () => {
    expect(inferPvzCityCode(item("ПВЗ", "Москва"))).toBe("moscow");
    expect(inferPvzCityCode(item("ПВЗ", "Калининград"))).toBe("kaliningrad");
  });

  it("filters PVZ by route city", () => {
    const list = [item("Мск офис", "Москва"), item("Кгд офис", "Калининград")];
    expect(filterDocumentsOrderPvzByCity(list, "moscow")).toHaveLength(1);
    expect(filterDocumentsOrderPvzByCity(list, "moscow")[0].Наименование).toBe("Мск офис");
    expect(filterDocumentsOrderPvzByCity(list, "kaliningrad")).toHaveLength(1);
  });

  it("keeps only PVZ of the header customer INN", () => {
    const list = [
      item("Свой ПВЗ", "Москва", "7820046291"),
      item("Чужой ПВЗ", "Москва", "7707083893"),
      item("Кгд свой", "Калининград", "7820046291"),
    ];
    expect(filterDocumentsOrderPvzByOwnerInn(list, "7820 046291")).toHaveLength(2);
    expect(filterDocumentsOrderPvzByCity(list, "moscow", "7820046291")).toEqual([
      expect.objectContaining({ Наименование: "Свой ПВЗ" }),
    ]);
    expect(filterDocumentsOrderPvzByOwnerInn(list, "")).toEqual([]);
  });
});
