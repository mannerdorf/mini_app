import { describe, expect, it } from "vitest";
import {
  enrichCargoItemForPushTemplate,
  mergeCargoItemForPushTemplate,
  shouldFetchPerevozkaLastMileForPush,
} from "./notificationCargoPayloadEnrich.js";

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
});
