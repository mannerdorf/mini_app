import { describe, expect, it } from "vitest";
import { buildRouteIndex } from "./routes.js";

describe("buildRouteIndex", () => {
  it("registers admin pickup dispatch API", () => {
    const index = buildRouteIndex();
    expect(index.static.has("/api/admin-pickup-dispatch")).toBe(true);
  });
});
