import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const URL = "http://localhost:9000/halo-test";
const OUT = ".halo-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1100, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

await page.screenshot({ path: `${OUT}/all-states.png`, fullPage: true });

// Zoom sur le 128px running pour voir la richesse de la signature
const box = await page.locator('section').nth(2).boundingBox();
if (box) {
  await page.screenshot({
    path: `${OUT}/zoom-128.png`,
    clip: box,
  });
}

await browser.close();
console.log("OK", OUT);
