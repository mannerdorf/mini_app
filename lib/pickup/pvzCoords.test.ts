import { describe, expect, it, vi } from "vitest";
import { resolvePickupPointCoords } from "./pvzCoords.js";

describe("resolvePickupPointCoords", () => {
  it("returns job coordinates when present", async () => {
    const pool = {} as never;
    const resolved = await resolvePickupPointCoords(pool, "moscow", {
      latitude: 55.75,
      longitude: 37.62,
      address: "Москва",
      pvzRef: "",
      addressKind: "pvz",
    });
    expect(resolved?.source).toBe("job");
    expect(resolved?.latitude).toBe(55.75);
  });

  it("uses pickup_pvz_coords registry before geocoding", async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          pvz_ref: "pvz-1",
          city: "moscow",
          latitude: "55.701",
          longitude: "37.401",
          full_address: "Подтверждённый адрес",
        },
      ],
    }));
    const pool = { query } as never;
    const resolved = await resolvePickupPointCoords(pool, "moscow", {
      latitude: null,
      longitude: null,
      address: "Только текст",
      pvzRef: "pvz-1",
      addressKind: "pvz",
    });
    expect(resolved?.source).toBe("pvz_registry");
    expect(resolved?.latitude).toBe(55.701);
    expect(query).toHaveBeenCalled();
  });
});
