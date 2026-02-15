#!/usr/bin/env node
/**
 * Проверка крона refresh-cache: вызов с секретом и вывод результата.
 *
 * Параметры скрипта (env):
 *   BASE_URL     — базовый URL приложения (например https://your-app.vercel.app)
 *   CRON_SECRET  — секрет для вызова /api/cron/refresh-cache (или VERCEL_CRON_SECRET)
 *
 * Параметры самого крона (env в Vercel):
 *   CRON_SECRET / VERCEL_CRON_SECRET — обязателен для вызова
 *   PEREVOZKI_SERVICE_LOGIN / HAULZ_1C_SERVICE_LOGIN — логин к 1С API
 *   PEREVOZKI_SERVICE_PASSWORD / HAULZ_1C_SERVICE_PASSWORD — пароль к 1С API
 *   DATABASE_URL — подключение к БД (для записи кэша)
 *
 * Пример запуска:
 *   BASE_URL=https://mini-app.vercel.app CRON_SECRET=your-secret node scripts/verify-cron.mjs
 *
 * Проверка через curl (подставьте BASE_URL и CRON_SECRET):
 *   curl -s -o /dev/null -w "%{http_code}" -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" "https://YOUR_APP.vercel.app/api/cron/refresh-cache"
 *   curl -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" "https://YOUR_APP.vercel.app/api/cron/refresh-cache"
 */

const BASE_URL = process.env.BASE_URL || process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`;
const CRON_SECRET = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET;

if (!BASE_URL) {
  console.error("Задайте BASE_URL или VERCEL_URL (например: BASE_URL=https://your-app.vercel.app)");
  process.exit(1);
}
if (!CRON_SECRET) {
  console.error("Задайте CRON_SECRET (значение из Vercel → Settings → Environment Variables)");
  process.exit(1);
}

const url = `${BASE_URL.replace(/\/$/, "")}/api/cron/refresh-cache`;
console.log("Проверка крона refresh-cache");
console.log("URL:", url);
console.log("Секрет: задан, длина", CRON_SECRET.length);
console.log("---");

const start = Date.now();
let res;
try {
  res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
} catch (e) {
  console.error("Ошибка запроса:", e.message);
  process.exit(1);
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
const text = await res.text();

console.log("Статус:", res.status, res.statusText);
console.log("Время:", elapsed, "с");
console.log("---");

if (res.status === 401) {
  console.error("401: неверный или отсутствующий CRON_SECRET");
  process.exit(1);
}

if (!res.ok) {
  console.error("Ответ (первые 500 символов):");
  console.error(text.slice(0, 500));
  process.exit(1);
}

// Парсим HTML успешного ответа: Перевозок, Счетов, УПД, Заказчиков
const numbers = {};
for (const label of ["Перевозок", "Счетов", "УПД", "Заказчиков"]) {
  const m = text.match(new RegExp(`${label}[^<]*<strong>([^<]+)</strong>`));
  if (m) numbers[label] = m[1].trim();
}
const periodMatch = text.match(/Период: ([^—]+)—([^<.]+)/);
if (periodMatch) numbers["Период"] = `${periodMatch[1].trim()} — ${periodMatch[2].trim()}`;

console.log("Результат:");
console.log("  Перевозок:", numbers["Перевозок"] ?? "—");
console.log("  Счетов:", numbers["Счетов"] ?? "—");
console.log("  УПД:", numbers["УПД"] ?? "—");
console.log("  Заказчиков (Getcustomers):", numbers["Заказчиков"] ?? "—");
if (numbers["Период"]) console.log("  Период:", numbers["Период"]);
console.log("---");
console.log("Крон проверен успешно.");
