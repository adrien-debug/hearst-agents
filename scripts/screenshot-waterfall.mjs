import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:9000/admin";
const out = process.argv[3] ?? "/tmp/canvas-waterfall.png";
const width = parseInt(process.argv[4] ?? "1920", 10);
const height = parseInt(process.argv[5] ?? "1080", 10);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
await ctx.addCookies([
  { name: "next-auth.session-token", value: "dev-fake", domain: "localhost", path: "/" },
]);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("[pageerror]", e.message));
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(2500);

// Click the first run in the right rail (has class "border-l-2 border-l-transparent" in idle state)
const firstRun = await page.$('aside button[type="button"]');
if (firstRun) {
  await firstRun.click();
  await page.waitForTimeout(1500); // wait for events fetch + waterfall render
}

await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log("waterfall screenshot:", out);
