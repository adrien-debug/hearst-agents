/**
 * Research tool — wrapper agent autour de runResearchReport().
 *
 * runResearchReport() est déjà branché en path déterministe dans
 * lib/engine/orchestrator/index.ts (isResearchIntent && !scheduleDetected).
 * Ce tool expose **aussi** la capacité comme tool_use explicite, permettant
 * au modèle de la déclencher dans des contextes où le path déterministe
 * ne s'active pas (ex: surface alternative, demande implicite via outil).
 *
 * Pattern : fire-and-forget. Le tool retourne un message court ; le pipeline
 * runResearchReport() émet ses propres events sur le runId via eventBus.
 */

import { jsonSchema } from "ai";
import type { Tool } from "ai";
import type { RunEngine } from "@/lib/engine/runtime/engine";
import type { RunEventBus } from "@/lib/events/bus";
import type { TenantScope } from "@/lib/multi-tenant/types";
import { runResearchReport } from "@/lib/engine/orchestrator/run-research-report";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AiToolMap = Record<string, Tool<any, any>>;

interface ResearchReportArgs {
  query: string;
  max_sources?: number;
}

export function buildResearchTools(opts: {
  engine: RunEngine;
  eventBus: RunEventBus;
  scope: TenantScope;
  threadId?: string;
}): AiToolMap {
  const { engine, eventBus, scope, threadId } = opts;

  const researchReport: Tool<ResearchReportArgs, unknown> = {
    description:
      "Lance une recherche web structurée (Exa/Perplexity/Tavily chain) puis " +
      "génère un rapport éditorial markdown via Claude Sonnet, persisté comme " +
      "asset (kind=report). Use this when the user asks for a deep report on " +
      "a topic ('lance une recherche sur X', 'fais un rapport sur Y', " +
      "'analyse ce sujet en profondeur'). Le rapport est long (3-8 paragraphes) " +
      "et inclut sources citées. NE PAS utiliser pour des questions courtes " +
      "(une phrase) — utilise web_search à la place.",
    inputSchema: jsonSchema<ResearchReportArgs>({
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description:
            "Sujet de recherche en une phrase (ex: 'État du marché des LLMs en 2026', " +
            "'Comparaison Stripe vs Adyen pour scale-up européen').",
        },
        max_sources: {
          type: "number",
          description: "Nombre max de sources à inclure dans le rapport (default 8, max 15).",
        },
      },
    }),
    execute: async (args) => {
      const query = args.query.trim();
      if (!query) {
        return "Erreur : query vide. Précise le sujet de recherche.";
      }

      // Fire-and-forget : le pipeline runResearchReport émet ses propres
      // events sur le runId via eventBus (step_started, orchestrator_log,
      // asset_generated, focal_object_ready). Le focal_object_ready à la
      // fin déclenche la bascule UI vers l'asset stage. Pas besoin
      // d'émettre stage_request ici (assetId pas connu, généré par le pipeline).
      void (async () => {
        try {
          await runResearchReport({
            message: query,
            engine,
            eventBus,
            scope,
            threadId,
          });
        } catch (err) {
          console.error("[research_report] pipeline failed:", err);
          eventBus.emit({
            type: "orchestrator_log",
            run_id: engine.id,
            message: `Research failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      })();

      return `Recherche en cours sur "${query}". Je t'amène sur le report — il sera prêt dans 30-60 secondes.`;
    },
  };

  return {
    research_report: researchReport,
  };
}
