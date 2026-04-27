import { chromium } from "@playwright/test";

const BASE = process.env.URL ?? "http://localhost:9000";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.addCookies([{
  name: "next-auth.session-token", value: "fake", domain: "localhost",
  path: "/", httpOnly: true, sameSite: "Lax",
}]);
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 20000 });
await page.waitForTimeout(2500);

const result = await page.evaluate(() => {
  const root = document.querySelector('[data-theme="light"]');
  const rootStyle = root ? getComputedStyle(root) : null;
  const titleEl = document.querySelector(".halo-action-row p");
  const titleStyle = titleEl ? getComputedStyle(titleEl) : null;
  return {
    foundRoot: !!root,
    rootText: rootStyle?.getPropertyValue("--text"),
    rootBgCenter: rootStyle?.getPropertyValue("--bg-center"),
    foundTitle: !!titleEl,
    titleColor: titleStyle?.color,
    titleHTML: titleEl?.outerHTML?.slice(0, 200),
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
