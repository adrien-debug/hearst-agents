# HEARST OS — Design System Tokens

Accent: **Turquoise #2ECFC2** (Pantone C)

## Fichiers

| Fichier | Usage |
|---------|-------|
| `tokens.ts` | TypeScript constants + helpers |
| `dashboard-vars.css` | CSS variables + utilities |

## Usage TypeScript

```typescript
import { TOKENS, MONO, fmtUsd } from '@/lib/design/tokens'

// Colors
TOKENS.colors.bg.app          // #050505
TOKENS.colors.accent.base     // #2ECFC2
TOKENS.colors.text.primary    // rgba(255,255,255,0.92)

// Typography
TOKENS.fonts.sans             // 'Satoshi Variable', Inter...
TOKENS.fontSizes.xl           // 24px
TOKENS.fontWeights.black      // 800

// Spacing (8px grid)
TOKENS.spacing[6]             // 24px
TOKENS.radius.md              // 8px

// Helpers
MONO                          // 'IBM Plex Mono', ...
fmtUsd(1234567.89)            // "$1,234,567.89"
fmtUsdCompact(1234567)        // "$1.2M"
```

## Usage CSS

```css
@import '@/lib/design/dashboard-vars.css';

.my-component {
  background: var(--hc-bg-app);
  color: var(--hc-text-primary);
  border: 1px solid var(--hc-border-subtle);
}

.accent-element {
  color: var(--hc-accent);
  box-shadow: var(--hc-glow-md);
}
```

## Palette complète

| Token | Hex | Usage |
|-------|-----|-------|
| `bg.app` | #050505 | App shell / deep void |
| `bg.page` | #141414 | Main scene |
| `bg.surface` | #0A0A0A | Modals, hover lift |
| `accent` | #2ECFC2 | CTAs, active states |
| `text.primary` | rgba(255,255,255,0.92) | Headlines |
| `text.secondary` | rgba(255,255,255,0.55) | Body text |
| `text.ghost` | rgba(255,255,255,0.35) | Hints, metadata |
| `border.subtle` | rgba(255,255,255,0.08) | Dividers |
| `danger` | #EF4444 | Errors |

## Migration depuis ancien cyan #00e5ff

| Ancien | Nouveau |
|--------|---------|
| `#00e5ff` | `#2ECFC2` |
| `var(--cyan-accent)` | `var(--hc-accent)` |
| `rgba(0,229,255,0.3)` | `rgba(46,207,194,0.3)` |
