import { describe, expect, it } from "vitest";
import {
  createDefaultPickupSiteInstructions,
  formatPickupSiteInstructions,
  parsePickupSiteInstructions,
  pickupSiteInstructionsDisplay,
} from "./jobSiteInstructions";

describe("jobSiteInstructions", () => {
  it("round-trips checklist order, toggles and note", () => {
    const state = createDefaultPickupSiteInstructions();
    state.order = ["call", "entry", "pass", "poa"];
    state.items = state.items.map((i) => ({
      ...i,
      enabled: i.id === "entry" || i.id === "call",
    }));
    state.note = "Въезд с торца";
    const raw = formatPickupSiteInstructions(state);
    const parsed = parsePickupSiteInstructions(raw);
    expect(parsed.order).toEqual(state.order);
    expect(parsed.items.find((i) => i.id === "entry")?.enabled).toBe(true);
    expect(parsed.items.find((i) => i.id === "pass")?.enabled).toBe(false);
    expect(parsed.note).toBe("Въезд с торца");
    expect(pickupSiteInstructionsDisplay(raw)).toContain("Въезд с торца");
    expect(pickupSiteInstructionsDisplay(raw)).not.toContain("#pk-inst:");
  });

  it("legacy plain text becomes note only", () => {
    const parsed = parsePickupSiteInstructions("Старый комментарий");
    expect(parsed.note).toBe("Старый комментарий");
    expect(parsed.items.every((i) => !i.enabled)).toBe(true);
  });
});
