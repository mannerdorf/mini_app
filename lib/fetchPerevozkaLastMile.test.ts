import { describe, expect, it } from "vitest";
import { flattenPerevozkaPayload } from "./fetchPerevozkaLastMile.js";
import { extractCargoLastMileMeta } from "./cargoLastMileMeta.js";

describe("flattenPerevozkaPayload", () => {
  it("ignores timeline-only GetPerevozka wrapper", () => {
    expect(
      flattenPerevozkaPayload({
        Success: true,
        items: [
          { Stage: "Получена информация", Date: "2026-08-01" },
          { Stage: "Поставлена на доставку", Date: "2026-08-20" },
        ],
      }),
    ).toBeNull();
  });

  it("finds Driver/AutoReg beside a status timeline", () => {
    const flat = flattenPerevozkaPayload({
      Success: true,
      items: [
        { Stage: "Получена информация", Date: "2026-08-01" },
        { Stage: "Поставлена на доставку", Date: "2026-08-20" },
      ],
      Driver: "Ругалев Иван Федорович",
      DriverTel: "+79953889445",
      AutoReg: "У706АР/39",
      AutoType: "Мерседес",
    });
    expect(flat).not.toBeNull();
    const meta = extractCargoLastMileMeta(flat);
    expect(meta.driver).toBe("Ругалев Иван Федорович");
    expect(meta.autoReg).toBe("У706АР");
    expect(meta.autoType).toBe("Мерседес");
    expect(meta.driverTel).toBe("+79953889445");
  });

  it("unwraps Items cargo card with last mile", () => {
    const flat = flattenPerevozkaPayload({
      Items: [
        {
          Number: "000141572",
          LMDriver: "Петров",
          LMAutoReg: "X123XX/77",
          LMAutoType: "Ford",
          LMDriverTel: "+79991112233",
        },
      ],
    });
    expect(extractCargoLastMileMeta(flat).driver).toBe("Петров");
    expect(extractCargoLastMileMeta(flat).autoReg).toBe("X123XX");
  });
});
