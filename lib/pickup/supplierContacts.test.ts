import { describe, expect, it } from "vitest";
import {
  contactPhoneDigits,
  isPersistablePickupContact,
} from "./supplierContacts";

describe("pickup supplier contacts", () => {
  it("normalizes phone digits", () => {
    expect(contactPhoneDigits("+7 (985) 047-45-26")).toBe("79850474526");
  });

  it("requires at least 7 digits to persist", () => {
    expect(
      isPersistablePickupContact({
        name: "A",
        phone: "+7999",
        extension: "",
        purpose: "Звонки",
      }),
    ).toBe(false);
    expect(
      isPersistablePickupContact({
        name: "A",
        phone: "+79991234567",
        extension: "",
        purpose: "Звонки",
      }),
    ).toBe(true);
  });
});
