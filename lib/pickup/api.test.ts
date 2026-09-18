import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { hashPassword } from "../passwordUtils";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("../../api/_db.js", () => ({
  getPool: () => ({
    connect: async () => ({
      query: (sql: string, params?: any[]) => state.db.query(sql, params),
      release: () => {},
    }),
  }),
}));
vi.mock("../rateLimit.js", () => ({
  getClientIp: () => "test",
  isRateLimited: () => false,
  ADMIN_API_LIMIT: {},
}));
vi.mock("./checkRoute.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./checkRoute.js")>();
  return {
    ...actual,
    checkRoute: vi.fn(async (input) => ({
      status: "gray",
      warnings: [],
      signature: actual.checkSignature(input),
      routeVersion: input.route.version,
      checkedAt: new Date().toISOString(),
    })),
  };
});
import handler from "../../api/pickup/index";
const password = "pickup-test-password";
const photo = `data:image/jpeg;base64,${Buffer.from([255, 216, 255, 224, 0, 2, 255, 217]).toString("base64")}`;
async function request(login: string, body: any) {
  const result = { status: 200, body: null as any };
  const res: any = {
    setHeader: () => {},
    status: (s: number) => {
      result.status = s;
      return res;
    },
    json: (b: any) => {
      result.body = b;
      return res;
    },
    end: () => {},
  };
  await handler(
    {
      method: "POST",
      headers: {},
      body: { login, password, requestId: randomUUID(), ...body },
    } as any,
    res,
  );
  return result;
}
async function ok(login: string, body: any) {
  const r = await request(login, body);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body;
}
const snapshot = (login = "dispatch") =>
  ok(login, { action: "snapshot", city: "moscow", date: "2026-09-15" });
const data = () => ({
  customerInn: "100",
  senderInn: "200",
  zayavkaNumber: "ЗАЯВКА-001",
  address: "Москва, тестовый склад",
  windowFrom: "10:00",
  windowTo: "16:00",
  contacts: [{ name: "Контакт", phone: "+79990000000" }],
  places: [{ count: 2 }],
  weightKg: 70,
  volumeM3: 1,
  priceRub: 5000,
  payment: "Оплачено",
});
async function setup() {
  const driver = await ok("dispatch", {
    action: "save_resource",
    kind: "driver",
    city: "moscow",
    name: "Водитель 1",
    data: {
      login: "driver",
      phone: "+79990000001",
      from: "08:00",
      to: "20:00",
    },
  });
  const vehicle = await ok("dispatch", {
    action: "save_resource",
    kind: "vehicle",
    city: "moscow",
    name: "Фургон",
    data: {
      plate: "А001АА",
      capacityKg: "1000",
      capacityM3: "10",
      from: "08:00",
      to: "20:00",
    },
  });
  const depot = await ok("dispatch", {
    action: "save_resource",
    kind: "depot",
    city: "moscow",
    name: "Склад Холз",
    data: { address: "Москва, склад Холз", from: "08:00", to: "20:00" },
  });
  const route = await ok("dispatch", {
    action: "save_route",
    city: "moscow",
    date: "2026-09-15",
    name: "Маршрут 1",
    driver_id: driver.id,
    vehicle_id: vehicle.id,
    depot_id: depot.id,
    start_time: "09:00",
  });
  const job = await ok("dispatch", {
    action: "save_job",
    city: "moscow",
    date: "2026-09-15",
    data: data(),
  });
  await ok("dispatch", {
    action: "assign",
    id: job.id,
    version: 1,
    route_id: route.id,
  });
  return { driver, vehicle, depot, route, job };
}
async function publishAndStart() {
  let s = await snapshot();
  await ok("dispatch", {
    action: "publish",
    id: s.routes[0].id,
    version: s.routes[0].version,
  });
  s = await snapshot("driver");
  await ok("driver", {
    action: "start",
    id: s.routes[0].id,
    version: s.routes[0].version,
  });
  return snapshot();
}
beforeAll(async () => {
  state.db = new PGlite();
  await state.db
    .exec(`CREATE TABLE registered_users(id serial PRIMARY KEY,login text,password_hash text,active boolean,permissions jsonb);
    CREATE TABLE cache_customers(inn text PRIMARY KEY,customer_name text);
    CREATE TABLE cache_suppliers(inn text PRIMARY KEY,supplier_name text);`);
  await state.db.exec(
    readFileSync(
      new URL("../../migrations/104_pickup_dispatch.sql", import.meta.url),
      "utf8",
    ),
  );
  for (const file of [
    "105_pickup_jobs_search_columns.sql",
    "106_pickup_job_cancelled.sql",
    "107_pickup_supplier_contacts.sql",
    "108_pickup_driver_locations.sql",
    "109_pickup_gps_quality.sql",
    "110_pickup_job_number.sql",
    "114_pickup_1c_integration.sql",
  ]) {
    await state.db.exec(
      readFileSync(
        new URL("../../migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  }
  // Verify migration is safe to re-apply.
  await state.db.exec(
    readFileSync(
      new URL("../../migrations/104_pickup_dispatch.sql", import.meta.url),
      "utf8",
    ),
  );
  await state.db.exec(
    "INSERT INTO cache_customers VALUES('100','Заказчик'); INSERT INTO cache_suppliers VALUES('200','Отправитель');",
  );
}, 30000);
afterAll(async () => {
  await state.db?.close();
});
beforeEach(async () => {
  await state.db.exec(
    "TRUNCATE pickup_receipts,pickup_events,pickup_photos,pickup_jobs,pickup_routes,pickup_resources,pickup_supplier_contacts,registered_users CASCADE",
  );
  for (const [login, permissions] of [
    ["dispatch", { dispatcher: true }],
    ["driver", { driver: true }],
    ["other", { driver: true }],
    ["client", {}],
  ] as const)
    await state.db.query(
      "INSERT INTO registered_users(login,password_hash,active,permissions) VALUES($1,$2,true,$3)",
      [login, hashPassword(password), JSON.stringify(permissions)],
    );
});
describe("pickup API with PostgreSQL (PGlite)", () => {
  it("lets only the assigned driver flag GPS and records the report", async () => {
    await setup();
    const started = await publishAndStart();
    const id = started.routes[0].id;
    await ok("driver", { action: "location", id, latitude: 55.75, longitude: 37.62, accuracy: 5, measured_at: new Date().toISOString() });
    expect((await request("other", { action: "location_unreliable", id })).status).toBe(403);
    await ok("driver", { action: "location_unreliable", id });
    const result = await snapshot();
    expect(result.locations[0].warning).toContain("Водитель сообщил");
    expect(result.events.some((e: any) => e.action === "Водитель сообщил о неверной позиции GPS")).toBe(true);
  });
  it("returns only the current driver's directory card even without a visible route", async () => {
    await setup();
    const own = await snapshot("driver");
    expect(own.routes).toHaveLength(0);
    expect(own.driverProfile).toMatchObject({ name: "Водитель 1", phone: "+79990000001", city: "moscow" });
    expect(own.driverProfile).not.toHaveProperty("data");
    expect((await snapshot("other")).driverProfile).toBeNull();
    const otherDay = await ok("driver", { action: "snapshot", city: "kaliningrad", date: "2026-09-20" });
    expect(otherDay.driverProfile).toEqual(own.driverProfile);
    expect(Number.isFinite(Date.parse(otherDay.syncedAt))).toBe(true);
  });
  it("lets service-mode driver browse all routes when requested", async () => {
    await setup();
    await publishAndStart();
    expect((await snapshot("driver")).routes).toHaveLength(1);
    expect((await snapshot("other")).routes).toHaveLength(0);
    await state.db.query(
      `UPDATE registered_users SET permissions = permissions || '{"service_mode":true}'::jsonb WHERE login='other'`,
    );
    const browse = await ok("other", {
      action: "snapshot",
      city: "moscow",
      date: "2026-09-15",
      serviceBrowse: true,
    });
    expect(browse.routes).toHaveLength(1);
    expect(browse.serviceBrowse).toBe(true);
  });
  it("isolates driver data, drafts and server permissions", async () => {
    const ids = await setup();
    expect((await snapshot("driver")).jobs).toHaveLength(0);
    await publishAndStart();
    const s = await snapshot("driver");
    expect(s.jobs).toHaveLength(1);
    expect(s.jobs[0].data.customerName).toBe("Заказчик");
    expect(s.jobs[0].data).not.toHaveProperty("priceRub");
    expect(s.jobs[0].data).not.toHaveProperty("payment");
    expect((await snapshot("other")).jobs).toHaveLength(0);
    expect(
      (
        await request("client", {
          action: "snapshot",
          city: "moscow",
          date: "2026-09-15",
        })
      ).status,
    ).toBe(403);
    expect(
      (await request("other", { action: "photos", id: ids.job.id })).status,
    ).toBe(403);
    expect(
      (
        await request("other", {
          action: "complete",
          id: ids.job.id,
          version: 2,
          actual_places: 2,
          photos: [photo],
        })
      ).status,
    ).toBe(403);
    expect(
      (await request("driver", { action: "directory", kind: "customer" }))
        .status,
    ).toBe(403);
    expect(
      (
        await request("driver", {
          action: "save_job",
          city: "moscow",
          date: "2026-09-15",
          data: data(),
        })
      ).status,
    ).toBe(403);
    await state.db.query(
      "UPDATE registered_users SET permissions='{}' WHERE login='driver'",
    );
    expect(
      (
        await request("driver", {
          action: "snapshot",
          city: "moscow",
          date: "2026-09-15",
        })
      ).status,
    ).toBe(403);
  });
  it("assigns unique job_number when creating a pickup job", async () => {
    const { job } = await setup();
    const snap = await snapshot();
    const row = snap.jobs.find((j: any) => j.id === job.id);
    expect(row?.job_number).toMatch(/^ZB-\d{6}$/);
  });
  it("requires photo and actual count, saves proof and handles repeated delivery once", async () => {
    await setup();
    const s = await publishAndStart(),
      j = s.jobs[0];
    expect(
      (
        await request("driver", {
          action: "complete",
          id: j.id,
          version: j.version,
          actual_places: 2,
          photos: [],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("driver", {
          action: "complete",
          id: j.id,
          version: j.version,
          actual_places: 0,
          photos: [photo],
        })
      ).status,
    ).toBe(400);
    const command = {
      action: "complete",
      id: j.id,
      version: j.version,
      actual_places: 2,
      photos: [photo],
      requestId: randomUUID(),
    };
    await ok("driver", command);
    await ok("driver", command);
    const proofs = await ok("driver", { action: "photos", id: j.id });
    expect(proofs.photos).toHaveLength(1);
    const after = await snapshot();
    expect(after.jobs[0].status).toBe("picked_up");
    expect(after.jobs[0].actual_places).toBe(2);
    await ok("driver", {
      action: "deposit",
      id: after.routes[0].id,
      version: after.routes[0].version,
    });
    const final = await snapshot();
    expect(final.routes[0].status).toBe("completed");
    expect(final.jobs[0].status).toBe("deposited");
  });
  it("lets driver deposit after partial pickup without dispatcher resolution", async () => {
    await setup();
    let s = await publishAndStart(),
      j = s.jobs[0];
    expect(
      (
        await request("driver", {
          action: "complete",
          id: j.id,
          version: j.version,
          actual_places: 1,
          photos: [photo],
        })
      ).status,
    ).toBe(400);
    await ok("driver", {
      action: "complete",
      id: j.id,
      version: j.version,
      actual_places: 1,
      note: "Второе место не готово",
      photos: [photo],
    });
    s = await snapshot();
    expect(s.jobs[0].status).toBe("partial");
    await ok("driver", {
      action: "deposit",
      id: s.routes[0].id,
      version: s.routes[0].version,
    });
    const final = await snapshot();
    expect(final.routes[0].status).toBe("completed");
    expect(final.jobs[0].status).toBe("deposited");
  });
  it("rejects stale edits, cross-city assignments, overload and invalid directory IDs", async () => {
    const ids = await setup();
    let s = await snapshot();
    expect(
      (
        await request("dispatch", {
          action: "assign",
          id: ids.job.id,
          version: 1,
          route_id: null,
        })
      ).status,
    ).toBe(409);
    const other = await ok("dispatch", {
      action: "save_job",
      city: "kaliningrad",
      date: "2026-09-15",
      data: data(),
    });
    expect(
      (
        await request("dispatch", {
          action: "assign",
          id: other.id,
          version: 1,
          route_id: ids.route.id,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("dispatch", {
          action: "save_job",
          city: "moscow",
          date: "2026-09-15",
          data: { ...data(), customerInn: "999" },
        })
      ).status,
    ).toBe(400);
    const heavy = await ok("dispatch", {
      action: "save_job",
      city: "moscow",
      date: "2026-09-15",
      data: { ...data(), weightKg: 1100 },
    });
    await ok("dispatch", {
      action: "assign",
      id: heavy.id,
      version: 1,
      route_id: ids.route.id,
    });
    s = await snapshot();
    expect(
      (
        await request("dispatch", {
          action: "publish",
          id: ids.route.id,
          version: s.routes[0].version,
        })
      ).status,
    ).toBe(200);
    expect((await snapshot()).routes[0].status).toBe("published");
  });
  it("locks completed points and requires acknowledging changed routes", async () => {
    const ids = await setup();
    let s = await publishAndStart();
    await ok("driver", {
      action: "arrive",
      id: ids.job.id,
      version: s.jobs[0].version,
    });
    const second = await ok("dispatch", {
      action: "save_job",
      city: "moscow",
      date: "2026-09-15",
      data: data(),
    });
    await ok("dispatch", {
      action: "assign",
      id: second.id,
      version: 1,
      route_id: ids.route.id,
    });
    s = await snapshot();
    expect(
      (
        await request("dispatch", {
          action: "reorder",
          id: ids.route.id,
          version: s.routes[0].version,
          ids: [second.id, ids.job.id],
        })
      ).status,
    ).toBe(400);
    const first = s.jobs.find((j: any) => j.id === ids.job.id);
    expect(
      (
        await request("driver", {
          action: "complete",
          id: first.id,
          version: first.version,
          actual_places: 2,
          photos: [photo],
        })
      ).status,
    ).toBe(400);
    await ok("driver", {
      action: "acknowledge",
      id: ids.route.id,
      version: s.routes[0].version,
    });
    await ok("driver", {
      action: "complete",
      id: first.id,
      version: first.version,
      actual_places: 2,
      photos: [photo],
    });
  });

  it("persists contacts to sender directory on save_job", async () => {
    await ok("dispatch", {
      action: "save_job",
      city: "moscow",
      date: "2026-09-15",
      data: {
        ...data(),
        contacts: [
          {
            name: "Иван Петров",
            phone: "+7 985 047-45-26",
            extension: "418",
            purpose: "Звонки",
          },
        ],
      },
    });
    const listed = await ok("dispatch", {
      action: "directory",
      kind: "sender_contact",
      sender_inn: "200",
      q: "",
    });
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0].name).toBe("Иван Петров");
    expect(listed.items[0].phone).toBe("+7 985 047-45-26");
    expect(listed.items[0].extension).toBe("418");
    await ok("dispatch", {
      action: "save_job",
      city: "moscow",
      date: "2026-09-16",
      data: {
        ...data(),
        contacts: [
          {
            name: "Иван П.",
            phone: "+79850474526",
            extension: "",
            purpose: "Переписка",
          },
        ],
      },
    });
    const updated = await ok("dispatch", {
      action: "directory",
      kind: "sender_contact",
      sender_inn: "200",
    });
    expect(updated.items).toHaveLength(1);
    expect(updated.items[0].name).toBe("Иван П.");
    expect(updated.items[0].purpose).toBe("Переписка");
  });
});

describe("atomic bulk assignment", () => {
  it("assigns a batch once and denies a driver the same action", async () => {
    const { route } = await setup();
    const jobs = [];
    for (let i = 0; i < 2; i++)
      jobs.push(
        await ok("dispatch", {
          action: "save_job",
          city: "moscow",
          date: "2026-09-15",
          data: data(),
        }),
      );
    const s = await snapshot();
    const body = {
      action: "assign_many",
      requestId: randomUUID(),
      route_id: route.id,
      route_version: s.routes[0].version,
      jobs: jobs.map((j) => ({ id: j.id, version: 1 })),
    };
    expect((await request("driver", body)).status).toBe(403);
    await ok("dispatch", body);
    const assigned = await snapshot();
    expect(
      assigned.jobs.filter((j: any) => j.route_id === route.id),
    ).toHaveLength(3);
    const version = assigned.routes[0].version;
    await ok("dispatch", body);
    expect((await snapshot()).routes[0].version).toBe(version);
  });
  it("rolls back all assignments when the cumulative load exceeds capacity", async () => {
    const { route } = await setup();
    const jobs = [];
    for (let i = 0; i < 2; i++)
      jobs.push(
        await ok("dispatch", {
          action: "save_job",
          city: "moscow",
          date: "2026-09-15",
          data: { ...data(), weightKg: 600 },
        }),
      );
    const s = await snapshot();
    const r = await request("dispatch", {
      action: "assign_many",
      route_id: route.id,
      route_version: s.routes[0].version,
      jobs: jobs.map((j) => ({ id: j.id, version: 1 })),
    });
    expect(r.status).toBe(400);
    const after = await snapshot();
    expect(after.jobs.filter((j: any) => !j.route_id)).toHaveLength(2);
    expect(after.routes[0].version).toBe(s.routes[0].version);
  });
  it("rolls back the earlier item when a later job has a stale version", async () => {
    const { route } = await setup();
    const jobs = [];
    for (let i = 0; i < 2; i++)
      jobs.push(
        await ok("dispatch", {
          action: "save_job",
          city: "moscow",
          date: "2026-09-15",
          data: data(),
        }),
      );
    const s = await snapshot();
    const r = await request("dispatch", {
      action: "assign_many",
      route_id: route.id,
      route_version: s.routes[0].version,
      jobs: [
        { id: jobs[0].id, version: 1 },
        { id: jobs[1].id, version: 999 },
      ],
    });
    expect(r.status).toBe(409);
    expect(
      (await snapshot()).jobs.filter((j: any) => !j.route_id),
    ).toHaveLength(2);
  });
});

it("returns sender address history only to dispatchers and separates cities and senders", async () => {
  await setup();
  const r = await ok("dispatch", {
    action: "sender_defaults",
    senderInn: "200",
    city: "moscow",
  });
  expect(r.items).toHaveLength(1);
  expect(r.items[0].address).toBe(data().address);
  expect(r.items[0].contacts[0].phone).toBe(data().contacts[0].phone);
  expect(r.items[0].priceRub).toBeUndefined();
  expect(
    (
      await ok("dispatch", {
        action: "sender_defaults",
        senderInn: "200",
        city: "kaliningrad",
      })
    ).items,
  ).toHaveLength(0);
  expect(
    (
      await ok("dispatch", {
        action: "sender_defaults",
        senderInn: "999",
        city: "moscow",
      })
    ).items,
  ).toHaveLength(0);
  expect(
    (
      await request("driver", {
        action: "sender_defaults",
        senderInn: "200",
        city: "moscow",
      })
    ).status,
  ).toBe(403);
});

describe("driver route order", () => {
  async function threeStops() {
    const ids = await setup();
    for (let i = 0; i < 2; i++) {
      const job = await ok("dispatch", {
        action: "save_job",
        city: "moscow",
        date: "2026-09-15",
        data: data(),
      });
      await ok("dispatch", {
        action: "assign",
        id: job.id,
        version: 1,
        route_id: ids.route.id,
      });
    }
    return ids;
  }
  it("lets the assigned driver reorder published and started routes, audits and acknowledges their own change", async () => {
    await threeStops();
    let s = await snapshot();
    await ok("dispatch", {
      action: "publish",
      id: s.routes[0].id,
      version: s.routes[0].version,
    });
    s = await snapshot();
    await ok("driver", {
      action: "reorder",
      id: s.routes[0].id,
      version: s.routes[0].version,
      ids: s.jobs.map((j: any) => j.id).reverse(),
      asDriver: true,
    });
    s = await snapshot();
    await ok("driver", {
      action: "start",
      id: s.routes[0].id,
      version: s.routes[0].version,
    });
    s = await snapshot();
    await ok("driver", {
      action: "arrive",
      id: s.jobs[0].id,
      version: s.jobs[0].version,
    });
    s = await snapshot();
    const command = {
      action: "reorder",
      id: s.routes[0].id,
      version: s.routes[0].version,
      ids: [s.jobs[0].id, s.jobs[2].id, s.jobs[1].id],
      requestId: randomUUID(),
    };
    await ok("driver", command);
    let after = await snapshot();
    expect(after.jobs.map((j: any) => j.id)).toEqual(command.ids);
    expect(after.routes[0].acknowledged_version).toBe(after.routes[0].version);
    expect(
      after.events.some(
        (e: any) =>
          e.action === "Водитель изменил порядок точек" && e.actor === "driver",
      ),
    ).toBe(true);
    await ok("driver", command);
    expect((await snapshot()).routes[0].version).toBe(after.routes[0].version);
    expect(
      (await request("driver", { ...command, requestId: randomUUID() })).status,
    ).toBe(409);
    expect(
      (
        await request("driver", {
          ...command,
          version: after.routes[0].version,
          ids: [after.jobs[1].id, after.jobs[0].id, after.jobs[2].id],
          requestId: randomUUID(),
        })
      ).status,
    ).toBe(400);
    expect(
      (await request("other", { ...command, version: after.routes[0].version }))
        .status,
    ).toBe(403);
  });
  it("requires reviewing dispatcher changes and never accepts a completed route or forged driver mode", async () => {
    await threeStops();
    let s = await publishAndStart();
    await ok("dispatch", {
      action: "reorder",
      id: s.routes[0].id,
      version: s.routes[0].version,
      ids: s.jobs.map((j: any) => j.id).reverse(),
    });
    s = await snapshot();
    const command = {
      action: "reorder",
      id: s.routes[0].id,
      version: s.routes[0].version,
      ids: s.jobs.map((j: any) => j.id).reverse(),
    };
    expect((await request("driver", command)).status).toBe(400);
    expect(
      (await request("dispatch", { ...command, asDriver: true })).status,
    ).toBe(403);
    await state.db.query(
      "UPDATE pickup_routes SET status='completed' WHERE id=$1",
      [s.routes[0].id],
    );
    expect((await request("driver", command)).status).toBe(400);
  });
});

describe("pickup GPS", () => {
  const fix = () => ({
    latitude: 55.751,
    longitude: 37.617,
    accuracy: 18,
    measured_at: new Date(Date.now() - 10000).toISOString(),
  });
  it("expires old GPS without changing route or pickup progress", async () => {
    await setup();
    const before = await publishAndStart();
    await ok("driver", {action:"location",id:before.routes[0].id,...fix(),requestId:undefined});
    await state.db.query("UPDATE pickup_driver_locations SET measured_at=now()-interval '8 days',last_observed_at=now()-interval '8 days'");
    const after = await snapshot();
    expect(after.locations).toEqual([]);
    expect(after.routes).toEqual(before.routes);
    expect(after.jobs).toEqual(before.jobs);
    expect((await state.db.query("SELECT * FROM pickup_driver_locations")).rows).toEqual([]);
  });
  it("stores only the latest fix without changing route version or creating receipts, isolates driver data", async () => {
    await setup();
    const s = await publishAndStart();
    const command = {
      action: "location",
      id: s.routes[0].id,
      ...fix(),
      requestId: undefined,
    };
    const receiptsBefore = await state.db.query(
      "SELECT count(*) AS n FROM pickup_receipts",
    );
    expect((await ok("driver", command)).accepted).toBe(true);
    let after = await snapshot();
    expect(after.locations).toHaveLength(1);
    expect(after.routes[0].version).toBe(s.routes[0].version);
    expect(after.routes[0].acknowledged_version).toBe(
      s.routes[0].acknowledged_version,
    );
    expect((await snapshot("other")).locations).toEqual([]);
    expect((await snapshot("driver")).locations[0].latitude).toBe(
      command.latitude,
    );
    const received = after.locations[0].received_at;
    expect(
      (
        await ok("driver", {
          ...command,
          latitude: 56,
          measured_at: new Date(Date.now() - 30000).toISOString(),
        })
      ).accepted,
    ).toBe(false);
    expect((await ok("driver", command)).accepted).toBe(false);
    after = await snapshot();
    expect(after.locations[0].received_at).toEqual(received);
    expect(after.locations[0].latitude).toBe(command.latitude);
    expect(
      (await state.db.query("SELECT count(*) AS n FROM pickup_receipts")).rows,
    ).toEqual(receiptsBefore.rows);
    expect(
      (
        await ok("driver", {
          ...command,
          latitude: 55.7511,
          measured_at: new Date().toISOString(),
        })
      ).accepted,
    ).toBe(true);
    expect((await snapshot()).locations[0].latitude).toBe(55.7511);
  });
  it("preserves accepted coordinates and time on a jump, persists warning, ignores out-of-order fixes, recovers", async () => {
    await setup();
    const s = await publishAndStart();
    const command = {
      action: "location",
      id: s.routes[0].id,
      ...fix(),
      measured_at: new Date(Date.now() - 60000).toISOString(),
    };
    await ok("driver", command);
    const before = (await snapshot()).locations[0];
    const bad = {
      ...command,
      latitude: 56.65,
      measured_at: new Date(Date.now() - 10000).toISOString(),
    };
    const rejected = await ok("driver", bad);
    expect(rejected.accepted).toBe(false);
    expect(rejected.warning).toBe("Резкий скачок координат");
    const after = (await snapshot()).locations[0];
    expect(after.latitude).toBe(before.latitude);
    expect(after.measured_at).toEqual(before.measured_at);
    expect(after.received_at).toEqual(before.received_at);
    await ok("driver", {
      ...command,
      measured_at: new Date(Date.now() - 30000).toISOString(),
    });
    expect((await snapshot()).locations[0].warning).toBe(rejected.warning);
    expect(
      (
        await ok("driver", {
          ...command,
          measured_at: new Date().toISOString(),
        })
      ).accepted,
    ).toBe(true);
    expect((await snapshot()).locations[0].warning).toBe("");
  });
  it("rejects another driver, dispatcher impersonation, missing permissions, and inactive routes", async () => {
    const { route } = await setup();
    const command = { action: "location", id: route.id, ...fix() };
    expect((await request("driver", command)).status).toBe(400);
    await publishAndStart();
    for (const login of ["other", "dispatch", "client"])
      expect((await request(login, command)).status).toBe(403);
    await state.db.query(
      "UPDATE registered_users SET permissions=permissions || '{\"dispatcher\":true}'::jsonb WHERE login='other'",
    );
    expect((await request("other", command)).status).toBe(403);
    await state.db.query(
      "UPDATE pickup_routes SET status='completed' WHERE id=$1",
      [route.id],
    );
    expect((await request("driver", command)).status).toBe(400);
  });
  it("rejects invalid, expired and future coordinates without overwriting the last fix", async () => {
    await setup();
    const s = await publishAndStart();
    const command = { action: "location", id: s.routes[0].id, ...fix() };
    await ok("driver", command);
    for (const invalid of [
      { latitude: 91 },
      { longitude: -181 },
      { latitude: null },
      { longitude: "37.6" },
      { accuracy: -1 },
      { accuracy: Infinity },
      { measured_at: new Date(Date.now() - 180000).toISOString() },
      { measured_at: new Date(Date.now() + 90000).toISOString() },
    ])
      expect((await request("driver", { ...command, ...invalid })).status).toBe(
        400,
      );
    expect((await snapshot()).locations[0].latitude).toBe(command.latitude);
  });
  it("keeps the module usable when GPS migration has not yet been applied", async () => {
    await setup();
    const s = await publishAndStart();
    await state.db.exec(
      "ALTER TABLE pickup_driver_locations RENAME TO pickup_driver_locations_unavailable",
    );
    try {
      const after = await snapshot();
      expect(after.locationAvailable).toBe(false);
      expect(after.jobs).toHaveLength(1);
      expect(
        (
          await request("driver", {
            action: "location",
            id: s.routes[0].id,
            ...fix(),
          })
        ).status,
      ).toBe(503);
    } finally {
      await state.db.exec(
        "ALTER TABLE pickup_driver_locations_unavailable RENAME TO pickup_driver_locations",
      );
    }
  });
});

describe("request numbers at depot handoff", () => {
  async function readyWithoutNumbers(count = 1) {
    const { route } = await setup();
    await state.db.query(
      "UPDATE pickup_jobs SET data=jsonb_set(data,'{zayavkaNumber}','\"\"'),zayavka_number=NULL WHERE route_id=$1",
      [route.id],
    );
    for (let i = 1; i < count; i++) {
      const j = await ok("dispatch", {
        action: "save_job",
        city: "moscow",
        date: "2026-09-15",
        data: { ...data(), zayavkaNumber: "" },
      });
      await ok("dispatch", {
        action: "assign",
        id: j.id,
        version: 1,
        route_id: route.id,
      });
    }
    const s = await publishAndStart();
    for (const job of s.jobs)
      await ok("driver", {
        action: "complete",
        id: job.id,
        version: job.version,
        actual_places: 2,
        photos: [photo],
      });
    return snapshot();
  }
  it("rejects handoff without a request number, including whitespace, and leaves cargo open", async () => {
    const s = await readyWithoutNumbers(),
      route = s.routes[0],
      job = s.jobs[0];
    const command = { action: "deposit", id: route.id, version: route.version };
    expect((await request("driver", command)).body.error).toContain("Заявка");
    for (const number of ["", "  ", "x".repeat(101)]) {
      expect(
        (
          await request("driver", {
            ...command,
            zayavka_numbers: [{ id: job.id, version: job.version, number }],
          })
        ).status,
      ).toBe(400);
    }
    const after = await snapshot();
    expect(after.routes[0].status).toBe("started");
    expect(after.jobs[0].status).toBe("picked_up");
  });
  it("requires all missing numbers and saves them atomically with handoff, search fields and audit", async () => {
    const s = await readyWithoutNumbers(2),
      route = s.routes[0];
    const entries = s.jobs.map((j: any, i: number) => ({
      id: j.id,
      version: j.version,
      number: `  З-00${i + 1}  `,
    }));
    const command = { action: "deposit", id: route.id, version: route.version };
    expect(
      (
        await request("driver", {
          ...command,
          zayavka_numbers: entries.slice(0, 1),
        })
      ).status,
    ).toBe(400);
    expect(
      (await snapshot()).jobs.every((j: any) => !j.data.zayavkaNumber),
    ).toBe(true);
    const complete = {
      ...command,
      requestId: randomUUID(),
      zayavka_numbers: entries,
    };
    await ok("driver", complete);
    const after = await snapshot();
    expect(after.routes[0].status).toBe("completed");
    expect(after.jobs.every((j: any) => j.status === "deposited")).toBe(true);
    expect(after.jobs.map((j: any) => j.data.zayavkaNumber)).toEqual([
      "З-001",
      "З-002",
    ]);
    expect(after.jobs.map((j: any) => j.zayavka_number)).toEqual([
      "З-001",
      "З-002",
    ]);
    expect(
      after.events.filter(
        (e: any) => e.action === "Заявка указана при сдаче на склад",
      ),
    ).toHaveLength(2);
    const queued = await state.db.query("SELECT order_number,state FROM pickup_number_sync ORDER BY order_number");
    expect(queued.rows).toEqual([{order_number:"З-001",state:"pending"},{order_number:"З-002",state:"pending"}]);
    await ok("driver", complete);
    expect((await snapshot()).jobs.map((j: any) => j.version)).toEqual(
      after.jobs.map((j: any) => j.version),
    );
    expect((await snapshot("driver")).jobs[0].data).not.toHaveProperty(
      "priceRub",
    );
  });
  it("rejects stale or unrelated jobs and cannot overwrite an existing number", async () => {
    const s = await readyWithoutNumbers(),
      route = s.routes[0],
      job = s.jobs[0];
    const command = {
      action: "deposit",
      id: route.id,
      version: route.version,
      zayavka_numbers: [{ id: job.id, version: job.version, number: "З-1" }],
    };
    expect((await request("other", command)).status).toBe(403);
    expect(
      (
        await request("driver", {
          ...command,
          zayavka_numbers: [
            { id: job.id, version: job.version - 1, number: "З-1" },
          ],
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request("driver", {
          ...command,
          zayavka_numbers: [
            { id: randomUUID(), version: job.version, number: "З-1" },
          ],
        })
      ).status,
    ).toBe(400);
    await state.db.query(
      "UPDATE pickup_jobs SET data=jsonb_set(data,'{zayavkaNumber}','\"СУЩЕСТВУЮЩАЯ\"'),zayavka_number='СУЩЕСТВУЮЩАЯ',version=version+1 WHERE id=$1",
      [job.id],
    );
    expect(
      (
        await request("driver", {
          ...command,
          zayavka_numbers: [
            { id: job.id, version: job.version + 1, number: "ДРУГАЯ" },
          ],
        })
      ).status,
    ).toBe(400);
    await ok("driver", {
      action: "deposit",
      id: route.id,
      version: route.version,
    });
    expect((await snapshot()).jobs[0].data.zayavkaNumber).toBe("СУЩЕСТВУЮЩАЯ");
  });
  it("does not require a number for cancelled or resolved pickups without collected cargo", async () => {
    await setup();
    const s = await publishAndStart(),
      job = s.jobs[0];
    await ok("driver", {
      action: "problem",
      id: job.id,
      version: job.version,
      note: "Груз не готов",
    });
    const problem = (await snapshot()).jobs[0];
    await state.db.query(
      "UPDATE pickup_jobs SET data=jsonb_set(data,'{zayavkaNumber}','\"\"'),zayavka_number=NULL WHERE id=$1",
      [job.id],
    );
    await ok("dispatch", {
      action: "resolve",
      id: job.id,
      version: problem.version,
      note: "Забор перенесён, груза у водителя нет",
    });
    await ok("driver", {
      action: "deposit",
      id: s.routes[0].id,
      version: s.routes[0].version,
    });
    expect((await snapshot()).jobs[0].status).toBe("resolved");
  });
});

describe("dispatcher route assessment", () => {
  it("is dispatcher-only, read-only and validates route revision", async () => {
    const { route } = await setup();
    const s = await snapshot();
    const revision = s.routes[0].version;
    const before = await state.db.query(
      "SELECT count(*) AS n FROM pickup_receipts",
    );
    const result = await ok("dispatch", {
      action: "check_route",
      id: route.id,
      version: revision,
      requestId: undefined,
    });
    expect(result.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(
      (await state.db.query("SELECT count(*) AS n FROM pickup_receipts")).rows,
    ).toEqual(before.rows);
    expect((await snapshot()).routes[0].version).toBe(revision);
    expect(
      (
        await request("driver", {
          action: "check_route",
          id: route.id,
          version: revision,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request("dispatch", {
          action: "check_route",
          id: route.id,
          version: revision - 1,
        })
      ).status,
    ).toBe(409);
  });
  it("rejects applying analysis after resource/job changes or expiry; valid result keeps standard reorder rules", async () => {
    const { route, vehicle } = await setup();
    let s = await snapshot();
    const check = () =>
      ok("dispatch", {
        action: "check_route",
        id: route.id,
        version: s.routes[0].version,
      });
    let result = await check();
    const apply = (r: any) =>
      request("dispatch", {
        action: "reorder",
        id: route.id,
        version: r.routeVersion,
        ids: s.jobs
          .filter((j: any) => j.route_id === route.id)
          .map((j: any) => j.id),
        analysisSignature: r.signature,
        checkedAt: r.checkedAt,
      });
    expect(
      (
        await apply({
          ...result,
          checkedAt: new Date(Date.now() - 11 * 60000).toISOString(),
        })
      ).status,
    ).toBe(400);
    await state.db.query(
      "UPDATE pickup_resources SET version=version+1 WHERE id=$1",
      [vehicle.id],
    );
    expect((await apply(result)).status).toBe(400);
    result = await check();
    expect((await apply(result)).status).toBe(200);
    s = await snapshot();
    result = await check();
    await state.db.query(
      "UPDATE pickup_jobs SET version=version+1 WHERE route_id=$1",
      [route.id],
    );
    expect((await apply(result)).status).toBe(400);
  });
});

describe("route start location", () => {
  it("validates, saves, preserves on legacy edits and publishes the chosen start to the driver", async () => {
    await setup();
    let route = (await snapshot()).routes[0];
    const save = (extra: Record<string, unknown>) => request("dispatch", { ...route, action: "save_route", ...extra });
    expect((await save({ start_mode: "address", start_address: "  " })).status).toBe(400);
    expect((await save({ start_mode: "unknown" })).status).toBe(400);
    expect((await save({ start_mode: "address", start_address: "Москва, стоянка" })).status).toBe(200);
    route = (await snapshot()).routes[0];
    expect(route.snapshot.start).toEqual({ mode: "address", address: "Москва, стоянка" });
    expect((await save({ name: "Новый заголовок" })).status).toBe(200);
    route = (await snapshot()).routes[0];
    expect(route.snapshot.start.address).toBe("Москва, стоянка");
    await ok("dispatch", { action: "publish", id: route.id, version: route.version });
    const published = (await snapshot("driver")).routes[0];
    expect(published.snapshot.start.address).toBe("Москва, стоянка");
    expect(published.snapshot.depot.data.address).not.toBe("Москва, стоянка");
  });
  it.each(["draft", "published", "started", "completed"])("lets dispatcher delete a %s route with any pickup status, preserving cargo and audit", async (status) => {
    const ids = await setup();
    await dbSetRouteStatus(status);
    const statuses=["pending","arrived","picked_up","partial","problem","deposited","resolved","cancelled"];
    const before=(await state.db.query("SELECT * FROM pickup_jobs WHERE route_id=$1",[ids.route.id])).rows[0];
    await state.db.query("UPDATE pickup_jobs SET status='arrived' WHERE id=$1",[before.id]);
    for(const jobStatus of statuses.filter(value=>value!=="arrived")) {
      await state.db.query("INSERT INTO pickup_jobs(id,city,date,data,route_id,status,job_number) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [randomUUID(),before.city,before.date,JSON.stringify(before.data),ids.route.id,jobStatus,`TEST-${randomUUID()}`]);
    }
    await state.db.query("INSERT INTO pickup_photos(id,job_id,content_type,bytes) VALUES($1,$2,'image/jpeg',$3)",[randomUUID(),before.id,Buffer.from([255,216,255])]);
    const route=(await snapshot()).routes[0];
    const command={action:"delete_route",id:route.id,version:route.version,requestId:randomUUID()};
    expect((await request("driver",command)).status).toBe(403);
    expect((await request("dispatch",{...command,version:route.version-1})).status).toBe(409);
    const removed=await ok("dispatch",command);
    expect(removed.jobsUnassigned).toBe(8);
    const jobs=(await state.db.query("SELECT status,route_id FROM pickup_jobs")).rows;
    expect(jobs.map((job:any)=>job.status).sort()).toEqual([...statuses].sort());
    expect(jobs.every((job:any)=>job.route_id===null)).toBe(true);
    expect((await state.db.query("SELECT * FROM pickup_routes WHERE id=$1",[route.id])).rows).toHaveLength(0);
    expect((await state.db.query("SELECT * FROM pickup_photos WHERE job_id=$1",[before.id])).rows).toHaveLength(1);
    const history=(await state.db.query("SELECT data FROM pickup_events WHERE data->'deletedRoute'->>'id'=$1",[route.id])).rows;
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].data.deletedRoute.status).toBe(status);
    expect(await ok("dispatch",command)).toEqual(removed);
    async function dbSetRouteStatus(value:string) {
      await state.db.query("UPDATE pickup_routes SET status=$2 WHERE id=$1",[ids.route.id,value]);
    }
  });
  it("lets dispatcher delete completed routes", async () => {
    const ids = await setup();
    let s = await publishAndStart();
    await ok("driver", {
      action: "complete",
      id: ids.job.id,
      version: s.jobs[0].version,
      actual_places: 2,
      photos: [photo],
    });
    s = await snapshot();
    await ok("driver", {
      action: "deposit",
      id: s.routes[0].id,
      version: s.routes[0].version,
    });
    s = await snapshot();
    expect(s.routes[0].status).toBe("completed");
    await ok("dispatch", {
      action: "delete_route",
      id: ids.route.id,
      version: s.routes[0].version,
    });
    const after = await snapshot();
    expect(after.routes).toHaveLength(0);
    expect(after.jobs[0].status).toBe("deposited");
    expect(after.jobs[0].route_id).toBeNull();
  });
});

it("denies drivers all billing actions", async () => {
  for (const action of ["billing_journal","billing_save","billing_send","billing_mark_issued"]) {
    expect((await request("driver",{action,city:"moscow",date:"2026-09-15"})).status).toBe(403);
  }
});

it("saves manual billing with no amount for deposited cargo and rejects stale versions", async () => {
  const { job } = await setup();
  await state.db.query("UPDATE pickup_jobs SET status='deposited' WHERE id=$1", [job.id]);
  const before = (await snapshot()).jobs.find((j:any)=>j.id===job.id);
  const body = {action:"set_job_billing",id:job.id,version:before.version,data:{...before.data,issueCustomerBill:true,customerBillMode:"manual",priceRub:null,payment:"Не указано",note:""}};
  expect((await request("driver",body)).status).toBe(403);
  await ok("dispatch",body);
  const after = (await snapshot()).jobs.find((j:any)=>j.id===job.id);
  expect(after.status).toBe("deposited");
  expect(after.data).toMatchObject({issueCustomerBill:true,customerBillMode:"manual",priceRub:null});
  expect((await request("dispatch",body)).status).toBe(409);
});
