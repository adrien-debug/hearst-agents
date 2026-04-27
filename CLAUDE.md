# Hearst OS — Instructions Claude

## Règles UI (non négociables)

Toute tâche qui touche à un composant, une page ou un style doit suivre ces règles. Si une règle ne peut pas être respectée, **arrête-toi et demande** avant de coder.

### 1. Aucun magic number

Tout passe par les tokens définis dans [app/globals.css](app/globals.css) :

- **Spacing** → variables `--space-1` à `--space-32` (jamais `px-12`, `gap-5`, `mt-4`, etc.)
- **Typo** → classes `.t-9`, `.t-13`, `.t-15`, `.t-28`… ou `.halo-title-xl`, `.halo-mono-label` (jamais `text-5xl` + inline `style={{ fontWeight, letterSpacing }}`)
- **Radius** → `--radius-xs` à `--radius-pill` (jamais `rounded-xl` brut)
- **Couleurs** → `var(--cykan)`, `var(--text-muted)`, `var(--border-default)` (jamais `#fff`, `text-white`, `text-gray-400`)
- **Shadows** → `--shadow-card`, `--shadow-card-hover`, `--shadow-input-focus` (jamais inline `box-shadow:`)
- **Motion** → `--duration-*` + `--ease-*` (jamais `transition-all duration-300` brut)

Si un token manque pour ce que tu veux faire : **stop. Demande à Adrien.** Ne crée pas un magic number "temporaire".

### 2. Une seule source de vérité par propriété

Interdit de cumuler Tailwind + classe custom + inline style sur le même élément pour la même propriété. Choisis :

- Couches utilitaires Tailwind (layout, flex, grid) **OU**
- Classes custom du design system (`.halo-suggestion`, `.card-depth`, `.section-elevated`) **OU**
- `style={{ ... }}` avec des `var(--token)` **uniquement** quand la classe n'existe pas

Pas les trois en même temps. Le mélange est la cause #1 du déséquilibre visuel.

### 3. Références visuelles obligatoires

Avant de coder une nouvelle page ou de retoucher une page existante, **ouvre et lis** :

- [HEARST-OS-DESIGN-SYSTEM.html](HEARST-OS-DESIGN-SYSTEM.html) — le langage visuel canonique
- [HEARST-UI-VISION.html](hearst-ui-vision.html) — la vision cible
- [mock-chat-central.html](mock-chat-central.html) — le mock de la surface principale

Calque-toi dessus. Cite les sections que tu réutilises dans ta réponse.

### 4. Boucle visuelle avant de livrer

Pour toute modif UI :

1. Lance le dev server (`npm run dev` en background) si pas déjà actif
2. Prends un screenshot via Playwright de l'écran modifié
3. Compare au mock de référence (ou décris l'écart honnêtement)
4. Itère jusqu'à matcher — ou explique précisément pourquoi tu ne peux pas

Ne dis jamais "c'est fait" sans avoir vu le résultat dans le navigateur.

### 5. Énumère tous les états

Pour chaque écran : empty, loading, error, success, hover/focus/active, disabled, mobile, dark mode (déjà par défaut). Pas de golden path tout seul.

## Stack

- **Next.js 15** (app router) + React 19
- **Tailwind v4** (`@import "tailwindcss"`) avec `@theme inline` qui mappe les tokens
- **Police** : Satoshi Variable (`--font-satoshi`)
- **Tests** : Playwright pour e2e, Jest/Vitest pour unit
- **Auth** : NextAuth (SessionProvider dans [app/(user)/layout.tsx](app/(user)/layout.tsx))

## Langue

Adrien travaille en français. Réponds en français. Les commits, commentaires de code et messages UI sont en français.
