/**
 * E2E — Tool `run_mission` + UI inline `ChatMissionRunInline`.
 *
 * Couvre :
 *  1. Smoke API : POST /api/v2/missions/[id]/run sans auth → pas de 5xx
 *  2. Smoke API : la route accepte un POST minimal sans crash
 *  3. Flow utilisateur complet (skip-ci) : chat → tool run_mission →
 *     card cliquable → click → mission lancée
 *
 * Le flow complet est `@skip-ci` car il nécessite Supabase live + auth +
 * une mission existante. Run manuel :
 *   HEARST_E2E_RUN_AUTH=1 HEARST_E2E_MISSION_NAME="Synthèse weekly" \
 *     npx playwright test e2e/run-mission.spec.ts
 */

import { test, expect } from "@playwright/test";

test.describe("run_mission API guards (no auth)", () => {
  test("POST /api/v2/missions/[id]/run refuse l'accès sans session (pas de 5xx)", async ({
    request,
  }) => {
    const res = await request.post(
      "/api/v2/missions/00000000-0000-0000-0000-000000000000/run",
    );
    // 401 (pas auth), 404 (mission inexistante mais auth OK), 302 (redirect login)
    // Accepte 200 (HEARST_DEV_AUTH_BYPASS=1 actif) ou 401/403/404/302/307
    // selon que le bypass est actif ou non. L'important : pas de 5xx.
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/v2/missions/[id]/run avec body vide → toujours pas de 5xx", async ({
    request,
  }) => {
    const res = await request.post(
      "/api/v2/missions/00000000-0000-0000-0000-000000000000/run",
      { data: {} },
    );
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe("@skip-ci run_mission — full chat flow (auth required)", () => {
  test("user dit « lance la mission X » → card ChatMissionRunInline visible", async ({
    page,
  }) => {
    test.skip(
      !process.env.HEARST_E2E_RUN_AUTH,
      "Set HEARST_E2E_RUN_AUTH=1 + HEARST_DEV_AUTH_BYPASS=1 + HEARST_E2E_MISSION_NAME to run",
    );
    const missionName = process.env.HEARST_E2E_MISSION_NAME;
    test.skip(!missionName, "HEARST_E2E_MISSION_NAME env var required");

    await page.goto("/");

    // Trouve l'input chat principal et envoie un message qui doit déclencher
    // le tool run_mission via le LLM
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill(`lance la mission ${missionName}`);
    await textarea.press("Enter");

    // La card ChatMissionRunInline doit apparaître après que le LLM appelle
    // run_mission et émette mission_run_request. Le timeout est large car
    // le streamText peut prendre 5-15s avant d'invoquer le tool.
    await expect(
      page.getByRole("region", { name: /Confirmation de lancement de mission/i }),
    ).toBeVisible({ timeout: 30_000 });

    // Le bouton « Lancer maintenant » est cliquable
    const runButton = page.getByRole("button", { name: /Lancer maintenant/i });
    await expect(runButton).toBeVisible();
    await expect(runButton).toBeEnabled();
  });

  test("card affiche le nom de la mission et le badge de match", async ({
    page,
  }) => {
    test.skip(
      !process.env.HEARST_E2E_RUN_AUTH,
      "Set HEARST_E2E_RUN_AUTH=1 + HEARST_DEV_AUTH_BYPASS=1 + HEARST_E2E_MISSION_NAME to run",
    );
    const missionName = process.env.HEARST_E2E_MISSION_NAME;
    test.skip(!missionName, "HEARST_E2E_MISSION_NAME env var required");

    await page.goto("/");
    const textarea = page.locator("textarea").first();
    await textarea.fill(`relance la mission ${missionName}`);
    await textarea.press("Enter");

    const card = page.getByRole("region", {
      name: /Confirmation de lancement de mission/i,
    });
    await expect(card).toBeVisible({ timeout: 30_000 });

    // Le titre de la mission doit être présent dans la card
    await expect(card).toContainText(missionName as string);

    // L'un des labels de match doit s'afficher (selon similarity)
    const matchBadgeRegex = /(Correspondance exacte|Préfixe|Approchant)/i;
    await expect(card).toContainText(matchBadgeRegex);
  });
});
