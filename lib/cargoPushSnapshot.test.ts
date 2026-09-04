import { describe, expect, it } from "vitest";
import {
  cargoPushSnapshotKey,
  cargoPushSnapshotToTemplateItem,
  extractCargoPushSnapshotFields,
} from "./cargoPushSnapshot.js";
import { buildPushTemplateContext } from "./pushNotificationTemplates.js";

describe("cargoPushSnapshotKey", () => {
  it("normalizes inn and cargo number", () => {
    expect(cargoPushSnapshotKey("7707083893", "000141572")).toBe("7707083893::000141572");
  });
});

describe("extractCargoPushSnapshotFields", () => {
  it("extracts list, bill and last mile fields", () => {
    const merged = {
      Number: "000141572",
      State: "Доставлена",
      StateBill: "Оплачен",
      Mest: 12,
      W: 100,
      PW: 120,
      Value: 1.5,
      Sender: "ООО Тест",
      Receiver: "ИП Иванов",
      BillNum: "000001529",
      SumDoc: 125000,
      LMAutoReg: "У706АР/39",
      LMAutoType: "Мерседес",
      LMDriver: "Ругалев Иван Федорович",
      LMDriverTel: "+79953889445",
      DateArrivalPlan: "2026-08-28",
    };
    const row = extractCargoPushSnapshotFields("7707083893", "000141572", merged);
    expect(row.driver).toBe("Ругалев Иван Федорович");
    expect(row.auto_reg).toBe("У706АР");
    expect(row.bill_number).toBe("1529");
    expect(row.plan_date).toBe("28.08.2026");
  });
});

describe("cargoPushSnapshotToTemplateItem", () => {
  it("round-trips into push template context", () => {
    const fields = extractCargoPushSnapshotFields("7707083893", "000141572", {
      Number: "000141572",
      LMDriver: "Иванов",
      LMDriverTel: "+79990001122",
      LMAutoReg: "A111AA/77",
      LMAutoType: "Газель",
    });
    const item = cargoPushSnapshotToTemplateItem({
      ...fields,
      updated_at: new Date().toISOString(),
    });
    const ctx = buildPushTemplateContext("delivery_scheduled", "000141572", item);
    expect(ctx.driver).toBe("Иванов");
    expect(ctx.driver_tel).toBe("+79990001122");
    expect(ctx.auto_reg).toBe("A111AA");
    expect(ctx.auto_type).toBe("Газель");
  });
});
