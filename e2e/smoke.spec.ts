import { test, expect } from "@playwright/test";

/**
 * Smoke tests — Critical path validation
 *
 * These tests ensure the application boots correctly and critical
 * routes are accessible without crashing.
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

    // OAuth buttons should be visible (FR labels)
    await expect(
      page.locator("text=Continuer avec Google")
    ).toBeVisible();
    await expect(
      page.locator("text=Continuer avec Outlook")
    ).toBeVisible();
  });
});

test.describe("Environment Security", () => {
  test("API routes require authentication", async ({ request }) => {
    const response = await request.get("/api/agents");
    expect([401, 302, 307]).toContain(response.status());
  });
});
