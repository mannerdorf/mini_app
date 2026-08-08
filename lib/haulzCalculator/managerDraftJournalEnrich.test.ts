import { describe, expect, it } from "vitest";
import { enrichDraftWithDocumentsOrderJournal } from "./managerDraftJournalEnrich";
import type { HaulzCalcDraftRow } from "./calculatorDraft";

const baseDraft = (): HaulzCalcDraftRow => ({
  id: 1,
  title: "[ЛК] test",
  status: "new",
  nomerZayavki: "HAULZ-DOC-123",
  loginKey: "user@test.ru",
  formState: {
    fromQuery: "Склад HAULZ, Москва",
    toQuery: "Склад HAULZ, Калининград",
    from: {
      label: "Склад HAULZ, Москва",
      fullAddress: "Московская область, склад",
      point: { lat: 1, lon: 2 },
      city: "moscow",
    },
    to: {
      label: "Склад HAULZ, Калининград",
      fullAddress: "Калининград, склад",
      point: { lat: 3, lon: 4 },
      city: "kaliningrad",
    },
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
    places: [{ weightKg: 1, volumeM3: 0.01 }],
    activePresetIdx: {},
    declaredValue: "",
    mainlineMode: "ferry",
    directionOverride: "mow_kgd",
    extraCodes: [],
    dataZabora: "2026-08-09",
  },
  quoteResult: {
    direction: "mow_kgd",
    totalRub: 1000,
    deliveryDays: 7,
    lines: [],
    chargeable: {
      actualWeightKg: 1,
      volumeM3: 0.01,
      volumeWeightKg: 1,
      chargeableWeightKg: 1,
      volumetricFactor: 200,
    },
  },
  createdAt: "2026-08-09T00:00:00.000Z",
  updatedAt: "2026-08-09T00:00:00.000Z",
});

describe("enrichDraftWithDocumentsOrderJournal", () => {
  it("builds journal fallback from form state for HAULZ-DOC drafts", async () => {
    const enriched = await enrichDraftWithDocumentsOrderJournal({ query: async () => ({ rows: [] }) } as never, baseDraft());
    expect(enriched.documentsOrderJournal?.routeLabel).toBe("MSK – KGD");
    expect(enriched.documentsOrderJournal?.customerName).toBe("5 POST");
    expect(enriched.documentsOrderJournal?.senderPoint).toContain("Московская");
  });

  it("skips calculator-only drafts", async () => {
    const draft = { ...baseDraft(), nomerZayavki: "HAULZ-CALC-17" };
    const enriched = await enrichDraftWithDocumentsOrderJournal({ query: async () => ({ rows: [] }) } as never, draft);
    expect(enriched.documentsOrderJournal).toBeUndefined();
  });
});
