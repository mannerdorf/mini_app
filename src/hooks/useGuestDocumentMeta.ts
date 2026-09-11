import { useEffect } from "react";
import type { PublicRouteInfo } from "../../lib/haulzCalculator/publicRouteCatalog";
import { publicCanonicalUrl } from "../../lib/haulzCalculator/publicRouteCatalog";

export type GuestMetaConfig = {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
};

function upsertMeta(name: string, content: string, attr: "name" | "property" = "name") {
  let el = document.head.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.content = content;
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

function removeJsonLd(id: string) {
  document.getElementById(id)?.remove();
}

function applyJsonLd(id: string, data: Record<string, unknown> | Array<Record<string, unknown>>) {
  removeJsonLd(id);
  const script = document.createElement("script");
  script.id = id;
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

export function buildRouteLandingJsonLd(route: PublicRouteInfo) {
  const url = publicCanonicalUrl(route.path);
  return [
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: route.h1,
      description: route.seoDescription,
      provider: {
        "@type": "Organization",
        name: "HAULZ",
        url: "https://haulz.space",
        email: "Info@haulz.pro",
      },
      areaServed: [{ "@type": "City", name: route.from }, { "@type": "City", name: route.to }],
      url,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: route.faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ];
}

export const GUEST_HOME_META: GuestMetaConfig = {
  title: "HAULZ — перевозка грузов Москва ↔ Калининград",
  description:
    "B2B-логистика между Москвой и Калининградом: перевозки, калькулятор, документы и отслеживание. LTL, FTL, паром и авто.",
  path: "/",
};

export function useGuestDocumentMeta(config: GuestMetaConfig | null) {
  useEffect(() => {
    if (!config || typeof document === "undefined") return;

    document.title = config.title;
    upsertMeta("description", config.description);
    upsertLink("canonical", publicCanonicalUrl(config.path));

    const robots = config.noindex ? "noindex, nofollow" : "index, follow";
    upsertMeta("robots", robots);
    upsertMeta("googlebot", robots);
    upsertMeta("yandex", robots);

    upsertMeta("og:title", config.title, "property");
    upsertMeta("og:description", config.description, "property");
    upsertMeta("og:url", publicCanonicalUrl(config.path), "property");
    upsertMeta("og:type", "website", "property");

    if (config.jsonLd) {
      applyJsonLd("haulz-guest-jsonld", config.jsonLd);
    } else {
      removeJsonLd("haulz-guest-jsonld");
    }

    return () => {
      removeJsonLd("haulz-guest-jsonld");
    };
  }, [config?.title, config?.description, config?.path, config?.noindex, config?.jsonLd]);
}
