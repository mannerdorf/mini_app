import React, { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { LoginScreen } from "../../components/LoginScreen";
import { AboutCompanyPage } from "../AboutCompanyPage";
import { ForgotPasswordPage } from "../ForgotPasswordPage";
import { GuestAppDownloadPage } from "./GuestAppDownloadPage";
import { GuestCalculatorPage } from "./GuestCalculatorPage";
import { GuestFaqPage } from "./GuestFaqPage";
import { GuestHomePage } from "./GuestHomePage";
import { GuestRouteLandingPage } from "./GuestRouteLandingPage";
import { GuestWarehousesPage } from "./GuestWarehousesPage";
import { GuestBlogListPage } from "./GuestBlogListPage";
import { GuestBlogArticlePage } from "./GuestBlogArticlePage";
import { GUEST_CONTACT_EMAIL_LABEL } from "./guestContactLabels";
import {
  guestNavigate,
  guestPathForScreen,
  parseGuestRoute,
  type GuestScreen,
} from "../../lib/guestRoutes";
import {
  getPublicRouteByDirection,
  getPublicRouteByPath,
  PUBLIC_ROUTE_CATALOG,
} from "../../../lib/haulzCalculator/publicRouteCatalog";
import {
  buildRouteLandingJsonLd,
  GUEST_HOME_META,
  useGuestDocumentMeta,
  type GuestMetaConfig,
} from "../../hooks/useGuestDocumentMeta";

function readRouteState() {
  if (typeof window === "undefined") {
    return parseGuestRoute("/", "");
  }
  return parseGuestRoute(window.location.pathname, window.location.search);
}

export function GuestAuthShell() {
  const [routeState, setRouteState] = useState(readRouteState);

  const syncFromLocation = useCallback(() => {
    setRouteState(readRouteState());
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.classList.add("guest-mode", "light-mode");
    root.classList.remove("dark-mode");
    body.classList.add("guest-mode", "light-mode");
    body.classList.remove("dark-mode");
    window.addEventListener("popstate", syncFromLocation);
    return () => {
      root.classList.remove("guest-mode", "light-mode");
      body.classList.remove("guest-mode", "light-mode");
      window.removeEventListener("popstate", syncFromLocation);
    };
  }, [syncFromLocation]);

  const navigateScreen = useCallback((screen: GuestScreen, direction?: typeof routeState.direction) => {
    const path = guestPathForScreen(screen, direction ?? routeState.direction);
    guestNavigate(path);
    setRouteState(parseGuestRoute(path.split("?")[0], path.includes("?") ? path.split("?")[1] : ""));
  }, [routeState.direction]);

  const navigatePath = useCallback((path: string) => {
    guestNavigate(path);
    const [pathname, search = ""] = path.split("?");
    setRouteState(parseGuestRoute(pathname, search));
  }, []);

  const openLogin = useCallback((hint?: string) => {
    const path = hint ? `/login?hint=${encodeURIComponent(hint)}` : "/login";
    guestNavigate(path);
    setRouteState(parseGuestRoute("/login", hint ? `hint=${encodeURIComponent(hint)}` : ""));
  }, []);

  const routeLanding = useMemo(() => {
    if (routeState.screen !== "route-landing" || !routeState.direction) return null;
    return getPublicRouteByDirection(routeState.direction) ?? getPublicRouteByPath(window.location.pathname);
  }, [routeState]);

  const metaConfig = useMemo((): GuestMetaConfig | null => {
    if (routeLanding) {
      return {
        title: routeLanding.seoTitle,
        description: routeLanding.seoDescription,
        path: routeLanding.path,
        jsonLd: buildRouteLandingJsonLd(routeLanding),
      };
    }
    switch (routeState.screen) {
      case "home":
        return GUEST_HOME_META;
      case "calculator":
        return {
          title: "Калькулятор перевозки Москва ↔ Калининград | HAULZ",
          description:
            "Онлайн-калькулятор B2B-перевозки между Москвой и Калининградом: вес, объём, паром, авто, авиа.",
          path: guestPathForScreen("calculator", routeState.direction),
        };
      case "faq":
        return {
          title: "FAQ — перевозки HAULZ Москва ↔ Калининград",
          description: "Ответы о расчёте, отслеживании и документах HAULZ на маршруте Москва — Калининград.",
          path: "/faq",
        };
      case "blog":
        return {
          title: "Блог HAULZ — логистика Москва ↔ Калининград",
          description: "Статьи о перевозках, тарифах и B2B-логистике между Москвой и Калининградом.",
          path: "/blog",
        };
      case "blog-article":
        return {
          title: "Статья HAULZ",
          description: "Материал блога HAULZ о перевозках Москва — Калининград.",
          path: routeState.blogSlug ? `/blog/${routeState.blogSlug}` : "/blog",
        };
      case "warehouses":
        return {
          title: "Склады HAULZ — Москва и Калининград",
          description: "Адреса и контакты складов HAULZ в Московской области и Калининграде.",
          path: "/sklady",
        };
      case "about":
        return {
          title: "О компании HAULZ",
          description: "B2B-логистика между Москвой и Калининградом: перевозки, документы, калькулятор.",
          path: "/o-kompanii",
        };
      default:
        return { ...GUEST_HOME_META, noindex: true };
    }
  }, [routeLanding, routeState]);

  useGuestDocumentMeta(metaConfig);

  if (routeState.screen === "login") {
    return (
      <div className="guest-shell">
        <LoginScreen
          variant="sheet"
          hint={routeState.loginHint}
          onBack={() => navigateScreen("home")}
          onOpenForgot={() => navigatePath("/forgot")}
        />
      </div>
    );
  }

  if (routeState.screen === "forgot") {
    return (
      <div className="guest-shell">
        <div className="guest-login-screen">
          <ForgotPasswordPage onBackToLogin={() => navigatePath("/login")} />
        </div>
      </div>
    );
  }

  if (routeState.screen === "about") {
    return (
      <AboutCompanyPage
        onBack={() => navigateScreen("home")}
        emailLabel={GUEST_CONTACT_EMAIL_LABEL}
        showWarehouses={false}
      />
    );
  }

  if (routeState.screen === "warehouses") {
    return <GuestWarehousesPage onBack={() => navigateScreen("home")} />;
  }

  if (routeState.screen === "faq") {
    return <GuestFaqPage onBack={() => navigateScreen("home")} />;
  }

  if (routeState.screen === "blog") {
    return (
      <GuestBlogListPage
        onBack={() => navigateScreen("home")}
        onOpenArticle={(slug) => navigatePath(`/blog/${slug}`)}
        onCalculator={() => navigateScreen("calculator")}
      />
    );
  }

  if (routeState.screen === "blog-article" && routeState.blogSlug) {
    return (
      <GuestBlogArticlePage
        slug={routeState.blogSlug}
        onBack={() => navigatePath("/blog")}
        onCalculator={() => navigateScreen("calculator")}
      />
    );
  }

  if (routeState.screen === "app") {
    return <GuestAppDownloadPage onBack={() => navigateScreen("home")} />;
  }

  if (routeState.screen === "calculator") {
    return (
      <GuestCalculatorPage
        initialDirection={routeState.direction}
        onBack={() => navigateScreen("home")}
        onLogin={() => openLogin("Войдите, чтобы оформить заявку или сохранить черновик")}
      />
    );
  }

  if (routeLanding) {
    const other = PUBLIC_ROUTE_CATALOG.find((r) => r.id !== routeLanding.id);
    return (
      <GuestRouteLandingPage
        route={routeLanding}
        onBack={() => navigateScreen("home")}
        onCalculator={(direction) => navigateScreen("calculator", direction)}
        onOtherRoute={(path) => navigatePath(path)}
        otherRouteLabel={other ? `${other.from} → ${other.to}` : "Другое направление"}
        otherRoutePath={other?.path ?? "/"}
      />
    );
  }

  return (
    <GuestHomePage
      onLogin={() => openLogin()}
      onAbout={() => navigateScreen("about")}
      onWarehouses={() => navigateScreen("warehouses")}
      onFaq={() => navigateScreen("faq")}
      onApp={() => navigateScreen("app")}
      onCalculator={() => navigateScreen("calculator")}
      onBlog={() => navigateScreen("blog")}
      onRouteLanding={(path) => navigatePath(path)}
    />
  );
}
