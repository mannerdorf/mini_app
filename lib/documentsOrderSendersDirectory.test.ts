import { describe, expect, it } from "vitest";
import type { PvzItem } from "../src/api/client/documentsOrders.js";
import {
  buildDocumentsOrderSendersDirectory,
  pickDefaultDocumentsOrderSender,
} from "./documentsOrderSendersDirectory.js";

function pvz(partial: Partial<PvzItem>): PvzItem {
  return {
    Ссылка: "ref",
    Наименование: "ПВЗ",
    КодДляПечати: "",
    ГородНаименование: "Москва",
    РегионНаименование: "",
    ВладелецИНН: "7722461620",
    ВладелецНаименование: "ООО 5 POST",
    ОтправительПолучательНаименование: "",
    КонтактноеЛицо: "",
    ...partial,
  };
}

describe("buildDocumentsOrderSendersDirectory", () => {
  it("adds fallback customer and unique PVZ senders", () => {
    const options = buildDocumentsOrderSendersDirectory(
      [
        pvz({ ОтправительПолучательНаименование: "5 POST Склад МО" }),
        pvz({ ОтправительПолучательНаименование: "5 POST Склад МО" }),
        pvz({
          ВладелецИНН: "7722461620",
          ОтправительПолучательНаименование: "5 POST Калининград",
        }),
      ],
      { inn: "7722461620", name: "ООО 5 POST" },
    );
    expect(options.map((o) => o.name)).toEqual([
      "5 POST Калининград",
      "5 POST Склад МО",
      "ООО 5 POST",
    ]);
    expect(options.every((o) => o.inn === "7722461620")).toBe(true);
  });

  it("picks default by preferred inn and name", () => {
    const options = buildDocumentsOrderSendersDirectory(
      [pvz({ ОтправительПолучательНаименование: "Другой" })],
      { inn: "7722461620", name: "ООО 5 POST" },
    );
    const picked = pickDefaultDocumentsOrderSender(options, "7722461620", "ООО 5 POST");
    expect(picked?.name).toBe("ООО 5 POST");
  });
});
