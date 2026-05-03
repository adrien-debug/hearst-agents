/**
 * Mission tools — expose les missions schedulées de l'utilisateur au LLM.
 *
 * Auparavant le LLM ne pouvait que CRÉER des missions (`create_scheduled_mission`).
 * S'il voulait lancer une mission existante par chat, il créait un doublon ou
 * répondait à la main. Trou UX majeur identifié dans l'audit fonctionnel.
 *
 * Ce module ajoute `run_mission(query)` : fuzzy match sur les missions de
 * l'utilisateur, émet un event `mission_run_request` que l'UI rend en card
 * cliquable. L'user clique → POST /api/v2/missions/[id]/run (route existante).
 */

import { jsonSchema } from "ai";
import type { Tool } from "ai";
import type { RunEngine } from "@/lib/engine/runtime/engine";
import type { RunEventBus } from "@/lib/events/bus";
import type { TenantScope } from "@/lib/multi-tenant/types";
import { getScheduledMissions } from "@/lib/engine/runtime/state/adapter";
import { scheduleDailyBriefing } from "@/lib/engine/runtime/briefing-scheduler";
import { loadAssetsForScope } from "@/lib/assets/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AiToolMap = Record<string, Tool<any, any>>;

interface RunMissionArgs {
  query: string;
}

interface MissionMatch {
  id: string;
  name: string;
  schedule?: string;
  scheduleLabel?: string;
  kind: "exact" | "prefix" | "substring";
}

/** Normalise un nom pour le matching : lowercase + retire accents + trim. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** Fuzzy match exact > prefix > substring. Retourne tous les matches triés. */
function matchMissions(
  query: string,
  missions: ReadonlyArray<{ id: string; name: string; schedule?: string; label?: string }>,
): MissionMatch[] {
  const q = normalize(query);
  if (!q) return [];

  const matches: MissionMatch[] = [];
  for (const m of missions) {
    const n = normalize(m.name);
    if (n === q) {
      matches.push({ id: m.id, name: m.name, schedule: m.schedule, scheduleLabel: m.label, kind: "exact" });
    } else if (n.startsWith(q)) {
      matches.push({ id: m.id, name: m.name, schedule: m.schedule, scheduleLabel: m.label, kind: "prefix" });
    } else if (n.includes(q) || q.includes(n)) {
      matches.push({ id: m.id, name: m.name, schedule: m.schedule, scheduleLabel: m.label, kind: "substring" });
    }
  }

  // Tri : exact d'abord, puis prefix, puis substring
  const order = { exact: 0, prefix: 1, substring: 2 };
  matches.sort((a, b) => order[a.kind] - order[b.kind]);
  return matches;
}

interface BuildMissionToolsOpts {
  engine: RunEngine;
  eventBus: RunEventBus;
  scope: TenantScope;
}

export function buildMissionTools(opts: BuildMissionToolsOpts): AiToolMap {
  const { engine, eventBus, scope } = opts;

  const runMission: Tool<RunMissionArgs, string> = {
    description:
      "Trouve une mission planifiée existante de l'utilisateur par nom (fuzzy match) et propose de la lancer maintenant via une card cliquable inline. À utiliser quand l'utilisateur dit : « lance ma synthèse weekly », « refais le rapport sales », « relance la mission X ». NE crée PAS de nouvelle mission — pour ça, utiliser `create_scheduled_mission`. Retourne la liste des missions matchées (ou la liste complète si aucun match) pour que tu puisses dialoguer avec l'utilisateur si ambiguïté.",
    inputSchema: jsonSchema<RunMissionArgs>({
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description:
            "Le nom (ou un fragment) de la mission à lancer, tel que l'utilisateur l'a écrit. Ex: « synthèse weekly », « rapport sales », « brief pipeline ».",
        },
      },
    }),
    execute: async (input: RunMissionArgs) => {
      const persisted = await getScheduledMissions({
        userId: scope.userId,
        tenantId: scope.tenantId ?? undefined,
        workspaceId: scope.workspaceId ?? undefined,
      });

      if (persisted.length === 0) {
        return JSON.stringify({
          ok: false,
          reason: "no_missions",
          message:
            "L'utilisateur n'a aucune mission planifiée. Suggérer d'en créer une via `create_scheduled_mission`.",
        });
      }

      const matches = matchMissions(input.query, persisted);

      if (matches.length === 0) {
        return JSON.stringify({
          ok: false,
          reason: "no_match",
          query: input.query,
          available: persisted.slice(0, 10).map((m) => ({ name: m.name, schedule: m.label })),
          message:
            "Aucune mission ne correspond. Lister les missions disponibles à l'utilisateur pour qu'il choisisse, ou proposer d'en créer une nouvelle.",
        });
      }

      // Match unique → émet l'event UI
      const top = matches[0];
      if (matches.length === 1 || top.kind === "exact") {
        eventBus.emit({
          type: "mission_run_request",
          run_id: engine.id,
          mission_id: top.id,
          mission_name: top.name,
          schedule_label: top.scheduleLabel,
          match_kind: top.kind,
        });
        return JSON.stringify({
          ok: true,
          missionId: top.id,
          missionName: top.name,
          scheduleLabel: top.scheduleLabel,
          matchKind: top.kind,
          message:
            "Mission trouvée. Une card de confirmation s'affiche dans le chat — l'utilisateur clique pour lancer.",
        });
      }

      // Plusieurs matches → laisse Claude lister les options
      return JSON.stringify({
        ok: false,
        reason: "ambiguous",
        query: input.query,
        matches: matches.slice(0, 5).map((m) => ({
          name: m.name,
          schedule: m.scheduleLabel,
          matchKind: m.kind,
        })),
        message:
          "Plusieurs missions correspondent. Présenter les options à l'utilisateur pour qu'il précise, puis rappeler `run_mission` avec un nom plus précis.",
      });
    },
  };

  // request_daily_brief — déclenche la génération du Daily Brief à la demande.
  // L'appel à scheduleDailyBriefing est idempotent (skip si un brief existe
  // déjà pour aujourd'hui en Redis). On fire-and-forget pour ne pas bloquer
  // le chat pendant 30s : l'user voit "Brief en cours" puis recharge /briefing.
  const requestDailyBrief: Tool<Record<string, never>, string> = {
    description:
      "Déclenche la génération du Daily Brief de l'utilisateur pour aujourd'hui. À utiliser quand il dit : « génère mon brief maintenant », « refais le brief du jour », « relance le briefing matinal ». Idempotent : si un brief existe déjà pour aujourd'hui, l'appel ne crée pas de doublon. Retourne immédiatement (génération en arrière-plan, ~30-60s) — invite l'utilisateur à consulter /briefing.",
    inputSchema: jsonSchema<Record<string, never>>({
      type: "object",
      properties: {},
    }),
    execute: async () => {
      void scheduleDailyBriefing({
        userId: scope.userId,
        tenantId: scope.tenantId ?? "dev-tenant",
        workspaceId: scope.workspaceId ?? "dev-workspace",
      }).catch((err) => {
        console.warn("[request_daily_brief] scheduleDailyBriefing failed:", err);
      });
      return JSON.stringify({
        ok: true,
        status: "generating",
        message:
          "Brief en cours de génération (~30-60s). Invite l'utilisateur à consulter /briefing dans une minute. Si un brief existait déjà pour aujourd'hui, il sera réutilisé.",
      });
    },
  };

  // find_asset — recherche d'assets persistés (rapports, briefs, documents,
  // images, vidéos générés). Read-only, retourne les top matches avec id +
  // titre + kind + thread + date. Claude peut ensuite répondre avec un
  // résumé et un lien vers /assets/{id} pour ouverture.
  const findAsset: Tool<{ query: string; kind?: string; limit?: number }, string> = {
    description:
      "Recherche dans les assets persistés de l'utilisateur (rapports, briefs, documents, images, vidéos générés via le chat ou les missions). Fuzzy match sur le titre. À utiliser quand il dit : « retrouve mon rapport pipeline d'hier », « ouvre le brief Sequoia », « cherche l'image du logo H ». Retourne les top 5 matches avec id, titre, kind, thread, date — Claude peut ensuite proposer le lien /assets/{id} ou résumer le contenu.",
    inputSchema: jsonSchema<{ query: string; kind?: string; limit?: number }>({
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description:
            "Le terme de recherche tel que l'utilisateur l'a écrit. Ex: « rapport pipeline », « logo H », « brief sequoia ».",
        },
        kind: {
          type: "string",
          enum: ["report", "brief", "document", "page", "code", "snippet", "message", "spreadsheet", "task", "event"],
          description:
            "Filtre optionnel par type d'asset. Si omis, cherche dans tous les types.",
        },
        limit: {
          type: "number",
          description: "Nombre max de résultats à retourner (défaut 5, max 20).",
        },
      },
    }),
    execute: async (input) => {
      const limit = Math.min(Math.max(input.limit ?? 5, 1), 20);
      const all = await loadAssetsForScope({
        tenantId: scope.tenantId ?? "dev-tenant",
        workspaceId: scope.workspaceId ?? "dev-workspace",
        userId: scope.userId,
        limit: 100,
      });

      const filtered = input.kind ? all.filter((a) => a.kind === input.kind) : all;

      if (filtered.length === 0) {
        return JSON.stringify({
          ok: false,
          reason: "no_assets",
          query: input.query,
          kindFilter: input.kind ?? null,
          message:
            "Aucun asset persisté. Suggérer d'en générer un via le chat (rapport, brief, etc.).",
        });
      }

      const q = normalize(input.query);
      const scored = filtered
        .map((a) => {
          const t = normalize(a.title);
          let score = 0;
          if (t === q) score = 100;
          else if (t.startsWith(q)) score = 80;
          else if (t.includes(q)) score = 60;
          else if (q.includes(t)) score = 40;
          return { asset: a, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      if (scored.length === 0) {
        return JSON.stringify({
          ok: false,
          reason: "no_match",
          query: input.query,
          recent: filtered.slice(0, 5).map((a) => ({
            id: a.id,
            title: a.title,
            kind: a.kind,
            createdAt: a.createdAt,
          })),
          message:
            "Aucun match. Lister les assets récents à l'utilisateur ou suggérer de reformuler la requête.",
        });
      }

      return JSON.stringify({
        ok: true,
        count: scored.length,
        matches: scored.map(({ asset, score }) => ({
          id: asset.id,
          title: asset.title,
          kind: asset.kind,
          summary: asset.summary?.slice(0, 200),
          threadId: asset.threadId,
          createdAt: asset.createdAt,
          matchScore: score,
        })),
      });
    },
  };

  return {
    run_mission: runMission,
    request_daily_brief: requestDailyBrief,
    find_asset: findAsset,
  };
}
