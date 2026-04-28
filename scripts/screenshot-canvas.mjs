import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:9000/admin";
const out = process.argv[3] ?? "/tmp/canvas-admin.png";
const width = parseInt(process.argv[4] ?? "1440", 10);
const height = parseInt(process.argv[5] ?? "900", 10);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
await ctx.addCookies([
  {
    name: "next-auth.session-token",
    value: "dev-fake-session-for-screenshot",
    domain: "localhost",
    path: "/",
  },
]);
// Block /api/auth/session so the client SessionProvider can't kick in and redirect us to /login.
await ctx.route("**/api/auth/session*", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      user: { name: "Adrien", email: "adrien@hearstcorporation.io" },
      expires: "2099-01-01T00:00:00.000Z",
    }),
  }),
);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("[pageerror]", e.message));
const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
console.log("response:", resp?.status(), resp?.url());
await page.waitForTimeout(2500);
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log("screenshot:", out, `${width}x${height}`);
