import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { VercelRequest } from "@vercel/node";
import { buildRouteIndex, getProjectRoot, loadHandler, matchRoute } from "./routes.js";
import { readRequestBody, toVercelRequest, toVercelResponse } from "./vercelAdapter.js";

const ENV_PATH = process.env.HAULZ_ENV_FILE || "/opt/haulz/.env";
if (fs.existsSync(ENV_PATH)) {
  loadEnv({ path: ENV_PATH });
} else {
  loadEnv();
}

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const routeIndex = buildRouteIndex();

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

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

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

    const matched = matchRoute(routeIndex, pathname);
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

server.listen(PORT, HOST, () => {
  console.log(JSON.stringify({ level: "info", event: "haulz_api_listen", host: HOST, port: PORT }));
});
