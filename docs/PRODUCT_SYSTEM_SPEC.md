# Hearst OS — Product System Spec

Document d’alignement **produit · design · engineering**, ancré sur le code et les routes actuels (pas une cible fictive). Chaque notion renvoie à une couche réelle ; les **tensions** avec le legacy sont explicites.

---

## 1. Canonical product loop

**Boucle réelle (utilisateur authentifié, shell `app/(user)/layout.tsx`)**  
L’utilisateur formule une **intention** dans `GlobalChat` → le client appelle **`POST /api/orchestrate`** (`app/api/orchestrate/route.ts`) avec `message`, `conversation_id`, `surface`, `thread_id`, `focal_context` optionnel → le serveur exécute **`orchestrateV2` → `orchestrate`** (`lib/orchestrator/index.ts`) : bus d’événements **`RunEventBus`**, adaptation **`SSEAdapter`** → **flux SSE** (`text/event-stream`) consommé par **`useOrchestrate`** (`app/hooks/use-orchestrate.ts`), qui repousse chaque événement JSON dans **`RunStreamProvider.push`** (`app/lib/run-stream-context.tsx`).

**État produit observable**  
- **Chat** : texte cumulatif + statut run dans `GlobalChat`.  
- **Orchestration visible** : `useHaloRuntime` / `use-halo` (`app/lib/halo-runtime-context.tsx`, `app/hooks/use-halo.ts`) — même flux SSE réduit en état halo.  
- **Manifestation** : objet focal + scène centrale (`ManifestationStage`, `useFocalObject`).  
- **Confiance / rail** : données agrégées + missions (`useRightPanel` → `GET /api/v2/right-panel`).  
- **Momentum** : rappel discret des activités (`useMomentum`, `MomentumIndicator` dans `TopContextBar`).

**Tension**  
`GlobalChat` peut encore appeler **`POST /api/chat`** (pipeline V1) si `NEXT_PUBLIC_USE_V2=false` / chemins legacy (`app/api/chat/route.ts`, `lib/system/config.ts`). La boucle **canonique** côté produit doit être assumée comme **V2 + `/api/orchestrate`** ; V1 est une **bifurcation** à documenter comme dette, pas comme vision par défaut.

---

## 2. Canonical render chain

**Ordre de montage réel (layout utilisateur)**  
`SessionProvider` → `AuthGate` → `MissionProvider` → `ChatProvider` / `ChatActivityProvider` → **`RunStreamProvider`** → **`HaloRuntimeProvider`** → **`SidebarProvider`** → **`SurfaceProvider`** → colonne : **`AppNav`** (sidebar threads) → **`SidebarMargin`** → **`RightPanelDocumentProvider`** → `TopContextBar` → `{children}` (ex. `/` → `ManifestationStage` dans `app/(user)/page.tsx`) → **`GlobalChat`** → **`RightPanel`**.

**Couches**  
| Couche | Rôle produit | Fichiers / routes clés |
|--------|----------------|-------------------------|
| Shell | Cadre persistant, auth, bus global | `app/(user)/layout.tsx` |
| Navigation mémoire | Threads, workspace, pas de nav “features” | `AppNav`, `app/hooks/use-sidebar.tsx`, `app/lib/sidebar-state.ts` |
| Scène principale | “Perception core” + document focal prêt au centre | `ManifestationStage.tsx`, `page.tsx` |
| Rail droit | INDEX/DOCUMENT, missions, assets, stream | `RightPanel.tsx`, `useRightPanel` |
| Composer | Intention → orchestration | `GlobalChat.tsx`, `/api/orchestrate` |
| Contexte haut | Halo + momentum | `TopContextBar.tsx`, `MomentumIndicator.tsx` |

**Tension**  
`TopContextBar` n’était pas toujours monté dans l’historique du repo ; il est désormais **dans le layout** au-dessus du contenu. Toute maquette qui ignore cette barre est **hors chaîne de rendu**.

---

## 3. Manifestation architecture

**Définition produit**  
La **manifestation** est ce que l’utilisateur voit comme **résultat stabilisé** (ou en cours) du travail de l’OS — pas le plan interne ni la liste d’étapes brute.

**Couches réelles**  
1. **Modèle d’objets** : `lib/right-panel/objects.ts` — types (`message_draft`, `report`, `mission_active`, …), statuts (`composing`, `ready`, `awaiting_approval`, …), règle **max 1 `primaryAction`**.  
2. **Mapping plan/mission/asset → focal** : `lib/right-panel/manifestation.ts` (`manifestPlan`, `manifestMission`, …) — pont entre planner invisible et surface visible.  
3. **Résolution “quel focal ?”** : `useFocalObject` (`app/hooks/use-focal-object.ts`) — priorité **objet focal live** depuis les données right-panel (SSE `focal_object_ready` mergé dans `use-right-panel.ts`), sinon résolution par thread (`getPlansForThread`, `getMissionsForThread`, `getAssetsForThread`).  
4. **Scène visuelle** : `ManifestationStage.tsx` + `deriveManifestationVisualState` / `focalStatusSubline` (`app/lib/manifestation-stage-model.ts`).  
5. **Rendu objet** : `FocalObjectRenderer.tsx` — `surface="rail"` vs `surface="center"` selon état DOCUMENT + focal `ready` / `awaiting_approval` (logique `RightPanelDocumentProvider` / `useRightPanelDocument`).

**SSE**  
`SSEAdapter` (`lib/events/consumers/sse-adapter.ts`) expose `focal_object_ready` au client ; `useRightPanel` fusionne dans `data.focalObject`.

**Tension**  
Deux **surfaces** pour le même renderer (rail vs centre) : risque de divergence UX si les règles d’auto-open (`RightPanel.tsx`) et les textes `ManifestationStage` ne sont pas tenus alignés. Le **modèle focal** est unique ; la **coque** varie.

---

## 4. Momentum architecture

**Définition produit**  
Le **momentum** est un **rappel discret** des activités en cours (run orchestration, missions `opsStatus`, focal “actif”) — pas un centre de notifications.

**Couches réelles**  
- **Modèle pur** : `app/lib/momentum-model.ts` — `buildMomentumItems(data, focal)`.  
- **Hook** : `app/hooks/use-momentum.ts` — `useRightPanel` + `useFocalObject` + **abonnement** `RunStreamProvider.subscribe` (même bus que les merges dans `use-right-panel.ts`) pour re-render **sans attendre** le poll `GET /api/v2/right-panel`.  
- **UI** : `MomentumIndicator.tsx` dans `TopContextBar` — `null` si `!hasActive`.

**Tension**  
Le momentum **ne persiste pas** en base : si l’utilisateur rafraîchit la page, l’état dépend du **re-fetch** + stream. Ce n’est pas une “file d’attente produit” persistée.

---

## 5. Trust and approval architecture

**Axes réels**  
| Axe | Où ça vit | Rôle produit |
|-----|-----------|--------------|
| Validation sortie | `lib/runtime/output-validator.ts`, classification / trust dans le runtime | Qualité du livrable, pas seulement “ça a répondu” |
| Garde-fous prompt | `lib/runtime/prompt-guard.ts`, `guard_policy` / signaux | Réduction des abus / contenus hors politique |
| Approvals run | `lib/runtime/engine/approval-manager.ts`, table `run_approvals`, événements `approval_requested` / `approval_decided` | Point d’arrêt humain sur un run |
| SSE → halo | `app/lib/halo-state.ts` — états `waiting_approval`, événements `approval_requested` | Feedback global “le système attend une décision” |
| Focal | Statut `awaiting_approval` sur objets focal | Même intention au niveau “objet manifesté” |
| Chat UI | `app/lib/thread-memory.ts` — `ChatMessage.awaitingApproval` | Fil de discussion peut porter un état d’attente mission côté client |

**Tension**  
Plusieurs **vocabulaires** (“waiting_approval” halo vs `awaiting_approval` focal vs `run_approvals` DB) : alignement produit/design nécessaire pour ne pas fragmenter la story utilisateur. Les **policies** (`memory_policies`, etc.) vivent côté gouvernance DB (`docs/AGENT_GOVERNANCE.md`, migrations) — pas toutes branchées sur chaque surface UI.

---

## 6. Multi-model orchestration role

**Rôle produit**  
Permettre d’**exécuter** des appels LLM avec **profil** (provider + modèle + coûts + fallback), et optionnellement un **routage “smart”** basé sur l’historique de traces.

**Couches réelles**  
- **Contrat provider** : `lib/llm/types.ts` — `LLMProvider.chat` / `streamChat`.  
- **Registry** : `lib/llm/router.ts` — `getProvider`, `chatWithProfile`, `streamChatWithProfile`, `smartChat` / `smartStreamChat`, `loadFallbackChain`.  
- **Providers** : `openai.ts`, `anthropic.ts`, `composer.ts`, `gemini.ts` (HTTP `fetch`).  
- **Profils DB** : `model_profiles` (migration `0003`, seed `0018` composer→gemini).  
- **Sélection** : `lib/decisions/model-selector.ts` — `scoreModels` + `selectModel` pour `smartChat`.

**Tension**  
Le **chat utilisateur** principal ne passe **pas** par `chatWithProfile` dans la boucle `GlobalChat` → `/api/orchestrate` : l’orchestrateur utilise son propre graphe d’agents/outils. Les **profils multi-modèles** sont le **socle gouverné** pour **composants serveur** (agents, skills, evals) — à ne pas confondre avec “le modèle du chat global” sans doc explicite.

---

## 7. Missions as living entities

**Réalité**  
- **Côté serveur / récurrence** : `lib/runtime/missions/scheduler.ts` (leader, leases, exécution), types **`lib/runtime/missions/types.ts`** — entités persistées et pilotées par le scheduler.  
- **Côté agrégat UI** : `GET /api/v2/right-panel` + `lib/ui/right-panel/aggregate.ts` — liste `missions` avec `opsStatus` (`idle` / `running` / …) pour le rail.  
- **Côté client legacy** : `app/lib/missions/*`, `MissionProvider`, `use-mission.tsx` — README et code signalent usage **ControlPanel / legacy** ; le panneau droit actuel consomme surtout **l’agrégat API + démo** dans `RightPanel.tsx`.

**Manifestation**  
Plans type `mission` / définitions actives → objets focal via `manifestation.ts` (`MissionDraftObject`, `MissionActiveObject`, …).

**Tension**  
**Deux mondes “missions”** (client `app/lib/missions` vs runtime `lib/runtime/missions`) : la vision “entité vivante” côté produit doit **s’aligner sur le scheduler + Supabase + right-panel**, pas sur l’ancien panneau client seul.

---

## 8. Cross-session continuity

**Mécanismes réels**  
- **Thread ↔ conversation** : `app/lib/thread-memory.ts` — `resolveConversationId(threadId)`, snapshots de chat par thread, garde-fous anti-replay au switch.  
- **Sidebar** : `SidebarProvider` + `sidebar-state.ts` — liste de threads, thread actif, recall.  
- **Persistance serveur** : conversations, runs, traces, assets, `model_profiles`, missions persistées (schémas Supabase / migrations — voir `docs/DB_AND_MIGRATIONS.md`).  
- **Surface / mode** : `SurfaceProvider`, `surface-state.ts` — restauration d’état UI liée au contexte.

**Tension**  
`thread-memory` est **in-memory côté client** pour la map thread→conversation : perte au hard refresh sauf rechargement depuis le backend quand implémenté. Le produit doit clarifier **qu’est “durable”** (Supabase) vs **“session navigateur”**.

---

## 9. Legacy layers to retire

**Candidats documentés dans le code / README / audits**  
- **`POST /api/chat`** : pipeline V1 parallèle à V2 ; warning si V2 actif (`app/api/chat/route.ts`). Cible : trafic uniquement `/api/orchestrate`.  
- **`lib/orchestrator.ts`** (minimal pour ancien chat) vs **`lib/orchestrator/index.ts`** (pipeline complet) — double narration “orchestrator”.  
- **`workflow_runs`** : marqué legacy / deprecate dans `docs/DB_AND_MIGRATIONS.md` / `RUNTIME_AND_REPLAY.md`.  
- **`RunTracer` vs “engine”** : coexistence documentée (`lib/runtime/engine/index.ts`, README).  
- **Missions client `app/lib/missions`** : liées à l’ancien ControlPanel (supprimé en audit) — risque de code mort ou de double source de vérité avec le scheduler serveur.  
- **Doublons types missions** : `app/lib/missions/types.ts` indique usage legacy ControlPanel.

**Action produit**  
Pour chaque couche legacy : **critère de retrait** = plus aucun appel runtime + migration données + mise à jour README / spec.

---

## 10. Non-negotiable system rules

1. **Une intention chat “principale”** en production = **`/api/orchestrate`** (SSE) sauf config explicite V1 (`NEXT_PUBLIC_USE_V2`, `SYSTEM_CONFIG`).  
2. **Tout changement d’état utilisateur visible** sur le run doit pouvoir être **reflété en SSE** (`SSEAdapter` — principe codé dans les commentaires du fichier).  
3. **Objet focal** : une **grammaire** unique (`objects.ts`) — pas de multiplication des surfaces de vérité pour le même type métier.  
4. **Right panel** : machine d’états **INDEX / DOCUMENT** reste la source de vérité UI pour ce rail (`RightPanel.tsx` + `RightPanelDocumentProvider`).  
5. **Thread switch** : **ne pas** rejouer les messages chat (règles `thread-memory.ts`).  
6. **Momentum** : indicateur **dérivé** ; ne pas en faire une source d’état primaire ni une persistance sans spec additionnelle.  
7. **Multi-modèle** : clés API **uniquement** env ; profils et fallbacks en **DB** (`model_profiles`).  
8. **Approvals** : distinguer clairement **run_approvals** (DB + engine), **halo waiting**, **focal awaiting_approval**, **message chat awaitingApproval** — alignement naming produit requis.  
9. **Nouvelle surface UI** : doit être branchée dans **`app/(user)/layout.tsx`** (ou enfant direct) pour être “réelle” dans le produit (cf. README “Never Guess The Surface”).  
10. **Tests de régression** sur les flux publics (`design-tokens`, LLM router, momentum) restent **obligatoires** avant d’élargir la vision produit.

---

*Fin du spec — à copier/coller dans Notion (titres H2 = sections 1–10). Mettre à jour ce fichier lorsque l’architecture change (nouvelle route, retrait legacy, nouveau provider).*
