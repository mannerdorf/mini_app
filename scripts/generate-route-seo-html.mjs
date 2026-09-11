#!/usr/bin/env node
/**
 * Generates static SEO landing HTML for crawlers (nginx serves before SPA fallback).
 * Run: node scripts/generate-route-seo-html.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");

const routes = [
  {
    path: "/perevozka-moskva-kaliningrad",
    title: "Перевозка грузов Москва — Калининград | HAULZ",
    description:
      "B2B-перевозка грузов из Москвы в Калининград: LTL, FTL, паром и авто. Онлайн-калькулятор, таможня ЕАЭС/ЕС.",
    h1: "Перевозка грузов Москва — Калининград",
    summary:
      "Перевозка генеральных, режимных, акцизных, опасных и санкционных грузов. LTL, LCL и FTL, FCL.",
    direction: "mow_kgd",
    reversePath: "/perevozka-kaliningrad-moskva",
    reverseLabel: "Калининград → Москва",
  },
  {
    path: "/perevozka-kaliningrad-moskva",
    title: "Перевозка грузов Калининград — Москва | HAULZ",
    description:
      "B2B-перевозка из Калининграда в Москву: возврат из ОЭЗ, импорт из ЕС, LTL и FTL.",
    h1: "Перевозка грузов Калининград — Москва",
    summary: "Возврат товаров из ОЭЗ и импорт из ЕС. LTL, LCL и FTL, FCL.",
    direction: "kgd_mow",
    reversePath: "/perevozka-moskva-kaliningrad",
    reverseLabel: "Москва → Калининград",
  },
];

function html(route) {
  const canonical = `https://haulz.space${route.path}`;
  const calc = `https://haulz.space/kalkulyator?direction=${route.direction}`;
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${route.title}</title>
  <meta name="description" content="${route.description}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${canonical}" />
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Service",
    name: route.h1,
    description: route.description,
    provider: { "@type": "Organization", name: "HAULZ", url: "https://haulz.space" },
    url: canonical,
  })}</script>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 48rem; margin: 0 auto; padding: 1.5rem; color: #111827; line-height: 1.6; }
    a { color: #2563eb; }
    .cta { display: inline-block; margin: 1rem 0.5rem 1rem 0; padding: 0.75rem 1.25rem; background: #2563eb; color: #fff; text-decoration: none; border-radius: 0.75rem; font-weight: 600; }
div.links { margin-top: 2rem; }
  </style>
</head>
<body>
  <p><a href="/">HAULZ</a></p>
  <h1>${route.h1}</h1>
  <p>${route.summary}</p>
  <p>B2B-логистика HAULZ: калькулятор, документы, отслеживание перевозки на каждом этапе.</p>
  <a class="cta" href="${calc}">Рассчитать перевозку</a>
  <a class="cta" href="${route.reversePath}" style="background:#fff;color:#2563eb;border:1px solid #2563eb;">${route.reverseLabel}</a>
  <div class="links">
    <p><a href="/">Главная</a> · <a href="/kalkulyator">Калькулятор</a> · <a href="/faq">FAQ</a> · <a href="/sklady">Склады</a></p>
    <p>Public API: <a href="/api/public/v1/routes">/api/public/v1/routes</a></p>
  </div>
</body>
</html>`;
}

for (const route of routes) {
  const dir = path.join(publicDir, route.path.replace(/^\//, ""));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html(route), "utf8");
  console.log("wrote", route.path);
}
