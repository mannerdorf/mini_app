import { describe, expect, it } from "vitest";
import {
  dgisRouteCheckWarnings,
  isDgisRouteCheckWarning,
} from "./pickupRouteCheckDgis";

describe("isDgisRouteCheckWarning", () => {
  it("filters business warnings", () => {
    expect(isDgisRouteCheckWarning("Ошибка сервиса 2ГИС. Расчёт недоступен.")).toBe(
      true,
    );
    expect(isDgisRouteCheckWarning("Превышен объём автомобиля.")).toBe(false);
    expect(
      isDgisRouteCheckWarning(
        "Подтвердите, что окна забора учитывают часы работы",
      ),
    ).toBe(false);
  });
});

describe("dgisRouteCheckWarnings", () => {
  it("keeps only 2gis lines", () => {
    expect(
      dgisRouteCheckWarnings([
        "Превышен объём автомобиля.",
        "Ошибка сервиса 2ГИС. x",
      ]),
    ).toEqual(["Ошибка сервиса 2ГИС. x"]);
  });
});
