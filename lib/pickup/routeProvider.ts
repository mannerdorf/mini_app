import { getDgisApiKey } from "../haulzCalculator/dgisClient.js";
import { requestFetch } from "../requestCancellation.js";
import {
  DgisRouteError,
  dgisErrorMessage,
  sanitizeDgisDebugPayload,
  type DgisDebugEntry,
} from "./dgisRouteError.js";
import { pointValid, type Point, type Leg } from "./routeAnalysis.js";

export type { DgisDebugEntry } from "./dgisRouteError.js";
export type RoutingOptions = {
  truck: Record<string, unknown>;
  traffic: "jam" | "statistics";
  utc: number;
};
export interface RouteProvider {
  geocode(address: string): Promise<Point | null>;
  matrix(points: Point[], options: RoutingOptions): Promise<Leg[][]>;
  geometry(
    points: Point[],
    options: RoutingOptions,
  ): Promise<{ lines: number[][][]; warnings: string[] }>;
}
const endpoint = "https://routing.api.2gis.com/routing/7.0.0/global";

function userMessageForHttpStatus(status: number): string {
  if ([401, 403].includes(status)) {
    return "Ключ 2ГИС не даёт доступ к грузовой маршрутизации или геокодеру. Проверьте серверные настройки доступа.";
  }
  if (status === 429) {
    return "Лимит запросов 2ГИС исчерпан. Повторите позже.";
  }
  return "Ошибка сервиса 2ГИС. Расчёт недоступен.";
}

async function request(
  service: DgisDebugEntry["service"],
  url: string,
  body: unknown,
  signal: AbortSignal,
) {
  let response: Response;
  try {
    response = await requestFetch(url, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch {
    throw new Error("2ГИС не ответил вовремя. Повторите проверку позже.");
  }
  const rawText = await response.text();
  let payload: unknown = null;
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = rawText.length > 8000 ? `${rawText.slice(0, 8000)}…` : rawText;
    }
  }
  const debugEntry = (): DgisDebugEntry => ({
    service,
    httpStatus: response.status,
    responseBody: sanitizeDgisDebugPayload(payload),
  });
  if (!response.ok) {
    const detail = dgisErrorMessage(payload);
    const base = userMessageForHttpStatus(response.status);
    throw new DgisRouteError(
      detail ? `${base} ${detail}` : base,
      debugEntry(),
    );
  }
  try {
    if (payload == null || typeof payload !== "object") {
      throw new DgisRouteError("2ГИС вернул некорректный ответ.", debugEntry());
    }
    return payload as { status?: string; result?: any } | Record<string, any>[];
  } catch (error) {
    if (error instanceof DgisRouteError) throw error;
    throw new DgisRouteError("2ГИС вернул некорректный ответ.", debugEntry());
  }
}
export async function mapConcurrent<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  limit = 3,
): Promise<R[]> {
  const result: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        result[i] = await fn(items[i], i);
      }
    }),
  );
  return result;
}
export function createRouteProvider(): {
  provider: RouteProvider;
  dispose: () => void;
} {
  let key: string;
  try {
    key = getDgisApiKey();
  } catch {
    throw new Error("Ключ 2ГИС не настроен в серверном окружении.");
  }
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 85000);
  const params = (options: RoutingOptions) => ({
    transport: "truck",
    route_mode: "fastest",
    traffic_mode: options.traffic,
    utc: options.utc,
    params: { truck: options.truck },
    allow_locked_roads: false,
    locale: "ru",
  });
  const route = (body: unknown) =>
    request(
      "routing",
      `${endpoint}?key=${encodeURIComponent(key)}`,
      body,
      controller.signal,
    );
  const provider: RouteProvider = {
    async geocode(address) {
      const query = new URLSearchParams({
        key,
        q: address,
        fields: "items.point",
        page_size: "2",
      });
      const result = await request(
        "geocode",
        `https://catalog.api.2gis.com/3.0/items/geocode?${query}`,
        undefined,
        controller.signal,
      );
      const items = !Array.isArray(result) && result.result?.items;
      if (
        !Array.isArray(items) ||
        items.length !== 1 ||
        !pointValid(items[0]?.point)
      )
        return null;
      return items[0].point;
    },
    async matrix(points, options) {
      const pairs: { i: number; j: number }[] = [];
      const result: Leg[][] = points.map(() => points.map(() => null));
      for (let i = 0; i < points.length - 1; i++)
        for (let j = 1; j < points.length; j++) {
          if (
            i === j ||
            (points[i].lat === points[j].lat && points[i].lon === points[j].lon)
          ) {
            result[i][j] = { distance: 0, duration: 0 };
            continue;
          }
          pairs.push({ i, j });
        }
      const batches = [];
      for (let i = 0; i < pairs.length; i += 25)
        batches.push(pairs.slice(i, i + 25));
      await mapConcurrent(batches, async (batch) => {
        const response = await route({
          ...params(options),
          output: "summary",
          points: batch.map(({ i, j }) =>
            [points[i], points[j]].map((p) => ({ ...p, type: "stop" })),
          ),
        });
        if (!Array.isArray(response) || response.length !== batch.length)
          throw new Error("2ГИС вернул неполную матрицу маршрутов.");
        response.forEach((value, index) => {
          const pair = batch[index];
          // Coordinate matching protects against a differently ordered batch response.
          if (
            Math.abs(Number(value.lat1) - points[pair.i].lat) > 0.00001 ||
            Math.abs(Number(value.lon1) - points[pair.i].lon) > 0.00001 ||
            Math.abs(Number(value.lat2) - points[pair.j].lat) > 0.00001 ||
            Math.abs(Number(value.lon2) - points[pair.j].lon) > 0.00001 ||
            ![value.lat1, value.lon1, value.lat2, value.lon2].every((x) =>
              Number.isFinite(Number(x)),
            )
          )
            throw new Error("2ГИС вернул несовпадающие точки маршрута.");
          if (value.status !== "OK") {
            if (
              [
                "ROUTE_NOT_FOUND",
                "ATTRACT_FAIL",
                "POINT_EXCLUDED",
                "ROUTE_DOES_NOT_EXISTS",
              ].includes(value.status)
            )
              return;
            throw new DgisRouteError(
              `2ГИС не смог оценить участок маршрута (${String(value.status)}).`,
              {
                service: "routing",
                httpStatus: 200,
                responseBody: sanitizeDgisDebugPayload(value),
              },
            );
          }
          if (
            typeof value.distance !== "number" ||
            typeof value.duration !== "number" ||
            !Number.isFinite(value.distance) ||
            !Number.isFinite(value.duration) ||
            value.distance < 0 ||
            value.duration < 0
          )
            throw new Error("2ГИС вернул некорректное время или расстояние.");
          result[pair.i][pair.j] = {
            distance: value.distance,
            duration: value.duration,
          };
        });
      });
      return result;
    },
    async geometry(points, options) {
      const response = await route({
        ...params(options),
        output: "detailed",
        points: points.map((p) => ({ ...p, type: "stop" })),
      });
      const path = !Array.isArray(response) && response.result?.[0];
      if (Array.isArray(response) || response.status !== "OK" || !path) {
        throw new DgisRouteError("Геометрия маршрута недоступна.", {
          service: "routing",
          httpStatus: 200,
          responseBody: sanitizeDgisDebugPayload(response),
        });
      }
      const lines: number[][][] = [];
      for (const step of path.maneuvers || [])
        for (const geo of step.outcoming_path?.geometry || []) {
          const match =
            typeof geo.selection === "string" &&
            geo.selection.match(/^LINESTRING\(([^)]+)\)$/);
          if (!match) continue;
          const line = match[1]
            .split(",")
            .map((s: string) =>
              s.trim().split(/\s+/).slice(0, 2).map(Number).reverse(),
            );
          if (
            line.length > 1 &&
            line.every(([lat, lon]: number[]) => pointValid({ lat, lon }))
          )
            lines.push(line);
        }
      if (!lines.length) throw new Error("Геометрия маршрута недоступна");
      return {
        lines,
        warnings: [
          ...(path.are_truck_pass_zones_ignored
            ? [
                "2ГИС не учёл зоны грузовых пропусков. Проверьте разрешения вручную.",
              ]
            : []),
          ...(path.features?.truck !== "full"
            ? [
                "2ГИС не подтвердил полный учёт грузовых ограничений. Проверьте проезд вручную.",
              ]
            : []),
        ],
      };
    },
  };
  return {
    provider,
    dispose: () => {
      clearTimeout(timer);
      controller.abort();
    },
  };
}
