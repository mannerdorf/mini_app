import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { annotateCargoPickupPhotos, cargoHasPickupPhotos } from "./cargoPhotoIndicator.js";

const cargo = { Number: "123", INN: "7701234567", ZayavkaNumber: "000018347" };
const job = { job_number: "ZB-001", data: { customerInn: "7701234567", zayavkaNumber: "18347" } };
describe("pickup photo indicator", () => {
  it("matches order numbers with leading zeros", () => {
    expect(cargoHasPickupPhotos(cargo, [job])).toBe(true);
  });
  it("matches an explicit pickup number", () => {
    expect(cargoHasPickupPhotos({ INN: cargo.INN, PickupNumber: "ZB-001" }, [job])).toBe(true);
  });
  it("matches cargo number when no order is available", () => {
    expect(cargoHasPickupPhotos({ INN: cargo.INN, Number: "00123" }, [{ ...job, data: { ...job.data, cargoNumber: "123" } }])).toBe(true);
  });
  it("does not match another customer or a missing customer", () => {
    expect(cargoHasPickupPhotos({ ...cargo, INN: "999" }, [job])).toBe(false);
    expect(cargoHasPickupPhotos({ ...cargo, INN: "" }, [job])).toBe(false);
  });
  it("rejects conflicting explicit links", () => {
    expect(cargoHasPickupPhotos({ ...cargo, PickupNumber: "ZB-002" }, [job])).toBe(false);
    expect(cargoHasPickupPhotos({ ...cargo, ZayavkaNumber: "42", PickupNumber: "ZB-001" }, [job])).toBe(false);
    expect(cargoHasPickupPhotos(cargo, [{ ...job, data: { ...job.data, cargoNumber: "456" } }])).toBe(false);
  });
  it("does not show an indicator without matching photos", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    expect(await annotateCargoPickupPhotos(pool as unknown as Pool, [{ ...cargo, pickupHasDriverPhotos: true }]))
      .toEqual([{ ...cargo, pickupHasDriverPhotos: false }]);
  });
  it("batches the query and returns only a boolean, without image data", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [job] }) };
    const result = await annotateCargoPickupPhotos(pool as unknown as Pool, [cargo, { ...cargo, ZayavkaNumber: "99" }]);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][0]).toContain("EXISTS (SELECT 1 FROM pickup_photos");
    expect(result[0]).toEqual({ ...cargo, pickupHasDriverPhotos: true });
    expect(result[1].pickupHasDriverPhotos).toBe(false);
  });
  it("keeps cargo available when the pickup database query fails", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const pool = { query: vi.fn().mockRejectedValue(new Error("unavailable")) };
      expect(await annotateCargoPickupPhotos(pool as unknown as Pool, [cargo])).toEqual([{ ...cargo, pickupHasDriverPhotos: false }]);
    } finally { warning.mockRestore(); }
  });
});
