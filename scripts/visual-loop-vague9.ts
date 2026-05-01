/**
 * Boucle visuelle vague 9 (CLAUDE.md règle #4).
 *
 * Lance Playwright + dev bypass pour capturer 4 screenshots :
 *  1. Cockpit avec localStorage clean → onboarding overlay
 *  2. Cockpit après skip onboarding → vue normale (Daily Brief card,
 *     watchlist, sections)
 *  3. Cockpit Hero en mode briefing empty → carte "Aperçu" grisée
 *  4. Mission stage avec mission existante → section "Conversation"
 *
 * Sortie : /tmp/hearst-vague9-screenshots/<name>.png
 *
 * Pré-requis : dev server qui tourne sur localhost:9000 + HEARST_DEV_AUTH_BYPASS=1
 *
 * Usage : npx tsx scripts/visual-loop-vague9.ts
 */

import { chromium, type Page } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:9000";
const OUT_DIR = "/tmp/hearst-vague9-screenshots";

mkdirSync(OUT_DIR, { recursive: true });

async function shot(page: Page, name: string, msg: string): Promise<void> {
  const buf = await page.screenshot({ fullPage: true });
  const path = `${OUT_DIR}/${name}.png`;
  writeFileSync(path, buf);
  console.log(`  📸 ${name}.png — ${msg}`);
}

async function main() {
  console.log(`[visual-loop] Base URL : ${BASE_URL}`);
  console.log(`[visual-loop] Output dir : ${OUT_DIR}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // ── 1. Cockpit avec onboarding overlay ───────────────────────
  console.log("\n[1/4] Cockpit + onboarding overlay (premier login)");
  await page.goto(BASE_URL);
  // Reset onboarding flag pour forcer l'overlay
  await page.evaluate(() => {
    try {
      window.localStorage.removeItem("hearst.onboarded");
    } catch {
      /* ignore */
    }
  });
  // Bascule en mode cockpit via le store dev-exposé. Cf. stores/stage.ts —
  // window.__hearstStageStore n'existe qu'en NODE_ENV !== "production".
  const ok = await page.evaluate(() => {
    type Store = { setState: (s: { current: { mode: string } }) => void };
    const w = window as unknown as { __hearstStageStore?: Store };
    if (!w.__hearstStageStore) return false;
    w.__hearstStageStore.setState({ current: { mode: "cockpit" } });
    return true;
  });
  if (!ok) {
    console.log("  ⚠ __hearstStageStore non exposé — restart du dev server requis");
  }
  await page.waitForTimeout(2500);
  await shot(page, "01-onboarding-slide1", "Slide 1 : Hearst voit ce que tu vois");

  // Click next pour slide 2
  const next = page.getByTestId("onboarding-next");
  const overlayVisible = await next.isVisible().catch(() => false);
  if (overlayVisible) {
    await next.click();
    await page.waitForTimeout(500);
    await shot(page, "02-onboarding-slide2", "Slide 2 : Branche tes outils");
    await next.click();
    await page.waitForTimeout(500);
    await shot(page, "03-onboarding-slide3", "Slide 3 : Lance ta première mission");
    await next.click(); // close
    await page.waitForTimeout(800);
  } else {
    console.log("  ⚠ pas d'overlay détecté — peut-être déjà fermé");
  }

  // ── 2. Cockpit normal (post-onboarding) ──────────────────────
  console.log("\n[2/4] Cockpit principal (post-onboarding)");
  await page.waitForTimeout(1500);
  await shot(page, "04-cockpit-main", "Cockpit avec Hero, Daily Brief card, Watchlist");

  // ── 3. Daily Brief card en évidence ──────────────────────────
  console.log("\n[3/4] Daily Brief card en focus");
  const dailyBriefSection = page.locator("text=/Daily Brief/i").first();
  if (await dailyBriefSection.isVisible().catch(() => false)) {
    await dailyBriefSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await shot(page, "05-daily-brief-card", "Carte Daily Brief (empty state ou PDF)");
  } else {
    console.log("  ⚠ section Daily Brief non visible");
  }

  // ── 4. Mission Stage (si mission existe) ─────────────────────
  console.log("\n[4/4] Mission Stage (si missions existent)");
  // Tente d'ouvrir /missions pour récupérer une missionId
  const missionsRes = await page.request
    .get(`${BASE_URL}/api/v2/missions`)
    .catch(() => null);
  let missionId: string | null = null;
  if (missionsRes && missionsRes.ok()) {
    const data = (await missionsRes.json()) as { missions?: Array<{ id: string }> };
    missionId = data.missions?.[0]?.id ?? null;
  }

  if (missionId) {
    console.log(`  → ouverture mission ${missionId.slice(0, 8)}...`);
    await page.goto(BASE_URL);
    // Force le mode mission via le store dev-exposé.
    await page.evaluate((mid) => {
      type Store = {
        setState: (s: { current: { mode: string; missionId: string } }) => void;
      };
      const w = window as unknown as { __hearstStageStore?: Store };
      if (w.__hearstStageStore) {
        w.__hearstStageStore.setState({ current: { mode: "mission", missionId: mid } });
      }
    }, missionId);
    await page.waitForTimeout(3000);
    await shot(page, "06-mission-stage", "MissionStage avec section Conversation");

    // Scroll vers Conversation
    const conversation = page.locator("text=Conversation").first();
    if (await conversation.isVisible().catch(() => false)) {
      await conversation.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await shot(page, "07-mission-conversation", "Section Conversation détaillée");
    }
  } else {
    console.log("  ⚠ aucune mission — skip Mission Stage");
  }

  await browser.close();
  console.log(`\n✅ Screenshots dans ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("[visual-loop] erreur :", err);
  process.exit(1);
});
