import { test } from "@playwright/test";

test("rail width @ 1440", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://localhost:9000/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const rail = page.locator("aside").first();
  const box = await rail.boundingBox();
  console.log("Rail bounding box:", JSON.stringify(box));
  const computedWidth = await rail.evaluate((el) =>
    window.getComputedStyle(el).width,
  );
  const inlineWidth = await rail.evaluate((el) => el.style.width);
  console.log("Computed width:", computedWidth, "Inline:", inlineWidth);
  await page.screenshot({
    path: "/tmp/hearst-screens/rail-width.png",
    fullPage: false,
  });
});
