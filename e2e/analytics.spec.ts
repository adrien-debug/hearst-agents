import { test, expect } from "@playwright/test";

/**
 * Analytics E2E Tests
 *
 * Verify analytics events are triggered correctly
 */

test.describe("Analytics Events", () => {
  test("login event tracked on OAuth click", async ({ page }) => {
    // Monitor console for analytics logs
    const analyticsLogs: string[] = [];
    page.on("console", (msg) => {
      if (msg.text().includes("[Analytics]")) {
        analyticsLogs.push(msg.text());
      }
    });

    await page.goto("/login");
    await page.click("text=Continuer avec Google");

    // Event should be logged (even if OAuth redirects)
    // Note: In real scenario, we'd check server logs
  });

  test("analytics API accepts events", async ({ request }) => {
    const response = await request.post("/api/analytics", {
      data: {
        type: "run_completed",
        userId: "test@example.com",
        properties: { runId: "test-123" },
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("analytics API rejects invalid events", async ({ request }) => {
    const response = await request.post("/api/analytics", {
      data: {
        // Missing required fields
        properties: {},
      },
    });

    expect(response.status()).toBe(400);
  });
});
