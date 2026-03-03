#!/usr/bin/env node
/**
 * Проверка крона обновления тарифов.
 * Запуск: node scripts/check-tariffs-cron.js
 * Нужно: CRON_SECRET в .env или передать BASE и SECRET.
 *
 * Локально (dev): BASE=http://localhost:3000 SECRET=your_cron_secret node scripts/check-tariffs-cron.js
 * Продакшен: BASE=https://your-app.vercel.app SECRET=your_cron_secret node scripts/check-tariffs-cron.js
 */

const BASE = process.env.BASE || "http://localhost:3000";
const SECRET = process.env.SECRET || process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET;

const url = SECRET
  ? `${BASE}/api/cron/refresh-tariffs-cache?secret=${encodeURIComponent(SECRET)}`
  : `${BASE}/api/cron/refresh-tariffs-cache`;

async function main() {
  console.log("GET", url.replace(SECRET ? encodeURIComponent(SECRET) : "", "<secret>"));
  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 500) };
  }
  console.log("Status:", res.status);
  console.log("Response:", JSON.stringify(data, null, 2));
  process.exit(res.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
