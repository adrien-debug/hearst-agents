// Quick visual loop: screenshot the idle home at 3 viewports.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE = process.env.URL ?? "http://localhost:9000";
const VIEWPORTS = [
  { name: "1280", width: 1280, height: 800 },
  { name: "1920", width: 1920, height: 1080 },
  { name: "2560", width: 2560, height: 1440 },
];

const outDir = "/tmp/hearst-screens";
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  // Proxy.ts only checks for cookie *presence*, not validity → bypass auth gate.
  await ctx.addCookies([
    {
      name: "next-auth.session-token",
      value: "fake-session-for-screenshots",
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await ctx.newPage();
  // Don't wait for networkidle — the right-panel SSE stream keeps it open.
  const res = await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(2500);
  const file = `${outDir}/home-${vp.name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log(`[${vp.name}] status=${res?.status()} url=${page.url()} -> ${file}`);
  await ctx.close();
}
await browser.close();
