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
  for (const file of [
    "../../migrations/104_pickup_dispatch.sql",
    "../../migrations/107_pickup_supplier_contacts.sql",
  ]) {
    await state.db.exec(
      readFileSync(new URL(file, import.meta.url), "utf8"),
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
  it("keeps discrepancies open until dispatcher resolution", async () => {
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
    expect(
      (
        await request("driver", {
          action: "deposit",
          id: s.routes[0].id,
          version: s.routes[0].version,
        })
      ).status,
    ).toBe(400);
    await ok("dispatch", {
      action: "resolve",
      id: j.id,
      version: s.jobs[0].version,
      note: "Остаток заберём завтра, создано отдельное задание",
    });
    await ok("driver", {
      action: "deposit",
      id: s.routes[0].id,
      version: s.routes[0].version,
    });
    expect((await snapshot()).jobs[0].resolution).toContain("Остаток");
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
    ).toBe(400);
    expect((await snapshot()).routes[0].status).toBe("draft");
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
