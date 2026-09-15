import { it, expect, vi } from "vitest";
import { checkRoute, checkSignature, type CheckInput } from "./checkRoute";
import type { RouteProvider } from "./routeProvider";
const now = Date.parse("2026-09-16T06:00:00Z");
function input(): CheckInput {
  const data = {
    address: "Москва, склад",
    from: "08:00",
    to: "18:00",
    capacityKg: "5000",
    capacityM3: "20",
    truckMaxMass: "8",
    truckMass: "6",
    truckAxleLoad: "3",
    truckHeight: "3",
    truckWidth: "2",
    truckLength: "6",
    truckDangerous: "no",
    truckExplosive: "no",
  };
  return {
    route: {
      id: "r",
      status: "draft",
      city: "moscow",
      date: "2026-09-16",
      start_time: "09:00",
      version: 1,
      snapshot: {},
    } as any,
    jobs: [
      {
        id: "a",
        version: 1,
        status: "pending",
        position: 1,
        data: {
          senderName: "Отправитель",
          address: "Москва, точка",
          latitude: 55.75,
          longitude: 37.6,
          windowFrom: "09:00",
          windowTo: "18:00",
          serviceMinutes: 20,
          weightKg: 10,
          volumeM3: 1,
        },
      },
    ] as any,
    resources: { driver: { data }, vehicle: { data }, depot: { data } } as any,
    events: [],
  };
}
const provider = (): RouteProvider => ({
  geocode: vi.fn(async () => ({ lat: 55.76, lon: 37.61 })),
  matrix: vi.fn(async (points) =>
    points.map(() => points.map(() => ({ distance: 1000, duration: 600 }))),
  ),
  geometry: vi.fn(async () => ({
    lines: [
      [
        [55.75, 37.6],
        [55.76, 37.61],
      ],
    ],
    warnings: [],
  })),
});
it("uses truck parameters and timezone-aware departure; green only with complete data", async () => {
  const p = provider(),
    r = await checkRoute(input(), { windowsConfirmed: true }, p, now);
  expect(r.status).toBe("green");
  expect(r.current?.minutes).toBe(40);
  expect(p.matrix).toHaveBeenCalledWith(
    expect.any(Array),
    expect.objectContaining({
      utc: now / 1000,
      traffic: "jam",
      truck: expect.objectContaining({
        mass: 6,
        height: 3,
        dangerous_cargo: false,
      }),
    }),
  );
  const i = input();
  i.route.city = "kaliningrad";
  i.jobs[0].data.latitude = 54.7;
  i.jobs[0].data.longitude = 20.5;
  p.geocode = async () => ({ lat: 54.7, lon: 20.5 });
  const k = await checkRoute(i, { windowsConfirmed: true }, p, now);
  expect(k.departure).toBe("2026-09-16T07:00:00.000Z");
  expect(k.traffic).toBe("statistics");
});
it("gray on missing truck parameters, unconfirmed hours, ignored permits or ambiguous geocode", async () => {
  const i = input();
  delete i.resources.vehicle!.data.truckHeight;
  expect(
    (await checkRoute(i, { windowsConfirmed: true }, provider(), now)).status,
  ).toBe("gray");
  expect((await checkRoute(input(), {}, provider(), now)).status).toBe("gray");
  const p = provider();
  p.geometry = async () => ({ lines: [], warnings: ["Не учтены пропуски"] });
  expect(
    (await checkRoute(input(), { windowsConfirmed: true }, p, now)).status,
  ).toBe("gray");
  p.geocode = async () => null;
  const r = await checkRoute(input(), { windowsConfirmed: true }, p, now);
  expect(r.current).toBeUndefined();
  expect(r.warnings.join()).toContain("однозначно");
});
it("excludes unreliable GPS; uses an explicit stop landmark or asks for start", async () => {
  const i = input();
  i.route.status = "started";
  i.location = {
    latitude: 0,
    longitude: 0,
    accuracy: 10,
    measured_at: new Date(now).toISOString(),
    warning: "jump",
  } as any;
  const p = provider();
  expect(
    (await checkRoute(i, { windowsConfirmed: true }, p, now)).current,
  ).toBeUndefined();
  expect(p.matrix).not.toHaveBeenCalled();
  i.events = [
    {
      route_id: "r",
      job_id: "a",
      action: "Прибыл на точку",
      created_at: new Date(now).toISOString(),
    },
  ] as any;
  const r = await checkRoute(i, { windowsConfirmed: true }, p, now);
  expect(r.originLabel).toContain("Ориентир");
  expect(r.status).toBe("gray");
  expect(vi.mocked(p.matrix).mock.calls[0][0][0]).toEqual({
    lat: 55.75,
    lon: 37.6,
  });
});
it("red for capacity violations; leaves source data unchanged", async () => {
  const i = input();
  i.resources.vehicle!.data.capacityKg = "1";
  const before = JSON.stringify(i);
  const r = await checkRoute(i, { windowsConfirmed: true }, provider(), now);
  expect(r.status).toBe("red");
  expect(JSON.stringify(i)).toBe(before);
});
it("limits size and rejects invalid windows without paid requests", async () => {
  const i = input(),
    p = provider();
  i.jobs = Array.from({ length: 21 }, () => i.jobs[0]);
  expect((await checkRoute(i, {}, p, now)).current).toBeUndefined();
  expect(p.geocode).not.toHaveBeenCalled();
  const bad = input();
  bad.jobs[0].data.windowTo = "bad";
  expect((await checkRoute(bad, {}, p, now)).current).toBeUndefined();
  expect(p.matrix).not.toHaveBeenCalled();
});

it("invalidates an assessment when running driver's GPS becomes unreliable", () => {
  const i = input();
  i.route.status = "started";
  i.location = {
    latitude: 55.75,
    longitude: 37.6,
    accuracy: 10,
    measured_at: new Date(now).toISOString(),
  } as any;
  const before = checkSignature(i);
  i.location!.warning = "Резкий скачок координат";
  expect(checkSignature(i)).not.toBe(before);
});

it("uses the saved start address for planned routes and allows a one-off calculation override", async () => {
  const data = input();
  data.route.snapshot.start = { mode: "address", address: "Москва, стоянка" };
  const routing = provider();
  const result = await checkRoute(data, { windowsConfirmed: true }, routing, now);
  expect(result.originLabel).toContain("Москва, стоянка");
  expect(routing.geocode).toHaveBeenCalledWith("Москва, стоянка");
  expect(routing.geocode).toHaveBeenCalledWith("Москва, склад");
  const override = await checkRoute(data, { windowsConfirmed: true, startAddress: "Москва, другой адрес" }, provider(), now);
  expect(override.originLabel).toContain("Москва, другой адрес");
  expect(data.route.snapshot.start.address).toBe("Москва, стоянка");
});

it("does not use the original start for a running route with unreliable GPS and no completed stops", async () => {
  const data = input();
  data.route.status = "started";
  data.route.snapshot.start = { mode: "address", address: "Москва, стоянка" };
  const result = await checkRoute(data, { windowsConfirmed: true }, provider(), now);
  expect(result.status).toBe("gray");
  expect(result.warnings.join(" ")).toContain("GPS ненадёжен");
});
