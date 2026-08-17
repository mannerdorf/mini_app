import { describe, expect, it } from "vitest";
import { normCargoKey, normalizeTransportName, filterItemsForHeaderCustomer, getItemPartyInns } from "./documentsPipeline";

describe("normCargoKey", () => {
  it("trims and strips leading zeros", () => {
    expect(normCargoKey("  00123  ")).toBe("123");
  });

  it("returns empty for null", () => {
    expect(normCargoKey(null)).toBe("");
  });
});

describe("normalizeTransportName", () => {
  it("normalizes container id", () => {
    expect(normalizeTransportName("MSKU1234567")).toBe("MSKU 1234567");
  });
});

describe("filterItemsForHeaderCustomer party roles", () => {
  const elenaInn = "390103058713";
  const polesieInn = "3900000000";

  it("keeps shipment where header company is only the receiver", () => {
    const items = [
      {
        Number: "141676",
        Customer: "ПОЛЕСЬЕ",
        CustomerINN: polesieInn,
        INN: polesieInn,
        Receiver: "Кудрявцева Елена Юрьевна",
        ReceiverINN: elenaInn,
        Sender: "ПОЛЕСЬЕ",
      },
    ];
    const filtered = filterItemsForHeaderCustomer(items, {
      activeInn: elenaInn,
      activeCustomerName: "Кудрявцева Елена Юрьевна ИП",
    });
    expect(filtered).toHaveLength(1);
    expect(getItemPartyInns(items[0])).toContain(elenaInn);
  });

  it("drops shipment unrelated to header company", () => {
    const items = [
      {
        Number: "1",
        Customer: "Другой",
        INN: "7707083893",
        Receiver: "Ещё кто-то",
        ReceiverINN: "500100732259",
      },
    ];
    const filtered = filterItemsForHeaderCustomer(items, { activeInn: elenaInn });
    expect(filtered).toHaveLength(0);
  });
});
