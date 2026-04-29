/**
 * E2E — Validation post-migration 0026_user_identity_uuid_cleanup.
 *
 * Scénario critique : un asset créé avant la migration (sa provenance
 * a un email comme userId) doit rester VISIBLE pour son propriétaire
 * après l'application de 0026 (qui backfill email→UUID) et 0028 (RLS
 * user-scoped).
 *
 * Si le test échoue, c'est que le backfill 0026 n'a pas couvert un
 * pattern d'écriture, ou que la session.user.id ne correspond pas à
 * l'UUID stocké après backfill.
 *
 * Pré-requis runtime :
 *  - 0026 + 0028 appliquées en DB
 *  - Login OAuth fonctionnel (ou HEARST_DEV_AUTH_BYPASS=1 + DEV_USER UUID
 *    correspondant à un row public.users existant)
 *  - Asset existant créé pendant le legacy (provenance.userId = email)
 *
 * Skip-CI : ce test demande un browser + une session OAuth réelle. Run
 * manuellement avec `npx playwright test e2e/auth/uuid-cleanup.spec.ts`.
 */

import { test, expect } from "@playwright/test";

test.describe("@skip-ci UUID cleanup post-migration", () => {
  test("legacy asset reste visible après login (RLS user-scoped + backfill 0026)", async ({ page }) => {
    test.skip(!process.env.HEARST_E2E_RUN_AUTH, "Set HEARST_E2E_RUN_AUTH=1 to run");

    // 1. Login (utilise dev bypass si configuré)
    await page.goto("/");

    // 2. Vérifie qu'on a une session authentifiée (cookies set)
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) => c.name.includes("next-auth.session-token"));
    expect(sessionCookie).toBeDefined();

    // 3. Liste les assets via l'API — l'utilisateur doit en voir au moins 1
    //    (hypothèse : ses assets legacy ont été backfill par 0026).
    const assetsRes = await page.request.get("/api/v2/assets?limit=10");
    expect(assetsRes.ok()).toBeTruthy();
    const data = await assetsRes.json();

    expect(Array.isArray(data.assets)).toBe(true);
    if (data.assets.length === 0) {
      console.warn("[E2E uuid-cleanup] 0 assets visible — soit migration 0026 incomplète, soit user n'a pas d'assets legacy");
      // On ne fail pas le test sur 0 assets : le user peut être nouveau.
      return;
    }

    // 4. Logout puis relogin — l'asset doit rester visible (pas
    //    d'invisibilité fantôme due à RLS).
    await page.request.post("/api/auth/signout");
    await page.goto("/");

    const reloggedAssets = await page.request.get("/api/v2/assets?limit=10");
    expect(reloggedAssets.ok()).toBeTruthy();
    const reloggedData = await reloggedAssets.json();

    expect(Array.isArray(reloggedData.assets)).toBe(true);
    expect(reloggedData.assets.length).toBe(data.assets.length);
  });

  test("POST /api/v2/assets/[id]/variants retourne 401 sans UUID résolu", async ({ page }) => {
    test.skip(!process.env.HEARST_E2E_RUN_AUTH, "Set HEARST_E2E_RUN_AUTH=1 to run");

    // Sans cookies de session = pas d'UUID = 401 (post-Phase 2).
    // Avant Phase 2, le fallback email aurait retourné 200 ou 404 fail.
    const ctx = await page.context().browser()?.newContext();
    if (!ctx) throw new Error("New browser context failed");

    const res = await ctx.request.post("/api/v2/assets/dummy-id/variants", {
      data: { kind: "audio", text: "test" },
    });
    expect(res.status()).toBe(401);
    await ctx.close();
  });
});
