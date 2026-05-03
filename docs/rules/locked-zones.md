# Zones verrouillées — Hearst OS

## But

Index des features et chemins du repo soumis à des **invariants verrouillés**. Toute modification d'un invariant ci-dessous exige une mise à jour de la spec correspondante (validée par Adrien) **avant** d'écrire du code.

Hors invariants, le travail reste libre selon le mode autonomie défini dans [CLAUDE.md](../../CLAUDE.md).

## Légende

| Niveau | Sens |
|--------|------|
| **P0** | Régression = app cassée pour tous les utilisateurs (auth, routing central, pipeline IA) |
| **P1** | Régression = feature majeure cassée silencieusement (data loss, race condition, sécurité) |
| **P2** | Régression = dégradation visible mais réparable (UX, perf, edge cases) |

## Procédure pour modifier un invariant

1. Ouvrir le fichier `docs/features/<id>.md` correspondant
2. Section "Invariants verrouillés" : lire l'invariant concerné
3. Si le changement le contredit → proposer un update spec à Adrien **avant** de coder
4. Si Adrien valide → mettre à jour la spec (incrémenter `version spec`, mettre à jour `dernière revue`)
5. Coder
6. PR référence la spec mise à jour

## Index des features verrouillées

### Cockpit — `cockpit` · P1

Spec : [docs/features/cockpit.md](../features/cockpit.md)

**Invariants** (résumé — détails dans la spec) :

| # | Invariant | Chemins surveillés |
|---|-----------|---------------------|
| I-1 | Contrat endpoint `GET /api/v2/cockpit/today` (auth, runtime, output) | `app/api/v2/cockpit/today/route.ts` |
| I-2 | Philosophie fail-soft : toute source via `safe<T>()` | `lib/cockpit/today.ts` |
| I-3 | Honest empty state (pas de mock fallback Phase B3) | `lib/cockpit/agenda-live.ts`, `lib/cockpit/watchlist-live.ts` |
| I-4 | Cache 5min `(userId, tenantId)` sur live providers | `lib/cockpit/agenda-live.ts`, `lib/cockpit/watchlist-live.ts` |
| I-5 | Stage routing via `useStageStore.current.mode === "cockpit"` | `app/(user)/components/stages/CockpitStage.tsx`, `stores/stage.ts` |
| I-6 | Spline scene URL + `SplineErrorBoundary` obligatoire | `app/(user)/components/cockpit/HaloAgentCore.tsx` |
| I-7 | Mapping agents → routes (pilot, scribe, delve, pulse, warden, cortex) | `app/(user)/components/cockpit/HaloAgentCore.tsx` |
| I-8 | RSC prefetch + client refetch au mount | `app/(user)/page.tsx`, `app/(user)/components/stages/CockpitStage.tsx` |

**Composants orphelins** (non verrouillés tant que non câblés, mais câblage = update spec) :
- `HaloAgentCore.tsx`
- `QuickActionsGrid.tsx`
- `AgentsConstellation.tsx`
- `CockpitHero.tsx`

---

## Features non encore verrouillées

Les 31 autres features de l'inventaire restent en mode autonomie standard tant que leur spec n'est pas écrite. Ordre de priorité de verrouillage proposé :

1. `auth` (P0) — risque max, surface petite
2. `chat` (P0) — cœur produit, surface énorme
3. `stage` (P0) — routing central UI
4. `missions` (P1) — distributed lease Redis critique
5. `assets` (P1) — hybrid storage
6. `connections` (P1) — write-guard Composio
7. `reports` (P1) — sharing token public
8. `memory-kg` (P1) — backfill destructif possible
9. `notifications` (P2) — throttle flood
10. (… reste à arbitrer)

## Chemins infrastructurels P0/P1 à surveiller (transversaux)

Ces chemins ne sont rattachés à aucune feature unique mais sont critiques. Listés ici pour mémoire — chaque feature concernée les référence dans sa spec.

| Chemin | Niveau | Pourquoi |
|--------|--------|----------|
| `lib/engine/orchestrator/` | P0 | Pipeline IA central, planner, safety gate |
| `lib/llm/router.ts` + `circuit-breaker.ts` + `rate-limiter.ts` | P0 | Routing toutes requêtes LLM |
| `lib/platform/auth/` | P0 | NextAuth, session, tokens, scope |
| `supabase/migrations/` | P0 | Irréversible en prod |
| `stores/stage.ts`, `stores/focal.ts`, `stores/runtime.ts` | P0 | État global UI |
| `lib/engine/runtime/missions/distributed-lease.ts` | P1 | Redis distributed lock — race conditions |
| `lib/connectors/composio/write-guard.ts` | P1 | Seule protection contre actions destructives IA |
| `lib/security/arcjet.ts` | P1 | Middleware global rate-limit / bot |
| `lib/engine/runtime/assets/storage/hybrid.ts` | P1 | Logique fallback R2 / Supabase / local |
| `lib/credits/middleware.ts` | P1 | Compteur consommation — faux positifs = UX brisée |
| `lib/reports/sharing/signed-url.ts` | P2 | Token public — sécurité |
| `lib/notifications/throttle.ts` | P2 | Flood possible si bypass |
