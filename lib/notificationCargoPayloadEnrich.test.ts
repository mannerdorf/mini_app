import { describe, expect, it } from "vitest";
import {
  enrichBillItemForPushTemplate,
  enrichCargoItemForPushTemplate,
  invoiceFieldsForPushMerge,
  mergeCargoItemForPushTemplate,
  shouldFetchPerevozkaLastMileForPush,
} from "./notificationCargoPayloadEnrich.js";
import { buildPushTemplateContext } from "./pushNotificationTemplates.js";

describe("mergeCargoItemForPushTemplate", () => {
  it("fills empty LM fields from overlay", () => {
    const merged = mergeCargoItemForPushTemplate(
      { Number: "000141659", Sender: "ООО Тест" },
      { LMDriver: "Иванов", LMDriverTel: "+79990001122", LMAutoReg: "A111AA/39", LMAutoType: "Газель" },
    );
    expect(merged.LMDriver).toBe("Иванов");
    expect(merged.LMDriverTel).toBe("+79990001122");
    expect(merged.Sender).toBe("ООО Тест");
  });
});

describe("enrichCargoItemForPushTemplate", () => {
  it("uses cached payload by cargo number", () => {
    const payloadByNumber = new Map([
      [
        "000141659",
        {
          LMDriver: "Сидоров",
          LMDriverTel: "+79990001122",
        },
      ],
    ]);
    const enriched = enrichCargoItemForPushTemplate({ Number: "000141659", Mest: 31 }, payloadByNumber);
    expect(enriched.LMDriver).toBe("Сидоров");
    expect(enriched.Mest).toBe(31);
  });
});

describe("shouldFetchPerevozkaLastMileForPush", () => {
  it("requests detail for delivery_scheduled without LM fields", () => {
    expect(shouldFetchPerevozkaLastMileForPush("delivery_scheduled", { Number: "1" })).toBe(true);
  });

  it("skips when LM fields already present", () => {
    expect(
      shouldFetchPerevozkaLastMileForPush("delivery_scheduled", {
        LMDriver: "Иванов",
        LMDriverTel: "+79990001122",
      }),
    ).toBe(false);
  });

  it("still fetches when GetPerevozki only has TypeOfTransit", () => {
    expect(
      shouldFetchPerevozkaLastMileForPush("delivery_scheduled", {
        Number: "000141572",
        TypeOfTransit: "Авто",
        TypeOfTranzit: "Авто",
      }),
    ).toBe(true);
  });
});

describe("enrichBillItemForPushTemplate", () => {
  it("fills bill number from linked invoice without overwriting cargo number", () => {
    const invoiceByCargo = new Map([
      [
        "141896",
        {
          Number: "000001234",
          SumDoc: 44941,
          List: [{ Operation: "Перевозка 000141896" }],
        },
      ],
    ]);
    const enriched = enrichBillItemForPushTemplate({ Number: "000141896", Sum: 44941 }, invoiceByCargo);
    expect(enriched.Number).toBe("000141896");
    expect(enriched.BillNum).toBe("000001234");
    const ctx = buildPushTemplateContext("bill_created", "000141896", enriched);
    expect(ctx.bill_number).toBe("1234");
    expect(ctx.bill_sum).toMatch(/44/);
  });

  it("fills bill number when List stores cargo in Number not Operation", () => {
    const invoiceByCargo = new Map([
      [
        "141896",
        {
          Number: "000001529",
          SumDoc: 125000,
          List: [{ Name: "Перевозка", Number: "000141896" }],
        },
      ],
    ]);
    const enriched = enrichBillItemForPushTemplate({ Number: "000141896", StateBill: "Не оплачен" }, invoiceByCargo);
    expect(enriched.BillNum).toBe("000001529");
    expect(buildPushTemplateContext("bill_created", "000141896", enriched).bill_number).toBe("1529");
  });
});

describe("invoiceFieldsForPushMerge", () => {
  it("maps invoice Number to BillNum", () => {
    const fields = invoiceFieldsForPushMerge({ Number: "000001529", SumDoc: 125000 });
    expect(fields.BillNum).toBe("000001529");
    expect(fields.SumDoc).toBe(125000);
  });

  it("maps nested Invoice.Number to BillNum", () => {
    const fields = invoiceFieldsForPushMerge({
      Invoice: { Number: "000001529", SumDoc: 125000 },
    });
    expect(fields.BillNum).toBe("000001529");
    expect(fields.SumDoc).toBe(125000);
  });
});

describe("loadInvoicePayloadsByCargoNumbers", () => {
  it("links invoice without customer_inn via payload text search", async () => {
    const invoice = {
      Number: "000001529",
      List: [{ Name: "Перевозка", Number: "000141896" }],
    };
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const pool = {
      query: async <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        if (sql.includes("ILIKE")) {
          return { rows: [{ doc_number: "000001529", payload: invoice }] as unknown as T[] };
        }
        return { rows: [] as T[] };
      },
    };
    const { loadInvoicePayloadsByCargoNumbers } = await import("./notificationCargoPayloadEnrich.js");
    const byCargo = await loadInvoicePayloadsByCargoNumbers(pool, "7820046291", ["000141896"]);
    expect(calls.some((c) => c.sql.includes("ILIKE"))).toBe(true);
    const hit = byCargo.get("000141896") ?? byCargo.get("141896");
    expect(hit?.Number).toBe("000001529");
  });
});
