import { expect, test } from "@playwright/test";

/**
 * Smoke for public guest shell. Skips cleanly if the local Vite server is down.
 */
async function guestReachable(request: { get: (url: string) => Promise<{ ok: () => boolean }> }) {
  try {
    const res = await request.get("/");
    return res.ok();
  } catch {
    return false;
  }
}

test.describe("guest smoke", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(
      !(await guestReachable(request)),
      "Dev server not reachable — keep `npm run dev` running, use PLAYWRIGHT_BASE_URL=http://localhost:5173",
    );
  });

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
