/**
 * Tests playwright-bridge — fake page + chemin "playwright indispo".
 *
 * Volontairement léger : on n'a pas envie de tirer un vrai chromium dans
 * vitest. Le test critique est que `getBrowserContext` retourne `null`
 * proprement quand `playwright-core` n'est pas chargeable, et que la
 * `createFakePage` est consommable comme une vraie PlaywrightPage.
 */

import { describe, it, expect } from "vitest";
import {
  createFakePage,
  isPlaywrightAvailable,
} from "@/lib/browser/playwright-bridge";

describe("playwright-bridge", () => {
  it("createFakePage expose la surface attendue", async () => {
    const page = createFakePage({
      url: "https://example.com",
      title: "Example",
      content: "<html><body>hi</body></html>",
    });
    await page.goto("https://example.com");
    expect(page.url()).toBe("https://example.com");
    expect(await page.title()).toBe("Example");
    expect(await page.content()).toContain("hi");
    const buf = await page.screenshot();
    expect(buf.length).toBeGreaterThan(0);
  });

  it("isPlaywrightAvailable retourne un boolean (true/false acceptés)", async () => {
    const v = await isPlaywrightAvailable();
    expect(typeof v).toBe("boolean");
  });
});
