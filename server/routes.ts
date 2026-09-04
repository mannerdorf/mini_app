import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SERVER_DIR, "..");
const API_DIR = path.join(PROJECT_ROOT, "api");

export type ApiHandler = (req: import("@vercel/node").VercelRequest, res: import("@vercel/node").VercelResponse) => unknown;

export type StaticRoute = {
  kind: "static";
  pathname: string;
  modulePath: string;
};

export type DynamicRoute = {
  kind: "dynamic";
  pathnamePattern: RegExp;
  paramNames: string[];
  modulePath: string;
};

export type RouteIndex = {
  static: Map<string, StaticRoute>;
  dynamic: DynamicRoute[];
};

function isRoutableRelativePath(relPath: string): boolean {
  const parts = relPath.split(/[/\\]/);
  const fileName = parts[parts.length - 1] || "";
  if (!fileName.endsWith(".ts")) return false;
  if (fileName.startsWith("_")) return false;
  if (parts.some((p) => p.startsWith("_"))) return false;
  if (parts.includes("lib")) return false;
  return true;
}

function fileToRoutePath(relPath: string): { pathname: string; paramNames: string[] } | null {
  const withoutExt = relPath.replace(/\.ts$/, "");
  const segments = withoutExt.split(/[/\\]/).filter(Boolean);
  // api/foo/index.ts → /api/foo (как на Vercel)
  if (segments.length > 0 && segments[segments.length - 1] === "index") {
    segments.pop();
  }
  const paramNames: string[] = [];
  const urlSegments: string[] = [];

  for (const seg of segments) {
    const dyn = seg.match(/^\[(.+)\]$/);
    if (dyn) {
      paramNames.push(dyn[1]);
      urlSegments.push(":param");
      continue;
    }
    urlSegments.push(seg);
  }

  return {
    pathname: `/api/${urlSegments.join("/")}`,
    paramNames,
  };
}

function buildDynamicRegex(pathname: string, paramNames: string[]): RegExp {
  const escaped = pathname
    .split("/")
    .map((part) => {
      if (part === ":param") return "([^/]+)";
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return new RegExp(`^${escaped}$`);
}

export function buildRouteIndex(): RouteIndex {
  const staticRoutes = new Map<string, StaticRoute>();
  const dynamicRoutes: DynamicRoute[] = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;

      const rel = path.relative(API_DIR, full).replace(/\\/g, "/");
      if (!isRoutableRelativePath(rel)) continue;

      const routeMeta = fileToRoutePath(rel);
      if (!routeMeta) continue;

      const modulePath = full;
      if (routeMeta.paramNames.length === 0) {
        staticRoutes.set(routeMeta.pathname, { kind: "static", pathname: routeMeta.pathname, modulePath });
        continue;
      }

      dynamicRoutes.push({
        kind: "dynamic",
        pathnamePattern: buildDynamicRegex(routeMeta.pathname, routeMeta.paramNames),
        paramNames: routeMeta.paramNames,
        modulePath,
      });
    }
  }

  walk(API_DIR);
  dynamicRoutes.sort((a, b) => b.paramNames.length - a.paramNames.length);
  return { static: staticRoutes, dynamic: dynamicRoutes };
}

export function matchRoute(index: RouteIndex, pathname: string): { modulePath: string; params: Record<string, string> } | null {
  const staticHit = index.static.get(pathname);
  if (staticHit) return { modulePath: staticHit.modulePath, params: {} };

  for (const route of index.dynamic) {
    const m = pathname.match(route.pathnamePattern);
    if (!m) continue;
    const params: Record<string, string> = {};
    route.paramNames.forEach((name, i) => {
      params[name] = decodeURIComponent(m[i + 1] || "");
    });
    return { modulePath: route.modulePath, params };
  }

  return null;
}

const handlerCache = new Map<string, ApiHandler>();

export async function loadHandler(modulePath: string): Promise<ApiHandler | null> {
  const cached = handlerCache.get(modulePath);
  if (cached) return cached;

  const mod = await import(pathToFileURL(modulePath).href);
  const handler = (mod.default ?? mod.handler) as ApiHandler | undefined;
  if (typeof handler !== "function") return null;

  handlerCache.set(modulePath, handler);
  return handler;
}

export function getProjectRoot(): string {
  return PROJECT_ROOT;
}
