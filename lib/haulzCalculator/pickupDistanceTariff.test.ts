import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import XLSX from "xlsx";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { calcPickupCityFee } from "./pickupTariff.js";
import { parsePickupMatrixRows } from "./pickupXlsxParser.js";
import { getActiveVersion } from "./tariffStore.js";
import * as tariffStore from "./tariffStore.js";
import * as ringDistance from "./mkadDistance.js";
import { buildQuote } from "./quoteEngine.js";
import type { PickupMatrixPayload } from "./types.js";

const csv = readFileSync("data/haulz-calculator-seed/pickup-2026-09-29.csv", "utf8");
const workbook = XLSX.read(csv, { type: "string", raw: true });
const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "" });
const parsed = parsePickupMatrixRows(matrix)!;
const moscow = { tiers: parsed.moscow };
const kgd = { tiers: parsed.kaliningrad };

afterEach(() => vi.restoreAllMocks());

describe("tariffs from the 29 September sheet", () => {
  it("imports all bands, both cities, and loading rows without shifting", () => {
    expect(parsed.moscow).toHaveLength(12);
    expect(parsed.kaliningrad).toHaveLength(12);
    expect(parsed.moscow[0]).toMatchObject({ city_fee: 1350, load_minutes: 30, overtime_rub_per_hour: 700 });
    expect(parsed.moscow[11].distance_rates?.map(x => x.per_km)).toEqual([70,91,118,153,230]);
    expect(parsed.kaliningrad[3]).toMatchObject({ city_fee: 2200, per_km: 28, load_minutes: 45 });
    expect(parsed.kaliningrad[3].distance_rates).toBeUndefined();
  });

  it.each([[0,0],[10,230],[10.5,244.5],[15,375],[20,520],[21,558],[30,900],[31,950],[40,1400],[41,1475],[50,2150]])(
    "adds progressive Moscow distance charge for %s km", (km, surcharge) => {
      const fee = calcPickupCityFee(moscow, 100, 0.5, km);
      expect(fee.perKmFee).toBeCloseTo(surcharge);
      expect(fee.total).toBeCloseTo(1350 + surcharge);
    },
  );

  it("uses the selected capacity tier and keeps Kaliningrad linear", () => {
    expect(calcPickupCityFee(moscow, 50, 1.5, 15).total).toBe(2300 + 240 + 155);
    expect(calcPickupCityFee(kgd, 100, 0.5, 15).total).toBe(1130);
    expect(calcPickupCityFee(kgd, 1250, 6, 50).total).toBe(3600);
  });

  it("rejects incomplete or invalid bands instead of undercharging", () => {
    const tier = { ...parsed.moscow[0], distance_rates: [{ max_km: 10, per_km: 23 }] };
    expect(() => calcPickupCityFee({ tiers: [tier] }, 100, 0.5, 15)).toThrow();
    tier.distance_rates[0].per_km = -1;
    expect(() => calcPickupCityFee({ tiers: [tier] }, 100, 0.5, 5)).toThrow();
  });

  it.each([false, true])("uses the correct address for each ring (reverse=%s)", async (reverse) => {
    const cities = { moscow, kaliningrad: kgd };
    vi.spyOn(tariffStore, "loadCalculatorTariffs").mockResolvedValue({
      asOfDate: "2026-09-29", pickup: { scope: "pickup", cities }, lastMile: { scope: "last_mile", cities },
      settings: undefined, extras: { services: [] }, rigidPackaging: null, boxes: null, mainline: [], sets: [], byCode: {},
    });
    const distance = vi.spyOn(ringDistance, "kmBeyondRing").mockImplementation(async (_pool, city) => ({ km: city === "moscow" ? 15 : 20, osrmKm: null, dgisKm: null }));
    const moscowAddress = { label: "Москва", fullAddress: "Москва", city: "moscow" as const, point: { lat: 55.8, lon: 37.9 } };
    const kgdAddress = { label: "Калининград", fullAddress: "Калининград", city: "kaliningrad" as const, point: { lat: 54.8, lon: 20.7 } };
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as Pool;
    const quote = await buildQuote(pool, {
      from: reverse ? kgdAddress : moscowAddress, to: reverse ? moscowAddress : kgdAddress,
      mainlineMode: "auto", places: [{ weightKg: 100, volumeM3: 0.5 }], kmOverride: { moscow: 15, kaliningrad: 20 },
    });
    expect(distance).toHaveBeenCalledWith(pool, "moscow", moscowAddress.point, 15, "max");
    expect(distance).toHaveBeenCalledWith(pool, "kaliningrad", kgdAddress.point, 20, "max");
    expect(quote.lines.find(line => line.key === "pickup")?.amountRub).toBe(reverse ? 1240 : 1725);
    expect(quote.lines.find(line => line.key === "last_mile")?.amountRub).toBe(reverse ? 1725 : 1240);
  });

  it("adds dated versions for both legs, preserves history, and is idempotent", async () => {
    const db = new PGlite();
    try {
      await db.exec(readFileSync("migrations/083_haulz_calculator.sql", "utf8"));
      await db.exec("INSERT INTO haulz_calc_tariff_sets(code,name,block) VALUES('pickup_matrix','Pickup','pickup'); INSERT INTO haulz_calc_tariff_versions(tariff_set_id,effective_from,payload) VALUES(1,'2020-01-01','{}');");
      const migration = readFileSync("migrations/121_calculator_distance_tariffs_20260929.sql", "utf8");
      await db.exec(migration);
      await db.exec(migration);
      expect((await db.query("SELECT * FROM haulz_calc_tariff_versions")).rows).toHaveLength(3);
      const pool = { query: (sql: string, params: unknown[]) => db.query(sql, params) } as unknown as Pool;
      expect((await getActiveVersion(pool, 1, "2026-09-28"))?.payload).toEqual({});
      const version = await getActiveVersion(pool, 1, "2026-09-29");
      expect((version?.payload as PickupMatrixPayload).cities.moscow.tiers).toEqual(parsed.moscow);
      expect((version?.payload as PickupMatrixPayload).cities.kaliningrad.tiers).toEqual(parsed.kaliningrad);
      const versions = await db.query<{payload: PickupMatrixPayload}>("SELECT payload FROM haulz_calc_tariff_versions WHERE effective_from='2026-09-29'");
      expect(versions.rows.map(x => x.payload.scope).sort()).toEqual(['last_mile','pickup']);
      for (const row of versions.rows) expect(calcPickupCityFee(row.payload.cities.moscow, 100, 0.5, 15).total).toBe(1725);
    } finally { await db.close(); }
  });
});
