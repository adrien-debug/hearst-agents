---
description: Audit visuel d'un écran (magic numbers, hiérarchie, fidélité au design system)
argument-hint: [chemin/vers/fichier.tsx ou rien pour l'écran courant]
---

Audite l'UI de **$ARGUMENTS** (si vide, demande à Adrien quel écran auditer).

## Étape 1 — Lecture des références

Ouvre obligatoirement et garde en tête :
- [app/globals.css](app/globals.css) — tous les tokens disponibles
- [HEARST-OS-DESIGN-SYSTEM.html](HEARST-OS-DESIGN-SYSTEM.html)
- [hearst-ui-vision.html](hearst-ui-vision.html)

## Étape 2 — Tableau des magic numbers

Lis le fichier ciblé. Construis un tableau markdown :

| Ligne | Code actuel | Token correct | Note |
|-------|-------------|---------------|------|
| L42 | `px-12` | `var(--space-12)` ou class à créer | spacing horizontal |
| L67 | `text-5xl` + `style={{ fontWeight: 700 }}` | `.halo-title-xl` | déjà existant, à réutiliser |
| L89 | `rgba(45,212,191,0.3)` | `var(--cykan)` + opacity | couleur hardcodée |

Liste **TOUS** les écarts. Ne saute aucune ligne.

## Étape 3 — Screenshot de l'état actuel

Si le dev server tourne déjà, prends un screenshot Playwright de la page concernée. Sinon dis-le, ne lance pas le serveur sans demander.

## Étape 4 — Diagnostic de hiérarchie visuelle

En 3-5 bullets max, identifie :
- Ce qui est déséquilibré (centrage, rythme vertical, alignements)
- La hiérarchie typographique (manque-t-il un niveau ? trop de niveaux ?)
- La densité (trop aéré, trop dense, par rapport au mock)

## Étape 5 — Plan de correction

3 corrections concrètes, ordonnées par impact visuel. Pour chacune :
- Quel token / classe utiliser
- Quel mock dans `HEARST-OS-DESIGN-SYSTEM.html` ou `hearst-ui-vision.html` la justifie
- Estimation : 1 ligne, 5 lignes, refacto complet ?

## Règle d'or

**Ne modifie AUCUN code à cette étape.** Audit only. Adrien valide la direction, ensuite il te dira "applique".

Si un token nécessaire manque dans `globals.css`, signale-le explicitement — ne propose pas de magic number "temporaire".
