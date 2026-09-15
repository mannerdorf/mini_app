import { describe, expect, it } from "vitest";
import {
  buildDocumentsOrderSendersDirectory,
  filterDocumentsOrderSenderOptions,
  findDocumentsOrderSenderOption,
} from "./documentsOrderSendersDirectory.js";

describe("buildDocumentsOrderSendersDirectory", () => {
  it("builds unique options from suppliers catalog", () => {
    const options = buildDocumentsOrderSendersDirectory([
      { inn: "7707083893", supplier_name: "Сбербанк" },
      { inn: "7707083893", supplier_name: "Сбербанк" },
      { inn: "7707083893", supplier_name: "ПАО Сбербанк" },
      { inn: "7722461620", supplier_name: "5 POST" },
    ]);
    expect(options.map((o) => o.name)).toEqual(["5 POST", "ПАО Сбербанк", "Сбербанк"]);
  });

  it("filters by inn or name", () => {
    const options = buildDocumentsOrderSendersDirectory([
      { inn: "7707083893", supplier_name: "Сбербанк" },
      { inn: "7722461620", supplier_name: "5 POST" },
    ]);
    expect(filterDocumentsOrderSenderOptions(options, "7707").map((o) => o.inn)).toEqual(["7707083893"]);
    expect(filterDocumentsOrderSenderOptions(options, "post").map((o) => o.name)).toEqual(["5 POST"]);
  });

  it("finds option by inn", () => {
    const options = buildDocumentsOrderSendersDirectory([
      { inn: "7722461620", supplier_name: "5 POST" },
    ]);
    expect(findDocumentsOrderSenderOption(options, "7722461620")?.name).toBe("5 POST");
  });
});
