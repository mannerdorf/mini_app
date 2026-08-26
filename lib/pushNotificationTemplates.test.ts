import { describe, expect, it } from "vitest";
import {
  buildPushTemplateContext,
  defaultPushNotificationTemplates,
  formatPushNotificationMessage,
  renderPushTemplateString,
} from "./pushNotificationTemplates.js";

describe("renderPushTemplateString", () => {
  it("substitutes variables", () => {
    const text = renderPushTemplateString("Груз {cargo_number} — {stage_label}", {
      cargo_number: "141572",
      stage_label: "Доставлена",
    });
    expect(text).toBe("Груз 141572 — Доставлена");
  });
});

describe("formatPushNotificationMessage", () => {
  it("uses custom template from map", () => {
    const templates = new Map([
      [
        "delivery_scheduled",
        {
          titleTemplate: "HAULZ доставка",
          bodyTemplate: "Запланирована доставка № {cargo_number} для {receiver}",
          enabled: true,
          updatedAt: null,
          updatedBy: null,
        },
      ],
    ] as const);

    const result = formatPushNotificationMessage(
      "delivery_scheduled",
      "000141572",
      { Receiver: "Гончаров ИП" },
      templates as never,
    );

    expect(result.title).toBe("HAULZ доставка");
    expect(result.body).toBe("Запланирована доставка № 000141572 для Гончаров ИП");
    expect(result.usedCustomTemplate).toBe(true);
  });

  it("uses default bill template with bill number", () => {
    const result = formatPushNotificationMessage("bill_created", "000141572", {
      BillNum: "000001529",
      SumDoc: 125000,
    });
    expect(result.body).toContain("счет № 1529");
    expect(result.body).toContain("000141572");
    expect(result.usedCustomTemplate).toBe(false);
  });

  it("uses planned delivery date default template", () => {
    const result = formatPushNotificationMessage("planned_delivery_date", "000141572", {
      DateArrivalPlan: "2026-08-28",
    });
    expect(result.body).toBe("Перевозка № 000141572 плановая дата доставки 28.08.2026");
  });

  it("uses app update default template", () => {
    const result = formatPushNotificationMessage("app_update", "", {});
    expect(result.body).toBe("Вышла новая версия — обновите приложение");
  });
});

describe("defaultPushNotificationTemplates", () => {
  it("covers all push events including plan date and app update", () => {
    const rows = defaultPushNotificationTemplates();
    expect(rows.some((r) => r.eventId === "delivery_scheduled")).toBe(true);
    expect(rows.some((r) => r.eventId === "bill_created")).toBe(true);
    expect(rows.some((r) => r.eventId === "planned_delivery_date")).toBe(true);
    expect(rows.some((r) => r.eventId === "app_update")).toBe(true);
    const plan = rows.find((r) => r.eventId === "planned_delivery_date");
    expect(plan?.bodyTemplate).toContain("{plan_date}");
    const bill = rows.find((r) => r.eventId === "bill_created");
    expect(bill?.bodyTemplate).toContain("{bill_number}");
  });
});

describe("buildPushTemplateContext", () => {
  it("formats bill sum", () => {
    const ctx = buildPushTemplateContext("bill_created", "1", { SumDoc: 125000 });
    expect(ctx.bill_sum).toMatch(/125/);
  });

  it("includes bill number and last mile fields", () => {
    const ctx = buildPushTemplateContext("delivery_scheduled", "000141572", {
      BillNum: "000001529",
      LMAutoReg: "У706АР/39",
      LMAutoType: "Мерседес",
      LMDriver: "Ругалев Иван Федорович",
      LMDriverTel: "+79953889445",
    });
    expect(ctx.bill_number).toBe("1529");
    expect(ctx.auto_reg).toBe("У706АР");
    expect(ctx.auto_type).toBe("Мерседес");
    expect(ctx.driver).toBe("Ругалев Иван Федорович");
    expect(ctx.driver_tel).toBe("+79953889445");
  });

  it("includes plan_date", () => {
    const ctx = buildPushTemplateContext("planned_delivery_date", "1", {
      DateArrivalPlan: "2026-08-28",
    });
    expect(ctx.plan_date).toBe("28.08.2026");
  });
});
