import { it, expect } from "vitest";
import { readiness, normalizeCargo, terminal, amount } from "./backlog";
const stages = (names: string[]) => ({
  Statuses: names.map((Stage) => ({ Stage, Date: "2026-10-01T10:00:00" })),
});
it("recognizes real 1C warehouse stages even when the summary says in transit", () => {
  expect(
    readiness({
      ...stages([
        "ПолученаИнформация",
        "ПолученаОтЗаказчика",
        "Упакована",
        "Консолидация",
      ]),
      State: "В пути",
    }).readiness,
  ).toBe("ready");
});
it("excludes loaded and departed cargo, including real 1C compact labels", () => {
  for (const s of [
    "ОтправленаВАэропорт",
    "В пути",
    "Улетела",
    "Загружена в ТС",
    "Доставлена",
  ])
    expect(readiness(stages(["Консолидация", s])).readiness).toBe("dispatched");
});
it("does not accept information-only, undated, missing or malformed histories", () => {
  expect(readiness(stages(["ПолученаИнформация"])).readiness).toBe(
    "unreceived",
  );
  expect(
    readiness({ Statuses: [{ Stage: "Консолидация", Date: "0001-01-01" }] })
      .readiness,
  ).toBe("unknown");
  expect(readiness(null).readiness).toBe("unknown");
  expect(readiness({ Success: false }).readiness).toBe("unknown");
});
it("normalizes actual rather than billable weight and does not invent pallets", () => {
  const c = normalizeCargo(
    {
      Number: "000142978",
      INN: "1",
      Customer: "Клиент",
      W: "106,50",
      PW: 280,
      Value: "1.40",
      Mest: 10,
      DatePrih: "2026-10-07",
      CitySender: "Москва",
      CityReceiver: "Калининград",
    },
    null,
  );
  expect(c.weight).toBe(106.5);
  expect(c.route).toBe("MSK → KGD");
  expect(c.number).toBe("142978");
  expect(c.received).toBe("2026-10-07");
  expect(amount("")).toBeNull();
  expect(amount("no")).toBeNull();
});
it("excludes delivered records even with an outdated summary", () => {
  expect(terminal({ State: "В пути", DateVr: "2026-10-01" })).toBe(true);
  expect(terminal({ State: "Готово к выдаче" })).toBe(true);
  expect(terminal({ State: "В пути", DateVr: "0001-01-01" })).toBe(false);
});
