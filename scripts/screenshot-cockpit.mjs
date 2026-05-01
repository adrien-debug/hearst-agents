import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:9000";
const outDir = "/tmp/hearst-screens";
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
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
await ctx.addInitScript(() => {
  window.localStorage.setItem("hearst.onboarded", "1");
});
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 20000 });
await page.waitForTimeout(3500);
await page.screenshot({ path: `${outDir}/cockpit-clean-1920.png`, fullPage: false });
console.log(`OK -> ${outDir}/cockpit-clean-1920.png`);
await browser.close();
