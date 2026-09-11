import type { Direction } from "../../lib/haulzCalculator/types";
import { getPublicRouteByPath, PUBLIC_ROUTE_CATALOG } from "../../lib/haulzCalculator/publicRouteCatalog";

export type GuestScreen =
  | "home"
  | "login"
  | "about"
  | "warehouses"
  | "faq"
  | "forgot"
  | "app"
  | "calculator"
  | "route-landing"
  | "blog"
  | "blog-article";

export type GuestRouteState = {
  screen: GuestScreen;
  direction: Direction | null;
  loginHint: string | null;
  blogSlug: string | null;
};

const PATH_TO_SCREEN: Record<string, GuestScreen> = {
  "/": "home",
  "/kalkulyator": "calculator",
  "/faq": "faq",
  "/sklady": "warehouses",
  "/o-kompanii": "about",
  "/about": "about",
  "/app": "app",
  "/login": "login",
  "/forgot": "forgot",
  "/blog": "blog",
  "/perevozka-moskva-kaliningrad": "route-landing",
  "/perevozka-kaliningrad-moskva": "route-landing",
};

export const GUEST_PUBLIC_PATHS = Object.keys(PATH_TO_SCREEN);

function parseBlogSlug(pathname: string): string | null {
  const m = pathname.match(/^\/blog\/([a-z0-9][a-z0-9_-]{0,120})$/i);
  return m ? m[1].toLowerCase() : null;
}

export function parseGuestRoute(pathname: string, search: string): GuestRouteState {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(search);
  const routeLanding = getPublicRouteByPath(normalized);
  const blogSlug = parseBlogSlug(normalized);

  if (blogSlug) {
    return {
      screen: "blog-article",
      direction: null,
      loginHint: null,
      blogSlug,
    };
  }

  if (routeLanding) {
    return {
      screen: "route-landing",
      direction: routeLanding.direction,
      loginHint: null,
      blogSlug: null,
    };
  }

  const screen = PATH_TO_SCREEN[normalized] ?? "home";
  const directionRaw = params.get("direction");
  const direction =
    directionRaw === "mow_kgd" || directionRaw === "kgd_mow" ? directionRaw : null;

  return {
    screen,
    direction,
    loginHint: params.get("hint"),
    blogSlug: null,
  };
}

export function guestPathForScreen(
  screen: GuestScreen,
  direction?: Direction | null,
  blogSlug?: string | null,
): string {
  if (screen === "blog-article" && blogSlug) return `/blog/${blogSlug}`;
  if (screen === "blog") return "/blog";
  if (screen === "route-landing" && direction) {
    const route = PUBLIC_ROUTE_CATALOG.find((r) => r.direction === direction);
    if (route) return route.path;
  }
  switch (screen) {
    case "calculator":
      return direction ? `/kalkulyator?direction=${direction}` : "/kalkulyator";
    case "faq":
      return "/faq";
    case "warehouses":
      return "/sklady";
    case "about":
      return "/o-kompanii";
    case "app":
      return "/app";
    case "login":
      return "/login";
    case "forgot":
      return "/forgot";
    case "home":
    default:
      return "/";
  }
}

export function guestNavigate(path: string, replace = false): void {
  if (typeof window === "undefined") return;
  if (replace) {
    window.history.replaceState(null, "", path);
  } else {
    window.history.pushState(null, "", path);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function isGuestPublicPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (GUEST_PUBLIC_PATHS.includes(normalized)) return true;
  if (getPublicRouteByPath(normalized)) return true;
  return Boolean(parseBlogSlug(normalized));
}
