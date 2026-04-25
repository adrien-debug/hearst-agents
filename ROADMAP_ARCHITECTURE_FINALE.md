# Roadmap Hearst OS — Alignement Architecture Finale

Ce document aligne le plan d'exécution (7 semaines) sur la [vision Architecture Finale](HEARST-ARCHITECTURE-FINALE.html).

## Principes directeurs

1. **Convergence avant réécriture** — Stabiliser la codebase actuelle avant migration massive
2. **lib/core/types/ premier** — Unification des types comme fondation de tout le reste
3. **Doublons éliminés progressivement** — Pas de suppression brutale, marquage @deprecated puis migration
4. **Connector Packs post-scale** — Garder lib/integrations/ fonctionnel jusqu'à tractions confirmée

---

## Phase 0–1 : Fondations (Semaines 0–1)

**Architecture Finale alignment** : Préparer le terrain pour `lib/core/types/` et `lib/platform/`.

| Livrable | Fichier(s) | Statut |
|----------|-----------|--------|
| ✅ Validation env prod | `lib/env.server.ts` | **Créé** |
| ✅ Smoke tests E2E | `e2e/smoke.spec.ts`, `playwright.config.ts` | **Créé** |
| ✅ Barrel types canonique | `lib/core/types/index.ts` | **Créé** |
| ✅ Focal utilities | `lib/core/types/focal.ts` | **Créé** |
| 🔄 CI verte | `.github/workflows/ci.yml` | **Créé, à valider** |

**Structure créée** :
```
lib/
├── core/
│   └── types/          ← NOUVEAU (Architecture Finale)
│       ├── index.ts    ← Barrel export unifié
│       └── focal.ts    ← Mapping utilities
├── platform/           ← SQUELETTE Phase 7
├── engine/             ← SQUELETTE Phase 7
├── agents/             ← SQUELETTE Phase 7
└── connectors/packs/   ← SQUELETTE Phase 7+
```

---

## Phase 2–3 : Shell Responsive + Feedback (Semaines 2–3)

**Architecture Finale alignment** : UI stable avant migration profonde.

| Composant | Architecture Finale | Action |
|-----------|---------------------|--------|
| `LeftPanel` | `app/(user)/components/LeftPanel.tsx` | Collapse `< md` |
| `RightPanel` | `app/(user)/components/RightPanel.tsx` | Drawer pattern |
| `FocalStage` | `app/(user)/components/FocalStage.tsx` | Intact, utilise `lib/core/types/focal` |
| Toasts | `app/components/Toast.tsx` (à créer) | Nouveau système feedback |

**Import alignment** :
```typescript
// Avant (dispersé)
import type { FocalObject } from "@/stores/focal";
import { mapFocalObject } from "@/lib/focal/utils";  // ← Supprimé

// Après (Architecture Finale)
import type { FocalObject } from "@/lib/core/types";
import { mapFocalObject } from "@/lib/core/types/focal";
```

---

## Phase 4–5 : Documentation + Analytics (Semaines 4–5)

**Architecture Finale alignment** : Observabilité avant migration `lib/engine/`.

| Domaine | Actuel | Cible Architecture Finale |
|---------|--------|---------------------------|
| Logs structurés | `console.log` + server | `lib/platform/settings/` pour config logging |
| Analytics | Logs serveur | Même, mais via abstraction settings |
| README | Root | Reste root, mais pointe vers `lib/core/types/` |

---

## Phase 6 : Tests E2E (Semaine 6)

**Architecture Finale alignment** : Filet de sécurité avant réorganisation `lib/engine/`.

```
e2e/
├── smoke.spec.ts           ← ✅ Existant (health, login)
├── chat.spec.ts            ← À créer (happy path)
├── focal.spec.ts           ← À créer (focal object flow)
└── mobile.spec.ts          ← À créer (responsive breakpoints)
```

---

## Phase 7+ : Convergence Architecture Finale (Mois 2–3)

### Étape 7.1 : Type Unification (Semaine 7)

**Objectif** : Éliminer `lib/right-panel/objects.ts` doublon.

| Fichier | Action |
|---------|--------|
| `stores/focal.ts` | Canonique — ajouter champs manquants de `objects.ts` |
| `lib/right-panel/objects.ts` | Marquer legacy, migrer imports |
| `lib/core/types/index.ts` | Export unique source de vérité |

### Étape 7.2 : Migration `lib/platform/` (Mois 2)

Déplacer depuis racine/lib vers architecture finale :
- `lib/auth.ts` → `lib/platform/auth/`
- `lib/supabase-server.ts` → `lib/platform/db/`
- Flags hardcodés → `lib/platform/settings/system.ts`

### Étape 7.3 : Migration `lib/engine/` (Mois 2–3)

Restructuration runtime :
```
lib/runtime/*           → lib/engine/runtime/* (inchangé d'abord)
lib/orchestrator/*      → lib/engine/orchestrator/
lib/planner/*           → lib/engine/planner/
```

Refonte assets (critique) :
```
lib/runtime/assets/*    → lib/engine/runtime/assets/
                           ├── storage/interface.ts  ← StorageProvider
                           ├── storage/local.ts      ← Dev
                           ├── storage/cloud.ts      ← R2/S3
                           └── storage/hybrid.ts     ← Hot/cold
```

### Étape 7.4 : Connector Packs (Mois 3+)

Uniquement après traction confirmée :
```
lib/integrations/       → lib/connectors/packs/*/services/
lib/connectors/nango/   → lib/connectors/packs/*/auth/
```

---

## Matrice de décision : Quand migrer ?

| Composant | Migrer maintenant ? | Raison |
|-----------|---------------------|--------|
| `lib/core/types/` | ✅ **Oui** | Fondation, pas de breaking change |
| `lib/env.server.ts` | ✅ **Oui** | Sécurité critique |
| E2E tests | ✅ **Oui** | Filet de sécurité |
| Responsive shell | ✅ **Oui** | UX critique |
| `lib/platform/` | ⏳ **Non** | Attendre stabilité types |
| `lib/engine/` | ⏳ **Non** | Attendre filet E2E complet |
| Connector Packs | ⏳ **Non** | Attendre traction 100+ users |
| RBAC | ⏳ **Non** | Attendre demande enterprise |

---

## Checklist alignement avant prochaine phase

- [ ] `lib/core/types/` importé par au moins 3 composants
- [ ] `lib/right-panel/objects.ts` marqué @deprecated avec lien vers canonique
- [ ] E2E tests passent sur mobile + desktop
- [ ] README mis à jour avec lien `lib/core/types/`
- [ ] Squelette `lib/platform/`, `lib/engine/`, `lib/agents/` documenté

---

**Document version** : 2026-04-25  
**Architecture Finale référence** : HEARST-ARCHITECTURE-FINALE.html
