import { describe, expect, it } from "vitest";
import {
  annotatePerevozkiRoles,
  resolvePerevozkiRolesForInns,
  stripPerevozkiFinances,
} from "./perevozkiPartyMatch.js";

describe("resolvePerevozkiRolesForInns", () => {
  const elena = "390103058713";
  const polesie = "3900000000";

  it("detects receiver role by ReceiverINN even when CustomerINN differs", () => {
    const roles = resolvePerevozkiRolesForInns(
      {
        INN: polesie,
        CustomerINN: polesie,
        ReceiverINN: elena,
        Customer: "ПОЛЕСЬЕ",
        Receiver: "Кудрявцева Елена Юрьевна",
      },
      new Set([elena]),
    );
    expect(roles).toEqual(["Receiver"]);
  });

  it("detects receiver by normalized name when INN missing", () => {
    const roles = resolvePerevozkiRolesForInns(
      {
        INN: polesie,
        Customer: "ПОЛЕСЬЕ",
        Receiver: "Кудрявцева Елена Юрьевна",
      },
      new Set([elena]),
      new Set(["кудрявцева елена юрьевна"]),
    );
    expect(roles).toEqual(["Receiver"]);
  });
});

describe("annotatePerevozkiRoles", () => {
  it("strips finances for non-customer roles", () => {
    const annotated = annotatePerevozkiRoles(
      { Number: "141676", Sum: 8114.4, StateBill: "Не оплачен", ReceiverINN: "390103058713" },
      ["Receiver"],
    );
    expect(annotated._role).toBe("Receiver");
    expect(annotated._roles).toEqual(["Receiver"]);
    expect(annotated.Sum).toBeUndefined();
    expect(annotated.StateBill).toBeUndefined();
  });

  it("keeps finances for customer role", () => {
    const annotated = annotatePerevozkiRoles({ Number: "1", Sum: 100 }, ["Customer", "Receiver"]);
    expect(annotated.Sum).toBe(100);
    expect(stripPerevozkiFinances({ Sum: 1 }).Sum).toBeUndefined();
  });
});
