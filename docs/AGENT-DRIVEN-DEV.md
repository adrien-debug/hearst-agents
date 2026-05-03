# Agent Driven Dev — État du projet

> **Document maître à lire en premier par tout agent intervenant sur ce repo.**
> Source de vérité unique sur l'état du verrouillage features. À jour : `2026-05-03`.

## Pour l'agent qui arrive (lecture obligatoire)

Si tu es un agent (Claude, ChatGPT, Cursor, Copilot, etc.) et tu vas modifier ce repo :

1. **Lis ce fichier en entier.** Il te dit quelles zones sont verrouillées.
2. **Avant toute modification d'une feature listée comme `locked` ci-dessous** : ouvre `docs/features/<id>.md`, lis la section "Invariants verrouillés", vérifie que ton changement n'en contredit aucun.
3. **Si ton changement contredit un invariant** : tu dois proposer un update de spec à Adrien **avant** de coder. Pas d'exception.
4. **Si la feature n'est pas encore verrouillée** : tu suis le mode autonomie défini dans [CLAUDE.md](../CLAUDE.md).
5. **Quand tu finis du travail sur une feature spec'd** : mets à jour la section "dernière revue" dans `docs/features/<id>.md` et incrémente `version spec` si tu as touché aux invariants (avec validation préalable).

## Méthode

L'objectif est de mettre Hearst OS sous contrôle Agent Driven Dev sans casser l'existant. La méthode :

1. **Inventaire** (fait) — 32 features identifiées rétroactivement à partir du code existant
2. **Verrouillage feature par feature** (en cours) — pour chaque feature, on écrit une spec figée dans `docs/features/<id>.md` qui capture :
   - Surface publique (composants exportés, endpoints API)
   - Architecture interne (stores, libs, dépendances)
   - **Invariants verrouillés** (ce qui ne peut pas changer sans update spec)
   - **Évolutions autorisées** (ce qui peut bouger librement)
   - Tests existants vs manquants
   - Risques connus
3. **Index des verrous** dans [docs/rules/locked-zones.md](rules/locked-zones.md)
4. **Itération** — une fois toutes les features critiques verrouillées, on traite les gaps (tests manquants, drift, code orphelin)

## Phase actuelle

**Phase 2 — Verrouillage feature par feature (pilote en cours).**

Ordre choisi : on verrouille **une feature à la fois**, on valide le format avec Adrien, puis on duplique aux suivantes.

### Pilote

`cockpit` — verrouillé en version `1.0` le `2026-05-03`. En attente validation Adrien pour duplication aux features suivantes.

## Tableau de bord features

| # | id | Statut | Spec | Niveau | Tests existants | Gap tests |
|---|----|----|----|----|----|----|
| F-01 | auth | non verrouillé | — | P0 | partiel | élevé |
| F-02 | **cockpit** | **verrouillé v1.0** | [cockpit.md](features/cockpit.md) | P1 | 3 fichiers | élevé (e2e + UI components + lifecycle) |
| F-03 | chat | non verrouillé | — | P0 | bon (orchestrator) | moyen |
| F-04 | missions | non verrouillé | — | P1 | bon | moyen |
| F-05 | runs | non verrouillé | — | P1 | partiel | moyen |
| F-06 | reports | non verrouillé | — | P1 | bon | faible |
| F-07 | assets | non verrouillé | — | P1 | partiel | moyen |
| F-08 | memory-kg | non verrouillé | — | P1 | partiel | élevé |
| F-09 | daily-brief | non verrouillé | — | P1 | bon | faible |
| F-10 | personas | non verrouillé | — | P2 | bon | faible |
| F-11 | connections | non verrouillé | — | P1 | partiel | moyen |
| F-12 | voice | non verrouillé | — | P2 | partiel | élevé |
| F-13 | browser | non verrouillé | — | P2 | partiel | élevé |
| F-14 | meetings | non verrouillé | — | P2 | bon | moyen |
| F-15 | marketplace | review | — | P2 | partiel | moyen |
| F-16 | commandeur | non verrouillé | — | P1 | manquant | élevé |
| F-17 | timeline-rail | in_progress | — | P2 | manquant | élevé |
| F-18 | context-rail | in_progress | — | P2 | partiel | élevé |
| F-19 | stage | non verrouillé | — | P0 | bon | moyen |
| F-20 | admin | non verrouillé | — | P2 | partiel | moyen |
| F-21 | notifications | non verrouillé | — | P2 | bon | faible |
| F-22 | webhooks | non verrouillé | — | P2 | bon | faible |
| F-23 | workflows | review | — | P2 | partiel | moyen |
| F-24 | datasets | review | — | P3 | manquant | élevé |
| F-25 | simulation | review | — | P3 | manquant | élevé |
| F-26 | artifact | in_progress | — | P2 | partiel | moyen |
| F-27 | onboarding | review | — | P3 | présent | faible |
| F-28 | settings | non verrouillé | — | P2 | manquant | moyen |
| F-29 | hospitality | review | — | P3 | manquant | élevé |
| F-30 | pulsebar | non verrouillé | — | P2 | manquant | moyen |
| F-31 | planner | review | — | P3 | manquant | élevé |
| F-32 | electron | review | — | P3 | manquant | élevé |

**Statuts possibles** :
- `non verrouillé` — autonomie standard, pas de spec figée
- `verrouillé v<n>` — spec figée, invariants à respecter
- `in_progress` — feature en construction active, pas verrouillable encore
- `review` — périmètre flou, à clarifier avant verrouillage
- `legacy` — pressenti obsolète, à vérifier avant suppression

## Ordre de verrouillage proposé

P0 d'abord (bloque tout si régression), puis P1, puis P2.

```
Verrouillé : cockpit (P1, pilote)
À faire :
  1. auth      (P0) — risque max, surface petite, idéal après pilote
  2. stage     (P0) — routing UI central
  3. chat      (P0) — cœur produit, surface large
  4. missions  (P1) — distributed lease Redis
  5. assets    (P1) — hybrid storage
  6. connections (P1) — write-guard Composio
  7. reports   (P1) — sharing token public
  8. memory-kg (P1) — backfill destructif possible
  9. (... reste à arbitrer après ces 8)
```

## Procédure pour verrouiller une nouvelle feature

1. Scan détaillé du périmètre (composants, API, stores, deps externes)
2. Copier `docs/features/_template.md` → `docs/features/<id>.md`
3. Remplir toutes les sections avec ce qui est **réellement dans le code** (pas d'aspirational)
4. Identifier les invariants — règle : un invariant = une chose qui, si elle changeait, casserait silencieusement quelque chose
5. Lister les tests existants et ceux qui manquent
6. Soumettre à Adrien pour validation
7. Une fois validé : ajouter une entrée dans [docs/rules/locked-zones.md](rules/locked-zones.md)
8. Mettre à jour ce fichier (`AGENT-DRIVEN-DEV.md`) : tableau de bord features

## Drift connu (à clore)

État `git status` au moment du verrouillage cockpit :

```
M  app/(user)/components/ChatInput.tsx
M  app/(user)/components/ContextRail.tsx
M  app/(user)/components/StageFooter.tsx
M  app/(user)/components/cockpit/ActivityStrip.tsx
M  app/(user)/components/cockpit/CockpitAgenda.tsx
M  app/(user)/components/cockpit/CockpitHeader.tsx
M  app/(user)/components/cockpit/CockpitHome.tsx
M  app/(user)/components/cockpit/KPIStrip.tsx
M  app/(user)/components/cockpit/QuickActionsGrid.tsx
M  app/(user)/components/cockpit/WatchlistMini.tsx
M  app/(user)/components/right-panel/GeneralDashboard.tsx
M  app/(user)/layout.tsx
M  app/globals.css
```

⚠ La spec `cockpit` a été écrite **après** ces modifications locales — donc le verrouillage capture l'état *avec* ces changements. Si Adrien revert ces modifs, la spec doit être relue.

## Bugs runtime observés (orthogonaux au verrouillage, à traiter en feature séparée)

- `402 Payment Required` sur `/api/v2/assets/{id}/variants` (logs dev `2026-05-03`) — probable quota provider IA dépassé
- `400 Bad Request` même endpoint
- `[notifications] startPolling() est déprécié` — migration realtime non finie
- Composio SDK `0.6.11` vs `0.8.1` dispo

## Liens

- [Inventaire features complet (Phase 1)](features/) — toutes les specs au fur et à mesure
- [Index des verrous](rules/locked-zones.md)
- [Template spec](features/_template.md)
- [CLAUDE.md](../CLAUDE.md) — règles autonomie générales
- [README.md](../README.md) — entrée projet

## Historique

| Date | Événement |
|------|-----------|
| 2026-05-03 | Phase 1 — Inventaire 32 features |
| 2026-05-03 | Phase 2 — Pilote `cockpit` verrouillé v1.0 |
