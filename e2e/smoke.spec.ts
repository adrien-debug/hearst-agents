import { test, expect } from "@playwright/test";

/**
 * Smoke tests — Critical path validation (Semaine 1)
 *
 * Quick validation that the application boots and core routes work.
 */

test.describe("Health & Availability", () => {
  test("health endpoint returns 200", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
  });
});

test.describe("Login Page", () => {
  test("login page renders without crash", async ({ page }) => {
    await page.goto("/login");

    // OAuth buttons should be visible (FR labels — Semaine 4)
    await expect(
      page.locator("text=Continuer avec Google")
    ).toBeVisible();
    await expect(
      page.locator("text=Continuer avec Outlook")
    ).toBeVisible();

    // French title (Semaine 4 i18n)
    await expect(
      page.locator("text=Accédez à votre espace de travail")
    ).toBeVisible();
  });

  test("login page is responsive", async ({ page }) => {
    // Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/login");
    await expect(page.locator("text=Continuer avec Google")).toBeVisible();

    // Desktop
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/login");
    await expect(page.locator("text=Continuer avec Google")).toBeVisible();
  });
});

test.describe("Environment Security", () => {
  test("API routes require authentication", async ({ request }) => {
    const response = await request.get("/api/agents");
    expect([401, 302, 307]).toContain(response.status());
  });

  test("analytics endpoint requires POST", async ({ request }) => {
    const getResponse = await request.get("/api/analytics");
    expect([404, 405]).toContain(getResponse.status());
  });
});
