import { it, expect, vi, afterEach } from "vitest";
vi.mock("../haulzCalculator/dgisClient.js", () => ({
  getDgisApiKey: () => "fixture-key-not-real",
}));
import { createRouteProvider } from "./routeProvider";
afterEach(() => vi.unstubAllGlobals());
const options = {
  truck: { mass: 6, height: 3 },
  traffic: "jam" as const,
  utc: 1800000000,
};
it("builds directed truck pairs with traffic/time and validates matching response coordinates", async () => {
  const calls: any[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      calls.push(body);
      return new Response(
        JSON.stringify(
          body.points.map(([a, b]: any) => ({
            status: "OK",
            distance: a.lon < b.lon ? 1000 : 2000,
            duration: 600,
            lat1: a.lat,
            lon1: a.lon,
            lat2: b.lat,
            lon2: b.lon,
          })),
        ),
      );
    }),
  );
  const { provider, dispose } = createRouteProvider();
  try {
    const matrix = await provider.matrix(
      [
        { lat: 55, lon: 37 },
        { lat: 55.1, lon: 37.1 },
        { lat: 55.2, lon: 37.2 },
        { lat: 55, lon: 37 },
      ],
      options,
    );
    expect(matrix[1][2]?.distance).toBe(1000);
    expect(matrix[2][1]?.distance).toBe(2000);
    expect(matrix[0][3]?.distance).toBe(0);
    expect(calls[0]).toMatchObject({
      transport: "truck",
      params: { truck: { mass: 6, height: 3 } },
      traffic_mode: "jam",
      utc: options.utc,
    });
  } finally {
    dispose();
  }
});
it("does not leak the key or provider error message on denied access", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { message: "fixture-key-not-real" } }),
          { status: 403 },
        ),
    ),
  );
  const { provider, dispose } = createRouteProvider();
  try {
    await expect(provider.geocode("Москва")).rejects.toThrow("не даёт доступ");
  } finally {
    dispose();
  }
});
it("extracts real road geometry and reports ignored restrictions", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: "OK",
            result: [
              {
                features: { truck: "full" },
                are_truck_pass_zones_ignored: true,
                maneuvers: [
                  {
                    outcoming_path: {
                      geometry: [
                        { selection: "LINESTRING(37.1 55.1, 37.2 55.2)" },
                      ],
                    },
                  },
                ],
              },
            ],
          }),
        ),
    ),
  );
  const { provider, dispose } = createRouteProvider();
  try {
    const result = await provider.geometry(
      [
        { lat: 55.1, lon: 37.1 },
        { lat: 55.2, lon: 37.2 },
      ],
      options,
    );
    expect(result.lines).toEqual([
      [
        [55.1, 37.1],
        [55.2, 37.2],
      ],
    ]);
    expect(result.warnings.join()).toContain("пропусков");
  } finally {
    dispose();
  }
});
