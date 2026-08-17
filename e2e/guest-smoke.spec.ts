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
    await expect(page.getByLabel("HAULZ").first()).toBeVisible();
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
});
