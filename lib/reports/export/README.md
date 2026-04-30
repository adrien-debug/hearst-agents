# Reports — Export modules

Modules d'export d'un `RenderPayload` vers binaire (PDF, XLSX, CSV).

Signature commune :

```ts
exportPdf(input: ExportInput): Promise<ExportResult>
exportXlsx(input: ExportInput): Promise<ExportResult>
exportCsv(input: ExportInput): Promise<ExportResult>
```

Les callers (`/api/reports/[id]/export`, `mission-job.ts`) sont agnostiques du
format, ils swap juste l'appelée selon `format`.

---

## PDF — refonte éditoriale (mai 2026)

Avant : "terminal output" — pipe ASCII, hex codes en dur, Helvetica only,
marges 50pt, pas de cover.

Après : magazine print premium inspiré du PDF *Art of Life Equine*. Source
Serif 4 + Inter embedded, accent or `#C8A961`, cover éditoriale sur fond dark,
sections paginées avec header/footer brand, chrome sobre, vraies tables (pas
de pipe ASCII), cohort en matrice colorée (intensité accent or proportionnelle
à la valeur), bullet/waterfall/bar éditoriaux.

### Architecture

```
pdf.ts                ← orchestrateur (cover + manifesto + sections + chrome)
pdf-tokens.ts         ← couleurs / typo / spacing — single source of truth print
pdf-fonts.ts          ← embed Source Serif 4 + Inter, fallback Times/Helvetica
pdf-cover.ts          ← page 1 éditoriale (rule or, eyebrow caps, H1 serif)
pdf-section.ts        ← header de section + chrome page (header brand, footer pagination)
pdf-blocks/
  kpi.ts              ← grand chiffre serif + label small caps + delta
  prose.ts            ← lead italic accent + body justifié sans-serif
  table.ts            ← vraie table colonnes alignées, hairlines, alternance subtile
  chart.ts            ← bar / waterfall / bullet / sparkline minimalistes
  quote.ts            ← pull-quote italic centré
  cohort.ts           ← matrice cellules colorées (pas de "─".repeat(N))
fonts/
  SourceSerif4-Regular.ttf, -Bold.ttf, -It.ttf
  Inter-Regular.ttf, -Medium.ttf, -SemiBold.ttf
```

### Système de tokens

`pdf-tokens.ts` est la **single source of truth** pour le rendu print. Mapping
intentionnel avec `app/globals.css` :

| PDF token              | CSS token            | Note                                   |
|------------------------|----------------------|----------------------------------------|
| `COLORS.accent`        | `--gold` (#C8A961)   | Accent or champagne (éditorial)        |
| `COLORS.ink`           | `#1A1815` (off-black)| Encre body sur fond clair              |
| `COLORS.inkLight`      | `#F5F1E8`            | Encre body sur fond dark (cover)       |
| `COLORS.muted`         | `#8B8578`            | Texte secondaire / eyebrow             |
| `COLORS.backgroundDark`| `--bg` (#0A0A0A)     | Fond cover éditoriale                  |
| `SPACE.s*`             | `--space-*`          | Baseline 4pt grid                      |

L'accent or `--gold` a été ajouté à `globals.css` (token éditorial pour
print). Le cykan turquoise du produit n'est pas réutilisé : il crierait dans
un livret print où l'accent doit murmurer.

**Règle** : aucun hex code ne doit jamais être hardcoded dans `pdf-blocks/` ou
`pdf-cover.ts`. Tout passe par `COLORS.*`. Si un token manque, on l'ajoute
d'abord dans `pdf-tokens.ts` (et `globals.css` si pertinent côté UI).

### Système de fonts

Les TTF sont embarqués sous `lib/reports/export/fonts/` :

- **Source Serif 4** (Adobe, OFL) — display, headlines, pull-quotes, KPI values
- **Inter** (Rasmus Andersson, OFL) — body, metadata, tables, captions

`registerFonts()` enregistre les 6 variantes dans le PDFDocument. Si l'embed
échoue (FS perms, fichier manquant en prod, etc.), le helper `setFont()` bascule
transparent vers les fonts PDFKit built-in (Times-Roman / Times-Bold /
Times-Italic / Helvetica / Helvetica-Bold). Le rendu reste fonctionnel,
juste moins beau — pas de crash possible sur une absence de font.

Total embedded : ~1.7 MB (négligeable face au stockage S3 par export).

### Layout

```
Page 1 — COVER
  ┌─────────────────────────────────────┐
  │ [fond dark #0A0A0A]                 │
  │ ──── (rule or 60pt)                 │
  │ CONFIDENTIEL — RAPPORT INTERNE      │
  │                                     │
  │ Founder Cockpit                     │ ← H1 serif 56pt
  │                                     │
  │ Sous-titre italic accent or         │ ← lead 14pt italic
  │ Description body sans-serif         │ ← body 11pt
  │                                     │
  │ ─────────────────────────────────── │
  │ 01 mai 2024 · founder · monthly     │ ← metadata bottom block
  │ HEARST OS · 01 — COVER · v1.0       │ ← footer
  └─────────────────────────────────────┘

Page 2 — MANIFESTO (si narration)
  ┌─────────────────────────────────────┐
  │ HEARST  ────────────────────────    │ ← header chrome
  │ ────                                │
  │ INTRODUCTION                        │
  │ Manifeste                           │ ← H2 serif
  │ Synthèse narrative.                 │ ← lead italic accent
  │                                     │
  │ Lead paragraph italic accent or...  │ ← prose
  │ Body paragraph justifié sans-serif. │
  │                                     │
  │ ─────────────────────────────────── │
  │ HEARST OS · 02 — MANIFESTO · v1.0   │ ← footer
  └─────────────────────────────────────┘

Pages 3+ — Sections (1 par groupe de blocks)
  - Section Indicateurs clés (KPI row, jusqu'à 4 par row)
  - Section [label] pour chaque block table/chart/cohort/etc.
```

### Comment ajouter un nouveau type de block

1. **Vérifier le block existe en spec** : voir `PRIMITIVE_KINDS` dans
   `lib/reports/spec/schema.ts`.
2. **Créer le renderer** : `lib/reports/export/pdf-blocks/<type>.ts`
   exportant `renderXxx(doc: PDFKit.PDFDocument, input: XxxInput): void`.
   Suivre la convention :
   - utiliser `COLORS.*` (jamais de hex hardcoded)
   - utiliser `setFont(doc, "serif" | "sans" | …, embedded)` (jamais
     `doc.font("Helvetica")` direct)
   - utiliser `SPACE.s*` pour les paddings/margins
   - retourner via `doc.y` la position après rendu (les blocks suivants
     repartent de là)
3. **Brancher dans l'orchestrateur** : ajouter un `case "<type>":` dans
   `renderSingleBlock()` de `pdf.ts`.
4. **Ajouter un test** : enrichir `__tests__/reports/pdf-render.test.ts` avec
   un payload contenant le nouveau type.

### Limitations connues

- **PDF version 1.3** (sortie PDFKit par défaut). Compatible Acrobat 4+, soit
  ~99% des lecteurs. Pas de fonctionnalités PDF/UA pour l'accessibilité (à
  ajouter si requis par un client réglementé).
- **Pas de breakpoint intelligent** : si une table dépasse une page, le rendu
  fait un `addPage()` brut sans réimprimer le header de section. Acceptable
  pour V1.
- **Sparkline / charts vraiment graphiques** sont rendus en primitives
  pdfkit (line, rect). Pas de SVG embedded — pdfkit ne sait pas le parser
  nativement. Si on veut du chart vraiment riche (sankey, network, geo), on
  bascule vers Playwright + image render à intégrer (option B → A migration).

### Génération d'un PDF de test

```bash
npx tsx scripts/gen-test-pdf.ts
# → /tmp/test-report.pdf

# Inspection visuelle (macOS) :
open /tmp/test-report.pdf

# Inspection texte (vérifie qu'aucun pipe ASCII subsiste) :
pdftotext /tmp/test-report.pdf - | less

# Render des pages en PNG (pour screenshot) :
pdftoppm -r 150 -png /tmp/test-report.pdf /tmp/test-page
open /tmp/test-page-1.png
```

---

## XLSX & CSV

Voir `xlsx.ts` et `csv.ts`. Schéma identique (`ExportInput → ExportResult`),
pas de refonte éditoriale (le tabulaire est natif au format).
