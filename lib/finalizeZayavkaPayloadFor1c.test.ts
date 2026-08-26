import { describe, expect, it } from "vitest";
import { patchReceiverInnFromPendingTableRows } from "./finalizeZayavkaPayloadFor1c.js";
import type { ZayavkaUploadPayload } from "./post1cZayavkaUpload.js";

describe("patchReceiverInnFromPendingTableRows", () => {
  const base: ZayavkaUploadPayload = {
    ЗаказчикИНН: "7722461620",
    ОтправительИНН: "7722461620",
    ПолучательИНН: "",
    ПунктОтправки: "from",
    ПунктНазначения: "to",
    ДатаЗабораПлан: "2026-08-27",
    ОГ: false,
    НомерЗаявкиКлиента: "",
    Посылки: [],
  };

  it("fills ПолучательИНН from contacts.to when payload is empty", () => {
    const patched = patchReceiverInnFromPendingTableRows(base, [
      {
        type: "contacts",
        to: { inn: "390103058713", companyName: "Шайдулин Р.Г. ИП" },
      },
    ]);
    expect(patched.ПолучательИНН).toBe("390103058713");
  });

  it("does not overwrite existing ПолучательИНН", () => {
    const patched = patchReceiverInnFromPendingTableRows(
      { ...base, ПолучательИНН: "1234567890" },
      [{ type: "contacts", to: { inn: "390103058713" } }],
    );
    expect(patched.ПолучательИНН).toBe("1234567890");
  });
});
