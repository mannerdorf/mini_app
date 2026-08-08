import { describe, expect, it } from "vitest";
import { formatHaulzCalcDraftCustomer } from "./draftCustomerDisplay";

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
});
