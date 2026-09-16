/**
 * Демо-данные заборной логистики: 3 водителя, 3 авто, 10 заборов, 3 маршрута (Москва).
 *
 * Usage:
 *   set -a && source /opt/haulz/.env && set +a
 *   npx tsx scripts/seed-pickup-demo.ts
 *
 * Env:
 *   PICKUP_SEED_DATE — дата заборов (YYYY-MM-DD), по умолчанию 2026-09-15
 *   PICKUP_SEED_CITY — moscow | kaliningrad, по умолчанию moscow
 */
import { randomUUID } from "node:crypto";
import { getPool } from "../api/_db.js";
import { hashPassword } from "../lib/passwordUtils.js";
import { ensureHaulzDepot } from "../lib/pickup/haulzDepot.js";
import { warehouseForCity } from "../lib/haulzCalculator/warehouses.js";
import type { City } from "../lib/pickup/model.js";
import { pgTableExists } from "../api/_haulzReturns.js";

const DEMO = "pickup-demo-v1";
const DEMO_PASSWORD = "PickupDemo2026!";
const CUSTOMER_INN = "7700000100";
const SUPPLIER_INN = "7700000200";

const DRIVERS = [
  { login: "pickup.demo.driver1@haulz.space", name: "Тест · Иванов И.И." },
  { login: "pickup.demo.driver2@haulz.space", name: "Тест · Петров П.П." },
  { login: "pickup.demo.driver3@haulz.space", name: "Тест · Сидоров С.С." },
];

const VEHICLES = [
  { name: "Тест · ГАЗель 1", plate: "А111АА799", model: "ГАЗель Next" },
  { name: "Тест · Sprinter", plate: "В222ВВ799", model: "Mercedes Sprinter" },
  { name: "Тест · Transit", plate: "С333СС799", model: "Ford Transit" },
];

function jobPayload(i: number, city: City) {
  const wh = warehouseForCity(city);
  return {
    demoSeed: DEMO,
    customerInn: CUSTOMER_INN,
    customerName: "Тест · Заказчик HAULZ",
    senderInn: SUPPLIER_INN,
    senderName: "Тест · Поставщик демо",
    address: `Москва, тестовая точка забора №${i}`,
    instructions: "",
    directionsUrl: "",
    contacts: [
      {
        name: "Контакт на точке",
        phone: "+7999000000" + String(i).padStart(2, "0").slice(-2),
        extension: "",
        purpose: "Звонки",
      },
    ],
    documents: [],
    places: [{ kind: "Короб", count: 1, lengthCm: 40, widthCm: 30, heightCm: 30 }],
    weightKg: 50 + i * 10,
    volumeM3: 0.5 + i * 0.05,
    windowFrom: "10:00",
    windowTo: "17:00",
    warehouseHours: "Пн–Пт 9:00–18:00",
    serviceMinutes: 20,
    zayavkaNumber: `ТЗ-${1000 + i}`,
    cargoNumber: "",
    priceRub: 3000 + i * 200,
    payment: "Тест",
    mkadKm: null,
    requirements: "",
    note: "Автосид «pickup-demo-v1»",
    latitude: null,
    longitude: null,
    deliveryMode: "courier",
    addressKind: "custom",
    pvzRef: "",
    defaultPlaceAddress: wh.fullAddress,
    defaultPlaceLatitude: wh.point.lat,
    defaultPlaceLongitude: wh.point.lon,
    defaultPlaceMode: "point",
    defaultPlaceKind: "pvz",
    defaultPlacePvzRef: "",
    scheduleMode: "once",
    schedulePattern: "",
    scheduleGroupId: "",
    scheduleWeekdays: "",
    scheduleUntil: "",
    scheduleDates: "",
  };
}

async function upsertDemoUsers(client: Awaited<ReturnType<Awaited<ReturnType<typeof getPool>>["connect"]>>) {
  const hash = hashPassword(DEMO_PASSWORD);
  for (const d of DRIVERS) {
    await client.query(
      `INSERT INTO registered_users (login, password_hash, inn, company_name, permissions, active)
       VALUES ($1, $2, $3, $4, $5::jsonb, true)
       ON CONFLICT (login) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         permissions = registered_users.permissions || '{"driver": true}'::jsonb,
         active = true,
         updated_at = now()`,
      [
        d.login.toLowerCase(),
        hash,
        CUSTOMER_INN,
        "HAULZ Pickup Demo",
        JSON.stringify({ driver: true, cargo: false, chat: false }),
      ],
    );
  }
}

async function main() {
  const city = (process.env.PICKUP_SEED_CITY === "kaliningrad"
    ? "kaliningrad"
    : "moscow") as City;
  const date =
    process.env.PICKUP_SEED_DATE?.trim() ||
    new Intl.DateTimeFormat("en-CA", {
      timeZone: city === "moscow" ? "Europe/Moscow" : "Europe/Kaliningrad",
    }).format(new Date());

  const pool = await getPool();
  if (!(await pgTableExists(pool, "pickup_jobs"))) {
    console.error("Таблица pickup_jobs не найдена. Примените migrations/104_pickup_dispatch.sql");
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO cache_customers (inn, customer_name) VALUES ($1, $2)
       ON CONFLICT (inn) DO UPDATE SET customer_name = EXCLUDED.customer_name`,
      [CUSTOMER_INN, "Тест · Заказчик HAULZ"],
    );
    await client.query(
      `INSERT INTO cache_suppliers (inn, supplier_name) VALUES ($1, $2)
       ON CONFLICT (inn) DO UPDATE SET supplier_name = EXCLUDED.supplier_name`,
      [SUPPLIER_INN, "Тест · Поставщик демо"],
    );

    await upsertDemoUsers(client);

    await client.query(
      `DELETE FROM pickup_jobs WHERE data->>'demoSeed' = $1 AND city = $2`,
      [DEMO, city],
    );
    await client.query(
      `DELETE FROM pickup_routes WHERE name LIKE 'Тест · Маршрут %' AND city = $1 AND date = $2::date`,
      [city, date],
    );
    await client.query(
      `DELETE FROM pickup_resources WHERE data->>'demoSeed' = $1 AND city = $2`,
      [DEMO, city],
    );

    const depotId = await ensureHaulzDepot(client, city);

    const driverIds: string[] = [];
    for (const d of DRIVERS) {
      const id = randomUUID();
      await client.query(
        `INSERT INTO pickup_resources (id, kind, city, name, active, data)
         VALUES ($1, 'driver', $2, $3, true, $4::jsonb)`,
        [
          id,
          city,
          d.name,
          JSON.stringify({
            demoSeed: DEMO,
            login: d.login.toLowerCase(),
            phone: "+79991234567",
            type: "own",
            from: "08:00",
            to: "20:00",
          }),
        ],
      );
      driverIds.push(id);
    }

    const vehicleIds: string[] = [];
    for (const v of VEHICLES) {
      const id = randomUUID();
      await client.query(
        `INSERT INTO pickup_resources (id, kind, city, name, active, data)
         VALUES ($1, 'vehicle', $2, $3, true, $4::jsonb)`,
        [
          id,
          city,
          v.name,
          JSON.stringify({
            demoSeed: DEMO,
            plate: v.plate,
            model: v.model,
            bodyType: "Фургон",
            capacityKg: "2000",
            capacityM3: "12",
            lift: "Нет",
            type: "own",
            from: "08:00",
            to: "20:00",
          }),
        ],
      );
      vehicleIds.push(id);
    }

    const jobIds: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const id = randomUUID();
      const data = jobPayload(i, city);
      const jobNumber = (
        await client.query<{ job_number: string }>(
          `SELECT 'ZB-' || lpad(nextval('pickup_job_number_seq')::text, 6, '0') AS job_number`,
        )
      ).rows[0].job_number;
      await client.query(
        `INSERT INTO pickup_jobs (id, city, date, data, zayavka_number, customer_inn, sender_inn, job_number)
         VALUES ($1, $2, $3::date, $4::jsonb, $5, $6, $7, $8)`,
        [
          id,
          city,
          date,
          JSON.stringify(data),
          data.zayavkaNumber,
          CUSTOMER_INN,
          SUPPLIER_INN,
          jobNumber,
        ],
      );
      jobIds.push(id);
    }

    const routeNames = ["Тест · Маршрут 1", "Тест · Маршрут 2", "Тест · Маршрут 3"];
    const splits = [
      jobIds.slice(0, 4),
      jobIds.slice(4, 7),
      jobIds.slice(7, 10),
    ];
    const startTimes = ["08:30", "09:00", "09:30"];

    for (let r = 0; r < 3; r++) {
      const routeId = randomUUID();
      const driverId = driverIds[r]!;
      const vehicleId = vehicleIds[r]!;
      const { rows: driverRow } = await client.query(
        "SELECT * FROM pickup_resources WHERE id = $1",
        [driverId],
      );
      const { rows: vehicleRow } = await client.query(
        "SELECT * FROM pickup_resources WHERE id = $1",
        [vehicleId],
      );
      const { rows: depotRow } = await client.query(
        "SELECT * FROM pickup_resources WHERE id = $1",
        [depotId],
      );
      const snapshot = {
        driver: driverRow[0],
        vehicle: vehicleRow[0],
        depot: depotRow[0],
      };
      await client.query(
        `INSERT INTO pickup_routes (id, city, date, name, driver_id, vehicle_id, depot_id, start_time, status, snapshot)
         VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, 'draft', $9::jsonb)`,
        [
          routeId,
          city,
          date,
          routeNames[r],
          driverId,
          vehicleId,
          depotId,
          startTimes[r],
          JSON.stringify(snapshot),
        ],
      );
      for (let p = 0; p < splits[r]!.length; p++) {
        await client.query(
          `UPDATE pickup_jobs SET route_id = $2, position = $3, version = version + 1 WHERE id = $1`,
          [splits[r]![p], routeId, p + 1],
        );
      }
    }

    await client.query("COMMIT");

    console.log("\n=== Pickup demo seed OK ===");
    console.log(`Город: ${city}, дата: ${date}`);
    console.log("Заборов: 10 · Маршрутов: 3 (черновик) · Водителей: 3 · Авто: 3");
    console.log("\nВодители (вход в приложение, бейдж «Водитель»):");
    for (const d of DRIVERS) {
      console.log(`  ${d.login} / ${DEMO_PASSWORD}`);
    }
    console.log(
      "\nДиспетчеризация: выберите город и дату, опубликуйте маршруты при необходимости.",
    );
    console.log(`Повторный запуск пересоздаёт только записи с меткой ${DEMO}.\n`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
