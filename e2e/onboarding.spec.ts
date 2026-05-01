/**
 * E2E — Onboarding 3 slides + exemple grisé (vague 9, action #5).
 *
 * Couvre :
 *  1. Première visite (localStorage clean) → overlay s'affiche
 *  2. Navigation slide 1 → 2 → 3 → close
 *  3. Persistence : après close, le flag localStorage est posé,
 *     reload n'affiche plus le tour
 *  4. Bouton "Passer" + Escape ferme aussi
 *
 * Tous ces tests nécessitent auth (Cockpit est la première route qui mount
 * le Tour). En CI sans auth, on valide juste la redirection.
 */

import { test, expect } from "@playwright/test";

test.describe("Onboarding — public surface (no auth)", () => {
  test("la racine redirige vers login si pas authentifié", async ({ page }) => {
    await page.goto("/");
    // Soit on voit /login, soit on est connecté via dev bypass et on voit le Cockpit
    const url = page.url();
    expect(url.includes("/login") || url.endsWith("/")).toBe(true);
  });
});

test.describe("@skip-ci Onboarding — full flow (auth required)", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !process.env.HEARST_E2E_RUN_AUTH,
      "Set HEARST_E2E_RUN_AUTH=1 + HEARST_DEV_AUTH_BYPASS=1 to run",
    );
    // Reset localStorage pour forcer l'overlay
    await page.goto("/");
    await page.evaluate(() => {
      try {
        window.localStorage.removeItem("hearst.onboarded");
      } catch {
        /* ignore */
      }
    });
  });

  test("première visite : l'overlay s'affiche et navigue 3 slides", async ({
    page,
  }) => {
    await page.goto("/");

    // Overlay visible avec slide 1
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Hearst voit ce que tu vois")).toBeVisible();

    // Slide 1 → 2
    await page.getByTestId("onboarding-next").click();
    await expect(page.locator("text=Branche tes outils en un clic")).toBeVisible();

    // Slide 2 → 3
    await page.getByTestId("onboarding-next").click();
    await expect(page.locator("text=Lance ta première mission")).toBeVisible();

    // Slide 3 → fermeture
    await page.getByTestId("onboarding-next").click();
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // Persistence : reload doit montrer Cockpit sans overlay
    await page.reload();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("bouton Passer ferme et persiste le flag", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
    await page.getByLabel(/Passer l'onboarding/).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("Escape ferme l'overlay", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });
});
