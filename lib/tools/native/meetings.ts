/**
 * Meetings tools — récupération du débrief d'un meeting passé via le chat.
 *
 * Auparavant le débrief généré par le worker meeting-bot était stocké dans
 * `contentRef.editorialSummary` de l'asset kind="event", et l'utilisateur
 * devait naviguer dans /assets pour le lire. Avec ce tool, le LLM peut
 * directement répondre « Voici le débrief de ton meeting Sequoia » dans le chat.
 *
 * Si le transcript est présent mais le débrief manquant (worker tombé, ou
 * meeting trop récent), on déclenche une génération à la demande en
 * fire-and-forget.
 */

import { jsonSchema } from "ai";
import type { Tool } from "ai";
import type { TenantScope } from "@/lib/multi-tenant/types";
import { loadAssetsForScope, storeAsset, type Asset } from "@/lib/assets/types";
import {
  generateMeetingDebrief,
  type MeetingActionItem,
} from "@/lib/meetings/debrief";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AiToolMap = Record<string, Tool<any, any>>;

interface MeetingContent {
  transcript?: string;
  actionItems?: MeetingActionItem[];
  editorialSummary?: string | null;
  startedAt?: number;
  endedAt?: number;
  status?: string;
}

function parseMeetingContent(asset: Asset): MeetingContent | null {
  if (!asset.contentRef) return null;
  try {
    return JSON.parse(asset.contentRef) as MeetingContent;
  } catch {
    return null;
  }
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

interface RequestMeetingDebriefArgs {
  query?: string;
}

interface BuildMeetingsToolsOpts {
  scope: TenantScope;
}

export function buildMeetingsTools(opts: BuildMeetingsToolsOpts): AiToolMap {
  const { scope } = opts;

  const requestMeetingDebrief: Tool<RequestMeetingDebriefArgs, string> = {
    description:
      "Récupère le débrief éditorial (Contexte / Décisions / Actions / Suivi) d'un meeting déjà transcrit par le bot Recall.ai. À utiliser sur « débrief de mon meeting Sequoia », « résumé du dernier call », « qu'est-ce qu'on a décidé en réunion ? ». Sans `query`, prend le meeting le plus récent. Si le transcript existe mais pas encore de débrief (worker tombé), déclenche la génération en arrière-plan et invite à recharger.",
    inputSchema: jsonSchema<RequestMeetingDebriefArgs>({
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Optionnel — titre ou fragment du meeting à débriefer (fuzzy match). Si omis, prend le meeting le plus récent.",
        },
      },
    }),
    execute: async (input) => {
      if (!scope.userId) {
        return JSON.stringify({
          ok: false,
          reason: "no_user",
          message: "Scope utilisateur incomplet — impossible de retrouver les meetings.",
        });
      }

      const all = await loadAssetsForScope({
        tenantId: scope.tenantId ?? "dev-tenant",
        workspaceId: scope.workspaceId ?? "dev-workspace",
        userId: scope.userId,
        limit: 100,
      });
      const meetings = all.filter((a) => a.kind === "event");

      if (meetings.length === 0) {
        return JSON.stringify({
          ok: false,
          reason: "no_meetings",
          message:
            "Aucun meeting persisté. Suggérer de lancer un bot Recall.ai via `start_meeting_bot` sur la prochaine réunion.",
        });
      }

      // Sélection : query fuzzy match OU plus récent
      let target: Asset | undefined;
      if (input.query && input.query.trim()) {
        const q = normalize(input.query);
        const scored = meetings
          .map((a) => {
            const t = normalize(a.title);
            let score = 0;
            if (t === q) score = 100;
            else if (t.startsWith(q)) score = 80;
            else if (t.includes(q)) score = 60;
            return { asset: a, score };
          })
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score);
        if (scored.length === 0) {
          return JSON.stringify({
            ok: false,
            reason: "no_match",
            query: input.query,
            available: meetings.slice(0, 5).map((m) => ({
              id: m.id,
              title: m.title,
              createdAt: m.createdAt,
            })),
            message:
              "Aucun meeting ne correspond. Lister les meetings récents pour que l'utilisateur précise.",
          });
        }
        target = scored[0].asset;
      } else {
        // Pas de query → meeting le plus récent (déjà trié desc par created_at)
        target = meetings[0];
      }

      const content = parseMeetingContent(target);

      // Cas 1 : débrief déjà présent → return direct
      if (content?.editorialSummary && content.editorialSummary.trim().length > 0) {
        return JSON.stringify({
          ok: true,
          status: "ready",
          meetingId: target.id,
          meetingTitle: target.title,
          debrief: content.editorialSummary,
          actionItems: content.actionItems ?? [],
          startedAt: content.startedAt ?? target.createdAt,
          endedAt: content.endedAt,
          message:
            "Débrief disponible. Présente-le tel quel à l'utilisateur (markdown 4 sections : Contexte / Décisions / Actions / Suivi).",
        });
      }

      // Cas 2 : transcript présent mais pas de débrief → kick off async
      if (content?.transcript && content.transcript.trim().length > 0) {
        void (async () => {
          try {
            const debrief = await generateMeetingDebrief({
              transcript: content.transcript!,
              actionItems: content.actionItems ?? [],
              title: target!.title,
            });
            if (debrief) {
              await storeAsset({
                ...target!,
                contentRef: JSON.stringify({
                  ...content,
                  editorialSummary: debrief,
                }),
              });
            }
          } catch (err) {
            console.warn("[request_meeting_debrief] async generation failed:", err);
          }
        })();
        return JSON.stringify({
          ok: true,
          status: "generating",
          meetingId: target.id,
          meetingTitle: target.title,
          message:
            "Débrief en cours de génération (~10-15s). Invite l'utilisateur à reposer la question dans une minute, ou propose de récupérer juste les action items pré-extraits maintenant.",
          actionItems: content.actionItems ?? [],
        });
      }

      // Cas 3 : pas de transcript exploitable
      return JSON.stringify({
        ok: false,
        reason: "no_transcript",
        meetingId: target.id,
        meetingTitle: target.title,
        message:
          "Le meeting n'a pas de transcript exploitable (bot Recall en erreur, meeting trop court, ou pas encore terminé). Indiquer à l'utilisateur que le bot doit avoir effectivement enregistré pour produire un débrief.",
      });
    },
  };

  return { request_meeting_debrief: requestMeetingDebrief };
}
