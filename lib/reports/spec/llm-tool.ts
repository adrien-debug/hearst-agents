/**
 * propose_report_spec — tool LLM pour générer un ReportSpec à la volée.
 *
 * L'LLM décrit la structure d'un report (sources, transforms, blocks). On
 * complète automatiquement les champs techniques (id, scope, timestamps,
 * cacheTTL, refresh) puis on exécute le pipeline déterministe.
 *
 * Pattern Zod-constrained : le LLM ne peut pas produire de Spec invalide
 * structurellement — les ops, les block types, les source kinds sont tous
 * dans des enums fermés.
 */

import { jsonSchema } from "ai";
import type { Tool } from "ai";
import { randomUUID } from "crypto";
import { z } from "zod";

import type { RunEngine } from "@/lib/engine/runtime/engine";
import type { RunEventBus } from "@/lib/events/bus";
import { storeAsset, type Asset } from "@/lib/assets/types";

import {
  reportSpecSchema,
  reportMetaSchema,
  sourceRefSchema,
  transformOpSchema,
  blockSpecSchema,
  narrationSpecSchema,
  type ReportSpec,
} from "./schema";
import { runReport } from "@/lib/reports/engine/run-report";
import { createSourceLoader } from "@/lib/reports/sources";

/**
 * Input du tool — un sous-ensemble du ReportSpec : pas d'id, pas de scope,
 * pas de timestamps. On les remplit côté serveur.
 */
const draftSpecSchema = z.object({
  meta: reportMetaSchema,
  sources: z.array(sourceRefSchema).min(1).max(8),
  transforms: z.array(transformOpSchema).max(24).default([]),
  blocks: z.array(blockSpecSchema).min(1).max(12),
  narration: narrationSpecSchema.optional(),
});

export type ReportDraft = z.infer<typeof draftSpecSchema>;

interface ProposeReportArgs extends ReportDraft {
  /** Toujours true en V1 — pour cohérence avec d'autres tools _preview. */
  _preview?: boolean;
}

interface BuildArgs {
  threadId: string;
  userId: string;
  tenantId: string;
  workspaceId: string;
}

export function buildProposeReportSpecTool(
  engine: RunEngine,
  eventBus: RunEventBus,
  ctx: BuildArgs,
): Tool<ProposeReportArgs, string> {
  return {
    description:
      "Compose et exécute un report cross-app (KPI, sparkline, bar, table, funnel) à partir " +
      "des apps connectées. Utilise UNIQUEMENT quand l'utilisateur demande explicitement un " +
      "rapport, un cockpit, un tableau de bord, une synthèse de plusieurs sources, ou une vue " +
      "d'ensemble. NE PAS utiliser pour une simple question (ex. 'combien j'ai d'emails ?' " +
      "→ utiliser gmail_recent_emails directement). Les sources doivent référencer des " +
      "actions Composio existantes ou des ops Google natives ('gmail.messages.list', " +
      "'calendar.events.upcoming', 'drive.files.recent'). Le résultat apparaît automatiquement " +
      "dans le focal de l'utilisateur sous forme d'asset persisté.",
    inputSchema: jsonSchema<ProposeReportArgs>({
      type: "object",
      required: ["meta", "sources", "blocks"],
      properties: {
        meta: {
          type: "object",
          required: ["title", "domain", "persona", "cadence"],
          properties: {
            title: { type: "string", description: "Titre court (≤ 80 chars), FR." },
            summary: { type: "string", description: "1 phrase qui résume l'objectif (≤ 280 chars)." },
            domain: {
              type: "string",
              enum: ["finance", "crm", "ops", "growth", "founder", "ops-eng", "support", "mixed"],
            },
            persona: {
              type: "string",
              enum: ["founder", "csm", "ops", "sales", "eng"],
            },
            cadence: {
              type: "string",
              enum: ["ad-hoc", "daily", "weekly", "monthly", "event"],
            },
            confidentiality: { type: "string", enum: ["internal", "shared"] },
          },
        },
        sources: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          description:
            "Liste des sources data. Chaque source a un `id` unique (snake_case), un `kind` " +
            "(composio | native_google | http | asset) et un `spec` selon le kind.",
          items: { type: "object" },
        },
        transforms: {
          type: "array",
          maxItems: 24,
          description:
            "DAG d'opérations : filter (where:string expression), join (on/how), groupBy " +
            "(by/measures), window (range:'30d', field), diff (field, window), rank (by, " +
            "direction, limit), derive (columns:[{name,expr}]), pivot, unionAll. Chaque op " +
            "a un id unique et liste ses inputs (ids des sources/transforms amont).",
          items: { type: "object" },
        },
        blocks: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          description:
            "Composants graphiques V1 : kpi, sparkline, bar, table, funnel. Chaque block a " +
            "un id, un type, un dataRef (id du dataset à afficher), un layout {col:1|2|4} et " +
            "des props (field, labelField, valueField, format, currency, limit, ...).",
          items: { type: "object" },
        },
        narration: {
          type: "object",
          description: "Narration LLM optionnelle. Mode bullets ou intro+bullets.",
          properties: {
            mode: { type: "string", enum: ["bullets", "intro+bullets"] },
            target: { type: "string", enum: ["focal_body", "summary"] },
            maxTokens: { type: "number" },
            style: { type: "string", enum: ["executive", "operational", "candid"] },
          },
        },
        _preview: {
          type: "boolean",
          description: "Réservé pour usage futur. Laisser à false ou omettre.",
          default: false,
        },
      },
    }),
    execute: async (args: ProposeReportArgs) => {
      // Valide l'input contre le sub-schema (laisse les erreurs Zod remonter
      // proprement au LLM pour qu'il auto-corrige au prochain tour).
      let draft: ReportDraft;
      try {
        draft = draftSpecSchema.parse(args);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Erreur de structure : ${msg}. Corrige le payload et réessaie.`;
      }

      // Hydrate vers un Spec complet
      const now = Date.now();
      const spec: ReportSpec = {
        id: randomUUID(),
        version: 1,
        meta: draft.meta,
        scope: {
          tenantId: ctx.tenantId,
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
        },
        sources: draft.sources,
        transforms: draft.transforms,
        blocks: draft.blocks,
        narration: draft.narration,
        refresh: { mode: "manual", cooldownHours: 0 },
        cacheTTL: { raw: 300, transform: 600, render: 1800 },
        createdAt: now,
        updatedAt: now,
      };

      // Validation finale (le draft est déjà valide ; on protège contre une
      // dérive future du schema).
      const finalCheck = reportSpecSchema.safeParse(spec);
      if (!finalCheck.success) {
        return `Spec invalide après hydratation : ${finalCheck.error.message}`;
      }

      // Exécute le pipeline
      const loader = createSourceLoader({ spec });
      let result;
      try {
        result = await runReport(spec, { sourceLoader: loader });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[propose_report_spec] runReport failed:", msg);
        return `L'exécution du report a échoué : ${msg}`;
      }

      // Persiste l'asset attaché au thread courant
      const asset: Asset = {
        id: randomUUID(),
        threadId: ctx.threadId,
        kind: "report",
        title: spec.meta.title,
        summary: spec.meta.summary,
        provenance: {
          providerId: "system",
          tenantId: ctx.tenantId,
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          specId: spec.id,
          specVersion: spec.version,
          runArtifact: true,
          reportMeta: {
            signals: result.signals,
            severity: result.severity,
          },
        },
        createdAt: now,
        contentRef: JSON.stringify({
          ...result.payload,
          narration: result.narration,
        }),
        runId: engine.id,
      };
      storeAsset(asset);

      eventBus.emit({
        type: "asset_generated",
        run_id: engine.id,
        asset_id: asset.id,
        asset_type: "report",
        name: spec.meta.title,
      });

      return (
        `Report "${spec.meta.title}" généré (${spec.blocks.length} blocks, ` +
        `${result.durationMs}ms). Visible dans le focal — l'utilisateur peut ` +
        `commenter ou demander des ajustements.`
      );
    },
  };
}
