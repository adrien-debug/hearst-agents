# Hearst OS — Instructions Claude

## Mode autonomie (défaut)

Adrien commande. Les règles ci-dessous sont des **principes de qualité**, pas des barrières bloquantes. Tu prends les décisions cohérentes au système et tu avances. Tu ne t'arrêtes pas pour demander sauf si :
- Une décision impacte directement l'UX visible et il y a 2 directions opposées valides
- Une action est destructive et irréversible (suppression branche, force-push prod, drop DB)
- Tu ne sais pas quoi vouloir Adrien et la question coûte moins cher que l'erreur

Pour le reste : tu décides, tu codes, tu commits, tu signales en fin.

## Principes de qualité (non bloquants, mais à viser)

### 1. Tokens > magic numbers (recommandé)

Tout devrait passer par les tokens [app/globals.css](app/globals.css). Tailwind v4 + `@theme inline` mappe les utilities sur les tokens — `px-12`, `gap-4`, `mb-4`, `w-8` sont OK : ils résolvent vers `var(--space-N)`.

- **Spacing** → utilities Tailwind ou `style={{ padding: "var(--space-N)" }}`
- **Typo** → `.t-9`, `.t-13`, `.t-15`, `.t-28`…
- **Radius** → `--radius-xs` à `--radius-pill` ou utilities Tailwind
- **Couleurs** → `var(--cykan)`, `var(--text-muted)`, etc.
- **Shadows** → `--shadow-card`, `--shadow-card-hover`, etc.
- **Motion** → `--duration-*` + `--ease-*`

**Token manquant ?** Si un cas légitime (utilisé 2+ fois, valeur cohérente au système) → ajoute le token dans `globals.css` et continue. Pas besoin de demander à Adrien d'abord.

`scripts/lint-visual.mjs` reste actif sur STRICT_PATHS — si il bloque un changement, soit fix le pattern, soit ajoute un token, soit ajoute le path à l'allowlist du lint.

### 2. Une seule source de vérité par propriété

Évite de cumuler Tailwind + classe custom + inline style pour la même propriété sur un même élément. Choisis :
- Tailwind (layout, flex, grid) **OU**
- Classes custom du DS (`.halo-suggestion`, `.card-depth`) **OU**
- `style={{ ... }}` avec `var(--token)` quand la classe n'existe pas

### 3. Références visuelles (consultables, pas obligatoires)

[HEARST-OS-DESIGN-SYSTEM.html](HEARST-OS-DESIGN-SYSTEM.html) documente le langage visuel canonique. Consulte si tu as un doute sur une convention ; sinon trust le code existant comme référence.

### 4. Boucle visuelle (selon contexte)

Pour les changements UI lourds (refonte d'écran, nouveau Stage), screenshot Playwright avant livraison. Pour les polish ciblés (hotkey markup, padding, mono caps cleanup, etc.) : tsc + lint:visual + lint suffisent ; les screenshots peuvent être faits en fin de session par batch ou laissés à Adrien.

### 5. États couverts

Quand tu construis un écran neuf : empty, loading, error, hover/focus/active, disabled, mobile, dark mode (défaut). Pour un polish ciblé sur un écran existant, ne refais pas tous les états — fix ce qui est demandé.

## Pratiques codeur

### Primitives DS

Si tu vois 3+ patterns dupliqués qui méritent extraction (`<MissionRow>`, `<EmptyState>`, `<RowSkeleton>`, etc.), crée la primitive dans `app/(user)/components/ui/` ou un sous-dossier métier (`components/missions/`, `components/personas/`), exporte via `index.ts`, propage les usages. Pas de demande préalable.

### Mode batch

Plan de N batches validé une fois → enchaîne sans s'arrêter entre chaque. Validations techniques (`tsc + lint + lint:visual`) à la fin uniquement. Commit par batch ou par phase logique avec message descriptif (Conventional Commits, en français).

### Décisions sans confirmation

- Choix entre 2 valeurs de token cohérentes
- Création de primitive si 3+ duplications
- Suppression de classes CSS mortes (orphelines)
- Rename variables locales / fonctions internes
- Refactor de pages massives en sous-composants
- Standardisation d'un padding sur N pages
- Renommage / restructuration interne d'un composant
- Fix d'erreurs lint préexistantes hors scope si elles bloquent le CI
- Ajout de tokens manquants dans `globals.css`

### Décisions qui méritent confirmation (cas rares)

- Modification de la palette de couleurs primaires (cykan / gold / danger / money)
- Refonte du shell layout (3 colonnes, PulseBar top, ChatDock bottom)
- Suppression d'une feature visible
- Changement de routes ou structure d'URL
- Modification de schémas DB / API contracts publics

### Git

- Commit par batch avec message clair (préfixes : `feat`, `fix`, `refactor`, `polish`, `chore`, `test`, `docs`)
- Push direct sur `main` autorisé (workflow solo dev assumé)
- Pas de force-push sauf si Adrien le demande explicitement par message
- Pas de `--no-verify` sur hooks sauf demande explicite

## Stack

- **Next.js 15** (app router) + React 19
- **Tailwind v4** (`@import "tailwindcss"`) avec `@theme inline`
- **Police** : Satoshi Variable (`--font-satoshi`)
- **Tests** : Playwright e2e, Vitest unit
- **Auth** : NextAuth (SessionProvider dans [app/(user)/layout.tsx](app/(user)/layout.tsx))
- **Deploy** : Vercel (auto-deploy via webhook GitHub)

## Langue

Français pour tout : réponses, commits, commentaires code, microcopy UI.

## Voix éditoriale (pivot 2026-04-29)

- Pas de mono caps `tracking-marquee/display/section/label` en JSX (commentaires JSDoc OK)
- Pas de `halo-on-hover` sur le chrome (boutons / inputs / liens) — halos cyan uniquement sur états actifs intentionnels (status dots, logo, voice active, input pill focus)
- Pas de gimmick `hover:tracking-[Xem]`
- Statuts en voix régulière FR ("Réussi" / "Échec" / "En cours") plutôt que mono caps abrégés ("OK" / "FAIL" / "RUN")
- `<Action>`, `<SectionHeader>`, `<RailSection>`, `<EmptyState>`, `<RowSkeleton>`, `<CardSkeleton>` sont les primitives canoniques
