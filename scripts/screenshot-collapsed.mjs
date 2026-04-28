import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:9000/admin";
const out = process.argv[3] ?? "/tmp/canvas-collapsed.png";
const width = parseInt(process.argv[4] ?? "1920", 10);
const height = parseInt(process.argv[5] ?? "1080", 10);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 1,
  storageState: {
    cookies: [],
    origins: [
      {
        origin: "http://localhost:9000",
        localStorage: [
          { name: "admin-sidebar-collapsed", value: "1" },
          { name: "canvas-aside-collapsed", value: "1" },
        ],
      },
    ],
  },
});
await ctx.addCookies([
  {
    name: "next-auth.session-token",
    value: "dev-fake",
    domain: "localhost",
    path: "/",
  },
]);
const page = await ctx.newPage();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log("collapsed screenshot:", out);
