import {
  checkRoute,
  checkSignature,
  type CheckInput,
} from "../../lib/pickup/checkRoute.js";
import { truckFields } from "../../lib/pickup/routeAnalysis.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "../_db.js";
import { verifyPassword } from "../../lib/passwordUtils.js";
import { respondCorsPreflight } from "../_lib/cors.js";
import {
  getClientIp,
  isRateLimited,
  ADMIN_API_LIMIT,
} from "../../lib/rateLimit.js";
import { buildPickupCustomerQuote } from "../../lib/pickup/customerQuote.js";
import { ensureHaulzDepot } from "../../lib/pickup/haulzDepot.js";
import {
  expandPickupScheduleDates,
  parsePickupScheduleBody,
  scheduleMetaForJobData,
} from "../../lib/pickup/pickupSchedule.js";
import { pgTableExists } from "../_haulzReturns.js";
import { upsertPickupSupplierContacts } from "../../lib/pickup/supplierContacts.js";
import {
  validateLocation,
  locationWarning,
} from "../../lib/pickup/location.js";
import { deletePickupRoute } from "../../lib/pickup/deleteRoute.js";
import {
  pickupJobIsFinishedForCleanup,
  pickupMayDeleteCompletedRoute,
} from "../../lib/pickup/pickupCompletedRouteDeleteAccess.js";
import {
  PickupError,
  pickupJobCanCancel,
  pickupJobCanDelete,
  pickupJobNeedsZayavka,
  requireValue,
  validCity,
  validDate,
  validTime,
  textValue,
  numberValue,
  safeUrl,
  normalizeJob,
  pickupJobSearchColumns,
  driverJob,
  plannedPlaces,
  validateCompletion,
  routeWarnings,
  type Job,
  type Route,
  type Resource,
} from "../../lib/pickup/model.js";

type Actor = {
  login: string;
  dispatcher: boolean;
  driver: boolean;
  permissions?: Record<string, unknown>;
};
async function persistJobContactsToSenderDirectory(
  db: PoolClient,
  senderInn: string,
  data: ReturnType<typeof normalizeJob>,
): Promise<void> {
  const pool = db as unknown as import("pg").Pool;
  if (!(await pgTableExists(pool, "pickup_supplier_contacts"))) return;
  await upsertPickupSupplierContacts(db, senderInn, data.contacts);
}
const uuid = (v: unknown): string => {
  requireValue(
    typeof v === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
    "Некорректный идентификатор",
  );
  return v;
};
function checkVersion(row: { version: number }, version: unknown) {
  if (row.version !== version)
    throw new PickupError(
      "Данные изменены другим пользователем. Обновите экран и повторите действие.",
      409,
    );
}
const dispatcherOnly = (actor: Actor) => {
  if (!actor.dispatcher)
    throw new PickupError("Требуется бейдж «Диспетчер»", 403);
};
async function routeById(db: PoolClient, id: unknown): Promise<Route> {
  const { rows } = await db.query(
    "SELECT *, to_char(date,'YYYY-MM-DD') AS date FROM pickup_routes WHERE id=$1 FOR UPDATE",
    [uuid(id)],
  );
  if (!rows[0]) throw new PickupError("Маршрут не найден", 404);
  return rows[0];
}
export function checkRouteAccess(actor: Actor, route: Route) {
  if (
    !actor.dispatcher &&
    (!actor.driver ||
      route.status === "draft" ||
      route.snapshot.driver?.data.login !== actor.login)
  ) {
    throw new PickupError("Маршрут недоступен", 403);
  }
}
async function event(
  db: PoolClient,
  actor: Actor,
  action: string,
  routeId: string | null = null,
  jobId: string | null = null,
  data = {},
) {
  await db.query(
    "INSERT INTO pickup_events(id,route_id,job_id,actor,action,data) VALUES($1,$2,$3,$4,$5,$6)",
    [randomUUID(), routeId, jobId, actor.login, action, JSON.stringify(data)],
  );
}
async function resource(
  db: PoolClient,
  id: unknown,
  kind: string,
): Promise<Resource> {
  const { rows } = await db.query(
    "SELECT * FROM pickup_resources WHERE id=$1 AND kind=$2 AND active=true",
    [uuid(id), kind],
  );
  requireValue(rows[0], `Выберите действующую запись: ${kind}`);
  return rows[0];
}
async function routeResources(db: PoolClient, body: any) {
  const driver = await resource(db, body.driver_id, "driver"),
    vehicle = await resource(db, body.vehicle_id, "vehicle"),
    depot = await resource(db, body.depot_id, "depot");
  requireValue(
    [driver, vehicle, depot].every((r) => r.city === body.city),
    "Водитель, машина и склад должны относиться к городу маршрута",
  );
  const { rows } = await db.query(
    "SELECT id FROM registered_users WHERE lower(trim(login))=$1 AND active=true AND permissions->>'driver'='true'",
    [driver.data.login],
  );
  requireValue(
    rows.length,
    "У водителя должен быть активный аккаунт с бейджем «Водитель»",
  );
  return { driver, vehicle, depot };
}
async function readCheckInput(
  db: PoolClient,
  id: unknown,
): Promise<CheckInput> {
  const route = (
    await db.query(
      "SELECT *,to_char(date,'YYYY-MM-DD') AS date FROM pickup_routes WHERE id=$1",
      [uuid(id)],
    )
  ).rows[0];
  requireValue(route, "Маршрут не найден");
  const jobs = (
    await db.query(
      "SELECT * FROM pickup_jobs WHERE route_id=$1 AND status<>'cancelled' ORDER BY position,created_at",
      [route.id],
    )
  ).rows;
  const resources = await routeResources(db, route);
  const events = (
    await db.query(
      "SELECT * FROM pickup_events WHERE route_id=$1 AND action=ANY($2::text[]) ORDER BY created_at DESC LIMIT 1",
      [route.id, ["Прибыл на точку", "Груз забран", "Проблема на точке"]],
    )
  ).rows;
  const location = (await pgTableExists(db as any, "pickup_driver_locations"))
    ? (
        await db.query(
          "SELECT * FROM pickup_driver_locations WHERE route_id=$1 AND driver_login=$2",
          [route.id, route.snapshot.driver?.data.login],
        )
      ).rows[0]
    : undefined;
  return { route, jobs, resources, events, location };
}
async function readSnapshot(db: PoolClient, actor: Actor, body: any) {
  validCity(body.city);
  validDate(body.date);
  if (actor.dispatcher) {
    await ensureHaulzDepot(db, body.city);
  }
  const resources = actor.dispatcher
    ? (
        await db.query(
          "SELECT * FROM pickup_resources WHERE city=$1 ORDER BY kind,name",
          [body.city],
        )
      ).rows
    : [];
  const routes: Route[] = (
    await db.query(
      `SELECT *,to_char(date,'YYYY-MM-DD') AS date FROM pickup_routes WHERE city=$1 AND date=$2
    AND ($3::boolean OR (status<>'draft' AND snapshot->'driver'->'data'->>'login'=$4)) ORDER BY start_time,name`,
      [body.city, body.date, actor.dispatcher, actor.login],
    )
  ).rows;
  const routeIds = routes.map((r) => r.id);
  // Allow the existing module to keep working while migration 108 is being rolled out.
  const locationAvailable = await pgTableExists(
    db as any,
    "pickup_driver_locations",
  );
  const locations = locationAvailable
    ? (
        await db.query(
          `SELECT l.* FROM pickup_driver_locations l JOIN pickup_routes r ON r.id=l.route_id
     WHERE l.route_id=ANY($1::uuid[]) AND l.driver_login=r.snapshot->'driver'->'data'->>'login'`,
          [routeIds],
        )
      ).rows
    : [];
  const jobs: Job[] = (
    await db.query(
      `SELECT j.*,to_char(j.date,'YYYY-MM-DD') AS date,
    (SELECT count(*)::int FROM pickup_photos p WHERE p.job_id=j.id) AS photo_count FROM pickup_jobs j WHERE j.city=$1 AND j.date=$2
    AND ($3::boolean OR j.route_id=ANY($4::uuid[])) ORDER BY j.position,j.created_at`,
      [body.city, body.date, actor.dispatcher, routeIds],
    )
  ).rows;
  const events = (
    await db.query(
      `SELECT * FROM pickup_events WHERE route_id=ANY($1::uuid[]) OR job_id=ANY($2::uuid[]) ORDER BY created_at DESC LIMIT 200`,
      [routeIds, jobs.map((j) => j.id)],
    )
  ).rows;
  return {
    locations,
    locationAvailable,
    resources,
    routes,
    jobs: actor.dispatcher ? jobs : jobs.map(driverJob),
    events,
    dispatcher: actor.dispatcher,
  };
}
async function perform(db: PoolClient, actor: Actor, body: any): Promise<any> {
  const action = body.action;
  if (action === "snapshot") return readSnapshot(db, actor, body);
  if (action === "location") {
    const route = await routeById(db, body.id);
    // Even a dispatcher may only report their own position, with a driver badge.
    if (!actor.driver || route.snapshot.driver?.data.login !== actor.login)
      throw new PickupError(
        "Передавать GPS может только назначенный водитель",
        403,
      );
    requireValue(
      route.status === "started",
      "GPS доступен только во время выполнения маршрута",
    );
    if (!(await pgTableExists(db as any, "pickup_driver_locations")))
      throw new PickupError(
        "GPS ещё не настроен: примените миграцию 108_pickup_driver_locations.sql",
        503,
      );
    const fix = validateLocation(body);
    const schema = await db.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='pickup_driver_locations' AND column_name='warning'",
    );
    if (!schema.rows.length)
      throw new PickupError(
        "Примените миграцию 109_pickup_gps_quality.sql для защиты GPS",
        503,
      );
    const previous = (
      await db.query(
        "SELECT * FROM pickup_driver_locations WHERE route_id=$1 FOR UPDATE",
        [route.id],
      )
    ).rows[0];
    if (
      previous &&
      Date.parse(fix.measured_at) <=
        new Date(previous.last_observed_at || previous.measured_at).getTime()
    )
      return { ok: true, accepted: false, warning: previous.warning };
    const warning = locationWarning(previous, fix);
    if (warning && previous) {
      await db.query(
        "UPDATE pickup_driver_locations SET warning=$2,last_observed_at=$3 WHERE route_id=$1",
        [route.id, warning, fix.measured_at],
      );
      return { ok: true, accepted: false, warning };
    }
    const result = await db.query(
      `INSERT INTO pickup_driver_locations(route_id,driver_login,latitude,longitude,accuracy,measured_at,last_observed_at,warning)
       VALUES($1,$2,$3,$4,$5,$6,$6,$7)
       ON CONFLICT(route_id) DO UPDATE SET driver_login=EXCLUDED.driver_login,
         latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,accuracy=EXCLUDED.accuracy,
         measured_at=EXCLUDED.measured_at,last_observed_at=EXCLUDED.measured_at,warning=EXCLUDED.warning,received_at=now()
       RETURNING measured_at,received_at`,
      [
        route.id,
        actor.login,
        fix.latitude,
        fix.longitude,
        fix.accuracy,
        fix.measured_at,
        warning,
      ],
    );
    return { ok: true, accepted: true, warning, ...result.rows[0] };
  }

  if (action === "sender_defaults") {
    dispatcherOnly(actor);
    validCity(body.city);
    const inn = textValue(body.senderInn, 32);
    requireValue(inn, "Выберите отправителя");
    const { rows } = await db.query(
      `SELECT data FROM (
      SELECT DISTINCT ON (lower(trim(data->>'address'))) data,updated_at
      FROM pickup_jobs WHERE city=$1 AND data->>'senderInn'=$2 AND status<>'cancelled'
      AND trim(COALESCE(data->>'address',''))<>''
      ORDER BY lower(trim(data->>'address')),updated_at DESC
    ) recent ORDER BY updated_at DESC LIMIT 8`,
      [body.city, inn],
    );
    return {
      items: rows.map(({ data }) => ({
        address: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
        contacts: data.contacts,
        warehouseHours: data.warehouseHours,
        windowFrom: data.windowFrom,
        windowTo: data.windowTo,
        serviceMinutes: data.serviceMinutes,
        instructions: data.instructions,
        directionsUrl: data.directionsUrl,
      })),
    };
  }
  if (action === "directory") {
    dispatcherOnly(actor);
    const q = `%${textValue(body.q, 100).replace(/[%_\\]/g, "")}%`;
    if (body.kind === "user")
      return {
        items: (
          await db.query(
            "SELECT login AS id, login AS name FROM registered_users WHERE active=true AND permissions->>'driver'='true' AND login ILIKE $1 ORDER BY login LIMIT 50",
            [q],
          )
        ).rows,
      };
    if (body.kind === "sender_contact") {
      const senderInn = textValue(body.sender_inn, 20);
      requireValue(senderInn, "Укажите отправителя");
      const pool = db as unknown as import("pg").Pool;
      if (!(await pgTableExists(pool, "pickup_supplier_contacts"))) {
        throw new PickupError(
          "Выполните миграцию migrations/107_pickup_supplier_contacts.sql",
          503,
        );
      }
      const like = `%${textValue(body.q, 100).replace(/[%_\\]/g, "")}%`;
      const digits = like.replace(/\D/g, "");
      const params: string[] = [senderInn];
      let filter = "";
      if (body.q && String(body.q).trim()) {
        params.push(like);
        filter =
          " AND (name ILIKE $2 OR phone ILIKE $2 OR extension ILIKE $2";
        if (digits.length >= 3) {
          params.push(`%${digits}%`);
          filter += " OR phone_digits LIKE $" + params.length;
        }
        filter += ")";
      }
      return {
        items: (
          await db.query(
            `SELECT id,name,phone,extension,purpose FROM pickup_supplier_contacts
             WHERE sender_inn=$1${filter}
             ORDER BY updated_at DESC LIMIT 50`,
            params,
          )
        ).rows,
      };
    }
    const table =
      body.kind === "customer"
        ? "cache_customers"
        : body.kind === "supplier"
          ? "cache_suppliers"
          : "";
    requireValue(table, "Неизвестный справочник");
    const column = body.kind === "customer" ? "customer_name" : "supplier_name";
    return {
      items: (
        await db.query(
          `SELECT inn AS id,${column} AS name FROM ${table} WHERE inn ILIKE $1 OR ${column} ILIKE $1 ORDER BY ${column} LIMIT 50`,
          [q],
        )
      ).rows,
    };
  }
  if (action === "customer_quote") {
    dispatcherOnly(actor);
    validCity(body.city);
    const city = body.city;
    const pool = db as unknown as import("pg").Pool;
    if (!(await pgTableExists(pool, "haulz_calc_tariff_sets"))) {
      throw new PickupError(
        "Выполните миграцию migrations/083_haulz_calculator.sql",
        503,
      );
    }
    const coord = (
      value: unknown,
      min: number,
      max: number,
      label: string,
    ): number | null => {
      if (value === "" || value == null) return null;
      const n = Number(value);
      requireValue(
        Number.isFinite(n) && n >= min && n <= max,
        `Некорректное значение: ${label}`,
      );
      return n;
    };
    let quote;
    try {
      quote = await buildPickupCustomerQuote(pool, {
        city,
        weightKg: numberValue(body.weight_kg, "weight_kg", 100000),
        volumeM3: numberValue(body.volume_m3, "volume_m3", 1000),
        latitude: coord(body.latitude, -90, 90, "latitude"),
        longitude: coord(body.longitude, -180, 180, "longitude"),
        kmOverride: numberValue(body.km_override, "km_override", 5000),
      });
    } catch (e) {
      throw new PickupError(
        (e as Error).message || "Не удалось рассчитать забор",
        400,
      );
    }
    return { quote };
  }
  if (action === "photos") {
    const { rows } = await db.query("SELECT * FROM pickup_jobs WHERE id=$1", [
      uuid(body.id),
    ]);
    requireValue(rows[0], "Забор не найден");
    if (!actor.dispatcher) {
      requireValue(rows[0].route_id, "Нет маршрута");
      checkRouteAccess(actor, await routeById(db, rows[0].route_id));
    }
    return {
      photos: (
        await db.query(
          "SELECT id,content_type,encode(bytes,'base64') AS base64 FROM pickup_photos WHERE job_id=$1 ORDER BY created_at",
          [body.id],
        )
      ).rows,
    };
  }
  if (action === "save_resource") {
    dispatcherOnly(actor);
    validCity(body.city);
    requireValue(
      ["driver", "vehicle", "depot"].includes(body.kind),
      "Неизвестный вид справочника",
    );
    requireValue(textValue(body.name, 200), "Укажите название / ФИО");
    const id = body.id ? uuid(body.id) : randomUUID();
    const data: Record<string, string> = {};
    for (const key of [
      "login",
      "phone",
      "phoneExtra",
      "type",
      "carrier",
      "plate",
      "model",
      "bodyType",
      "capacityKg",
      "capacityM3",
      "dimensions",
      ...truckFields.map(([field]) => field),
      "truckDangerous",
      "truckExplosive",
      "truckPassIds",
      "pallets",
      "loading",
      "lift",
      "permits",
      "note",
      "address",
      "from",
      "to",
      "directionsUrl",
    ])
      data[key] = textValue(body.data?.[key], 2000);
    if (body.kind === "driver") {
      data.login = data.login.toLowerCase();
      requireValue(
        data.phone && data.login,
        "Укажите телефон и аккаунт водителя",
      );
      const { rows } = await db.query(
        "SELECT id FROM registered_users WHERE lower(trim(login))=$1 AND active=true AND permissions->>'driver'='true'",
        [data.login],
      );
      requireValue(
        rows.length,
        "Выберите активного пользователя с бейджем «Водитель»",
      );
    }
    if (body.kind === "vehicle") {
      requireValue(data.plate, "Укажите госномер");
      for (const [field, label] of truckFields) {
        if (data[field])
          requireValue(
            Number.isFinite(Number(data[field])) &&
              Number(data[field]) > 0 &&
              Number(data[field]) <= 200,
            `Некорректное значение: ${label}`,
          );
      }
      for (const key of ["truckDangerous", "truckExplosive"])
        if (data[key])
          requireValue(["yes", "no"].includes(data[key]), "Выберите тип груза");
      if (data.truckPassIds)
        requireValue(
          data.truckPassIds
            .split(/[,\s]+/)
            .filter(Boolean)
            .every((x) => /^\d+$/.test(x)),
          "Укажите числовые идентификаторы пропусков 2ГИС через запятую",
        );
      for (const key of ["capacityKg", "capacityM3", "pallets"]) {
        if (textValue(body.data?.[key], 200)) numberValue(data[key], key);
      }
    }
    if (body.kind === "depot") {
      requireValue(
        data.address || data.code?.startsWith("WH_"),
        "Укажите адрес склада",
      );
    }
    requireValue(
      validTime(data.from) && validTime(data.to) && data.from < data.to,
      "Укажите рабочее время в пределах дня",
    );
    data.directionsUrl = safeUrl(data.directionsUrl);
    if (body.id) {
      const { rows } = await db.query(
        "SELECT * FROM pickup_resources WHERE id=$1 FOR UPDATE",
        [id],
      );
      requireValue(rows[0] && rows[0].kind === body.kind, "Запись не найдена");
      checkVersion(rows[0], body.version);
      const used = await db.query(
        "SELECT id FROM pickup_routes WHERE status<>'completed' AND (driver_id=$1 OR vehicle_id=$1 OR depot_id=$1)",
        [id],
      );
      requireValue(
        !used.rows.length ||
          (body.active !== false &&
            rows[0].city === body.city &&
            rows[0].data.login === data.login),
        "Нельзя отключить запись, сменить город или аккаунт, пока есть незавершённые маршруты",
      );
      await db.query(
        "UPDATE pickup_resources SET name=$2,city=$3,active=$4,data=$5,version=version+1,updated_at=now() WHERE id=$1",
        [
          id,
          textValue(body.name, 200),
          body.city,
          body.active !== false,
          JSON.stringify(data),
        ],
      );
    } else
      await db.query(
        "INSERT INTO pickup_resources(id,kind,city,name,active,data) VALUES($1,$2,$3,$4,$5,$6)",
        [
          id,
          body.kind,
          body.city,
          textValue(body.name, 200),
          body.active !== false,
          JSON.stringify(data),
        ],
      );
    await event(db, actor, "Справочник обновлён", null, null, {
      resourceId: id,
      kind: body.kind,
    });
    return { id };
  }
  if (action === "delete_resource") {
    dispatcherOnly(actor);
    requireValue(
      body.kind === "driver" || body.kind === "vehicle",
      "Удалять можно только водителей и автомобили",
    );
    const id = uuid(body.id);
    const { rows } = await db.query(
      "SELECT * FROM pickup_resources WHERE id=$1 FOR UPDATE",
      [id],
    );
    requireValue(
      rows[0] && rows[0].kind === body.kind,
      "Запись не найдена",
    );
    checkVersion(rows[0], body.version);
    const openRoute = await db.query(
      `SELECT id FROM pickup_routes
       WHERE status <> 'completed' AND (driver_id = $1 OR vehicle_id = $1)
       LIMIT 1`,
      [id],
    );
    requireValue(
      !openRoute.rows.length,
      "Ресурс на незавершённом маршруте — смените водителя/авто или завершите маршрут",
    );
    const anyRoute = await db.query(
      `SELECT 1 FROM pickup_routes
       WHERE driver_id = $1 OR vehicle_id = $1
       LIMIT 1`,
      [id],
    );
    let archived = false;
    if (anyRoute.rows.length) {
      await db.query(
        "UPDATE pickup_resources SET active=false, version=version+1, updated_at=now() WHERE id=$1",
        [id],
      );
      archived = true;
      await event(db, actor, "Справочник: архив", null, null, {
        resourceId: id,
        kind: body.kind,
      });
    } else {
      await db.query("DELETE FROM pickup_resources WHERE id=$1", [id]);
      await event(db, actor, "Справочник: удаление", null, null, {
        resourceId: id,
        kind: body.kind,
      });
    }
    return { ok: true, archived };
  }
  if (action === "save_job") {
    dispatcherOnly(actor);
    validCity(body.city);
    validDate(body.date);
    const data = normalizeJob(body.data);
    const customer = await db.query(
      "SELECT customer_name FROM cache_customers WHERE inn=$1",
      [data.customerInn],
    );
    const sender = await db.query(
      "SELECT supplier_name FROM cache_suppliers WHERE inn=$1",
      [data.senderInn],
    );
    requireValue(
      customer.rows[0] && sender.rows[0],
      "Выберите заказчика и отправителя из справочников",
    );
    data.customerName = customer.rows[0].customer_name;
    data.senderName = sender.rows[0].supplier_name;
    const id = body.id ? uuid(body.id) : randomUUID();
    if (body.id) {
      const search = pickupJobSearchColumns(data);
      const { rows } = await db.query(
        "SELECT *, to_char(date,'YYYY-MM-DD') AS date FROM pickup_jobs WHERE id=$1 FOR UPDATE",
        [id],
      );
      const job: Job = rows[0];
      requireValue(job, "Забор не найден");
      checkVersion(job, body.version);
      requireValue(
        job.status !== "cancelled",
        "Отменённый забор нельзя изменить",
      );
      requireValue(
        job.status === "pending",
        "Редактировать можно только забор, который ещё не начат",
      );
      if (job.route_id) {
        const route = await routeById(db, job.route_id);
        requireValue(route.status !== "completed", "Маршрут завершён");
        requireValue(
          body.city === job.city && body.date === job.date,
          "Чтобы сменить дату или город, сначала снимите забор с маршрута",
        );
        if (route.status !== "draft") {
          const assigned: Job[] = (
            await db.query("SELECT * FROM pickup_jobs WHERE route_id=$1", [
              route.id,
            ])
          ).rows;
          const merged = assigned.map((j) =>
            j.id === job.id ? { ...j, data } : j,
          );
          const warnings = routeWarnings(merged, route.snapshot.vehicle);
          requireValue(
            !warnings.some((w) => w.startsWith("Превышен")),
            warnings.join(" "),
          );
          requireValue(
            data.windowTo > route.start_time &&
              data.windowFrom < (route.snapshot.depot?.data.to ?? "23:59"),
            "Окно забора вне времени маршрута / склада",
          );
        }
      }
      await db.query(
        `UPDATE pickup_jobs SET data=$2,city=$3,date=$4,
          zayavka_number=$5,cargo_number=$6,customer_inn=$7,sender_inn=$8,
          version=version+1,updated_at=now() WHERE id=$1`,
        [
          id,
          JSON.stringify(data),
          body.city,
          body.date,
          search.zayavka_number,
          search.cargo_number,
          search.customer_inn,
          search.sender_inn,
        ],
      );
      if (job.route_id) {
        await db.query(
          "UPDATE pickup_routes SET version=version+1,updated_at=now() WHERE id=$1",
          [job.route_id],
        );
        await event(db, actor, "Забор изменён", job.route_id, id);
      } else await event(db, actor, "Забор сохранён", null, id);
      await persistJobContactsToSenderDirectory(db, data.senderInn, data);
      return { id };
    }

    const schedule = parsePickupScheduleBody(body);
    const dates = expandPickupScheduleDates(schedule);
    const groupId = dates.length > 1 ? randomUUID() : "";
    const scheduleMeta = scheduleMetaForJobData(schedule, groupId);
    const ids: string[] = [];

    for (let i = 0; i < dates.length; i++) {
      const jobId = i === 0 ? id : randomUUID();
      const jobData = { ...data, ...scheduleMeta };
      const search = pickupJobSearchColumns(jobData);
      await db.query(
        `INSERT INTO pickup_jobs(id,city,date,data,zayavka_number,cargo_number,customer_inn,sender_inn)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          jobId,
          body.city,
          dates[i],
          JSON.stringify(jobData),
          search.zayavka_number,
          search.cargo_number,
          search.customer_inn,
          search.sender_inn,
        ],
      );
      ids.push(jobId);
      await event(db, actor, "Забор сохранён", null, jobId, {
        schedule:
          dates.length > 1
            ? { groupId, index: i + 1, total: dates.length }
            : {},
      });
    }
    await persistJobContactsToSenderDirectory(db, data.senderInn, data);
    return { id: ids[0], ids, createdCount: ids.length };
  }
  if (action === "save_route") {
    dispatcherOnly(actor);
    validCity(body.city);
    validDate(body.date);
    requireValue(
      textValue(body.name, 200) && validTime(body.start_time),
      "Укажите название и время старта",
    );
    body.depot_id = await ensureHaulzDepot(db, body.city);
    const resources = await routeResources(db, body);
    const id = body.id ? uuid(body.id) : randomUUID();
    const existing = body.id ? await routeById(db, id) : undefined;
    const mode = body.start_mode ?? existing?.snapshot.start?.mode ?? "depot";
    requireValue(mode === "depot" || mode === "address", "Выберите место старта");
    const rawAddress = body.start_address ?? existing?.snapshot.start?.address ?? "";
    requireValue(typeof rawAddress === "string" && rawAddress.length <= 1000, "Некорректный адрес старта");
    const address = mode === "address" ? rawAddress.trim() : "";
    requireValue(mode !== "address" || address.length > 0, "Укажите адрес старта маршрута");
    const snapshot = { ...resources, start: { mode, address } };
    if (body.id) {
      const route = existing!;
      checkVersion(route, body.version);
      requireValue(
        route.status === "draft",
        "Параметры маршрута можно менять только в черновике",
      );
      requireValue(
        route.city === body.city && route.date === body.date,
        "Создайте новый маршрут для другого города или дня",
      );
      await db.query(
        "UPDATE pickup_routes SET name=$2,driver_id=$3,vehicle_id=$4,depot_id=$5,start_time=$6,snapshot=$7,version=version+1,updated_at=now() WHERE id=$1",
        [
          id,
          textValue(body.name, 200),
          body.driver_id,
          body.vehicle_id,
          body.depot_id,
          body.start_time,
          JSON.stringify(snapshot),
        ],
      );
    } else
      await db.query(
        "INSERT INTO pickup_routes(id,city,date,name,driver_id,vehicle_id,depot_id,start_time,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          id,
          body.city,
          body.date,
          textValue(body.name, 200),
          body.driver_id,
          body.vehicle_id,
          body.depot_id,
          body.start_time,
          JSON.stringify(snapshot),
        ],
      );
    await event(db, actor, "Маршрут сохранён", id);
    return { id };
  }
  if (action === "delete_route") {
    dispatcherOnly(actor);
    return deletePickupRoute(db, {
      routeId: uuid(body.id),
      version: body.version,
      allowCompletedDelete: pickupMayDeleteCompletedRoute(actor.permissions),
      actorLogin: actor.login,
      logEvent: (actionName, routeId, jobId, data) =>
        event(db, actor, actionName, routeId, jobId, data ?? {}),
    });
  }
  if (action === "assign_many") {
    dispatcherOnly(actor);
    requireValue(
      Array.isArray(body.jobs) &&
        body.jobs.length > 0 &&
        body.jobs.length <= 100,
      "Выберите от 1 до 100 заборов",
    );
    const ids = body.jobs.map((item: any) => uuid(item.id));
    requireValue(
      new Set(ids).size === ids.length,
      "Заборы не должны повторяться",
    );
    const route = await routeById(db, body.route_id);
    checkVersion(route, body.route_version);
    requireValue(
      route.status === "draft" || route.status === "published",
      "Выберите маршрут, который ещё не начат",
    );
    // All assignments share the outer transaction and receipt. Any failure rolls back the entire batch.
    for (const item of body.jobs) {
      const { rows } = await db.query(
        "SELECT route_id,status FROM pickup_jobs WHERE id=$1 FOR UPDATE",
        [uuid(item.id)],
      );
      requireValue(
        rows[0] && !rows[0].route_id && rows[0].status === "pending",
        "Один из заборов уже назначен или начат. Обновите план дня",
      );
      await perform(db, actor, {
        action: "assign",
        id: item.id,
        version: item.version,
        route_id: route.id,
      });
    }
    const jobs: Job[] = (
      await db.query(
        "SELECT * FROM pickup_jobs WHERE route_id=$1 AND status<>'cancelled'",
        [route.id],
      )
    ).rows;
    const snapshot = await routeResources(db, route);
    const warnings = routeWarnings(jobs, snapshot.vehicle);
    requireValue(
      !warnings.some((w) => w.startsWith("Превышен")),
      warnings.join(" "),
    );
    requireValue(
      jobs.every(
        (j) =>
          j.data.windowTo > route.start_time &&
          j.data.windowFrom < snapshot.driver.data.to &&
          j.data.windowFrom < snapshot.depot.data.to,
      ),
      "Есть точки вне времени маршрута / работы склада",
    );
    return { ok: true, assignedCount: body.jobs.length };
  }
  if (action === "assign") {
    dispatcherOnly(actor);
    const { rows } = await db.query(
      "SELECT *,to_char(date,'YYYY-MM-DD') AS date FROM pickup_jobs WHERE id=$1 FOR UPDATE",
      [uuid(body.id)],
    );
    const job: Job = rows[0];
    requireValue(job, "Забор не найден");
    checkVersion(job, body.version);
    requireValue(
      job.status === "pending",
      "Начатый забор нельзя переназначить",
    );
    const oldRoute = job.route_id ? await routeById(db, job.route_id) : null;
    if (oldRoute)
      requireValue(oldRoute.status !== "completed", "Маршрут завершён");
    const route = body.route_id ? await routeById(db, body.route_id) : null;
    if (route)
      requireValue(
        route.status !== "completed" &&
          route.city === job.city &&
          route.date === job.date,
        "Маршрут должен быть открыт и совпадать по городу и дате",
      );
    if (route && route.id !== oldRoute?.id && route.status !== "draft") {
      const assigned: Job[] = (
        await db.query(
          "SELECT * FROM pickup_jobs WHERE route_id=$1 AND status<>'cancelled'",
          [route.id],
        )
      ).rows;
      const warnings = routeWarnings(
        [...assigned, job],
        route.snapshot.vehicle,
      );
      requireValue(
        !warnings.some((w) => w.startsWith("Превышен")),
        warnings.join(" "),
      );
      requireValue(
        job.data.windowTo > route.start_time &&
          job.data.windowFrom < (route.snapshot.depot?.data.to ?? "23:59"),
        "Окно забора вне времени маршрута / склада",
      );
    }
    const { rows: positions } = await db.query(
      "SELECT COALESCE(max(position),0)+1 AS next FROM pickup_jobs WHERE route_id=$1",
      [route?.id ?? null],
    );
    await db.query(
      "UPDATE pickup_jobs SET route_id=$2,position=$3,version=version+1,updated_at=now() WHERE id=$1",
      [job.id, route?.id ?? null, positions[0].next],
    );
    for (const rid of new Set([oldRoute?.id, route?.id].filter(Boolean))) {
      await db.query(
        "UPDATE pickup_routes SET version=version+1,updated_at=now() WHERE id=$1",
        [rid],
      );
      await event(db, actor, "Состав маршрута изменён", rid!, job.id);
    }
    return { ok: true };
  }
  if (
    ["reorder", "publish", "start", "acknowledge", "deposit"].includes(action)
  ) {
    const route = await routeById(db, body.id);
    checkRouteAccess(actor, route);
    checkVersion(route, body.version);
    const jobs: Job[] = (
      await db.query(
        "SELECT * FROM pickup_jobs WHERE route_id=$1 AND status<>'cancelled' ORDER BY position,created_at",
        [route.id],
      )
    ).rows;
    if (action === "reorder") {
      if (body.analysisSignature) {
        dispatcherOnly(actor);
        const current = await readCheckInput(db, route.id);
        requireValue(
          checkSignature(current) === body.analysisSignature,
          "Маршрут, задания или справочники изменились. Повторите проверку маршрута.",
        );
        const age = Date.now() - Date.parse(body.checkedAt);
        requireValue(
          Number.isFinite(age) && age >= -30000 && age <= 10 * 60000,
          "Расчёт устарел. Повторите проверку маршрута.",
        );
      }
      const byDriver = !actor.dispatcher || body.asDriver === true;
      if (byDriver) {
        if (
          !actor.driver ||
          route.snapshot.driver?.data.login !== actor.login ||
          route.status === "draft"
        )
          throw new PickupError(
            "Можно менять порядок только своего опубликованного маршрута",
            403,
          );
        requireValue(
          route.status !== "started" ||
            route.acknowledged_version === route.version,
          "Сначала ознакомьтесь с изменениями диспетчера",
        );
      }
      requireValue(route.status !== "completed", "Маршрут завершён");
      requireValue(
        Array.isArray(body.ids) &&
          body.ids.length === jobs.length &&
          new Set(body.ids).size === jobs.length &&
          jobs.every((j) => body.ids.includes(j.id)),
        "Порядок должен содержать все задания ровно один раз",
      );
      jobs.forEach((j, i) => {
        if (j.status !== "pending")
          requireValue(
            body.ids[i] === j.id,
            "Начатые и выполненные точки зафиксированы",
          );
      });
      for (let i = 0; i < body.ids.length; i++)
        await db.query(
          "UPDATE pickup_jobs SET position=$2,version=version+1 WHERE id=$1",
          [body.ids[i], i + 1],
        );
      await db.query(
        `UPDATE pickup_routes SET version=version+1,updated_at=now(),
         acknowledged_version=CASE WHEN $2::boolean AND status='started' THEN version+1 ELSE acknowledged_version END WHERE id=$1`,
        [route.id, byDriver],
      );
    }
    if (action === "publish") {
      dispatcherOnly(actor);
      requireValue(
        route.status === "draft" && jobs.length,
        "Добавьте заборы в черновик маршрута",
      );
      const snapshot = { ...await routeResources(db, route), start: route.snapshot.start };
      requireValue(
        route.start_time >= snapshot.driver.data.from &&
          route.start_time < snapshot.driver.data.to,
        "Старт вне смены водителя",
      );
      requireValue(
        jobs.every(
          (j) =>
            j.data.windowTo > route.start_time &&
            j.data.windowFrom < snapshot.driver.data.to &&
            j.data.windowFrom < snapshot.depot.data.to,
        ),
        "Есть точки вне времени маршрута / работы склада",
      );
      const warnings = routeWarnings(jobs, snapshot.vehicle);
      requireValue(
        !warnings.some((w) => w.startsWith("Превышен")),
        warnings.join(" "),
      );
      await db.query(
        "UPDATE pickup_routes SET status='published',snapshot=$2,version=version+1,updated_at=now() WHERE id=$1",
        [route.id, JSON.stringify(snapshot)],
      );
    }
    if (action === "start") {
      requireValue(
        route.status === "published",
        "Начать можно только опубликованный маршрут",
      );
      const busy = await db.query(
        "SELECT id FROM pickup_routes WHERE status='started' AND id<>$1 AND (driver_id=$2 OR vehicle_id=$3)",
        [route.id, route.driver_id, route.vehicle_id],
      );
      requireValue(
        !busy.rows.length,
        "Водитель или автомобиль ещё выполняет другой маршрут",
      );
      await db.query(
        "UPDATE pickup_routes SET status='started',acknowledged_version=version,updated_at=now() WHERE id=$1",
        [route.id],
      );
    }
    if (action === "acknowledge") {
      requireValue(
        route.status === "published" || route.status === "started",
        "Маршрут недоступен для подтверждения",
      );
      await db.query(
        "UPDATE pickup_routes SET acknowledged_version=version WHERE id=$1",
        [route.id],
      );
    }
    if (action === "deposit") {
      requireValue(route.status === "started", "Маршрут ещё не начат");
      requireValue(
        jobs.length &&
          jobs.every((j) =>
            ["picked_up", "partial", "resolved", "deposited"].includes(
              j.status,
            ),
          ),
        "Остались незавершённые заборы или проблемы без решения диспетчера",
      );
      requireValue(
        jobs.every((j) => j.status !== "partial" || j.resolution),
        "Диспетчер должен принять решение по частичному забору",
      );
      const missing = jobs.filter(pickupJobNeedsZayavka);
      const entries = body.zayavka_numbers ?? [];
      requireValue(
        Array.isArray(entries) && entries.length <= jobs.length,
        "Некорректный список номеров заявок",
      );
      const numbers = new Map<string, string>();
      for (const entry of entries) {
        const job = missing.find((j) => j.id === entry?.id);
        requireValue(
          job && !numbers.has(job.id),
          "Укажите заявку только для забора этого маршрута с незаполненным номером",
        );
        checkVersion(job, entry.version);
        requireValue(
          typeof entry.number === "string" &&
            entry.number.trim().length > 0 &&
            entry.number.trim().length <= 100,
          "Введите номер заявки: от 1 до 100 символов",
        );
        numbers.set(job.id, entry.number.trim());
      }
      requireValue(
        missing.every((job) => numbers.has(job.id)),
        "Заполните поле «Заявка» для каждого забранного груза перед сдачей на склад",
      );
      // Save request numbers and the handoff in the same transaction.
      for (const job of missing) {
        const number = numbers.get(job.id)!;
        await db.query(
          `UPDATE pickup_jobs SET data=jsonb_set(data,'{zayavkaNumber}',to_jsonb($2::text)),
           zayavka_number=$2,version=version+1,updated_at=now() WHERE id=$1`,
          [job.id, number],
        );
        await event(
          db,
          actor,
          "Заявка указана при сдаче на склад",
          route.id,
          job.id,
          { note: `Заявка № ${number}` },
        );
      }
      await db.query(
        "UPDATE pickup_jobs SET status='deposited',version=version+1,updated_at=now() WHERE route_id=$1 AND status IN ('picked_up','partial')",
        [route.id],
      );
      await db.query(
        "UPDATE pickup_routes SET status='completed',updated_at=now() WHERE id=$1",
        [route.id],
      );
    }
    await event(
      db,
      actor,
      (
        {
          reorder:
            !actor.dispatcher || body.asDriver === true
              ? "Водитель изменил порядок точек"
              : "Порядок точек изменён",
          publish: "Маршрут опубликован",
          start: "Водитель приступил",
          acknowledge: "Изменения просмотрены",
          deposit: "Грузы сданы на склад",
        } as Record<string, string>
      )[action],
      route.id,
    );
    return { ok: true };
  }
  if (action === "cancel") {
    const { rows } = await db.query(
      "SELECT *,to_char(date,'YYYY-MM-DD') AS date FROM pickup_jobs WHERE id=$1 FOR UPDATE",
      [uuid(body.id)],
    );
    const job: Job = rows[0];
    requireValue(job, "Забор не найден");
    checkVersion(job, body.version);
    requireValue(textValue(body.note, 3000), "Укажите причину отмены");
    requireValue(
      pickupJobCanCancel(job.status),
      "Этот забор уже нельзя отменить",
    );
    const routeId = job.route_id;
    if (actor.dispatcher) {
      /* диспетчер — любой допустимый статус */
    } else {
      requireValue(routeId, "Забор не на вашем маршруте");
      const route = await routeById(db, routeId);
      checkRouteAccess(actor, route);
      requireValue(route.status !== "completed", "Маршрут завершён");
    }
    await db.query(
      `UPDATE pickup_jobs SET status='cancelled', resolution=$2, route_id=NULL, position=0,
        version=version+1, updated_at=now() WHERE id=$1`,
      [job.id, textValue(body.note, 3000)],
    );
    if (routeId) {
      await db.query(
        "UPDATE pickup_routes SET version=version+1,updated_at=now() WHERE id=$1",
        [routeId],
      );
      await event(db, actor, "Забор отменён", routeId, job.id, {
        note: textValue(body.note, 3000),
      });
    } else {
      await event(db, actor, "Забор отменён", null, job.id, {
        note: textValue(body.note, 3000),
      });
    }
    return { ok: true };
  }
  if (action === "delete_job") {
    dispatcherOnly(actor);
    const { rows } = await db.query(
      "SELECT *, to_char(date,'YYYY-MM-DD') AS date FROM pickup_jobs WHERE id=$1 FOR UPDATE",
      [uuid(body.id)],
    );
    const job: Job = rows[0];
    requireValue(job, "Забор не найден");
    checkVersion(job, body.version);
    const allowFinishedDelete = pickupMayDeleteCompletedRoute(actor.permissions);
    const standardDelete = pickupJobCanDelete(job.status);
    const powerFinishedDelete =
      allowFinishedDelete && pickupJobIsFinishedForCleanup(job.status);
    let deleteDeniedMessage = "Удалить можно только ожидающий или отменённый забор";
    if (pickupJobIsFinishedForCleanup(job.status)) {
      deleteDeniedMessage =
        "Завершённые заборы могут удалять пользователи с доступом в CMS, служебным режимом, аналитикой и HAULZ";
    } else if (!standardDelete) {
      deleteDeniedMessage =
        "Забор в процессе выполнения нельзя удалить — отмените или дождитесь завершения";
    }
    requireValue(standardDelete || powerFinishedDelete, deleteDeniedMessage);
    const routeId = job.route_id;
    if (routeId && standardDelete) {
      const route = await routeById(db, routeId);
      requireValue(route.status !== "completed", "Маршрут завершён");
      requireValue(
        job.status === "pending",
        "Снимите начатый забор с маршрута или отмените его",
      );
    }
    await db.query("DELETE FROM pickup_photos WHERE job_id=$1", [job.id]);
    await db.query("UPDATE pickup_events SET job_id=NULL WHERE job_id=$1", [
      job.id,
    ]);
    await db.query("DELETE FROM pickup_jobs WHERE id=$1", [job.id]);
    if (routeId) {
      await db.query(
        "UPDATE pickup_routes SET version=version+1,updated_at=now() WHERE id=$1",
        [routeId],
      );
      await event(db, actor, "Забор удалён", routeId, null, { jobId: job.id });
    } else {
      await event(db, actor, "Забор удалён", null, null, { jobId: job.id });
    }
    return { ok: true };
  }
  if (["arrive", "complete", "problem", "resolve"].includes(action)) {
    const { rows } = await db.query(
      "SELECT * FROM pickup_jobs WHERE id=$1 FOR UPDATE",
      [uuid(body.id)],
    );
    const job: Job = rows[0];
    requireValue(job?.route_id, "Забор не назначен на маршрут");
    const route = await routeById(db, job.route_id);
    checkRouteAccess(actor, route);
    checkVersion(job, body.version);
    requireValue(route.status === "started", "Маршрут должен быть начат");
    if (!actor.dispatcher)
      requireValue(
        route.acknowledged_version === route.version,
        "Ознакомьтесь с изменениями маршрута",
      );
    if (action === "resolve") {
      dispatcherOnly(actor);
      requireValue(
        ["problem", "partial"].includes(job.status),
        "Нет проблемы для решения",
      );
      requireValue(
        textValue(body.note),
        "Опишите решение и что делать с остатком",
      );
      await db.query(
        "UPDATE pickup_jobs SET resolution=$2,status=CASE WHEN status='problem' THEN 'resolved' ELSE status END,version=version+1,updated_at=now() WHERE id=$1",
        [job.id, textValue(body.note, 3000)],
      );
    } else {
      requireValue(
        ["pending", "arrived"].includes(job.status),
        "По этому забору уже зафиксирован результат",
      );
      if (action === "complete") {
        const count = validateCompletion(job, body.actual_places, body.note);
        requireValue(
          Array.isArray(body.photos) &&
            body.photos.length >= 1 &&
            body.photos.length <= 3,
          "Приложите от 1 до 3 фото",
        );
        for (const photo of body.photos) {
          requireValue(
            typeof photo === "string" &&
              /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo),
            "Принимаются фотографии JPEG",
          );
          const bytes = Buffer.from(photo.split(",")[1], "base64");
          requireValue(
            bytes.length <= 900000 &&
              bytes.length > 4 &&
              bytes[0] === 255 &&
              bytes[1] === 216 &&
              bytes[2] === 255,
            "Фото должно быть JPEG размером до 900 КБ",
          );
          await db.query(
            "INSERT INTO pickup_photos(id,job_id,content_type,bytes) VALUES($1,$2,'image/jpeg',$3)",
            [randomUUID(), job.id, bytes],
          );
        }
        await db.query(
          "UPDATE pickup_jobs SET status=$2,actual_places=$3,note=$4,version=version+1,updated_at=now() WHERE id=$1",
          [
            job.id,
            count !== plannedPlaces(job.data) ? "partial" : "picked_up",
            count,
            textValue(body.note, 3000),
          ],
        );
      } else {
        if (action === "problem")
          requireValue(textValue(body.note), "Укажите причину проблемы");
        await db.query(
          "UPDATE pickup_jobs SET status=$2,note=$3,version=version+1,updated_at=now() WHERE id=$1",
          [
            job.id,
            action === "arrive" ? "arrived" : "problem",
            textValue(body.note, 3000),
          ],
        );
      }
    }
    await event(
      db,
      actor,
      (
        {
          arrive: "Прибыл на точку",
          complete: "Груз забран",
          problem: "Проблема на точке",
          resolve: "Решение диспетчера",
        } as Record<string, string>
      )[action],
      route.id,
      job.id,
      {
        note: textValue(body.note, 3000),
        ...(action === "complete" ? { actualPlaces: body.actual_places } : {}),
      },
    );
    return { ok: true };
  }
  throw new PickupError("Неизвестное действие");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (respondCorsPreflight(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST")
    return res.status(405).json({ error: "Используйте POST" });
  if (isRateLimited("pickup", getClientIp(req), ADMIN_API_LIMIT))
    return res.status(429).json({ error: "Слишком много запросов" });
  let db: PoolClient | undefined;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    requireValue(body && typeof body === "object", "Некорректный запрос");
    const login = textValue(body.login, 200).toLowerCase();
    requireValue(
      login && typeof body.password === "string",
      "Требуется вход в приложение",
    );
    db = await getPool().connect();
    const { rows } = await db.query(
      "SELECT password_hash,permissions FROM registered_users WHERE lower(trim(login))=$1 AND active=true",
      [login],
    );
    const user = rows[0];
    if (!user || !verifyPassword(body.password, user.password_hash))
      throw new PickupError("Неверный логин или пароль", 401);
    const actor: Actor = {
      login,
      dispatcher: user.permissions?.dispatcher === true,
      driver: user.permissions?.driver === true,
      permissions: user.permissions ?? {},
    };
    if (!actor.dispatcher && !actor.driver)
      throw new PickupError("Нет доступа к заборной логистике", 403);
    if (body.action === "check_route") {
      dispatcherOnly(actor);
      if (isRateLimited("pickup-route-check", login, 2))
        throw new PickupError(
          "Не более двух проверок маршрута в минуту. Повторите чуть позже.",
          429,
        );
      requireValue(
        body.startAddress == null || typeof body.startAddress === "string",
        "Некорректный адрес старта",
      );
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const input = await readCheckInput(db, body.id);
      checkVersion(input.route, body.version);
      await db.query("COMMIT");
      // Release the connection and all database locks before paid network requests.
      db.release();
      db = undefined;
      return res
        .status(200)
        .json(
          await checkRoute(input, {
            startAddress: body.startAddress,
            windowsConfirmed: body.windowsConfirmed === true,
          }),
        );
    }
    const mutation = ![
      // GPS uses monotonic measured_at upserts; no receipt for each periodic fix.
      "location",
      "snapshot",
      "directory",
      "photos",
      "customer_quote",
      "sender_defaults",
    ].includes(body.action);
    if (mutation) uuid(body.requestId);
    await db.query("BEGIN");
    // Small dispatch workload: serialize writes to protect assignments, capacities and idempotency.
    if (mutation) {
      await db.query("SELECT pg_advisory_xact_lock(104,1)");
      const receipt = await db.query(
        "SELECT result FROM pickup_receipts WHERE actor=$1 AND request_id=$2",
        [login, body.requestId],
      );
      if (receipt.rows[0]) {
        await db.query("COMMIT");
        return res.status(200).json(receipt.rows[0].result);
      }
    }
    const result = await perform(db, actor, body);
    if (mutation)
      await db.query(
        "INSERT INTO pickup_receipts(actor,request_id,result) VALUES($1,$2,$3)",
        [login, body.requestId, JSON.stringify(result)],
      );
    await db.query("COMMIT");
    return res.status(200).json(result);
  } catch (error: any) {
    if (db) await db.query("ROLLBACK").catch(() => {});
    const missing = error?.code === "42P01";
    const missingColumn = error?.code === "42703";
    const status =
      error instanceof PickupError
        ? error.status
        : missing
          ? 503
          : error?.code === "23505"
            ? 409
            : 500;
    return res.status(status).json({
      error:
        error instanceof PickupError
          ? error.message
          : missingColumn
            ? "Примените миграцию migrations/105_pickup_jobs_search_columns.sql"
            : missing
              ? "Модуль ещё не настроен: примените миграцию 104_pickup_dispatch.sql"
              : status === 409
                ? "Аккаунт уже связан с другим водителем"
                : "Не удалось выполнить действие. Повторите позже.",
    });
  } finally {
    db?.release();
  }
}
