# Hearst OS - Etat d'avancement et ecarts (24/04/2026)

Document de reference pour aligner le repo reel avec la vision produit et `HEARST-ARCHITECTURE-FINALE.html`.

## 1. Synthese

- Le projet est dans un etat **intermediaire stable**: le runtime V2 chat-first fonctionne, les gates techniques passent, mais la convergence finale n'est pas terminee.
- La direction produit n'a pas change: chat central, runtime canonique, right panel, focal objects, missions, connectors reels.
- Le principal risque actuel n'est plus la stabilite technique de base, mais le **drift entre documentation, code reel et architecture cible**.

## 2. Ce qui a ete fait

### 2.1 Runtime et orchestration

- Le point d'entree chat-first canonique est `app/api/orchestrate/route.ts`.
- L'entree d'orchestration V2 est consolidee dans `lib/orchestrator/entry.ts`.
- Le pipeline principal V2 existe dans `lib/orchestrator/orchestrate-v2.ts`.
- Le backend par defaut du chat V2 est `openai_assistants` dans `lib/system/config.ts`.
- Le contrat `thread_id === conversation_id` est utilise sur la home pour la continuite chat-first.
- Le `run_id` canonique est unifie entre stream SSE, client et persistence.

### 2.2 Right panel, focal objects, runs

- La source canonique UI pour le rail droit est `app/api/v2/right-panel/route.ts`.
- L'agregation serveur est centralisee dans `lib/ui/right-panel/aggregate.ts`.
- La manifestation plan / mission / asset vers objet focal est portee par `lib/right-panel/manifestation.ts`.
- Le centre et le rail consomment le meme contrat focal via `stores/focal.ts`, `app/(user)/components/FocalStage.tsx` et `app/(user)/components/RightPanel.tsx`.
- La page detail run consomme la timeline canonique via `app/(user)/runs/[id]/page.tsx`.

### 2.3 Scope, auth, missions, persistence

- Le garde global auth de Next 16 / Turbopack est porte par `proxy.ts`.
- Le scope V2 est reellement applique sur les routes clefs via `lib/scope.ts` et les routes `app/api/v2/*`.
- Les assets, runs et missions sont persistables via Supabase.
- Les routes missions `pause` / `resume` ont ete remises sur une voie canonique scopee.

### 2.4 Connecteurs reels

- Les connexions utilisateur sont exposees via `app/api/v2/user/connections/route.ts`.
- Le flux OAuth Nango est branche via `app/api/nango/connect/route.ts` et `app/api/nango/callback/route.ts`.
- Le produit repose toujours sur des integrations reelles, pas sur un faux systeme de demo.

### 2.5 Validation technique actuelle

- `npm run lint`: OK
- `npm run build`: OK
- `npm test`: OK
- Etat observe lors de la derniere verification: `0` erreur lint, `33` warnings, `377` tests passes, `6` skipped.

## 3. Ce qui est fait mais encore partiel

- `lib/core/types/index.ts` existe, mais l'unification des types est seulement entamee.
- Le right panel est canonique cote donnees, mais la structure UI finale INDEX / DOCUMENT n'est pas encore totalement convergee.
- Les focal objects sont reels, mais leur rendu reste encore porte par des composants locaux `app/(user)/components/*` et non par la structure de surface decrite dans la doc cible.
- Les assets sont persistes, mais le stockage fichier reste local et file-backed.
- Des chemins legacy et des formulations documentaires anciennes subsistent encore.
- Le lint est vert, mais il reste des warnings a nettoyer.

## 4. Ce qu'il reste a faire

### 4.1 Realignement documentaire

Priorite immediate:

1. realigner `README.md`
2. realigner `docs/PRODUCT_SYSTEM_SPEC.md`
3. mettre a jour les pages Notion qui decrivent encore un shell UI ou un backend runtime differents de l'etat reel

### 4.2 Convergence UI structurelle

Il reste a converger la vraie chaine de rendu vers la cible produit sans repartir sur une nouvelle architecture:

1. partir du shell reel `app/(user)/layout.tsx`
2. clarifier la chaine de rendu reelle de `/`
3. converger le centre, le rail droit et l'experience de lecture vers la cible HTML
4. eliminer le drift entre surface documentee et surface effectivement montee

### 4.3 Chantiers architecture cible encore absents

Les blocs suivants de `HEARST-ARCHITECTURE-FINALE.html` ne sont pas encore implementes:

- `lib/platform/*`
- settings dynamiques type `system_settings`
- RBAC / permissions type `roles` et `user_roles`
- abstraction `StorageProvider`
- stockage cloud assets type R2 / S3
- table `asset_files`
- connector packs
- admin dynamique complet

### 4.4 Nettoyage final

- nettoyer les warnings prioritaires
- reduire les fallbacks ambigus
- isoler ou documenter explicitement le legacy restant
- passer un gate final propre apres convergence

## 5. Ecarts constates

### 5.1 Ecarts entre la documentation et le code reel

- Une partie de `README.md` decrit encore une chaine UI avec `AppNav`, `GlobalChat`, `TopContextBar`, `ManifestationStage`, `RightPanelDocumentProvider`, `FocalObjectRenderer`, alors que le rendu reel monte aujourd'hui surtout `app/(user)/components/LeftPanel.tsx`, `RightPanel.tsx`, `FocalStage.tsx`, `ChatInput.tsx` et `ChatMessages.tsx`.
- `docs/PRODUCT_SYSTEM_SPEC.md` decrit aussi un shell plus avance que ce qui est effectivement monte.
- Certaines pages Notion parlent encore de `Claude Sonnet 4.6` comme runtime principal, alors que le chat V2 est aujourd'hui recentre sur `openai_assistants`.
- Une partie de la doc mentionne encore `halo-design-direction.html`, alors que ce n'est plus la direction systeme canonique a suivre.

### 5.2 Ecarts entre le code reel et l'HTML final

- `HEARST-ARCHITECTURE-FINALE.html` reste une **cible**, pas un reflet de l'etat actuel.
- La reorganisation profonde du dossier `lib/` n'est pas terminee.
- Les chantiers platform / storage / admin / RBAC ne sont pas encore converges.
- L'architecture UI finale de lecture et de manifestation n'est pas encore completement montee dans la vraie chaine de rendu.

## 6. Verdict produit

- Nous ne sommes pas sortis du contexte de l'outil.
- Nous n'avons pas change la direction produit.
- Nous avons bien avance sur le socle canonique V2, le scope, le right panel, les focal objects et la continuite chat-first.
- En revanche, il faut maintenant traiter la **convergence**: documentation, shell UI reel, et gros ecarts d'architecture encore ouverts par rapport a l'HTML final.

## 7. Ordre recommande a partir de maintenant

1. realigner la documentation canonique
2. converger la vraie UI a partir de la chaine de rendu reelle
3. ouvrir les gros chantiers d'architecture encore absents
4. faire le nettoyage final et le gate de sortie
