import { describe, expect, it } from "vitest";
import { legRequiresPvzCreation } from "./orderAddressKind.js";

describe("legRequiresPvzCreation", () => {
  it("flags courier custom addresses", () => {
    expect(legRequiresPvzCreation("courier", "custom")).toBe(true);
  });

  it("does not flag PVZ or warehouse legs", () => {
    expect(legRequiresPvzCreation("courier", "pvz")).toBe(false);
    expect(legRequiresPvzCreation("courier", "warehouse")).toBe(false);
    expect(legRequiresPvzCreation("point", "custom")).toBe(false);
    expect(legRequiresPvzCreation("point", "warehouse")).toBe(false);
  });
});
