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
  | "route-landing";

export type GuestRouteState = {
  screen: GuestScreen;
  direction: Direction | null;
  loginHint: string | null;
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
  "/perevozka-moskva-kaliningrad": "route-landing",
  "/perevozka-kaliningrad-moskva": "route-landing",
};

export const GUEST_PUBLIC_PATHS = Object.keys(PATH_TO_SCREEN);

export function parseGuestRoute(pathname: string, search: string): GuestRouteState {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(search);
  const routeLanding = getPublicRouteByPath(normalized);

  if (routeLanding) {
    return {
      screen: "route-landing",
      direction: routeLanding.direction,
      loginHint: null,
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
  };
}

export function guestPathForScreen(screen: GuestScreen, direction?: Direction | null): string {
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
  return GUEST_PUBLIC_PATHS.includes(normalized) || Boolean(getPublicRouteByPath(normalized));
}
