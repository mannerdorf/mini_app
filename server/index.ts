import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { VercelRequest } from "@vercel/node";
import { buildRouteIndex, getProjectRoot, loadHandler, matchRoute } from "./routes.js";
import { applyCors } from "./cors.js";
import { readRequestBody, toVercelRequest, toVercelResponse } from "./vercelAdapter.js";

const ENV_PATH = process.env.HAULZ_ENV_FILE || "/opt/haulz/.env";
if (fs.existsSync(ENV_PATH)) {
  loadEnv({ path: ENV_PATH });
} else {
  loadEnv();
}

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
let routeIndex = buildRouteIndex();

function matchApiRoute(pathname: string) {
  let matched = matchRoute(routeIndex, pathname);
  if (matched) return matched;
  routeIndex = buildRouteIndex();
  return matchRoute(routeIndex, pathname);
}

console.log(
  JSON.stringify({
    level: "info",
    event: "haulz_api_boot",
    port: PORT,
    host: HOST,
    env_file: fs.existsSync(ENV_PATH) ? ENV_PATH : "dotenv-default",
    static_routes: routeIndex.static.size,
    dynamic_routes: routeIndex.dynamic.length,
    project_root: getProjectRoot(),
  })
);

/** Параллельные тяжёлые запросы не должны вечно держать сокеты nginx. */
const REQUEST_HARD_TIMEOUT_MS = Number(process.env.HAULZ_REQUEST_TIMEOUT_MS || 90_000);
const FIVEPOST_TRANSLATE_TIMEOUT_MS = Number(
  process.env.HAULZ_FIVEPOST_TRANSLATE_TIMEOUT_MS || 300_000,
);
const DAILY_SUMMARY_TIMEOUT_MS = Number(process.env.HAULZ_DAILY_SUMMARY_TIMEOUT_MS || 300_000);

function requestHardTimeoutMs(pathname: string): number {
  if (pathname === "/api/documents/fivepost-translate") return FIVEPOST_TRANSLATE_TIMEOUT_MS;
  if (pathname === "/api/notification-daily-summary") return DAILY_SUMMARY_TIMEOUT_MS;
  return REQUEST_HARD_TIMEOUT_MS;
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  applyCors(res);

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const hardTimeoutMs = requestHardTimeoutMs(pathname);

  let settled = false;
  const hardTimer = setTimeout(() => {
    if (settled || res.headersSent) return;
    settled = true;
    res.statusCode = 504;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Gateway timeout", timeout_ms: hardTimeoutMs }));
  }, hardTimeoutMs);
  hardTimer.unref?.();

  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(hardTimer);
  };
  res.on("finish", finish);
  res.on("close", finish);

  if ((req.method || "GET").toUpperCase() === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (pathname === "/health") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (!pathname.startsWith("/api/")) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    const matched = matchApiRoute(pathname);
    if (!matched) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "API route not found", path: pathname }));
      return;
    }

    const handler = await loadHandler(matched.modulePath);
    if (!handler) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Handler not exported", path: pathname }));
      return;
    }

    const body = await readRequestBody(req);
    const vercelReq = toVercelRequest(req, body);
    for (const [key, value] of Object.entries(matched.params)) {
      (vercelReq as VercelRequest & { params?: Record<string, string> }).params = {
        ...(vercelReq as VercelRequest & { params?: Record<string, string> }).params,
        [key]: value,
      };
      vercelReq.query[key] = value;
    }

    const vercelRes = toVercelResponse(res);
    await handler(vercelReq, vercelRes);
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "haulz_api_unhandled",
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - started,
      })
    );
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
});

server.requestTimeout = Math.max(
  REQUEST_HARD_TIMEOUT_MS,
  FIVEPOST_TRANSLATE_TIMEOUT_MS,
  DAILY_SUMMARY_TIMEOUT_MS,
) + 5_000;
server.headersTimeout = Math.min(60_000, REQUEST_HARD_TIMEOUT_MS);
server.keepAliveTimeout = 65_000;
server.maxRequestsPerSocket = 100;

server.listen(PORT, HOST, () => {
  console.log(
    JSON.stringify({
      level: "info",
      event: "haulz_api_listen",
      host: HOST,
      port: PORT,
      request_timeout_ms: REQUEST_HARD_TIMEOUT_MS,
    }),
  );
});
