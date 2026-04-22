# Architecture — Hearst Managed Agents

## Overview

Hearst is a full-stack agent orchestration platform. It manages the complete lifecycle of LLM-backed agents: creation, configuration, execution, observation, evaluation, and replay.

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                │
│  Dashboard │ Agents │ Skills │ Tools │ Workflows     │
│  Datasets │ Runs & Traces │ Model Profiles           │
└────────────────────┬────────────────────────────────┘
                     │ Server Components + API Routes
┌────────────────────▼────────────────────────────────┐
│                   API Layer                          │
│  Zod validation │ Domain helpers │ API key auth      │
│  Middleware (x-api-key / Bearer)                     │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│              Domain / Runtime Layer                  │
│  lib/domain/  — schemas, types, slugify             │
│  lib/runtime/ — tracer, lifecycle, tool-executor,   │
│                 workflow-engine, memory-governor,    │
│                 replay, cost-sentinel, prompt-guard  │
│  lib/llm/     — provider abstraction, router,       │
│                 fallback chain                       │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│             Data Layer (Supabase/Postgres)           │
│  26+ tables │ RLS │ pgvector │ enums │ indexes      │
│  Migrations: supabase/migrations/000{1-5}           │
└─────────────────────────────────────────────────────┘
```

## Directory Structure

```
├── app/
│   ├── api/              # API routes (Next.js Route Handlers)
│   │   ├── agents/       # CRUD + chat + evaluate + memory + versions
│   │   ├── conversations/
│   │   ├── datasets/     # CRUD + entries + batch evaluate
│   │   ├── model-profiles/
│   │   ├── memory-policies/
│   │   ├── prompts/      # Prompt artifact registry
│   │   ├── runs/         # Run detail + replay
│   │   ├── skills/
│   │   ├── tools/
│   │   └── workflows/    # CRUD + run execution
│   ├── agents/           # Agent UI pages
│   ├── datasets/         # Dataset UI pages
│   ├── runs/             # Run & trace inspection UI
│   ├── skills/           # Skill UI pages
│   ├── tools/            # Tool UI pages
│   ├── workflows/        # Workflow UI pages
│   └── components/       # Shared UI components
├── lib/
│   ├── domain/           # Zod schemas, TS types, API helpers
│   ├── llm/              # LLM provider abstraction
│   ├── runtime/          # Execution engine
│   │   ├── lifecycle.ts  # Canonical statuses, transitions, errors
│   │   ├── tracer.ts     # Run + trace recording
│   │   ├── tool-executor.ts  # Tool HTTP execution + governance
│   │   ├── workflow-engine.ts # Versioned step execution
│   │   ├── memory-governor.ts # Memory policy enforcement
│   │   ├── replay.ts     # Run replay (live/stub) at frozen config
│   │   ├── cost-sentinel.ts # Runtime cost budget enforcement
│   │   ├── prompt-guard.ts  # Prompt validation + output trust + guards
│   │   └── output-validator.ts # Output classification + trust scoring
│   ├── database.types.ts # Auto-generated Supabase types
│   └── supabase-server.ts # Server-side Supabase client
├── supabase/
│   └── migrations/       # Ordered SQL migrations
└── middleware.ts          # API key authentication
```

## Design Principles

1. **Domain-Driven**: Every concept has an explicit table, type, and schema
2. **Versioned Artifacts**: Agents, skills, prompts, workflows — all versioned immutably
3. **Observable Execution**: Every run produces structured traces with output trust
4. **Governed Tools**: Kill switch, risk levels, rate limits, retry policies
5. **Replayable Runs**: Live or stub replay at frozen config with comparison
6. **Cost-Controlled**: Runtime budget enforcement with COST_LIMIT_EXCEEDED
7. **Multi-Provider LLM**: Provider-agnostic with fallback chains
8. **Type-Safe**: Zod validation at API boundary, TypeScript throughout
9. **Tested**: 81 unit tests on lifecycle, cost, guards, output validation
10. **Manifestation-First**: Intent is materialized visually in the central stage with momentum indicators.

## Key Boundaries

| Boundary | Responsibility | Does NOT |
|----------|---------------|----------|
| `lib/domain/` | Schemas, types, validation | Call DB or providers |
| `lib/runtime/` | Execution, tracing, governance | Render UI |
| `lib/llm/` | LLM abstraction, routing | Know about agents/runs |
| `app/api/` | HTTP handling, orchestration | Contain business logic |
| `app/*/page.tsx` | UI rendering | Mutate data directly |

## Authentication

Single API key via `HEARST_API_KEY` env var, checked in `middleware.ts` for all `/api/*` routes except `/api/health`.
