import { describe, expect, it } from "vitest";
import { cityToCode, formatCargoRoute } from "./cityToCode.js";

describe("cityToCode", () => {
  it("maps Sofinskoe terminal to MSK", () => {
    expect(cityToCode("Софьинское с.п")).toBe("MSK");
    expect(cityToCode("Софьино")).toBe("MSK");
  });

  it("keeps KGD and MSK codes", () => {
    expect(cityToCode("Калининград")).toBe("KGD");
    expect(cityToCode("Москва")).toBe("MSK");
  });
});

describe("formatCargoRoute", () => {
  it("formats Sofinskoe to KGD as MSK – KGD", () => {
    expect(formatCargoRoute("Софьинское с.п", "Калининград")).toBe("MSK – KGD");
  });
});
