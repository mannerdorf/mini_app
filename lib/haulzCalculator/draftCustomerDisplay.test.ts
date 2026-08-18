import { describe, expect, it } from "vitest";
import { formatHaulzCalcDraftCustomer, journalCustomerDisplayName } from "./draftCustomerDisplay";

describe("formatHaulzCalcDraftCustomer", () => {
  it("prefers company name and INN over login", () => {
    expect(
      formatHaulzCalcDraftCustomer(
        { customerCompanyName: "5 POST", customerInn: "7722461620" } as never,
        "notification@haulz.pro",
      ),
    ).toBe("5 POST · ИНН 7722461620");
  });

  it("falls back to login when customer is missing", () => {
    expect(formatHaulzCalcDraftCustomer({} as never, "notification@haulz.pro")).toBe(
      "notification@haulz.pro",
    );
  });

  it("keeps guest email and phone together", () => {
    expect(
      formatHaulzCalcDraftCustomer(
        { guestContactEmail: "365656@gmail.com", guestContactPhone: "+7 (999) 123-45-67" } as never,
        "__guest__",
      ),
    ).toBe("365656@gmail.com · +7 (999) 123-45-67");
  });
});

describe("journalCustomerDisplayName", () => {
  it("keeps guest email · phone", () => {
    expect(journalCustomerDisplayName("365656@gmail.com · +7 (999) 123-45-67")).toBe(
      "365656@gmail.com · +7 (999) 123-45-67",
    );
  });

  it("strips only INN suffix for companies", () => {
    expect(journalCustomerDisplayName("5 POST · ИНН 7722461620")).toBe("5 POST");
  });

  it("prefers an explicit journal customer name", () => {
    expect(journalCustomerDisplayName("email · phone", "5 POST")).toBe("5 POST");
  });
});
