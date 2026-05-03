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
- `lib/memory/mission-context.ts`
- `lib/reports/engine/narrate.ts`
- `lib/watchlist/narrate.ts`
- `lib/workflows/handlers/ai-draft-welcome-notes.ts`

### Candidats potentiels (SYSTEM_PROMPT sans charter)
- `lib/tools/native/kg-query.ts`

## 3. Events SSE

- Émis : 50
- Consommés (sse-adapter) : 50

### Orphelins (émis hors whitelist interne)
Aucun.

## 4. TODOs critiques

- lib/analytics/events.ts:41 — // TODO: remplacer par backend analytics (PostHog, Amplitude, etc.)
- lib/connections/oauth-refresh.ts:12 — * TODO: Si Hearst migre vers une table `oauth_tokens` propriétaire,
- lib/connections/oauth-refresh.ts:52 — * TODO: Utiliser le champ `expiresAt` dès que Composio SDK l'expose.
- lib/connections/oauth-refresh.ts:98 — // TODO: Si Composio absent, interroger une table oauth_tokens propriétaire.
- lib/connections/oauth-refresh.ts:180 — * TODO: Utiliser `composio.connectedAccounts.refresh(connectionId)` quand
- lib/connections/oauth-refresh.ts:241 — * TODO: Brancher sur une vraie queue (BullMQ, Inngest, etc.) quand disponible.
- lib/connections/oauth-refresh.ts:253 — // TODO: Enqueue chaque connexion via la queue de jobs.
- lib/tools/handlers/send-message.ts:44 — // TODO: integrate with Slack Web API (chat.postMessage)
- lib/tools/handlers/send-message.ts:56 — // TODO: integrate with Meta Cloud API (messages endpoint)
- lib/workflows/executor.ts:19 — *   peuplé (resume manuel). TODO : persister `{ graph, outputs, awaitingNodeId }`

---

*Ce rapport est généré automatiquement. Re-run avec `npm run audit -- --write`.*
