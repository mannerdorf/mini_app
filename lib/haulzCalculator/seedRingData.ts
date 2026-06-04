import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { KAD_RING_EXITS } from "./kadRingExits.js";
import { ringFromExits } from "./mkadDistance.js";
import { parseMkadExitsFromMoxcel, parseMoxcelCells } from "./moxcelParser.js";
import type { CityCode } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.resolve(__dirname, "../../data/haulz-calculator-seed");

export type RingExitInput = { code: string; name: string; lat: number; lon: number };

export async function seedRingCity(pool: Pool, cityCode: CityCode, exits: RingExitInput[]): Promise<number> {
  await pool.query(`delete from haulz_calc_ring_exits where city_code = $1`, [cityCode]);
  let order = 0;
  for (const e of exits) {
    await pool.query(
      `insert into haulz_calc_ring_exits (city_code, code, name, lat, lon, active, sort_order)
       values ($1, $2, $3, $4, $5, true, $6)`,
      [cityCode, e.code, e.name, e.lat, e.lon, order++],
    );
  }
  const { rows } = await pool.query<{
    id: number;
    city_code: CityCode;
    code: string | null;
    name: string;
    lat: number;
    lon: number;
    active: boolean;
    sort_order: number;
  }>(
    `select id, city_code, code, name, lat::float8 as lat, lon::float8 as lon, active, sort_order
     from haulz_calc_ring_exits where city_code = $1 and active order by sort_order`,
    [cityCode],
  );
  const ring = ringFromExits(rows);
  await pool.query(`delete from haulz_calc_ring_polygon where city_code = $1`, [cityCode]);
  for (let i = 0; i < ring.length; i++) {
    await pool.query(
      `insert into haulz_calc_ring_polygon (city_code, seq, lat, lon) values ($1, $2, $3, $4)`,
      [cityCode, i, ring[i].lat, ring[i].lon],
    );
  }
  return exits.length;
}

function findSeedFile(names: string[]): string | null {
  if (!fs.existsSync(SEED_DIR)) return null;
  for (const name of names) {
    const p = path.join(SEED_DIR, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** МКАД из data/haulz-calculator-seed/Список.MXL (47 съездов). */
export async function seedMkadFromRepo(pool: Pool): Promise<number> {
  const mxlPath = findSeedFile(["Список.MXL", "spisok.mxl", "mkad.mxl"]);
  if (!mxlPath) {
    throw new Error("Файл Список.MXL не найден в data/haulz-calculator-seed/");
  }
  const cells = parseMoxcelCells(fs.readFileSync(mxlPath, "utf8"));
  const exits = parseMkadExitsFromMoxcel(cells);
  if (exits.length === 0) {
    throw new Error("Не удалось разобрать съезды МКАД из MXL");
  }
  return seedRingCity(pool, "moscow", exits);
}

/** КАД — встроенный справочник пересечений (20 точек). */
export async function seedKadFromDefaults(pool: Pool): Promise<number> {
  return seedRingCity(pool, "kaliningrad", KAD_RING_EXITS);
}

export async function seedAllRingDefaults(pool: Pool): Promise<{ moscow: number; kaliningrad: number }> {
  const moscow = await seedMkadFromRepo(pool);
  const kaliningrad = await seedKadFromDefaults(pool);
  return { moscow, kaliningrad };
}
