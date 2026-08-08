import { describe, expect, it } from "vitest";
import { draftToManagerJournalRow } from "./draftToManagerJournalRow";
import type { HaulzCalcDraft } from "../../api/client/haulzCalculator";

const baseDraft = (): HaulzCalcDraft => ({
  id: 1,
  title: "[ЛК] test",
  status: "new",
  nomerZayavki: "HAULZ-DOC-123",
  loginKey: "user@test.ru",
  formState: {
    fromQuery: "Склад",
    toQuery: "Склад",
    from: null,
    to: null,
    fromMode: "point",
    toMode: "point",
    fromPhone: "",
    toPhone: "",
    customerInn: "7722461620",
    customerCompanyName: "5 POST",
    fromInn: "",
    toInn: "",
    fromCompanyName: "",
    toCompanyName: "",
    fromName: "",
    toName: "",
    places: [],
    activePresetIdx: {},
    declaredValue: "",
    mainlineMode: "ferry",
    directionOverride: "mow_kgd",
    extraCodes: [],
    dataZabora: "2026-08-09",
  },
  quoteResult: null,
  createdAt: "2026-08-09T00:00:00.000Z",
  updatedAt: "2026-08-09T00:23:00.000Z",
});

describe("draftToManagerJournalRow", () => {
  it("maps documents journal enrichment to documents row shape", () => {
    const row = draftToManagerJournalRow({
      ...baseDraft(),
      documentsOrderJournal: {
        customerName: "5 POST",
        senderPoint: "Московская область, склад",
        destinationPoint: "Калининград, склад",
        senderName: "5 POST",
        receiverName: "",
        routeLabel: "MSK – KGD",
        pickupDate: "2026-08-09",
        fivepostRows: [{ lineNo: 1, clientOrderNo: "1" }],
        legacyTableRows: [],
      },
    });

    expect(row.НомерЗаявки).toBe("HAULZ-DOC-123");
    expect(row.CitySender).toBe("MSK");
    expect(row.CityReceiver).toBe("KGD");
    expect(row.АдресОтправки).toContain("Московская");
    expect(row._fivepostRows).toHaveLength(1);
  });
});
