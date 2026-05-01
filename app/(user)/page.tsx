/**
 * HomePage — Server Component (Phase C5).
 *
 * Pre-fetch le payload Cockpit côté serveur via `getCockpitToday(scope)` et
 * le passe en prop initiale à `HomePageClient`. CockpitStage utilise cette
 * data en first paint au lieu d'attendre son `useEffect` fetch GET
 * `/api/v2/cockpit/today` au mount → gain LCP attendu 300-500ms.
 *
 * Auth fail-soft : si `requireScope` échoue (session manquante côté serveur,
 * cas dev / cookies non rehydratés), on rend `initialCockpitData = null`
 * et le client retombe sur son fetch existant. Aucune régression.
 */

import { requireScope } from "@/lib/platform/auth/scope";
import { getCockpitToday, type CockpitTodayPayload } from "@/lib/cockpit/today";
import HomePageClient from "./HomePageClient";

export const dynamic = "force-dynamic";

async function loadInitialCockpitData(): Promise<CockpitTodayPayload | null> {
  const { scope, error } = await requireScope({ context: "RSC app/(user)/page.tsx" });
  if (error || !scope) return null;
  try {
    return await getCockpitToday({
      userId: scope.userId,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
    });
  } catch (err) {
    console.error("[RSC HomePage] getCockpitToday failed, falling back to client fetch:", err);
    return null;
  }
}

export default async function HomePage() {
  const initialCockpitData = await loadInitialCockpitData();
  return <HomePageClient initialCockpitData={initialCockpitData} />;
}
