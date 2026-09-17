import { expect, test } from "@playwright/test";

test.describe("guest smoke", () => {
  test("home shows HAULZ brand in hero", async ({ page }) => {
    await page.goto("/");
    const heroBrand = page.locator(".guest-home-hero__brand");
    await expect(heroBrand).toBeVisible();
    await expect(heroBrand).toHaveText(/HAULZ/i);
    await expect(page.getByRole("heading", { name: /Москвой и Калининградом/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Рассчитать доставку/i })).toBeVisible();
  });

  test("calculator opens from hero CTA", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Рассчитать доставку/i }).click();
    await expect(page.locator(".guest-shell--calc, .haulz-calc-page--cdek").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("calculator opens from /kalkulyator URL", async ({ page }) => {
    await page.goto("/kalkulyator?direction=mow_kgd");
    await expect(page.locator(".guest-shell--calc, .haulz-calc-page--cdek").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("route landing renders Moscow to Kaliningrad", async ({ page }) => {
    await page.goto("/perevozka-moskva-kaliningrad");
    await expect(page.getByRole("heading", { level: 1, name: /Перевозка грузов Москва/i })).toBeVisible();
  });
});
