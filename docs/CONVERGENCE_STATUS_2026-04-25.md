# Hearst OS — État d'avancement et écarts (25/04/2026)

Document de référence pour aligner le repo réel avec la vision produit et `HEARST-ARCHITECTURE-FINALE.html`.

**Date de mise à jour** : 25/04/2026  
**Précédente version** : [2026-04-24](./CONVERGENCE_STATUS_2026-04-24.md)

---

## 1. Synthèse

Le projet est dans un état **intermédiaire stable avancé**. Les fondations (Sécurité, Responsive, Types unifiés, Feedback utilisateur) sont maintenant en place. La convergence finale n'est pas terminée mais le socle est solide.

La direction produit reste inchangée : chat central, runtime canonique, right panel, focal objects, missions, connecteurs réels.

Le principal risque reste le **drift entre documentation, code réel et architecture cible**, mais il est maintenant **documenté et partiellement résolu**.

---

## 2. Ce qui a été fait (mise à jour 25/04)

### 2.1 Fondations — Semaines 0–4 ✅

| Semaine | Livrable | Fichiers | Statut |
|---------|----------|----------|--------|
| **1** | Sécurité env prod | `lib/env.server.ts` | ✅ Interdit bypass en prod |
| **1** | E2E smoke tests | `e2e/smoke.spec.ts`, `playwright.config.ts` | ✅ CI-ready |
| **2** | Responsive shell | `layout.tsx`, `LeftPanel`, `RightPanel` | ✅ Mobile drawer + desktop |
| **3** | Feedback utilisateur | `Toast.tsx`, `use-toast.ts`, `page.tsx` | ✅ 7 points d'erreur couverts |
| **4** | Login FR | `app/login/page.tsx` | ✅ 100% français |
| **4** | Core types unifiés | `lib/core/types/` | ✅ Barrel export canonique |

### 2.2 Architecture Finale — Squelettes créés

```
lib/
├── core/types/           ✅ Canonique actif
├── platform/             ✅ Squelette Phase 7
├── engine/               ✅ Squelette Phase 7
├── agents/               ✅ Squelette Phase 7
└── connectors/packs/     ✅ Squelette Phase 7+
```

### 2.3 Résumé des changements récents

**Sécurité**
- `HEARST_DEV_AUTH_BYPASS=1` interdit en production (crash explicite)
- API key optionnelle mais documentée

**Responsive**
- LeftPanel : caché sur mobile, collapsible sur desktop
- RightPanel : drawer mobile avec toggle FAB, sidebar desktop
- Breakpoint : `md` (768px)

**UX**
- Système toast : info, success, error, warning
- Auto-dismiss 5s, accessible (role="alert")
- Couverture erreurs : orchestration, OAuth, connecteurs

**I18n**
- Login 100% français (CTA, erreurs, micro-copy)
- Fallbacks silencieux pour right-panel (non bloquant)

---

## 3. Ce qui est fait mais encore partiel

| Élément | Statut | Notes |
|---------|--------|-------|
| `lib/core/types/` | 🟡 Partiel | Canonique créé, migration progressive |
| RightPanel UI | 🟡 Fonctionnel | Drawer mobile OK, INDEX/DOCUMENT différé |
| Focal objects | 🟡 Fonctionnels | `mapFocalObject` extrait, dédoublonnage partiel |
| Assets storage | 🔴 Local | Reste file-backed, cloud (R2/S3) Phase 7+ |
| Settings dynamiques | 🔴 Hardcodés | `lib/platform/settings/` squelette uniquement |
| RBAC | 🔴 Absent | `roles`, `user_roles` Phase 7+ |

---

## 4. Ce qu'il reste à faire

### Phase 5 — Analytics (Semaine 5)

- [ ] 4 événements logs structurés (login, message, run, erreur)
- [ ] Configuration via `lib/platform/settings/` (début)

### Phase 6 — E2E complet (Semaine 6)

- [ ] Happy path E2E : login → message → focal visible
- [ ] Test mobile : drawer toggle, responsive
- [ ] Test erreur : toast visibility

### Phase 7 — Convergence Architecture Finale (Mois 2)

- [ ] Migration `lib/runtime/` → `lib/engine/runtime/`
- [ ] Unification types `lib/right-panel/objects.ts` → `stores/focal.ts`
- [ ] Settings dynamiques : `system_settings` table
- [ ] Auth déplacé : `lib/auth.ts` → `lib/platform/auth/`

### Phase 8+ — Scale (Mois 3+)

- [ ] `StorageProvider` abstraction (local → R2/S3)
- [ ] Connector packs structure
- [ ] RBAC complet
- [ ] Admin dynamique

---

## 5. Écarts constatés (mise à jour)

### 5.1 Écarts document → code (résolus ✅)

| Avant (24/04) | Après (25/04) | Action |
|---------------|---------------|--------|
| README décrivait `AppNav`, `GlobalChat`, `TopContextBar` | README pointe vers `lib/core/types/` et composants réels | ✅ Mis à jour |
| `lib/core/types/` inexistant | Créé avec barrel export | ✅ Créé |
| Login anglais | Login 100% français | ✅ Traduit |
| Pas de feedback erreur | Toasts sur 7 points critiques | ✅ Implémenté |

### 5.2 Écarts code → Architecture Finale HTML

| Cible HTML | État actuel | Gap |
|------------|-------------|-----|
| `lib/platform/` plein | Squelette `.gitkeep` | Attend Phase 7 |
| `lib/engine/` plein | Squelette `.gitkeep` | Attend Phase 7 |
| `StorageProvider` | Pas de abstraction | Phase 7+ |
| 200+ connecteurs | 12 natifs + Nango | Phase 8+ (traction) |

---

## 6. Verdict produit

- ✅ **Fondations solides** : sécurité, responsive, types, feedback
- ✅ **Architecture Finale alignée** : squelettes créés, roadmap documentée
- 🟡 **Convergence en cours** : Phase 7 (unification types, migration engine)
- 🔴 **Scale non prioritaire** : cloud, RBAC, connector packs attendent traction

**Prochaine décision critique** : valider E2E happy path avant d'ouvrir Phase 7 (réorganisation profonde).

---

## 7. Ordre recommandé (mis à jour)

1. **Semaine 5** — Analytics minimal (4 events) + validation
2. **Semaine 6** — E2E complet (happy path + mobile + erreurs)
3. **Phase 7** — Convergence types + migration engine (post-E2E)
4. **Phase 8+** — Scale (cloud, RBAC, connector packs)

**Gate de sortie Phase 6** : E2E verts = confiance pour réorganisation profonde.
