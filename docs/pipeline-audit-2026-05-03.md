# Hearst OS — Audit Pipeline (statique)

Généré le 2026-05-03 par `scripts/audit-pipeline.ts`.

## 1. Tools — annoncés vs wirés

- **Annoncés** dans `system-prompt.ts` CAPACITÉS NATIVES : 17
- **Wirés** dans `ai-pipeline.ts` aiTools spread : 35

### Fantômes (annoncés mais pas wirés)
Aucun.

### Invisibles (wirés mais pas annoncés au LLM)
Aucun.

## 2. Prompts IA — charte unifiée

### Migrés vers `composeEditorialPrompt`
- `lib/capabilities/providers/deepgram.ts`
- `lib/daily-brief/generate.ts`
- `lib/editorial/charter.ts`
- `lib/engine/orchestrator/run-research-report.ts`
- `lib/engine/orchestrator/system-prompt.ts`
- `lib/inbox/inbox-brief.ts`
- `lib/meetings/debrief.ts`
- `lib/memory/briefing.ts`
- `lib/memory/conversation-summary.ts`
- `lib/memory/kg.ts`
- `lib/memory/mission-context.ts`
- `lib/reports/engine/narrate.ts`
- `lib/tools/native/kg-query.ts`
- `lib/watchlist/narrate.ts`
- `lib/workflows/handlers/ai-classify-priority.ts`
- `lib/workflows/handlers/ai-draft-welcome-notes.ts`

### Candidats potentiels (SYSTEM_PROMPT sans charter)
Aucun.

## 3. Events SSE

- Émis : 50
- Consommés (sse-adapter) : 50

### Orphelins (émis hors whitelist interne)
Aucun.

## 4. TODOs critiques

Aucun.

---

*Ce rapport est généré automatiquement. Re-run avec `npm run audit -- --write`.*
