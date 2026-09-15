import { describe, expect, it } from "vitest";
import { isPresetCancelReason } from "./cancelReasonPresets";

describe("cancelReasonPresets", () => {
  it("recognizes preset values", () => {
    expect(isPresetCancelReason("Ошибочно создан")).toBe(true);
    expect(isPresetCancelReason("ошибочно")).toBe(false);
  });
});
