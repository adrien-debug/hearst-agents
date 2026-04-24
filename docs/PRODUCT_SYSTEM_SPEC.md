# Hearst OS — Product System Spec

Document d'alignement **produit · design · engineering**, ancré sur le code et les routes actuels (pas une cible fictive). Chaque notion renvoie à une couche réelle ; les **tensions** avec le legacy sont explicites.

---

## 1. Canonical product loop

**Boucle réelle (utilisateur authentifié, shell `app/(user)/layout.tsx`)**  
L'utilisateur formule une **intention** dans `ChatInput` (`app/(user)/components/ChatInput.tsx`) → le client appelle **`POST /api/orchestrate`** (`app/api/orchestrate/route.ts`) avec `message`, `thread_id`, `surface`, `conversation_id`, `focal_context`, `history` optionnels → le serveur exécute **`orchestrateV2`** (`lib/orchestrator/orchestrate-v2.ts`) : bus d'événements **`RunEventBus`**, adaptation **`SSEAdapter`** → **flux SSE** (`text/event-stream`) consommé dans **`app/(user)/page.tsx`** qui injecte les événements dans `useRuntimeStore` (`stores/runtime.ts`).

**État produit observable**  
- **Chat** : messages thread-scopés dans `ChatMessages` (`app/(user)/components/ChatMessages.tsx`) + saisie dans `ChatInput`.  
- **Orchestration visible** : `useRuntimeStore` + `useFocalStore` — flux SSE réduit en état focal et runtime.  
- **Manifestation** : objet focal + scène centrale (`FocalStage`, `stores/focal.ts`).  
- **Confiance / rail** : données agrégées + missions (`RightPanel` → `GET /api/v2/right-panel`).  
- **Momentum** : *Non monté actuellement* — `TopContextBar` et `MomentumIndicator` sont cibles de convergence, pas état actuel.

**Tension**  
Le pipeline V1 (`POST /api/chat`) a été supprimé. La boucle **canonique** est **V2 + `/api/orchestrate`** uniquement.

---

## 2. Canonical render chain

**Ordre de montage réel (layout utilisateur)**  
`SessionProvider` → `div` shell → **`LeftPanel`** (sidebar threads) → `<main>{children}</main>` → **`RightPanel`**.

**Page d'accueil (`/`)**  
`LeftPanel` + `main` contenant : `ChatMessages` → `FocalStage` (toggleable) → `ChatInput`.  
**Note** : `RightPanel` est monté dans `layout.tsx` comme sibling de `main`, pas dans le contenu de `page.tsx`.

**Couches**
| Couche | Rôle produit | Fichiers / routes clés |
|--------|----------------|-------------------------|
| Shell | Cadre persistant, auth | `app/(user)/layout.tsx` |
| Navigation mémoire | Threads, surface | `LeftPanel`, `stores/navigation.ts` |
| Scène principale | Objet focal au centre | `FocalStage.tsx`, `page.tsx` |
| Rail droit | Missions, assets, stream | `RightPanel.tsx`, `GET /api/v2/right-panel` |
| Composer | Intention → orchestration | `ChatInput.tsx`, `/api/orchestrate` |
| Contexte haut | *Cible : Halo + momentum* | *`TopContextBar.tsx` non monté actuellement* |

**Écarts cible vs réel**
| Cible (HTML final) | État actuel | Statut |
|-------------------|-------------|--------|
| `AppNav` | `LeftPanel` | Partiel — convergence UI requise |
| `ManifestationStage` | `FocalStage` | Partiel — `FocalStage` remplit le rôle |
| `RightPanelDocumentProvider` (INDEX/DOCUMENT) | Non monté | Dette — machine à états cible non implémentée |
| `FocalObjectRenderer` (surface rail/center) | Rendu inline dans `FocalStage` | Dette — abstraction cible non extraite |
| `TopContextBar` + `MomentumIndicator` | Non montés | Cible future — pas dans chaîne actuelle |
| `GlobalChat` | `ChatInput` + `ChatMessages` | OK — `GlobalChat` était un nom cible |

**Tension**  
La chaîne documentée précédemment (`AppNav`, `ManifestationStage`, `RightPanelDocumentProvider`, `TopContextBar`) décrivait une **cible produit** plutôt que l'état réel. Le rendu actuel est fonctionnel mais plus simple : pas de machine à états INDEX/DOCUMENT, pas de context bar, pas de provider document dédié.

---

## 3. Manifestation architecture

**Définition produit**  
La **manifestation** est ce que l'utilisateur voit comme **résultat stabilisé** (ou en cours) du travail de l'OS — pas le plan interne ni la liste d'étapes brute.

**Couches réelles**
1. **Modèle d'objets** : `lib/right-panel/objects.ts` — types (`message_draft`, `report`, `mission_active`, …), statuts (`composing`, `ready`, `awaiting_approval`, …), règle **max 1 `primaryAction`**.  
2. **Mapping plan/mission/asset → focal** : `lib/right-panel/manifestation.ts` (`manifestPlan`, `manifestMission`, …) — pont entre planner invisible et surface visible.  
3. **Résolution "quel focal ?"** : `stores/focal.ts` — priorité **objet focal live** depuis le SSE (`focal_object_ready` lu dans `page.tsx`, injecté dans `stores/runtime.ts` via `addEvent()`, puis traité par `runtime.ts` qui appelle `useFocalStore.getState().setFocal()`), sinon résolution par thread via requête à `/api/v2/right-panel`.  
4. **Scène visuelle** : `FocalStage.tsx` — rendu inline des objets focal avec actions primaires (approve, discard, pause, resume).  

**Cibles de convergence (non montées)**
- `FocalObjectRenderer.tsx` — abstraction cible pour rendu `surface="rail"` vs `surface="center"`  
- `RightPanelDocumentProvider` — machine à états INDEX/DOCUMENT pour le rail droit  
- `ManifestationStage` — scène centrale avec transitions de flou/échelle

**SSE**  
`SSEAdapter` (`lib/events/consumers/sse-adapter.ts`) expose `focal_object_ready` au client. La boucle réelle :
1. **`app/(user)/page.tsx`** lit le flux SSE ligne par ligne et parse les événements
2. **`app/(user)/page.tsx`** injecte les événements dans `stores/runtime.ts` via `useRuntimeStore.getState().addEvent()`
3. **`stores/runtime.ts`** traite `focal_object_ready` dans son switch interne et appelle `useFocalStore.getState().setFocal()`

**RightPanel** ne consomme **pas** le SSE directement — il est alimenté par polling sur `GET /api/v2/right-panel`.

**Tension**  
Le rendu focal actuel est **inline** dans `FocalStage`. L'abstraction `FocalObjectRenderer` avec coques variables (rail vs centre) est une **cible** pour convergence future, pas l'état actuel.

---

## 4. Momentum architecture

**Définition produit**  
Le **momentum** est un **rappel discret** des activités en cours (run orchestration, missions `opsStatus`, focal "actif") — pas un centre de notifications.

**État actuel**  
Les fichiers `app/lib/momentum-model.ts`, `app/hooks/use-momentum.ts`, `MomentumIndicator.tsx` existent mais **ne sont pas montés** dans la chaîne de rendu actuelle. `TopContextBar` n'existe pas encore.

**Cible de convergence**
- **Modèle pur** : `app/lib/momentum-model.ts` — `buildMomentumItems(data, focal)`.  
- **Hook** : `app/hooks/use-momentum.ts` — abonnement SSE pour re-render sans attendre le poll.  
- **UI** : `MomentumIndicator.tsx` dans `TopContextBar` — `null` si `!hasActive`.

**Tension**  
Momentum décrit une **vision produit** non encore branchée dans `layout.tsx`. Toute référence à momentum dans l'UI actuelle est spéculative.

---

## 5. Trust and approval architecture

**Axes réels**
| Axe | Où ça vit | Rôle produit |
|-----|-----------|--------------|
| Validation sortie | `lib/runtime/output-validator.ts`, classification / trust dans le runtime | Qualité du livrable, pas seulement "ça a répondu" |
| Garde-fous prompt | `lib/runtime/prompt-guard.ts`, `guard_policy` / signaux | Réduction des abus / contenus hors politique |
| Approvals run | `lib/runtime/engine/approval-manager.ts`, table `run_approvals`, événements `approval_requested` / `approval_decided` | Point d'arrêt humain sur un run |
| SSE → halo | `app/lib/halo-state.ts` — états `waiting_approval`, événements `approval_requested` | Feedback global "le système attend une décision" |
| Focal | Statut `awaiting_approval` sur objets focal | Même intention au niveau "objet manifesté" |
| Chat UI | `stores/navigation.ts` — `Message` thread-scopé | Fil de discussion porte l'historique |

**Tension**  
Plusieurs **vocabulaires** ("waiting_approval" halo vs `awaiting_approval` focal vs `run_approvals` DB) : alignement produit/design nécessaire pour ne pas fragmenter la story utilisateur. Les **policies** (`memory_policies`, etc.) vivent côté gouvernance DB (`docs/AGENT_GOVERNANCE.md`, migrations) — pas toutes branchées sur chaque surface UI.

---

## 6. Multi-model orchestration role

**Rôle produit**  
Permettre d'**exécuter** des appels LLM avec **profil** (provider + modèle + coûts + fallback), et optionnellement un **routage "smart"** basé sur l'historique de traces.

**Couches réelles**
- **Contrat provider** : `lib/llm/types.ts` — `LLMProvider.chat` / `streamChat`.  
- **Registry** : `lib/llm/router.ts` — `getProvider`, `chatWithProfile`, `streamChatWithProfile`, `smartChat` / `smartStreamChat`, `loadFallbackChain`.  
- **Providers** : `openai.ts`, `anthropic.ts`, `composer.ts`, `gemini.ts` (HTTP `fetch`).  
- **Profils DB** : `model_profiles` (migration `0003`, seed `0018` composer→gemini).  
- **Sélection** : `lib/decisions/model-selector.ts` — `scoreModels` + `selectModel` pour `smartChat`.

**Tension**  
Le **chat utilisateur** principal ne passe **pas** par `chatWithProfile` dans la boucle `ChatInput` → `/api/orchestrate` : l'orchestrateur utilise son propre graphe d'agents/outils. Les **profils multi-modèles** sont le **socle gouverné** pour **composants serveur** (agents, skills, evals) — à ne pas confondre avec "le modèle du chat global" sans doc explicite.

---

## 7. Missions as living entities

**Réalité**
- **Côté serveur / récurrence** : `lib/runtime/missions/scheduler.ts` (leader, leases, exécution), types **`lib/runtime/missions/types.ts`** — entités persistées et pilotées par le scheduler.  
- **Côté agrégat UI** : `GET /api/v2/right-panel` + `lib/ui/right-panel/aggregate.ts` — liste `missions` avec `opsStatus` (`idle` / `running` / …) pour le rail.  
- **Côté client legacy** : `app/lib/missions/*`, `MissionProvider`, `use-mission.tsx` — README et code signalent usage **ControlPanel / legacy** ; le panneau droit actuel consomme surtout **l'agrégat API** dans `RightPanel.tsx`.

**Manifestation**  
Plans type `mission` / définitions actives → objets focal via `manifestation.ts` (`MissionDraftObject`, `MissionActiveObject`, …).

**Tension**  
**Deux mondes "missions"** (client `app/lib/missions` vs runtime `lib/runtime/missions`) : la vision "entité vivante" côté produit doit **s'aligner sur le scheduler + Supabase + right-panel**, pas sur l'ancien panneau client seul.

---

## 8. Cross-session continuity

**Mécanismes réels**
- **Thread ↔ conversation** : `stores/navigation.ts` — `activeThreadId`, `messages` par thread, garde-fous anti-replay au switch.  
- **Sidebar** : `LeftPanel` + `stores/navigation.ts` — liste de threads, thread actif, recall.  
- **Persistance serveur** : conversations, runs, traces, assets, `model_profiles`, missions persistées (schémas Supabase / migrations — voir `docs/DB_AND_MIGRATIONS.md`).  
- **Surface / mode** : `stores/navigation.ts` — `surface` actuel (`home` | `apps` | `missions` | …).

**Écarts cible vs réel**
| Cible | État actuel | Note |
|-------|-------------|------|
| `SidebarProvider` + `sidebar-state.ts` | Fonctionnalité dans `stores/navigation.ts` | OK — Zustand remplace les providers React |
| `SurfaceProvider` + `surface-state.ts` | Fonctionnalité dans `stores/navigation.ts` | OK — Zustand remplace les providers React |
| `thread-memory.ts` | `stores/navigation.ts` | Migration réalisée — pas de drift |

**Tension**  
Les providers React (`SidebarProvider`, `SurfaceProvider`) mentionnés dans la doc cible ont été **remplacés par Zustand** (`stores/navigation.ts`). C'est une évolution architecture, pas une dette.

---

## 9. Legacy layers to retire

**Candidats documentés dans le code / README / audits**
- **`POST /api/chat`** : SUPPRIMÉ — le trafic chat principal passe uniquement par `/api/orchestrate`.  
- **`lib/orchestrator.ts`** (legacy) vs **`lib/orchestrator/orchestrate-v2.ts`** (pipeline canonique) — V2 est la voie principale, avec fallback V1 explicite encore présent pour non-chat / migration.  
- **`workflow_runs`** : marqué legacy / deprecate dans `docs/DB_AND_MIGRATIONS.md` / `RUNTIME_AND_REPLAY.md`.  
- **`RunTracer` vs "engine"** : coexistence documentée (`lib/runtime/engine/index.ts`, README).  
- **Missions client `app/lib/missions`** : liées à l'ancien ControlPanel (supprimé en audit) — risque de code mort ou de double source de vérité avec le scheduler serveur.  
- **Doublons types missions** : `app/lib/missions/types.ts` indique usage legacy ControlPanel.

**Action produit**  
Pour chaque couche legacy : **critère de retrait** = plus aucun appel runtime + migration données + mise à jour README / spec.

---

## 10. Non-negotiable system rules

1. **Une intention chat "principale"** en production = **`/api/orchestrate`** (SSE) uniquement. V2 est la voie canonique ; un fallback V1 legacy explicite subsiste pour usage non-chat ou migration.  
2. **Tout changement d'état utilisateur visible** sur le run doit pouvoir être **reflété en SSE** (`SSEAdapter` — principe codé dans les commentaires du fichier).  
3. **Objet focal** : une **grammaire** unique (`objects.ts`) — pas de multiplication des surfaces de vérité pour le même type métier.  
4. **Right panel** : INDEX/DOCUMENT est une **cible** pas l'état actuel. L'état réel est un rail droit fonctionnel sans machine à états formelle.  
5. **Thread switch** : **ne pas** rejouer les messages chat (règles `stores/navigation.ts`).  
6. **Momentum** : indicateur **dérivé** ; ne pas en faire une source d'état primaire ni une persistance sans spec additionnelle. *Non monté actuellement*.  
7. **Multi-modèle** : clés API **uniquement** env ; profils et fallbacks en **DB** (`model_profiles`).  
8. **Approvals** : distinguer clairement **run_approvals** (DB + engine), **halo waiting**, **focal awaiting_approval** — alignement naming produit requis.  
9. **Nouvelle surface UI** : doit être branchée dans **`app/(user)/layout.tsx`** (ou enfant direct) pour être "réelle" dans le produit (cf. README "Never Guess The Surface").  
10. **Tests de régression** sur les flux publics (`design-tokens`, LLM router) restent **obligatoires** avant d'élargir la vision produit.

---

*Fin du spec — à copier/coller dans Notion (titres H2 = sections 1–10). Mettre à jour ce fichier lorsque l'architecture change (nouvelle route, retrait legacy, nouveau provider).*
