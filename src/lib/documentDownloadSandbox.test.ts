import { describe, expect, it } from "vitest";
import { resolveSandboxDocumentRequest } from "./documentDownloadSandbox";

describe("resolveSandboxDocumentRequest", () => {
  const base = {
    cargoNumber: "141572",
    invoiceNumber: "0000-000123",
    dateDoc: "2026-08-24",
    inn: "",
    formatCargoForApi: true,
    schetUseInvoiceNumber: false,
  };

  it("formats cargo number for APP", () => {
    const result = resolveSandboxDocumentRequest("АПП", base);
    expect(result).toEqual({ metod: "АПП", number: "000141572" });
  });

  it("requires invoice and date for registry", () => {
    expect(resolveSandboxDocumentRequest("Реестр", { ...base, dateDoc: "" })).toEqual({
      error: "Укажите дату счёта (YYYY-MM-DD) для реестра",
    });
    const ok = resolveSandboxDocumentRequest("Реестр", base);
    if ("error" in ok) throw new Error(ok.error);
    expect(ok.metod).toBe("РеестрКсчету");
    expect(ok.number).toBe("0000-000123");
    expect(ok.dateDoc).toBe("2026-08-24T00:00:00");
  });

  it("allows invoice number for schet", () => {
    const result = resolveSandboxDocumentRequest("СЧЕТ", { ...base, schetUseInvoiceNumber: true });
    expect(result).toEqual({ metod: "Счет", number: "0000-000123" });
  });
});
