import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:9000/admin";
const out = process.argv[3] ?? "/tmp/canvas-toggled.png";
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
await page.waitForTimeout(1500);

// Click sidebar toggle (chevron at the bottom of sidebar)
await page.click('button[title="Réduire la sidebar"]').catch(() => console.log("no sidebar toggle"));
await page.waitForTimeout(400);

// Click aside toggle (in the action strip, top-right of canvas)
await page.click('button[title="Masquer le panneau droit"]').catch(() => console.log("no aside toggle"));
await page.waitForTimeout(600);

await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log("toggles screenshot:", out);
