/**
 * RuStore phone screenshots — строго 1080×1920 (9:16), viewport only.
 * Полный UI в кадре, без fullPage (иначе RuStore обрезает до 9:16 и режет текст/кнопки).
 *
 * Usage:
 *   node scripts/capture-rustore-screenshots.mjs
 *   STORESHOT_BASE_URL=https://haulz.space node scripts/capture-rustore-screenshots.mjs
 *
 * Optional in-app shots (needs demo login on haulz.space):
 *   STORE_LOGIN=... STORE_PASSWORD=... node scripts/capture-rustore-screenshots.mjs --app
 */

import { chromium, devices } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

/** Итоговый PNG для RuStore (9:16). */
const WIDTH = 1080;
const HEIGHT = 1920;
/** CSS-viewport телефона (≤768px), иначе грузится desktop-вёрстка guest/app. */
const VIEWPORT_W = 360;
const VIEWPORT_H = 640;
const DEVICE_SCALE = WIDTH / VIEWPORT_W; // 3 → PNG ровно 1080×1920
const BASE_URL = (process.env.STORESHOT_BASE_URL || "https://haulz.space").replace(/\/$/, "");
const OUT_DIR = path.resolve("store/rustore/screenshots");
const WITH_APP = process.argv.includes("--app");
const STORE_LOGIN = process.env.STORE_LOGIN || "";
const STORE_PASSWORD = process.env.STORE_PASSWORD || "";

async function snap(page, fileName) {
  const outPath = path.join(OUT_DIR, fileName);
  await page.screenshot({
    path: outPath,
    type: "png",
    fullPage: false,
    animations: "disabled",
  });
  const stat = await fs.stat(outPath);
  const mb = stat.size / (1024 * 1024);
  if (mb > 3) {
    console.warn(`WARN ${fileName}: ${mb.toFixed(2)} MB (>3 MB RuStore phone limit)`);
  }
  console.log(`OK ${fileName} (${WIDTH}×${HEIGHT}, ${(stat.size / 1024).toFixed(0)} KB)`);
}

async function waitGuestReady(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForSelector(".guest-home-hero__brand", { timeout: 45_000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function clickGuestQuickAction(page, label) {
  const action = page.locator(".guest-home-action").filter({ hasText: label }).first();
  await action.scrollIntoViewIfNeeded();
  await action.click();
}

async function captureGuestSet(page) {
  await waitGuestReady(page);
  await snap(page, "01-guest-home.png");

  await page.getByRole("button", { name: /Рассчитать доставку/i }).click();
  await page.waitForSelector(".haulz-calc-page--cdek, .guest-shell--calc, .haulz-calc-page", { timeout: 20_000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await snap(page, "02-calculator.png");

  await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
  await page.waitForSelector(".guest-home-hero__brand");
  await clickGuestQuickAction(page, "Склады");
  await page.getByRole("heading", { name: /Где забрать и куда привезти/i }).waitFor({ timeout: 15_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await snap(page, "03-warehouses.png");

  await page.getByRole("button", { name: "Назад" }).click();
  await page.waitForSelector(".guest-home-hero__brand");
  await clickGuestQuickAction(page, "FAQ");
  await page.getByText(/Ответы без лишних слов|Частые вопросы/i).first().waitFor({ timeout: 15_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await snap(page, "04-faq.png");

  await page.getByRole("button", { name: "Назад" }).click();
  await page.waitForSelector(".guest-home-hero__brand");
  await page.getByRole("button", { name: /Войти и оформить/i }).click();
  await page.locator(".guest-login-screen__heading, .login-screen").first().waitFor({ timeout: 15_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await snap(page, "05-login.png");
}

async function loginApp(page) {
  if (!STORE_LOGIN || !STORE_PASSWORD) {
    throw new Error("Set STORE_LOGIN and STORE_PASSWORD for --app screenshots");
  }
  await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
  await page.getByRole("button", { name: /Войти/i }).first().click();
  await page.locator(".guest-login-screen__heading, .login-screen").first().waitFor();
  await page.locator('input[type="email"], input[name="login"], input[autocomplete="username"]').first().fill(STORE_LOGIN);
  await page.locator('input[type="password"]').first().fill(STORE_PASSWORD);
  await page.getByRole("button", { name: /Подтвердить|Войти/i }).click();
  await page.waitForSelector(".app-container, .tab-bar, [class*='TabBar']", { timeout: 45_000 });
  await page.waitForTimeout(800);
}

async function captureAppSet(page) {
  await loginApp(page);

  await page.getByRole("button", { name: /^Грузы$/i }).click().catch(async () => {
    await page.locator("text=Грузы").first().click();
  });
  await page.waitForSelector(".text-page-title, h1, h2", { timeout: 20_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await snap(page, "06-cargo.png");

  await page.getByRole("button", { name: /^Документы$/i }).click().catch(async () => {
    await page.locator("text=Документы").first().click();
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await snap(page, "07-documents.png");

  await page.getByRole("button", { name: /^Главная$/i }).click().catch(async () => {
    await page.locator("text=Главная").first().click();
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await snap(page, "08-dashboard.png");
}

const browser = await chromium.launch({ headless: true });
const pixel = devices["Pixel 7"];
const context = await browser.newContext({
  ...pixel,
  viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
  deviceScaleFactor: DEVICE_SCALE,
  locale: "ru-RU",
  colorScheme: "light",
});
const page = await context.newPage();

await fs.mkdir(OUT_DIR, { recursive: true });
console.log(
  `Capturing RuStore screenshots (${WIDTH}×${HEIGHT} PNG, CSS viewport ${VIEWPORT_W}×${VIEWPORT_H}, scale ${DEVICE_SCALE.toFixed(2)}) from ${BASE_URL}`,
);
console.log(`Output: ${OUT_DIR}/`);

try {
  await captureGuestSet(page);
  if (WITH_APP) {
    await captureAppSet(page);
  } else {
    console.log("Skip in-app shots (pass --app and STORE_LOGIN/STORE_PASSWORD to add Грузы/Документы).");
  }
} finally {
  await browser.close();
}

console.log("\nUpload to RuStore Console → Скриншоты → телефон → вертикальная ориентация (9:16).");
