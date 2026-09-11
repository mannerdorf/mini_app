import { describe, expect, it } from "vitest";
import { parseChannels } from "./channels";

describe("parseChannels", () => {
  it("filters unknown channels", () => {
    expect(parseChannels(["site", "telegram", "invalid"])).toEqual(["site", "telegram"]);
  });

  it("returns empty for non-array", () => {
    expect(parseChannels(null)).toEqual([]);
  });
});
