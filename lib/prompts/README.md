# Prompts premium — guide interne Hearst OS

## Pourquoi ce dossier existe

Les prompts envoyés au LLM sont des artefacts produits, pas du collage rapide. Un prompt mal écrit dégrade la perception de qualité de tout le produit. Référence éditoriale : style « Art of Life Equine » (mature, sobre, factuel).

Tout prompt critique (briefing, narration, summary, extraction) doit suivre le pattern décrit ci-dessous.

## Pattern obligatoire

Un prompt premium contient **5 sections** dans cet ordre :

1. **System role** — Définit qui tu es. Pas « Tu es un assistant », mais « Tu es l'analyste exécutif… », « Tu es l'éditeur d'archives… ». Le rôle ancre le ton.

2. **Format strict** — Décrit la structure attendue (sections obligatoires, JSON schema, longueur max). Sans format, le LLM produit du texte libre généralement médiocre.

3. **Constraints** — Règles explicites : limites de longueur, vocabulaire interdit, edge cases (transcript vague → return [], texte court → return {entities:[]}).

4. **Few-shot examples** — Au minimum 2 exemples `{ input, output }` injectés via `formatFewShotBlock()`. Ils ancrent le style mieux que toute description.

5. **Output schema** (si JSON) — Format exact, sans markdown fence, sans texte autour.

## Library partagée

`lib/prompts/examples/index.ts` exporte les constantes réutilisables :

- `BRIEFING_FEWSHOT_FR` — exemples briefing matinal founder
- `NARRATION_FEWSHOT_FR` — exemples narration report éditorial
- `CONV_SUMMARY_FEWSHOT` — exemples résumé conversation dense
- `ACTION_ITEMS_FEWSHOT` — exemples extraction actions meeting
- `KG_EXTRACTION_FEWSHOT` — exemples extraction entités + relations
- `INBOX_PRIORITY_FEWSHOT` — exemples classification priorité email

Helper `formatFewShotBlock(examples)` produit un bloc XML `<example>…</example>` injectable directement dans le system prompt.

## Checklist avant merge

Pour chaque nouveau prompt critique :

- [ ] System role explicite (« Tu es… ») non générique
- [ ] Format strict décrit (sections, JSON schema, ou contraintes structurelles)
- [ ] Liste de contraintes explicites (longueur, vocabulaire, edge cases)
- [ ] ≥ 2 few-shot examples injectés
- [ ] Vocabulaire interdit listé : `voici`, `n'hésite pas`, `j'espère que`, `il faut`, `les données montrent`, `on peut voir que`
- [ ] Edge cases couverts (input vide, input vague, output null)
- [ ] Test de regression dans `__tests__/prompts/quality-regression.test.ts`

## Bons exemples

```ts
// ✅ Bon — système identifie un rôle, format strict, few-shot
export const BRIEFING_SYSTEM_PROMPT = [
  "Tu es l'analyste exécutif de l'utilisateur — l'équivalent d'un chef de cabinet pour un fondateur.",
  "",
  "FORMAT STRICT (3 sections, dans cet ordre, en markdown) :",
  "1. **Cette nuit.** Une ligne factuelle…",
  // ...
  "EXEMPLES :",
  formatFewShotBlock(BRIEFING_FEWSHOT_FR),
].join("\n");
```

## Mauvais exemples

```ts
// ❌ Mauvais — pas de rôle, pas de format, pas d'exemple
const PROMPT = "Résume cette conversation en 2-3 phrases concises.";

// ❌ Mauvais — rôle vague, format vague
const PROMPT = "Tu es un assistant. Génère un briefing matinal sympathique.";
```

## Test de régression

`__tests__/prompts/quality-regression.test.ts` vérifie pour chaque prompt critique :

- présence des marqueurs structurels (rôle, format, sections)
- ≥ N few-shot examples (`<example>` block count)
- absence de formules bannies (sauf déclarées dans la liste BANNIS du prompt)
- longueur raisonnable (200 < L < 8000)

Le test ne vérifie pas l'output LLM (trop flaky), uniquement le PROMPT envoyé.

## Modèles utilisés

- **Briefing / classification / extraction** → `claude-haiku-4-5-20251001` (rapide, coût bas).
- **Narration report (éditorial)** → `claude-sonnet-4-6` (qualité prose, prompt cacheable).

Le system prompt est marqué `cacheControl: { type: "ephemeral" }` quand le SDK le supporte (cf. `narrate.ts`) pour amortir le coût des few-shot examples sur les appels suivants.
